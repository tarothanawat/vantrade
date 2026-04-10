import { Module } from '@nestjs/common';
import { EncryptionModule } from '../encryption/encryption.module';
import { TradingModule } from '../trading/trading.module';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysRepository } from './api-keys.repository';
import { ApiKeysService } from './api-keys.service';

@Module({
  imports: [EncryptionModule, TradingModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeysRepository],
})
export class ApiKeysModule {}
