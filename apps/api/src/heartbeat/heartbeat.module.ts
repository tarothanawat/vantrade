import { Module } from '@nestjs/common';
import { EncryptionModule } from '../encryption/encryption.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TradeLogsModule } from '../trade-logs/trade-logs.module';
import { TradingModule } from '../trading/trading.module';
import { HeartbeatService } from './heartbeat.service';

@Module({
  imports: [SubscriptionsModule, TradingModule, EncryptionModule, TradeLogsModule],
  providers: [HeartbeatService],
})
export class HeartbeatModule {}
