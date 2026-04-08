import { Role } from '../enums';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

export interface AuthRequest {
  user: JwtPayload;
  [key: string]: unknown;
}

export interface Blueprint {
  id: string;
  title: string;
  description: string;
  parameters: BlueprintParameters;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
}

export interface BlueprintParameters {
  symbol: string;
  executionTimeframe?: '1Min' | '5Min' | '15Min' | '1Hour' | '1Day';
  executionMode?: 'BUY_LOW_SELL_HIGH' | 'SELL_HIGH_BUY_LOW';
  rsiPeriod: number;
  rsiBuyThreshold: number;
  rsiSellThreshold: number;
  maPeriod: number;
  quantity: number;
}

export interface Subscription {
  id: string;
  isActive: boolean;
  createdAt: Date;
  userId: string;
  blueprintId: string;
}

export interface TradeLog {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  pnl: number | null;
  status: string;
  executedAt: Date;
  subscriptionId: string;
}

export * from './IBrokerAdapter';
