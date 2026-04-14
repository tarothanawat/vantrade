import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type {
    BacktestQueryDto,
    BacktestResultDto,
    BacktestTradeDto,
    BlueprintBacktestPreviewDto,
    BlueprintCreateDto,
    BlueprintUpdateDto,
    BlueprintVerifyDto,
    IBrokerAdapter,
    IctParametersDto,
    MarketBarDto,
    MarketDataTimeframe,
    RsiParametersDto,
} from '@vantrade/types';
import { BlueprintParametersSchema, OrderSide, TradeSignal } from '@vantrade/types';

type OpenRsiPosition = { side: 'buy' | 'sell'; entryPrice: number; entryTime: string; entryRsi: number };
type OpenIctPosition = {
  side: 'buy' | 'sell';
  entryPrice: number;
  entryTime: string;
  stopLossPrice: number;
  takeProfitPrice: number;
  entryContext: string;
};
type EquityPoint = { timestamp: string; equity: number };
import {
    aggregateBars,
    calculatePnL,
    calculateRSI,
    checkLimitOrderFill,
    generateIctSignal,
    generateSignal,
} from '../trading/trading.engine';
import { BlueprintsRepository } from './blueprints.repository';

@Injectable()
export class BlueprintsService {
  constructor(
    private readonly repo: BlueprintsRepository,
    @Inject('IBrokerAdapter') private readonly broker: IBrokerAdapter,
  ) {}

  findAllVerified() {
    return this.repo.findAllVerified();
  }

  findAll() {
    return this.repo.findAll();
  }

  async findById(id: string) {
    const blueprint = await this.repo.findById(id);
    if (!blueprint) throw new NotFoundException('Blueprint not found');
    return blueprint;
  }

  findByAuthor(authorId: string) {
    return this.repo.findByAuthor(authorId);
  }

  async create(dto: BlueprintCreateDto, authorId: string) {
    const existing = await this.repo.findByTitleAndAuthor(dto.title, authorId);
    if (existing) throw new ConflictException('You already have a blueprint with this title');

    return this.repo.create({ ...dto, authorId });
  }

  async update(id: string, dto: BlueprintUpdateDto, requesterId: string) {
    const blueprint = await this.repo.findById(id);
    if (!blueprint) throw new NotFoundException('Blueprint not found');
    if (blueprint.authorId !== requesterId) throw new ForbiddenException('Not your blueprint');

    return this.repo.update(id, dto);
  }

  async verify(id: string, dto: BlueprintVerifyDto) {
    const blueprint = await this.repo.findById(id);
    if (!blueprint) throw new NotFoundException('Blueprint not found');
    return this.repo.setVerified(id, dto.isVerified);
  }

  async remove(id: string, requesterId: string) {
    const blueprint = await this.repo.findById(id);
    if (!blueprint) throw new NotFoundException('Blueprint not found');
    if (blueprint.authorId !== requesterId) throw new ForbiddenException('Not your blueprint');

    return this.repo.delete(id);
  }

  async getDryRunSignal(id: string) {
    const blueprint = await this.repo.findById(id);
    if (!blueprint) throw new NotFoundException('Blueprint not found');

    const parsed = BlueprintParametersSchema.safeParse(blueprint.parameters);
    if (!parsed.success) throw new BadRequestException('Invalid blueprint parameters');

    const params = parsed.data;

    if (params.strategyType === 'ICT') {
      return this.getDryRunIctSignal(params);
    }
    return this.getDryRunRsiSignal(params);
  }

  private async getDryRunRsiSignal(params: RsiParametersDto) {
    const requiredBars = params.rsiPeriod + 1;
    const bars = await this.broker.getRecentBars(params.symbol, params.executionTimeframe, requiredBars);

    if (bars.length < requiredBars) {
      throw new BadRequestException(
        `Not enough bar data for RSI (got ${bars.length}, need ${requiredBars})`,
      );
    }

    const closeSeries = bars.map((b) => b.close);
    const rsi = calculateRSI(closeSeries, params.rsiPeriod);
    const signal = generateSignal(rsi, params.rsiBuyThreshold, params.rsiSellThreshold);
    const price = bars.at(-1)!.close;

    return { symbol: params.symbol, rsi, signal, price };
  }

  private async getDryRunIctSignal(params: IctParametersDto) {
    const BAR_LIMIT = 60;
    const [h1Bars, m15Bars, m5Bars] = await Promise.all([
      this.broker.getRecentBars(params.symbol, '1Hour', BAR_LIMIT),
      this.broker.getRecentBars(params.symbol, '15Min', BAR_LIMIT),
      this.broker.getRecentBars(params.symbol, '5Min',  BAR_LIMIT),
    ]);

    const result = generateIctSignal({
      h1Bars,
      m15Bars,
      m5Bars,
      params,
      currentTime: new Date(),
    });

    return {
      symbol: params.symbol,
      signal: result.signal,
      reason: result.reason,
      limitPrice: result.limitPrice,
      stopLossPrice: result.stopLossPrice,
      takeProfitPrice: result.takeProfitPrice,
      price: m5Bars.at(-1)?.close ?? 0,
    };
  }

  async runBacktest(id: string, query: BacktestQueryDto): Promise<BacktestResultDto> {
    const blueprint = await this.repo.findById(id);
    if (!blueprint) throw new NotFoundException('Blueprint not found');

    const parsed = BlueprintParametersSchema.safeParse(blueprint.parameters);
    if (!parsed.success) throw new BadRequestException('Invalid blueprint parameters');

    const params = parsed.data;

    if (params.strategyType === 'ICT') {
      return this.simulateIct(params, query.symbol ?? params.symbol, query.limit, query.slippagePct, query.commissionPerTrade);
    }

    return this.simulateRsi(
      params,
      query.symbol ?? params.symbol,
      query.timeframe ?? params.executionTimeframe,
      query.limit,
      query.slippagePct,
      query.commissionPerTrade,
    );
  }

  async runBacktestPreview(dto: BlueprintBacktestPreviewDto): Promise<BacktestResultDto> {
    const params = dto.parameters;

    if (params.strategyType === 'ICT') {
      return this.simulateIct(params, dto.testSymbol ?? params.symbol, dto.limit, dto.slippagePct, dto.commissionPerTrade);
    }

    return this.simulateRsi(
      params,
      dto.testSymbol ?? params.symbol,
      dto.testTimeframe ?? params.executionTimeframe,
      dto.limit,
      dto.slippagePct,
      dto.commissionPerTrade,
    );
  }

  private async simulateRsi(
    params: RsiParametersDto,
    symbol: string,
    timeframe: MarketDataTimeframe,
    limit: number,
    slippagePct = 0,
    commissionPerTrade = 0,
  ): Promise<BacktestResultDto> {
    if (limit < params.rsiPeriod + 1) {
      throw new BadRequestException(
        `Limit must be at least rsiPeriod + 1 (${params.rsiPeriod + 1}) to compute RSI`,
      );
    }

    const bars = await this.broker.getRecentBars(symbol, timeframe, limit);

    if (bars.length < params.rsiPeriod + 1) {
      throw new BadRequestException(
        `Not enough bar data for RSI (got ${bars.length}, need ${params.rsiPeriod + 1})`,
      );
    }

    const closePrices = bars.map((b) => b.close);
    const timestamps = bars.map((b) => b.timestamp.toISOString());

    const slippageFactor = slippagePct / 100;

    let openPosition: OpenRsiPosition | null = null;
    const trades: BacktestTradeDto[] = [];
    let runningEquity = 0;
    const equityCurve: { timestamp: string; equity: number }[] = [];

    for (let i = params.rsiPeriod; i < closePrices.length; i++) {
      const rsi = calculateRSI(closePrices.slice(0, i + 1), params.rsiPeriod);
      const signal = generateSignal(rsi, params.rsiBuyThreshold, params.rsiSellThreshold);
      const result = this.processRsiBar(
        signal, closePrices[i], timestamps[i], rsi,
        params.executionMode, openPosition, params, slippageFactor, commissionPerTrade,
      );
      openPosition = result.openPosition;
      if (result.closedTrade) {
        runningEquity += result.pnl!;
        trades.push(result.closedTrade);
        equityCurve.push({ timestamp: timestamps[i], equity: runningEquity });
      }
    }

    if (openPosition !== null) {
      trades.push({ entryTime: openPosition.entryTime, exitTime: null, side: openPosition.side, entryPrice: openPosition.entryPrice, exitPrice: null, entryRsi: openPosition.entryRsi, exitRsi: null, entryContext: null, exitReason: null, pnl: null, isOpen: true });
    }

    return this.buildBacktestResult(trades, equityCurve, bars.length, symbol, timeframe);
  }

  // ── ICT Backtest ───────────────────────────────────────────────────────────

  private async simulateIct(
    params: IctParametersDto,
    symbol: string,
    limit: number,
    slippagePct = 0,
    commissionPerTrade = 0,
  ): Promise<BacktestResultDto> {
    // Fetch M5 bars only — M15 and H1 views are derived via aggregateBars
    const m5Bars = await this.broker.getRecentBars(symbol, '5Min', limit);

    const minBars = params.swingLookback * 2 + 3;
    if (m5Bars.length < minBars) {
      throw new BadRequestException(
        `Not enough M5 bars for ICT backtest (got ${m5Bars.length}, need ${minBars})`,
      );
    }

    const M5_PER_M15 = 3;
    const M5_PER_H1  = 12;
    // Start once we can build at least 4 H1 bars (for swing detection)
    const startIndex = Math.max(params.swingLookback * 2 + 1, M5_PER_H1 * 4);

    const slippageFactor = slippagePct / 100;

    let openPosition: OpenIctPosition | null = null;
    const trades: BacktestTradeDto[] = [];
    let runningEquity = 0;
    const equityCurve: { timestamp: string; equity: number }[] = [];

    for (let i = startIndex; i < m5Bars.length; i++) {
      const m5Slice  = m5Bars.slice(0, i + 1);
      const m15Slice = aggregateBars(m5Slice, M5_PER_M15);
      const h1Slice  = aggregateBars(m5Slice, M5_PER_H1);

      const currentBar = m5Bars[i];

      // Check if an open limit order was filled on this bar
      if (openPosition !== null) {
        const closed = this.tryCloseIctPosition(openPosition, currentBar, params, slippageFactor, commissionPerTrade);
        if (closed !== null) {
          runningEquity += closed.pnl;
          trades.push(closed.trade);
          equityCurve.push({ timestamp: currentBar.timestamp.toISOString(), equity: runningEquity });
          openPosition = null;
        }
        // Whether closed or still pending, skip new entry this bar
        continue;
      }

      // Generate ICT signal on current multi-timeframe slices
      if (h1Slice.length < params.swingLookback * 2 + 1 || m15Slice.length < params.swingLookback * 2 + 1) continue;

      const signalResult = generateIctSignal({
        h1Bars: h1Slice,
        m15Bars: m15Slice,
        m5Bars: m5Slice,
        params,
        currentTime: currentBar.timestamp,
      });

      if (signalResult.signal !== TradeSignal.HOLD && signalResult.limitPrice !== null) {
        // Apply entry slippage to limit price
        const entryPrice = signalResult.side === OrderSide.BUY
          ? signalResult.limitPrice * (1 + slippageFactor)
          : signalResult.limitPrice * (1 - slippageFactor);

        openPosition = {
          side: signalResult.side === OrderSide.BUY ? 'buy' : 'sell',
          entryPrice,
          entryTime: currentBar.timestamp.toISOString(),
          stopLossPrice: signalResult.stopLossPrice!,
          takeProfitPrice: signalResult.takeProfitPrice!,
          entryContext: signalResult.reason,
        };
      }
    }

    // Mark any still-pending position as open (unfilled or in-flight)
    if (openPosition !== null) {
      trades.push({
        entryTime: openPosition.entryTime,
        exitTime: null,
        side: openPosition.side,
        entryPrice: openPosition.entryPrice,
        exitPrice: null,
        entryRsi: null,
        exitRsi: null,
        entryContext: openPosition.entryContext,
        exitReason: null,
        pnl: null,
        isOpen: true,
      });
    }

    return this.buildBacktestResult(trades, equityCurve, m5Bars.length, symbol, '5Min');
  }

  /** Processes a single RSI bar tick: opens or closes a position depending on signal and mode.
   *  Returns the updated open position and an optional closed trade with its realised pnl. */
  private processRsiBar(
    signal: string,
    price: number,
    time: string,
    rsi: number,
    executionMode: string,
    openPosition: OpenRsiPosition | null,
    params: RsiParametersDto,
    slippageFactor: number,
    commissionPerTrade: number,
  ): { openPosition: OpenRsiPosition | null; closedTrade?: BacktestTradeDto; pnl?: number } {
    if (executionMode === 'BUY_LOW_SELL_HIGH') {
      if (signal === 'buy' && openPosition === null) {
        return { openPosition: { side: 'buy', entryPrice: price * (1 + slippageFactor), entryTime: time, entryRsi: rsi } };
      }
      if (signal === 'sell' && openPosition?.side === 'buy') {
        const exitPrice = price * (1 - slippageFactor);
        const pnl = calculatePnL(openPosition.entryPrice, exitPrice, params.quantity, 'buy') - commissionPerTrade * 2;
        return { openPosition: null, pnl, closedTrade: { entryTime: openPosition.entryTime, exitTime: time, side: 'buy', entryPrice: openPosition.entryPrice, exitPrice, entryRsi: openPosition.entryRsi, exitRsi: rsi, entryContext: null, exitReason: null, pnl, isOpen: false } };
      }
    } else {
      if (signal === 'sell' && openPosition === null) {
        return { openPosition: { side: 'sell', entryPrice: price * (1 - slippageFactor), entryTime: time, entryRsi: rsi } };
      }
      if (signal === 'buy' && openPosition?.side === 'sell') {
        const exitPrice = price * (1 + slippageFactor);
        const pnl = calculatePnL(openPosition.entryPrice, exitPrice, params.quantity, 'sell') - commissionPerTrade * 2;
        return { openPosition: null, pnl, closedTrade: { entryTime: openPosition.entryTime, exitTime: time, side: 'sell', entryPrice: openPosition.entryPrice, exitPrice, entryRsi: openPosition.entryRsi, exitRsi: rsi, entryContext: null, exitReason: null, pnl, isOpen: false } };
      }
    }
    return { openPosition };
  }

  /** Attempts to close an open ICT limit-order position on the given bar.
   *  Returns the closed trade + realised pnl if TP or SL was hit, null if still pending. */
  private tryCloseIctPosition(
    openPosition: OpenIctPosition,
    currentBar: MarketBarDto,
    params: IctParametersDto,
    slippageFactor: number,
    commissionPerTrade: number,
  ): { trade: BacktestTradeDto; pnl: number } | null {
    const fillResult = checkLimitOrderFill(currentBar, openPosition);
    if (fillResult === null) return null;

    const exitTime = currentBar.timestamp.toISOString();
    let exitPrice: number;
    if (fillResult === 'TP') {
      exitPrice = openPosition.takeProfitPrice;
    } else {
      // SL: apply adverse slippage
      const raw = openPosition.stopLossPrice;
      exitPrice = openPosition.side === 'buy' ? raw * (1 - slippageFactor) : raw * (1 + slippageFactor);
    }

    const pnl = calculatePnL(openPosition.entryPrice, exitPrice, params.quantity, openPosition.side) - commissionPerTrade * 2;
    const trade: BacktestTradeDto = {
      entryTime: openPosition.entryTime,
      exitTime,
      side: openPosition.side,
      entryPrice: openPosition.entryPrice,
      exitPrice,
      entryRsi: null,
      exitRsi: null,
      entryContext: openPosition.entryContext,
      exitReason: fillResult,
      pnl,
      isOpen: false,
    };
    return { trade, pnl };
  }

  /** Computes the final BacktestResultDto from the collected trades and equity curve. */
  private buildBacktestResult(
    trades: BacktestTradeDto[],
    equityCurve: EquityPoint[],
    barsAnalyzed: number,
    symbol: string,
    timeframe: MarketDataTimeframe,
  ): BacktestResultDto {
    const closedTrades = trades.filter((t) => !t.isOpen);
    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const winCount = closedTrades.filter((t) => (t.pnl ?? 0) > 0).length;
    const lossCount = closedTrades.filter((t) => (t.pnl ?? 0) < 0).length;
    const winRate = winCount + lossCount > 0 ? (winCount / (winCount + lossCount)) * 100 : 0;
    const maxDrawdown = this.calculateMaxDrawdown(equityCurve.map((e) => e.equity));
    const sharpeRatio = this.calculateSharpeRatio(closedTrades.map((t) => t.pnl ?? 0));
    return { symbol, timeframe, barsAnalyzed, trades, totalPnL, winRate, totalTrades: trades.length, winCount, lossCount, equityCurve, maxDrawdown, sharpeRatio };
  }

  /** Peak-to-trough maximum drawdown (in equity units). */
  private calculateMaxDrawdown(equityPoints: number[]): number {
    if (equityPoints.length === 0) return 0;
    let peak = equityPoints[0];
    let maxDD = 0;
    for (const eq of equityPoints) {
      if (eq > peak) peak = eq;
      const dd = peak - eq;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
  }

  /**
   * Annualised Sharpe ratio (risk-free rate = 0).
   * Uses per-trade returns; assumes ~252 trading days / year and 1 trade/day as a proxy.
   * Returns 0 when there are fewer than 2 closed trades.
   */
  private calculateSharpeRatio(pnlSeries: number[]): number {
    if (pnlSeries.length < 2) return 0;
    const mean = pnlSeries.reduce((s, v) => s + v, 0) / pnlSeries.length;
    const variance = pnlSeries.reduce((s, v) => s + (v - mean) ** 2, 0) / pnlSeries.length;
    const stddev = Math.sqrt(variance);
    if (stddev === 0) return 0;
    return (mean / stddev) * Math.sqrt(252);
  }
}
