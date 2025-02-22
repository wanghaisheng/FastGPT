export interface UserType {
  _id: string;
  username: string;
  openaiKey: string;
  balance: number;
  promotion: {
    rate: number;
  };
}

export interface UserUpdateParams {
  balance?: number;
  openaiKey: string;
}

export interface UserBillType {
  id: string;
  time: string;
  type: 'chat' | 'splitData' | 'return';
  textLen: number;
  tokenLen: number;
  userId: string;
  chatId: string;
  price: number;
}
