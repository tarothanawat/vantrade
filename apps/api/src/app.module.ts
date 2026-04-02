import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { AuthModule } from './auth/auth.module';
import { BlueprintsModule } from './blueprints/blueprints.module';
import { EncryptionModule } from './encryption/encryption.module';
import { HeartbeatModule } from './heartbeat/heartbeat.module';
import { MarketDataModule } from './market-data/market-data.module';
import { PrismaModule } from './prisma/prisma.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { TradingModule } from './trading/trading.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    EncryptionModule,
    AuthModule,
    BlueprintsModule,
    SubscriptionsModule,
    TradingModule,
    MarketDataModule,
    HeartbeatModule,
    ApiKeysModule,
  ],
})
export class AppModule {}
