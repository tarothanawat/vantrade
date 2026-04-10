import { Module } from '@nestjs/common';
import { ApiKeysRepository } from '../api-keys/api-keys.repository';
import { EncryptionModule } from '../encryption/encryption.module';
import { TradingModule } from '../trading/trading.module';
import { PositionsController } from './positions.controller';
import { PositionsService } from './positions.service';

@Module({
  imports: [TradingModule, EncryptionModule],
  controllers: [PositionsController],
  providers: [PositionsService, ApiKeysRepository],
})
export class PositionsModule {}
