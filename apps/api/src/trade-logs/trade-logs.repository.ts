import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CreateTradeLogData {
  subscriptionId: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  pnl: number | null;
  status: string;
}

@Injectable()
export class TradeLogsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateTradeLogData) {
    return this.prisma.tradeLog.create({ data });
  }
}
