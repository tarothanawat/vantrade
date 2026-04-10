import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type {
  BlueprintParameters,
  BlueprintParametersDto,
  IBrokerAdapter,
  MarketDataTimeframe,
  OrderParams,
} from '@vantrade/types';
import { BlueprintParametersSchema, OrderSide, TradeSignal } from '@vantrade/types';
import { EncryptionService } from '../encryption/encryption.service';
import { TradeLogsRepository } from '../trade-logs/trade-logs.repository';
import { SubscriptionsRepository } from '../subscriptions/subscriptions.repository';
import { calculateRSI, generateSignal } from '../trading/trading.engine';

type ActiveSubscription = Awaited<ReturnType<SubscriptionsRepository['findAllActive']>>[number];

@Injectable()
export class HeartbeatService {
  private readonly logger = new Logger(HeartbeatService.name);
  private readonly usMarketTimezone = 'America/New_York';
  private lastRunAt: Date | null = null;
  private lastActiveCount = 0;

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
    const active = await this.subscriptionsRepo.findAllActive();
    this.lastActiveCount = active.length;
    this.lastRunAt = new Date();
    this.logger.debug(`Processing ${active.length} active subscriptions`);
    await Promise.allSettled(active.map((sub) => this.processSub(sub)));
  }

  private isTwentyFourSevenSymbol(symbol: string): boolean {
    const normalized = symbol.trim().toUpperCase();
    return normalized.endsWith('USD') || normalized.endsWith('USDT');
  }

  private isUsMarketOpen(now: Date = new Date()): boolean {
    const { weekday, hour, minute } = this.getEasternTimeParts(now);
    if (weekday === 'Sat' || weekday === 'Sun') return false;

    const minutesSinceMidnight = hour * 60 + minute;
    const marketOpenMinute = 9 * 60 + 30; // 09:30 ET
    const marketCloseMinute = 16 * 60; // 16:00 ET

    return minutesSinceMidnight >= marketOpenMinute && minutesSinceMidnight < marketCloseMinute;
  }

  private isMarketOpenForSymbol(symbol: string, now: Date = new Date()): boolean {
    if (this.isTwentyFourSevenSymbol(symbol)) return true;
    return this.isUsMarketOpen(now);
  }

  private getEasternTimeParts(now: Date = new Date()): {
    weekday: string;
    hour: number;
    minute: number;
  } {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: this.usMarketTimezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const getPart = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((part) => part.type === type)?.value ?? '';

    return {
      weekday: getPart('weekday'),
      hour: Number(getPart('hour')),
      minute: Number(getPart('minute')),
    };
  }

  private shouldRunForTimeframe(timeframe: MarketDataTimeframe, now: Date = new Date()): boolean {
    const { hour, minute } = this.getEasternTimeParts(now);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return false;

    switch (timeframe) {
      case '1Min':
        return true;
      case '5Min':
        return minute % 5 === 0;
      case '15Min':
        return minute % 15 === 0;
      case '1Hour':
        return minute === 0;
      case '1Day':
        return hour === 0 && minute === 0;
      default:
        return true;
    }
  }

  private async getLastTradeSide(subscriptionId: string): Promise<OrderSide | null> {
    const latest = await this.tradeLogsRepo.findLatestTradeSideBySubscription(subscriptionId);
    if (!latest) return null;
    if (latest.side === OrderSide.BUY || latest.side === OrderSide.SELL) return latest.side;
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

      if (!this.shouldRunForTimeframe(executionTimeframe)) {
        this.logger.debug(
          `Skipping ${params.symbol} for subscription ${sub.id} — waiting for ${executionTimeframe} boundary`,
        );
        return;
      }

      if (!user.apiKeys || user.apiKeys.length === 0) {
        this.logger.warn(`User ${user.id} has no API key — skipping subscription ${sub.id}`);
        return;
      }

      if (!this.isMarketOpenForSymbol(params.symbol)) {
        this.logger.debug(
          `Market is closed for ${params.symbol} — skipping subscription ${sub.id} until open session`,
        );
        return;
      }

      const requiredBars = params.rsiPeriod + 1;
      const recentBars = await this.broker.getRecentBars(
        params.symbol,
        executionTimeframe,
        requiredBars,
      );

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

      const apiKey = this.encryptionService.decrypt(user.apiKeys[0].encryptedKey);
      const apiSecret = this.encryptionService.decrypt(user.apiKeys[0].encryptedSecret);
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
