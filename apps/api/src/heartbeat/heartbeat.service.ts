import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { BlueprintParameters, IBrokerAdapter, OrderParams } from '@vantrade/types';
import { BlueprintParametersSchema, OrderSide, TradeSignal } from '@vantrade/types';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsRepository } from '../subscriptions/subscriptions.repository';
import { AlpacaAdapter } from '../trading/broker/alpaca.adapter';
import { calculateRSI, generateSignal } from '../trading/trading.engine';

type ActiveSubscription = Awaited<ReturnType<SubscriptionsRepository['findAllActive']>>[number];

@Injectable()
export class HeartbeatService {
  private readonly logger = new Logger(HeartbeatService.name);

  constructor(
    @Inject('IBrokerAdapter') private readonly broker: IBrokerAdapter,
    private readonly subscriptionsRepo: SubscriptionsRepository,
    private readonly encryptionService: EncryptionService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron('*/60 * * * * *')
  async tick(): Promise<void> {
    this.logger.debug('Heartbeat tick started');
    const active = await this.subscriptionsRepo.findAllActive();
    this.logger.debug(`Processing ${active.length} active subscriptions`);
    await Promise.allSettled(active.map((sub) => this.processSub(sub)));
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

      if (!user.apiKeys || user.apiKeys.length === 0) {
        this.logger.warn(`User ${user.id} has no API key — skipping subscription ${sub.id}`);
        return;
      }

      const apiKey = this.encryptionService.decrypt(user.apiKeys[0].encryptedKey);
      const apiSecret = this.encryptionService.decrypt(user.apiKeys[0].encryptedSecret);

      const currentPrice = await this.broker.getLatestPrice(params.symbol);

      // A single data point is insufficient for RSI — hold until enough bars accumulate
      const mockPriceSeries = [currentPrice];
      if (mockPriceSeries.length < params.rsiPeriod + 1) {
        this.logger.debug(`Not enough price data for RSI on ${params.symbol} — holding`);
        return;
      }

      const rsi = calculateRSI(mockPriceSeries, params.rsiPeriod);
      const signal = generateSignal(rsi, params.rsiBuyThreshold, params.rsiSellThreshold);

      this.logger.debug(
        `${blueprint.title} — ${params.symbol} price=${currentPrice} rsi=${rsi.toFixed(2)} signal=${signal}`,
      );

      if (signal === TradeSignal.HOLD) return;

      const orderParams: OrderParams = {
        symbol: params.symbol,
        side: signal === TradeSignal.BUY ? OrderSide.BUY : OrderSide.SELL,
        quantity: params.quantity,
        accountId: user.id,
      };

      const adapter = this.broker as AlpacaAdapter;
      const result = await adapter.placeOrderWithCredentials(orderParams, apiKey, apiSecret);

      await this.prisma.tradeLog.create({
        data: {
          subscriptionId: sub.id,
          symbol: params.symbol,
          side: signal,
          quantity: params.quantity,
          price: result.filledPrice,
          pnl: null,
          status: result.status,
        },
      });
    } catch (err) {
      this.logger.error(`Error processing subscription ${sub.id}: ${(err as Error).message}`);
      // Do NOT rethrow — error isolation per subscription
    }
  }
}
