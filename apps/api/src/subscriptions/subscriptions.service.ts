import {
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type { SubscriptionCreateDto } from '@vantrade/types';
import { BlueprintsRepository } from '../blueprints/blueprints.repository';
import { TradeLogsRepository } from '../trade-logs/trade-logs.repository';
import { SubscriptionsRepository } from './subscriptions.repository';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly repo: SubscriptionsRepository,
    private readonly blueprintsRepo: BlueprintsRepository,
    private readonly tradeLogsRepo: TradeLogsRepository,
  ) {}

  findByUser(userId: string) {
    return this.repo.findByUser(userId);
  }

  async create(dto: SubscriptionCreateDto, userId: string) {
    const blueprint = await this.blueprintsRepo.findById(dto.blueprintId);
    if (!blueprint) throw new NotFoundException('Blueprint not found');
    if (!blueprint.isVerified) throw new ForbiddenException('Blueprint is not verified');

    const existing = await this.repo.findExisting(userId, dto.blueprintId);
    if (existing) throw new ConflictException('Already subscribed to this blueprint');

    return this.repo.create(userId, dto.blueprintId);
  }

  async remove(id: string, userId: string) {
    const sub = await this.repo.findById(id);
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.userId !== userId) throw new ForbiddenException('Not your subscription');

    return this.repo.delete(id);
  }

  async toggle(id: string, userId: string, isActive: boolean) {
    const sub = await this.repo.findById(id);
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.userId !== userId) throw new ForbiddenException('Not your subscription');

    return this.repo.setActive(id, isActive);
  }

  async findTradeLogsBySubscription(subId: string, userId: string, take?: number, skip?: number) {
    const sub = await this.repo.findById(subId);
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.userId !== userId) throw new ForbiddenException('Not your subscription');

    return this.tradeLogsRepo.findBySubscription(subId, take, skip);
  }

  async getStats(subId: string, userId: string) {
    const sub = await this.repo.findById(subId);
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.userId !== userId) throw new ForbiddenException('Not your subscription');

    return this.tradeLogsRepo.getStats(subId);
  }
}
