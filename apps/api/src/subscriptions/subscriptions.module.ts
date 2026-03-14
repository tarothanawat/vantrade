import { Module } from '@nestjs/common';
import { BlueprintsModule } from '../blueprints/blueprints.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsRepository } from './subscriptions.repository';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [BlueprintsModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionsRepository],
  exports: [SubscriptionsRepository],
})
export class SubscriptionsModule {}
