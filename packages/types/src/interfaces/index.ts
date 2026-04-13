import { Role } from '../enums';
import type { BlueprintParametersDto } from '../schemas/blueprint.schema';

export type BlueprintParameters = BlueprintParametersDto;

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
