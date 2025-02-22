import { PgClient } from '@/service/pg';
import { ModelDataStatusEnum, ModelVectorSearchModeEnum, ChatModelMap } from '@/constants/model';
import { ModelSchema } from '@/types/mongoSchema';
import { openaiCreateEmbedding } from '../utils/chat/openai';
import { ChatRoleEnum } from '@/constants/chat';
import { modelToolMap } from '@/utils/chat';
import { ChatItemSimpleType } from '@/types/chat';

/**
 *  use openai embedding search kb
 */
export const searchKb = async ({
  userOpenAiKey,
  prompts,
  similarity = 0.2,
  model,
  userId
}: {
  userOpenAiKey?: string;
  prompts: ChatItemSimpleType[];
  model: ModelSchema;
  userId: string;
  similarity?: number;
}): Promise<{
  code: 200 | 201;
  searchPrompt?: {
    obj: `${ChatRoleEnum}`;
    value: string;
  };
}> => {
  async function search(textArr: string[] = []) {
    // 获取提示词的向量
    const { vectors: promptVectors } = await openaiCreateEmbedding({
      userOpenAiKey,
      userId,
      textArr
    });

    const searchRes = await Promise.all(
      promptVectors.map((promptVector) =>
        PgClient.select<{ id: string; q: string; a: string }>('modelData', {
          fields: ['id', 'q', 'a'],
          where: [
            ['status', ModelDataStatusEnum.ready],
            'AND',
            ['model_id', model._id],
            'AND',
            `vector <=> '[${promptVector}]' < ${similarity}`
          ],
          order: [{ field: 'vector', mode: `<=> '[${promptVector}]'` }],
          limit: 20
        }).then((res) => res.rows)
      )
    );

    // Remove repeat record
    const idSet = new Set<string>();
    const filterSearch = searchRes.map((search) =>
      search.filter((item) => {
        if (idSet.has(item.id)) {
          return false;
        }
        idSet.add(item.id);
        return true;
      })
    );

    return filterSearch.map((item) => item.map((item) => `${item.q}\n${item.a}`).join('\n'));
  }
  const modelConstantsData = ChatModelMap[model.chat.chatModel];

  // search three times
  const userPrompts = prompts.filter((item) => item.obj === 'Human');

  const searchArr: string[] = [
    userPrompts[userPrompts.length - 1].value,
    userPrompts[userPrompts.length - 2]?.value
  ].filter((item) => item);
  const systemPrompts = await search(searchArr);

  // filter system prompts.
  const filterRateMap: Record<number, number[]> = {
    1: [1],
    2: [0.7, 0.3]
  };
  const filterRate = filterRateMap[systemPrompts.length] || filterRateMap[0];

  const filterSystemPrompt = filterRate
    .map((rate, i) =>
      modelToolMap[model.chat.chatModel].sliceText({
        text: systemPrompts[i],
        length: Math.floor(modelConstantsData.systemMaxToken * rate)
      })
    )
    .join('\n');

  /* 高相似度+不回复 */
  if (!filterSystemPrompt && model.chat.searchMode === ModelVectorSearchModeEnum.hightSimilarity) {
    return {
      code: 201,
      searchPrompt: {
        obj: ChatRoleEnum.AI,
        value: '对不起，你的问题不在知识库中。'
      }
    };
  }
  /* 高相似度+无上下文，不添加额外知识,仅用系统提示词 */
  if (!filterSystemPrompt && model.chat.searchMode === ModelVectorSearchModeEnum.noContext) {
    return {
      code: 200,
      searchPrompt: model.chat.systemPrompt
        ? {
            obj: ChatRoleEnum.System,
            value: model.chat.systemPrompt
          }
        : undefined
    };
  }

  /* 有匹配 */
  return {
    code: 200,
    searchPrompt: {
      obj: ChatRoleEnum.System,
      value: `
${model.chat.systemPrompt}
${
  model.chat.searchMode === ModelVectorSearchModeEnum.hightSimilarity ? '不回答知识库外的内容.' : ''
}
知识库内容为: '${filterSystemPrompt}'
`
    }
  };
};
