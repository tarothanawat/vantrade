import { OrderSide, OrderStatus } from '../enums';

export interface OrderParams {
  symbol: string;
  side: OrderSide;
  quantity: number;
  accountId: string;
}

export interface OrderResult {
  orderId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  filledPrice: number;
  status: OrderStatus;
}

export interface Position {
  symbol: string;
  quantity: number;
  averageEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
}

export interface IBrokerAdapter {
  getLatestPrice(symbol: string): Promise<number>;
  placeOrder(params: OrderParams): Promise<OrderResult>;
  getPositions(accountId: string): Promise<Position[]>;
}
