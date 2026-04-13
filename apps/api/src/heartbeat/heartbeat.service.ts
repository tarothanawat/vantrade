import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type {
  BlueprintParameters,
  BlueprintParametersDto,
  IBrokerAdapter,
  MarketBarDto,
  MarketDataTimeframe,
  OrderParams,
} from '@vantrade/types';
import { BlueprintParametersSchema, OrderSide, TradeSignal } from '@vantrade/types';
import { EncryptionService } from '../encryption/encryption.service';
import { TradeLogsRepository } from '../trade-logs/trade-logs.repository';
import { SubscriptionsRepository } from '../subscriptions/subscriptions.repository';
import { calculateRSI, generateSignal } from '../trading/trading.engine';
import {
  isMarketOpenForSymbol,
  shouldRunForTimeframe,
} from './market-hours.util';

type ActiveSubscription = Awaited<ReturnType<SubscriptionsRepository['findAllActive']>>[number];

// TTL in milliseconds per timeframe — bars are only re-fetched after the window expires
const CACHE_TTL_MS: Record<MarketDataTimeframe, number> = {
  '1Min':  60_000,
  '5Min':  5 * 60_000,
  '15Min': 15 * 60_000,
  '1Hour': 60 * 60_000,
  '1Day':  24 * 60 * 60_000,
};

interface CacheEntry {
  bars: MarketBarDto[];
  fetchedAt: number;
}

@Injectable()
export class HeartbeatService {
  private readonly logger = new Logger(HeartbeatService.name);
  private lastRunAt: Date | null = null;
  private lastActiveCount = 0;
  private readonly barsCache = new Map<string, CacheEntry>();

  constructor(
    @Inject('IBrokerAdapter') private readonly broker: IBrokerAdapter,
    private readonly subscriptionsRepo: SubscriptionsRepository,
    private readonly tradeLogsRepo: TradeLogsRepository,
    private readonly encryptionService: EncryptionService,
  ) {}

  getStatus() {
    return {
      lastRunAt: this.lastRunAt,
      nextRunAt: this.lastRunAt ? new Date(this.lastRunAt.getTime() + 60_000) : null,
      lastActiveCount: this.lastActiveCount,
    };
  }

  @Cron('*/60 * * * * *')
  async tick(): Promise<void> {
    this.logger.debug('Heartbeat tick started');
    this.barsCache.clear(); // discard stale entries from previous tick
    const active = await this.subscriptionsRepo.findAllActive();
    this.lastActiveCount = active.length;
    this.lastRunAt = new Date();
    this.logger.debug(`Processing ${active.length} active subscriptions`);
    await Promise.allSettled(active.map((sub) => this.processSub(sub)));
  }

  private async getCachedBars(
    symbol: string,
    timeframe: MarketDataTimeframe,
    limit: number,
  ): Promise<MarketBarDto[]> {
    const key = `${symbol}:${timeframe}:${limit}`;
    const cached = this.barsCache.get(key);
    const ttl = CACHE_TTL_MS[timeframe] ?? 60_000;

    if (cached && Date.now() - cached.fetchedAt < ttl) {
      return cached.bars;
    }

    const bars = await this.broker.getRecentBars(symbol, timeframe, limit);
    this.barsCache.set(key, { bars, fetchedAt: Date.now() });
    return bars;
  }

  private async getLastTradeSide(subscriptionId: string): Promise<OrderSide | null> {
    const latest = await this.tradeLogsRepo.findLatestTradeSideBySubscription(subscriptionId);
    if (!latest) return null;
    if (latest.side === OrderSide.BUY || latest.side === OrderSide.SELL) return latest.side as OrderSide;
    return null;
  }

  private resolveExpectedNextSide(
    executionMode: BlueprintParametersDto['executionMode'],
    lastSide: OrderSide | null,
  ): OrderSide {
    if (executionMode === 'SELL_HIGH_BUY_LOW') {
      if (lastSide === null) return OrderSide.SELL;
      return lastSide === OrderSide.SELL ? OrderSide.BUY : OrderSide.SELL;
    }

    if (lastSide === null) return OrderSide.BUY;
    return lastSide === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY;
  }

  private async processSub(sub: ActiveSubscription): Promise<void> {
    try {
      const { blueprint, user } = sub;
      const parsedParams = BlueprintParametersSchema.safeParse(blueprint.parameters);
      if (!parsedParams.success) {
        this.logger.warn(`Invalid blueprint parameters for subscription ${sub.id} — skipping`);
        return;
      }
      const params: BlueprintParameters = parsedParams.data;
      const executionTimeframe: MarketDataTimeframe = params.executionTimeframe ?? '1Min';
      const executionMode = params.executionMode ?? 'BUY_LOW_SELL_HIGH';

      if (!shouldRunForTimeframe(executionTimeframe)) {
        this.logger.debug(
          `Skipping ${params.symbol} for subscription ${sub.id} — waiting for ${executionTimeframe} boundary`,
        );
        return;
      }

      const defaultKey = user.apiKeys?.find((k) => k.label === 'default') ?? user.apiKeys?.[0];
      if (!defaultKey) {
        this.logger.warn(`User ${user.id} has no API key — skipping subscription ${sub.id}`);
        return;
      }

      if (!isMarketOpenForSymbol(params.symbol)) {
        this.logger.debug(
          `Market is closed for ${params.symbol} — skipping subscription ${sub.id} until open session`,
        );
        return;
      }

      const requiredBars = params.rsiPeriod + 1;
      const recentBars = await this.getCachedBars(params.symbol, executionTimeframe, requiredBars);

      if (recentBars.length < requiredBars) {
        this.logger.debug(
          `Not enough bars for RSI on ${params.symbol} (${recentBars.length}/${requiredBars}) — holding`,
        );
        return;
      }

      const closeSeries = recentBars.map((bar) => bar.close);
      const currentPrice = recentBars.at(-1)?.close;
      if (currentPrice === undefined) {
        this.logger.debug(`No latest close price for ${params.symbol} — holding`);
        return;
      }

      const rsi = calculateRSI(closeSeries, params.rsiPeriod);
      const signal = generateSignal(rsi, params.rsiBuyThreshold, params.rsiSellThreshold);
      const signalSide = signal === TradeSignal.BUY ? OrderSide.BUY : signal === TradeSignal.SELL ? OrderSide.SELL : null;
      const lastTradeSide = await this.getLastTradeSide(sub.id);
      const expectedNextSide = this.resolveExpectedNextSide(executionMode, lastTradeSide);

      this.logger.debug(
        `${blueprint.title} — ${params.symbol} price=${currentPrice} rsi=${rsi.toFixed(2)} signal=${signal} mode=${executionMode} expected=${expectedNextSide}`,
      );

      if (signal === TradeSignal.HOLD || signalSide === null) {
        await this.tradeLogsRepo.create({
          subscriptionId: sub.id,
          symbol: params.symbol,
          side: TradeSignal.HOLD,
          quantity: 0,
          price: currentPrice,
          pnl: null,
          status: 'signal_hold',
        });
        return;
      }

      if (signalSide !== expectedNextSide) {
        await this.tradeLogsRepo.create({
          subscriptionId: sub.id,
          symbol: params.symbol,
          side: TradeSignal.HOLD,
          quantity: 0,
          price: currentPrice,
          pnl: null,
          status: `signal_${signal}_waiting_${expectedNextSide}`,
        });
        return;
      }

      const orderParams: OrderParams = {
        symbol: params.symbol,
        side: signalSide,
        quantity: params.quantity,
        accountId: user.id,
      };

      const apiKey = this.encryptionService.decrypt(defaultKey.encryptedKey);
      const apiSecret = this.encryptionService.decrypt(defaultKey.encryptedSecret);
      const result = await this.broker.placeOrderWithCredentials(orderParams, apiKey, apiSecret);

      await this.tradeLogsRepo.create({
        subscriptionId: sub.id,
        symbol: params.symbol,
        side: signal,
        quantity: params.quantity,
        price: result.filledPrice,
        pnl: null,
        status: result.status,
      });
    } catch (err) {
      this.logger.error(`Error processing subscription ${sub.id}: ${(err as Error).message}`);
      // Do NOT rethrow — error isolation per subscription
    }
  }
}
