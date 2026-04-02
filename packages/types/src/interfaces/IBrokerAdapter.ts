import { OrderSide, OrderStatus } from '../enums';
import type { MarketBarDto, MarketDataTimeframe } from '../schemas/market-data.schema';

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
  getRecentBars(symbol: string, timeframe: MarketDataTimeframe, limit: number): Promise<MarketBarDto[]>;
  placeOrder(params: OrderParams): Promise<OrderResult>;
  placeOrderWithCredentials(
    params: OrderParams,
    apiKey: string,
    apiSecret: string,
  ): Promise<OrderResult>;
  getPositions(accountId: string): Promise<Position[]>;
}
