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
    BlueprintParametersDto,
    BlueprintUpdateDto,
    BlueprintVerifyDto,
    IBrokerAdapter,
    MarketDataTimeframe,
} from '@vantrade/types';
import { BlueprintParametersSchema } from '@vantrade/types';
import { calculatePnL, calculateRSI, generateSignal } from '../trading/trading.engine';
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

  async runBacktest(id: string, query: BacktestQueryDto): Promise<BacktestResultDto> {
    const blueprint = await this.repo.findById(id);
    if (!blueprint) throw new NotFoundException('Blueprint not found');

    const parsed = BlueprintParametersSchema.safeParse(blueprint.parameters);
    if (!parsed.success) throw new BadRequestException('Invalid blueprint parameters');

    const params = parsed.data;
    return this.simulate(
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
    return this.simulate(
      params,
      dto.testSymbol ?? params.symbol,
      dto.testTimeframe ?? params.executionTimeframe,
      dto.limit,
      dto.slippagePct,
      dto.commissionPerTrade,
    );
  }

  private async simulate(
    params: BlueprintParametersDto,
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

    type OpenPosition = { side: 'buy' | 'sell'; entryPrice: number; entryTime: string; entryRsi: number };
    let openPosition: OpenPosition | null = null;
    const trades: BacktestTradeDto[] = [];
    let runningEquity = 0;
    const equityCurve: { timestamp: string; equity: number }[] = [];

    for (let i = params.rsiPeriod; i < closePrices.length; i++) {
      const rsi = calculateRSI(closePrices.slice(0, i + 1), params.rsiPeriod);
      const signal = generateSignal(rsi, params.rsiBuyThreshold, params.rsiSellThreshold);
      const price = closePrices[i];
      const time = timestamps[i];

      if (params.executionMode === 'BUY_LOW_SELL_HIGH') {
        if (signal === 'buy' && openPosition === null) {
          // Slippage on entry: buyer pays slightly more
          const filledPrice = price * (1 + slippageFactor);
          openPosition = { side: 'buy', entryPrice: filledPrice, entryTime: time, entryRsi: rsi };
        } else if (signal === 'sell' && openPosition?.side === 'buy') {
          // Slippage on exit: seller receives slightly less
          const filledPrice = price * (1 - slippageFactor);
          const pnl = calculatePnL(openPosition.entryPrice, filledPrice, params.quantity, 'buy') - commissionPerTrade * 2;
          runningEquity += pnl;
          trades.push({ entryTime: openPosition.entryTime, exitTime: time, side: 'buy', entryPrice: openPosition.entryPrice, exitPrice: filledPrice, entryRsi: openPosition.entryRsi, exitRsi: rsi, pnl, isOpen: false });
          equityCurve.push({ timestamp: time, equity: runningEquity });
          openPosition = null;
        }
      } else {
        if (signal === 'sell' && openPosition === null) {
          const filledPrice = price * (1 - slippageFactor);
          openPosition = { side: 'sell', entryPrice: filledPrice, entryTime: time, entryRsi: rsi };
        } else if (signal === 'buy' && openPosition?.side === 'sell') {
          const filledPrice = price * (1 + slippageFactor);
          const pnl = calculatePnL(openPosition.entryPrice, filledPrice, params.quantity, 'sell') - commissionPerTrade * 2;
          runningEquity += pnl;
          trades.push({ entryTime: openPosition.entryTime, exitTime: time, side: 'sell', entryPrice: openPosition.entryPrice, exitPrice: filledPrice, entryRsi: openPosition.entryRsi, exitRsi: rsi, pnl, isOpen: false });
          equityCurve.push({ timestamp: time, equity: runningEquity });
          openPosition = null;
        }
      }
    }

    if (openPosition !== null) {
      trades.push({ entryTime: openPosition.entryTime, exitTime: null, side: openPosition.side, entryPrice: openPosition.entryPrice, exitPrice: null, entryRsi: openPosition.entryRsi, exitRsi: null, pnl: null, isOpen: true });
    }

    const closedTrades = trades.filter((t) => !t.isOpen);
    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const winCount = closedTrades.filter((t) => (t.pnl ?? 0) > 0).length;
    const lossCount = closedTrades.filter((t) => (t.pnl ?? 0) < 0).length;
    const winRate = winCount + lossCount > 0 ? (winCount / (winCount + lossCount)) * 100 : 0;
    const maxDrawdown = this.calculateMaxDrawdown(equityCurve.map((e) => e.equity));
    const sharpeRatio = this.calculateSharpeRatio(closedTrades.map((t) => t.pnl ?? 0));

    return {
      symbol,
      timeframe,
      barsAnalyzed: bars.length,
      trades,
      totalPnL,
      winRate,
      totalTrades: trades.length,
      winCount,
      lossCount,
      equityCurve,
      maxDrawdown,
      sharpeRatio,
    };
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
