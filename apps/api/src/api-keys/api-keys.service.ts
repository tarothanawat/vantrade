import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ApiKeyCreateDto, ApiKeyDeleteDto, IBrokerAdapter } from '@vantrade/types';
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

    await this.repo.upsert(userId, { encryptedKey, encryptedSecret, label: dto.label });
    return { message: 'API key stored securely' };
  }

  async listKeys(userId: string) {
    const keys = await this.repo.findByUser(userId);
    return keys.map((k) => ({ label: k.label, broker: k.broker }));
  }

  async hasKey(userId: string): Promise<boolean> {
    const keys = await this.repo.findByUser(userId);
    return keys.length > 0;
  }

  async remove(dto: ApiKeyDeleteDto, userId: string) {
    const key = await this.repo.findByUserAndLabel(userId, dto.label);
    if (!key) throw new NotFoundException(`No API key found with label "${dto.label}"`);
    await this.repo.delete(userId, dto.label);
    return { message: 'API key removed' };
  }

  async verify(userId: string, label = 'default'): Promise<{ valid: boolean }> {
    const key = await this.repo.findByUserAndLabel(userId, label);
    if (!key) throw new NotFoundException(`No API key found with label "${label}"`);

    const apiKey = this.encryption.decrypt(key.encryptedKey);
    const apiSecret = this.encryption.decrypt(key.encryptedSecret);
    const valid = await this.broker.verifyCredentials(apiKey, apiSecret);
    return { valid };
  }
}
