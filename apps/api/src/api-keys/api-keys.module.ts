import { Module } from '@nestjs/common';
import { EncryptionModule } from '../encryption/encryption.module';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysRepository } from './api-keys.repository';
import { ApiKeysService } from './api-keys.service';

@Module({
  imports: [EncryptionModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeysRepository],
})
export class ApiKeysModule {}
