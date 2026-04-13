import { OrderSide, OrderStatus } from '../enums';
import type { MarketBarDto, MarketDataTimeframe } from '../schemas/market-data.schema';

export interface LimitOrderDetails {
  limitPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
}

export interface OrderParams {
  symbol: string;
  side: OrderSide;
  quantity: number;
  accountId: string;
  /** Present → bracket limit order (ICT path). Absent → market order (RSI path). */
  limitOrder?: LimitOrderDetails;
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
  getRecentBars(symbol: string, timeframe: MarketDataTimeframe, limit: number): Promise<MarketBarDto[]>;
  placeOrder(params: OrderParams): Promise<OrderResult>;
  placeOrderWithCredentials(
    params: OrderParams,
    apiKey: string,
    apiSecret: string,
  ): Promise<OrderResult>;
  /** Fetch open positions using system-level credentials. */
  getPositions(accountId: string): Promise<Position[]>;
  /** Fetch open positions using per-user credentials. */
  getPositionsWithCredentials(apiKey: string, apiSecret: string): Promise<Position[]>;
  /** Returns true if the supplied credentials can authenticate with the broker. */
  verifyCredentials(apiKey: string, apiSecret: string): Promise<boolean>;
}
