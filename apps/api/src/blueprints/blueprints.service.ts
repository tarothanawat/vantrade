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
} from '@vantrade/types';
import { BlueprintParametersSchema } from '@vantrade/types';
import { calculateRSI, generateSignal } from '../trading/trading.engine';
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
}
