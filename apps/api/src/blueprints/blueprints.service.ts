import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type {
    BlueprintCreateDto,
    BlueprintUpdateDto,
    BlueprintVerifyDto,
    IBrokerAdapter,
    IctParametersDto,
    RsiParametersDto,
} from '@vantrade/types';
import { BlueprintParametersSchema } from '@vantrade/types';
import {
    calculateRSI,
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
    const bars = await this.broker.getRecentBars(params.symbol, params.executionTimeframe, requiredBars).catch((err: unknown) => {
      throw new BadRequestException(err instanceof Error ? err.message : `Failed to fetch bars for ${params.symbol}`);
    });

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
    ]).catch((err: unknown) => {
      throw new BadRequestException(err instanceof Error ? err.message : `Failed to fetch bars for ${params.symbol}`);
    });

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

}
