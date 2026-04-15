import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type {
  IBrokerAdapter,
  IctParametersDto,
  MarketBarDto,
  MarketDataTimeframe,
  OrderParams,
  RsiParametersDto,
} from '@vantrade/types';
import { BlueprintParametersSchema, OrderSide, TradeSignal } from '@vantrade/types';
import { EncryptionService } from '../encryption/encryption.service';
import { TradeLogsRepository } from '../trade-logs/trade-logs.repository';
import { SubscriptionsRepository } from '../subscriptions/subscriptions.repository';
import { calculateRSI, generateIctSignal, generateSignal } from '../trading/trading.engine';
import {
  isInIctSession,
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

interface IctSessionState {
  /** UTC date string 'YYYY-MM-DD' — used to reset state at the start of each new day. */
  sessionDate: string;
  tradesThisSession: number;
  lossesThisSession: number;
}

@Injectable()
export class HeartbeatService {
  private readonly logger = new Logger(HeartbeatService.name);
  private lastRunAt: Date | null = null;
  private lastActiveCount = 0;
  private readonly barsCache = new Map<string, CacheEntry>();
  /** In-memory session state per subscription — resets on new UTC day. */
  private readonly ictSessionState = new Map<string, IctSessionState>();

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
    executionMode: RsiParametersDto['executionMode'],
    lastSide: OrderSide | null,
  ): OrderSide {
    if (executionMode === 'SELL_HIGH_BUY_LOW') {
      if (lastSide === null) return OrderSide.SELL;
      return lastSide === OrderSide.SELL ? OrderSide.BUY : OrderSide.SELL;
    }

    if (lastSide === null) return OrderSide.BUY;
    return lastSide === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY;
  }

  private getOrResetIctSessionState(subscriptionId: string, now: Date): IctSessionState {
    const dateKey = now.toISOString().slice(0, 10); // 'YYYY-MM-DD' UTC
    const existing = this.ictSessionState.get(subscriptionId);
    if (existing && existing.sessionDate === dateKey) return existing;
    const fresh: IctSessionState = {
      sessionDate: dateKey,
      tradesThisSession: 0,
      lossesThisSession: 0,
    };
    this.ictSessionState.set(subscriptionId, fresh);
    return fresh;
  }

  private async processSub(sub: ActiveSubscription): Promise<void> {
    try {
      const { blueprint } = sub;
      const parsedParams = BlueprintParametersSchema.safeParse(blueprint.parameters);
      if (!parsedParams.success) {
        this.logger.warn(`Invalid blueprint parameters for subscription ${sub.id} — skipping`);
        return;
      }
      // Apply the tester's symbol override so both RSI and ICT paths use it transparently.
      const params = sub.symbolOverride
        ? { ...parsedParams.data, symbol: sub.symbolOverride }
        : parsedParams.data;

      if (params.strategyType === 'ICT') {
        return await this.processIctSub(sub, params);
      }
      return await this.processRsiSub(sub, params);
    } catch (err) {
      this.logger.error(`Error processing subscription ${sub.id}: ${(err as Error).message}`);
      // Do NOT rethrow — error isolation per subscription
    }
  }

  // ── RSI Strategy ────────────────────────────────────────────────────────────

  private async processRsiSub(sub: ActiveSubscription, params: RsiParametersDto): Promise<void> {
    const executionTimeframe: MarketDataTimeframe = params.executionTimeframe ?? '1Min';
    const executionMode = params.executionMode ?? 'BUY_LOW_SELL_HIGH';

    if (!shouldRunForTimeframe(executionTimeframe)) {
      this.logger.debug(
        `Skipping ${params.symbol} for subscription ${sub.id} — waiting for ${executionTimeframe} boundary`,
      );
      return;
    }

    const defaultKey = sub.user.apiKeys?.find((k) => k.label === 'default') ?? sub.user.apiKeys?.[0];
    if (!defaultKey) {
      this.logger.warn(`User ${sub.user.id} has no API key — skipping subscription ${sub.id}`);
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
      `${sub.blueprint.title} — ${params.symbol} price=${currentPrice} rsi=${rsi.toFixed(2)} signal=${signal} mode=${executionMode} expected=${expectedNextSide}`,
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
      accountId: sub.user.id,
    };

    const apiKey = this.encryptionService.decrypt(defaultKey.encryptedKey);
    const apiSecret = this.encryptionService.decrypt(defaultKey.encryptedSecret);
    const result = await this.broker.placeOrderWithCredentials(orderParams, apiKey, apiSecret);

    const exitPrice = result.filledPrice > 0 ? result.filledPrice : currentPrice;

    // Calculate P&L only when this is the exit leg.
    // BUY_LOW_SELL_HIGH: SELL closes the long.
    // SELL_HIGH_BUY_LOW: BUY closes the short.
    const isExitLeg = executionMode === 'SELL_HIGH_BUY_LOW'
      ? signalSide === OrderSide.BUY
      : signalSide === OrderSide.SELL;

    let pnl: number | null = null;
    if (isExitLeg) {
      const entryLog = await this.tradeLogsRepo.findLastExecutedBySubscription(sub.id);
      if (entryLog) {
        pnl = executionMode === 'SELL_HIGH_BUY_LOW'
          ? (entryLog.price - exitPrice) * params.quantity  // closed a short
          : (exitPrice - entryLog.price) * params.quantity; // closed a long
      }
    }

    await this.tradeLogsRepo.create({
      subscriptionId: sub.id,
      symbol: params.symbol,
      side: signal,
      quantity: params.quantity,
      price: exitPrice,
      pnl,
      status: result.status,
    });
  }

  // ── ICT Strategy ────────────────────────────────────────────────────────────

  private async processIctSub(sub: ActiveSubscription, params: IctParametersDto): Promise<void> {
    // Gate 1: only run on M5 timeframe boundary
    if (!shouldRunForTimeframe('5Min')) {
      this.logger.debug(`ICT: not on 5Min boundary — skipping sub ${sub.id}`);
      return;
    }

    // Gate 2: session filter (XAUUSD is 24/7 — skip equity market-hours check)
    if (!isInIctSession(params.sessionFilter)) {
      this.logger.debug(
        `ICT: outside session window (${params.sessionFilter}) for sub ${sub.id}`,
      );
      return;
    }

    // Gate 3: per-session risk limits
    const now = new Date();
    const sessionState = this.getOrResetIctSessionState(sub.id, now);
    if (sessionState.tradesThisSession >= params.maxTradesPerSession) {
      this.logger.debug(`ICT: max trades/session reached for sub ${sub.id}`);
      return;
    }
    if (sessionState.lossesThisSession >= params.maxLossesPerSession) {
      this.logger.debug(`ICT: max losses/session reached for sub ${sub.id}`);
      return;
    }

    // Gate 4: API key
    const defaultKey = sub.user.apiKeys?.find((k) => k.label === 'default') ?? sub.user.apiKeys?.[0];
    if (!defaultKey) {
      this.logger.warn(`User ${sub.user.id} has no API key — skipping ICT sub ${sub.id}`);
      return;
    }

    const apiKey    = this.encryptionService.decrypt(defaultKey.encryptedKey);
    const apiSecret = this.encryptionService.decrypt(defaultKey.encryptedSecret);

    // ── Gate 5: Check if there is an open bracket position ───────────────────
    // If yes, poll Alpaca positions. If the position closed (TP/SL fired), write
    // the exit log and return — do NOT look for a new entry this tick.
    const lastEntry = await this.tradeLogsRepo.findLastExecutedBySubscription(sub.id);
    if (lastEntry?.status.startsWith('bracket_entry:')) {
      const parts = lastEntry.status.split(':');
      // format: bracket_entry:<symbol>:<side>:<entryPrice>:<slPrice>:<tpPrice>
      const [, bracketSymbol, bracketSide, entryPriceStr, slPriceStr, tpPriceStr] = parts;
      const entryPrice = Number(entryPriceStr);
      const slPrice    = Number(slPriceStr);
      const tpPrice    = Number(tpPriceStr);

      const positions = await this.broker.getPositionsWithCredentials(apiKey, apiSecret);
      const normalizedSymbol = bracketSymbol.toUpperCase();
      const stillOpen = positions.some((p) => {
        const s = p.symbol.toUpperCase().replace('/', '');
        return s === normalizedSymbol || s === normalizedSymbol.replace('USD', '') + 'USD';
      });

      if (!stillOpen) {
        // Position was closed by Alpaca (TP or SL triggered).
        // Determine which by checking which price is closer to current market price.
        const m5Now = await this.getCachedBars(params.symbol, '5Min', 1);
        const currentPrice = m5Now.at(-1)?.close ?? entryPrice;
        const isTP = bracketSide === OrderSide.BUY
          ? currentPrice >= tpPrice
          : currentPrice <= tpPrice;

        const exitPrice = isTP ? tpPrice : slPrice;
        const pnl = bracketSide === OrderSide.BUY
          ? (exitPrice - entryPrice) * params.quantity
          : (entryPrice - exitPrice) * params.quantity;
        const exitSide = bracketSide === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY;

        this.logger.log(
          `ICT bracket closed for sub ${sub.id} — ${isTP ? 'TP' : 'SL'} @ ${exitPrice.toFixed(2)} pnl=${pnl.toFixed(2)}`,
        );

        await this.tradeLogsRepo.create({
          subscriptionId: sub.id,
          symbol: params.symbol,
          side: exitSide,
          quantity: params.quantity,
          price: exitPrice,
          pnl,
          status: isTP ? 'bracket_exit:tp' : 'bracket_exit:sl',
        });

        if (!isTP) sessionState.lossesThisSession++;
      } else {
        this.logger.debug(`ICT bracket still open for sub ${sub.id} — waiting for TP/SL`);
      }
      return; // either way, don't place a new entry this tick
    }

    // ── No open bracket — look for a new entry signal ─────────────────────────
    const BAR_LIMIT = 60;
    const [h1Bars, m15Bars, m5Bars] = await Promise.all([
      this.getCachedBars(params.symbol, '1Hour', BAR_LIMIT),
      this.getCachedBars(params.symbol, '15Min', BAR_LIMIT),
      this.getCachedBars(params.symbol, '5Min',  BAR_LIMIT),
    ]);

    const minBars = params.swingLookback * 2 + 1;
    if (h1Bars.length < minBars || m15Bars.length < minBars || m5Bars.length < minBars) {
      this.logger.debug(`ICT: insufficient bars for ${params.symbol} — holding`);
      return;
    }

    const currentPrice = m5Bars.at(-1)?.close ?? 0;
    const signalResult = generateIctSignal({ h1Bars, m15Bars, m5Bars, params, currentTime: now });

    this.logger.debug(
      `ICT ${sub.blueprint.title} — ${params.symbol} signal=${signalResult.signal} reason=${signalResult.reason}`,
    );

    if (signalResult.signal === TradeSignal.HOLD) {
      await this.tradeLogsRepo.create({
        subscriptionId: sub.id,
        symbol: params.symbol,
        side: TradeSignal.HOLD,
        quantity: 0,
        price: currentPrice,
        pnl: null,
        status: `ict_hold:${signalResult.reason}`,
      });
      return;
    }

    const orderParams: OrderParams = {
      symbol: params.symbol,
      side: signalResult.side!,
      quantity: params.quantity,
      accountId: sub.user.id,
      limitOrder: {
        limitPrice: signalResult.limitPrice!,
        stopLossPrice: signalResult.stopLossPrice!,
        takeProfitPrice: signalResult.takeProfitPrice!,
      },
    };

    const result = await this.broker.placeOrderWithCredentials(orderParams, apiKey, apiSecret);
    sessionState.tradesThisSession++;

    // Encode bracket metadata in status so the next tick can monitor the position.
    // format: bracket_entry:<symbol>:<side>:<entryPrice>:<slPrice>:<tpPrice>
    const entryPrice = result.filledPrice || signalResult.limitPrice!;
    await this.tradeLogsRepo.create({
      subscriptionId: sub.id,
      symbol: params.symbol,
      side: signalResult.signal,
      quantity: params.quantity,
      price: entryPrice,
      pnl: null,
      status: `bracket_entry:${params.symbol}:${signalResult.side}:${entryPrice}:${signalResult.stopLossPrice}:${signalResult.takeProfitPrice}`,
    });
  }
}
