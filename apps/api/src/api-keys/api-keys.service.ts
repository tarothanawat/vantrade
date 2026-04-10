import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ApiKeyCreateDto, IBrokerAdapter } from '@vantrade/types';
import { EncryptionService } from '../encryption/encryption.service';
import { ApiKeysRepository } from './api-keys.repository';

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly repo: ApiKeysRepository,
    private readonly encryption: EncryptionService,
    @Inject('IBrokerAdapter') private readonly broker: IBrokerAdapter,
  ) {}

  async upsert(dto: ApiKeyCreateDto, userId: string) {
    const encryptedKey = this.encryption.encrypt(dto.alpacaApiKey);
    const encryptedSecret = this.encryption.encrypt(dto.alpacaApiSecret);

    await this.repo.upsert(userId, { encryptedKey, encryptedSecret });
    return { message: 'API key stored securely' };
  }

  async hasKey(userId: string): Promise<boolean> {
    const key = await this.repo.findByUser(userId);
    return key !== null;
  }

  async remove(userId: string) {
    const key = await this.repo.findByUser(userId);
    if (!key) throw new NotFoundException('No API key found');
    await this.repo.delete(userId);
    return { message: 'API key removed' };
  }

  async verify(userId: string): Promise<{ valid: boolean }> {
    const key = await this.repo.findByUser(userId);
    if (!key) throw new NotFoundException('No API key found');

    const apiKey = this.encryption.decrypt(key.encryptedKey);
    const apiSecret = this.encryption.decrypt(key.encryptedSecret);
    const valid = await this.broker.verifyCredentials(apiKey, apiSecret);
    return { valid };
  }
}
