import { Injectable } from '@nestjs/common';
import { TradeSide } from '@prisma/client';
import { OrderSide } from '@vantrade/types';
import { PrismaService } from '../prisma/prisma.service';

interface CreateTradeLogData {
  subscriptionId: string;
  symbol: string;
  side: TradeSide;
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

  findLatestTradeSideBySubscription(subscriptionId: string) {
    return this.prisma.tradeLog.findFirst({
      where: {
        subscriptionId,
        side: { in: [OrderSide.BUY, OrderSide.SELL] },
      },
      orderBy: { executedAt: 'desc' },
      select: { side: true },
    });
  }

  findBySubscription(subscriptionId: string, take?: number, skip?: number) {
    return this.prisma.tradeLog.findMany({
      where: { subscriptionId },
      orderBy: { executedAt: 'desc' },
      ...(take !== undefined ? { take } : {}),
      ...(skip !== undefined ? { skip } : {}),
    });
  }

  async getStats(subscriptionId: string) {
    const [total, buyCount, sellCount, pnlAgg, winCount, lossCount] = await Promise.all([
      this.prisma.tradeLog.count({ where: { subscriptionId } }),
      this.prisma.tradeLog.count({ where: { subscriptionId, side: OrderSide.BUY } }),
      this.prisma.tradeLog.count({ where: { subscriptionId, side: OrderSide.SELL } }),
      this.prisma.tradeLog.aggregate({
        where: { subscriptionId, pnl: { not: null } },
        _sum: { pnl: true },
      }),
      this.prisma.tradeLog.count({ where: { subscriptionId, pnl: { gt: 0 } } }),
      this.prisma.tradeLog.count({ where: { subscriptionId, pnl: { lt: 0 } } }),
    ]);

    return {
      totalTrades: total,
      executedTrades: buyCount + sellCount,
      buyCount,
      sellCount,
      holdCount: total - buyCount - sellCount,
      totalPnl: pnlAgg._sum.pnl ?? 0,
      winCount,
      lossCount,
    };
  }
}
