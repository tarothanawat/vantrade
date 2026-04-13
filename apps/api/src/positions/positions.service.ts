import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { IBrokerAdapter } from '@vantrade/types';
import { ApiKeysRepository } from '../api-keys/api-keys.repository';
import { EncryptionService } from '../encryption/encryption.service';

@Injectable()
export class PositionsService {
  constructor(
    @Inject('IBrokerAdapter') private readonly broker: IBrokerAdapter,
    private readonly apiKeysRepo: ApiKeysRepository,
    private readonly encryption: EncryptionService,
  ) {}

  async getPositions(userId: string) {
    const keys = await this.apiKeysRepo.findByUser(userId);
    const key = keys.find((k) => k.label === 'default') ?? keys[0];
    if (!key) throw new NotFoundException('No API key configured');

    const apiKey = this.encryption.decrypt(key.encryptedKey);
    const apiSecret = this.encryption.decrypt(key.encryptedSecret);
    return this.broker.getPositionsWithCredentials(apiKey, apiSecret);
  }
}
