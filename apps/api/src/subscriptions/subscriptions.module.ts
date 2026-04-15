import { Module } from '@nestjs/common';
import { BlueprintsModule } from '../blueprints/blueprints.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { TradeLogsModule } from '../trade-logs/trade-logs.module';
import { TradingModule } from '../trading/trading.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsRepository } from './subscriptions.repository';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [BlueprintsModule, TradeLogsModule, TradingModule, EncryptionModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionsRepository],
  exports: [SubscriptionsRepository],
})
export class SubscriptionsModule {}
