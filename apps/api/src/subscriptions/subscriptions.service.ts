import {
    ConflictException,
    ForbiddenException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import type { IBrokerAdapter, SubscriptionCreateDto } from '@vantrade/types';
import { BlueprintParametersSchema, OrderSide } from '@vantrade/types';
import { EncryptionService } from '../encryption/encryption.service';
import { BlueprintsRepository } from '../blueprints/blueprints.repository';
import { TradeLogsRepository } from '../trade-logs/trade-logs.repository';
import { SubscriptionsRepository } from './subscriptions.repository';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly repo: SubscriptionsRepository,
    private readonly blueprintsRepo: BlueprintsRepository,
    private readonly tradeLogsRepo: TradeLogsRepository,
    @Inject('IBrokerAdapter') private readonly broker: IBrokerAdapter,
    private readonly encryptionService: EncryptionService,
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

    return this.repo.create(userId, dto.blueprintId, dto.symbolOverride);
  }

  async remove(id: string, userId: string) {
    const sub = await this.repo.findById(id);
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.userId !== userId) throw new ForbiddenException('Not your subscription');

    // Close any open broker position for this blueprint's symbol
    const defaultKey = sub.user.apiKeys?.find((k) => k.label === 'default') ?? sub.user.apiKeys?.[0];
    if (defaultKey) {
      const parsed = BlueprintParametersSchema.safeParse(sub.blueprint.parameters);
      if (parsed.success) {
        const symbol = parsed.data.symbol;
        try {
          const apiKey    = this.encryptionService.decrypt(defaultKey.encryptedKey);
          const apiSecret = this.encryptionService.decrypt(defaultKey.encryptedSecret);
          const positions = await this.broker.getPositionsWithCredentials(apiKey, apiSecret);
          const openPos   = positions.find((p) => {
            const s = p.symbol.toUpperCase().replace('/', '');
            const t = symbol.toUpperCase().replace('/', '');
            return s === t || s === t.replace('USD', '') + 'USD';
          });
          if (openPos && openPos.quantity !== 0) {
            const closeSide = openPos.quantity > 0 ? OrderSide.SELL : OrderSide.BUY;
            await this.broker.placeOrderWithCredentials(
              { symbol, side: closeSide, quantity: Math.abs(openPos.quantity), accountId: userId },
              apiKey,
              apiSecret,
            );
            this.logger.log(`Closed open position ${symbol} (qty=${openPos.quantity}) on subscription removal`);
          }
        } catch (err) {
          this.logger.warn(`Could not close position on subscription removal: ${(err as Error).message}`);
        }
      }
    }

    return this.repo.deleteWithTradeLogs(id);
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

    const stats = await this.tradeLogsRepo.getStats(subId);

    let unrealizedPnl = 0;
    const defaultKey = sub.user.apiKeys?.find((k) => k.label === 'default') ?? sub.user.apiKeys?.[0];
    if (defaultKey) {
      const parsed = BlueprintParametersSchema.safeParse(sub.blueprint.parameters);
      if (parsed.success) {
        const symbol = parsed.data.symbol;
        try {
          const apiKey    = this.encryptionService.decrypt(defaultKey.encryptedKey);
          const apiSecret = this.encryptionService.decrypt(defaultKey.encryptedSecret);
          const positions = await this.broker.getPositionsWithCredentials(apiKey, apiSecret);
          const openPos   = positions.find((p) => {
            const s = p.symbol.toUpperCase().replace('/', '');
            const t = symbol.toUpperCase().replace('/', '');
            return s === t || s === t.replace('USD', '') + 'USD';
          });
          if (openPos) unrealizedPnl = openPos.unrealizedPnl;
        } catch (err) {
          this.logger.warn(`Could not fetch positions for stats: ${(err as Error).message}`);
        }
      }
    }

    return { ...stats, unrealizedPnl };
  }
}
