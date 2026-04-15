import {
    BadRequestException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type {
    BacktestQueryDto,
    BacktestResultDto,
    BacktestTradeDto,
    BlueprintBacktestPreviewDto,
    IBrokerAdapter,
    IctParametersDto,
    MarketBarDto,
    MarketDataTimeframe,
    RsiParametersDto,
} from '@vantrade/types';
import { BlueprintParametersSchema, OrderSide, TradeSignal } from '@vantrade/types';
import {
    aggregateBars,
    calculatePnL,
    calculateRSI,
    checkLimitOrderFill,
    generateIctSignal,
    generateSignal,
} from '../trading/trading.engine';
import { BlueprintsRepository } from './blueprints.repository';

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

@Injectable()
export class BacktestService {
  constructor(
    private readonly repo: BlueprintsRepository,
    @Inject('IBrokerAdapter') private readonly broker: IBrokerAdapter,
  ) {}

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

    const bars = await this.broker.getRecentBars(symbol, timeframe, limit).catch((err: unknown) => {
      throw new BadRequestException(err instanceof Error ? err.message : `Failed to fetch bars for ${symbol}`);
    });

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
    const equityCurve: EquityPoint[] = [];

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

  private async simulateIct(
    params: IctParametersDto,
    symbol: string,
    limit: number,
    slippagePct = 0,
    commissionPerTrade = 0,
  ): Promise<BacktestResultDto> {
    const m5Bars = await this.broker.getRecentBars(symbol, '5Min', limit).catch((err: unknown) => {
      throw new BadRequestException(err instanceof Error ? err.message : `Failed to fetch bars for ${symbol}`);
    });

    const minBars = params.swingLookback * 2 + 3;
    if (m5Bars.length < minBars) {
      throw new BadRequestException(
        `Not enough M5 bars for ICT backtest (got ${m5Bars.length}, need ${minBars})`,
      );
    }

    const M5_PER_M15 = 3;
    const M5_PER_H1  = 12;
    const startIndex = Math.max(params.swingLookback * 2 + 1, M5_PER_H1 * 4);
    const slippageFactor = slippagePct / 100;

    let openPosition: OpenIctPosition | null = null;
    const trades: BacktestTradeDto[] = [];
    let runningEquity = 0;
    const equityCurve: EquityPoint[] = [];

    for (let i = startIndex; i < m5Bars.length; i++) {
      const m5Slice  = m5Bars.slice(0, i + 1);
      const m15Slice = aggregateBars(m5Slice, M5_PER_M15);
      const h1Slice  = aggregateBars(m5Slice, M5_PER_H1);

      const currentBar = m5Bars[i];

      if (openPosition !== null) {
        const closed = this.tryCloseIctPosition(openPosition, currentBar, params, slippageFactor, commissionPerTrade);
        if (closed !== null) {
          runningEquity += closed.pnl;
          trades.push(closed.trade);
          equityCurve.push({ timestamp: currentBar.timestamp.toISOString(), equity: runningEquity });
          openPosition = null;
        }
        continue;
      }

      if (h1Slice.length < params.swingLookback * 2 + 1 || m15Slice.length < params.swingLookback * 2 + 1) continue;

      const signalResult = generateIctSignal({
        h1Bars: h1Slice,
        m15Bars: m15Slice,
        m5Bars: m5Slice,
        params,
        currentTime: currentBar.timestamp,
      });

      if (signalResult.signal !== TradeSignal.HOLD && signalResult.limitPrice !== null) {
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

  private calculateSharpeRatio(pnlSeries: number[]): number {
    if (pnlSeries.length < 2) return 0;
    const mean = pnlSeries.reduce((s, v) => s + v, 0) / pnlSeries.length;
    const variance = pnlSeries.reduce((s, v) => s + (v - mean) ** 2, 0) / pnlSeries.length;
    const stddev = Math.sqrt(variance);
    if (stddev === 0) return 0;
    return (mean / stddev) * Math.sqrt(252);
  }
}
