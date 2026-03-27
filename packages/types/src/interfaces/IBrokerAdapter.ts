import { OrderSide, OrderStatus } from '../enums';

export interface BrokerCredentials {
  apiKey: string;
  apiSecret: string;
}

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
  /** Fetch the last `limit` close prices for a symbol (oldest → newest). */
  getHistoricalPrices(symbol: string, limit: number): Promise<number[]>;
  /** Convenience wrapper — returns the single most recent close price. */
  getLatestPrice(symbol: string): Promise<number>;
  /** Place a market order using the caller-supplied per-user credentials. */
  placeOrder(params: OrderParams, credentials: BrokerCredentials): Promise<OrderResult>;
  /** Fetch open positions for a user using their own credentials. */
  getPositions(accountId: string, credentials: BrokerCredentials): Promise<Position[]>;
}
