import { Module } from '@nestjs/common';
import { BlueprintsModule } from '../blueprints/blueprints.module';
import { TradeLogsModule } from '../trade-logs/trade-logs.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsRepository } from './subscriptions.repository';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [BlueprintsModule, TradeLogsModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionsRepository],
  exports: [SubscriptionsRepository],
})
export class SubscriptionsModule {}
