import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type {
  BlueprintParameters,
  BrokerCredentials,
  IBrokerAdapter,
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

  constructor(
    @Inject('IBrokerAdapter') private readonly broker: IBrokerAdapter,
    private readonly subscriptionsRepo: SubscriptionsRepository,
    private readonly tradeLogsRepo: TradeLogsRepository,
    private readonly encryptionService: EncryptionService,
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

      const credentials: BrokerCredentials = {
        apiKey: this.encryptionService.decrypt(user.apiKeys[0].encryptedKey),
        apiSecret: this.encryptionService.decrypt(user.apiKeys[0].encryptedSecret),
      };

      // Fetch enough bars for RSI: period + 1 data points minimum
      const prices = await this.broker.getHistoricalPrices(params.symbol, params.rsiPeriod + 1);
      const currentPrice = prices[prices.length - 1];

      const rsi = calculateRSI(prices, params.rsiPeriod);
      const signal = generateSignal(rsi, params.rsiBuyThreshold, params.rsiSellThreshold);

      this.logger.debug(
        `${blueprint.title} — ${params.symbol} price=${currentPrice} rsi=${rsi.toFixed(2)} signal=${signal}`,
      );

      if (signal === TradeSignal.HOLD) {
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

      const orderParams: OrderParams = {
        symbol: params.symbol,
        side: signal === TradeSignal.BUY ? OrderSide.BUY : OrderSide.SELL,
        quantity: params.quantity,
        accountId: user.id,
      };

      const result = await this.broker.placeOrder(orderParams, credentials);

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
