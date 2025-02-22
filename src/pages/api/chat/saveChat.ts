import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { ChatItemType } from '@/types/chat';
import { connectToDatabase, Chat } from '@/service/mongo';
import { authModel } from '@/service/utils/auth';
import { authToken } from '@/service/utils/auth';
import mongoose from 'mongoose';

/* 聊天内容存存储 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { chatId, modelId, prompts, newChatId } = req.body as {
      newChatId: '' | string;
      chatId: '' | string;
      modelId: string;
      prompts: ChatItemType[];
    };

    if (!prompts) {
      throw new Error('缺少参数');
    }

    const userId = await authToken(req.headers.authorization);

    await connectToDatabase();

    const content = prompts.map((item) => ({
      _id: new mongoose.Types.ObjectId(item._id),
      obj: item.obj,
      value: item.value,
      systemPrompt: item.systemPrompt
    }));

    await authModel({ modelId, userId, authOwner: false });

    // 没有 chatId, 创建一个对话
    if (!chatId) {
      const { _id } = await Chat.create({
        _id: newChatId ? new mongoose.Types.ObjectId(newChatId) : undefined,
        userId,
        modelId,
        content,
        title: content[0].value.slice(0, 20)
      });
      return jsonRes(res, {
        data: _id
      });
    } else {
      // 已经有记录，追加入库
      await Chat.findByIdAndUpdate(chatId, {
        $push: {
          content: {
            $each: content
          }
        },
        updateTime: new Date()
      });
    }
    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
