import { Module } from '@nestjs/common';
import { EncryptionModule } from '../encryption/encryption.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TradingModule } from '../trading/trading.module';
import { HeartbeatService } from './heartbeat.service';

@Module({
  imports: [SubscriptionsModule, TradingModule, EncryptionModule],
  providers: [HeartbeatService],
})
export class HeartbeatModule {}
