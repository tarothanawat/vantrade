import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EncryptionService } from '../encryption/encryption.service';
import { ApiKeysRepository } from './api-keys.repository';
import { ApiKeysService } from './api-keys.service';

const STORED_KEY = { encryptedKey: 'ek', encryptedSecret: 'es', userId: 'user-1' };

describe('ApiKeysService.verify()', () => {
  let service: ApiKeysService;
  let mockRepo: jest.Mocked<Pick<ApiKeysRepository, 'findByUser' | 'upsert' | 'delete'>>;
  let mockEncryption: jest.Mocked<Pick<EncryptionService, 'encrypt' | 'decrypt'>>;
  let mockBroker: { verifyCredentials: jest.Mock; getPositionsWithCredentials: jest.Mock };

  beforeEach(async () => {
    mockRepo = {
      findByUser: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    };
    mockEncryption = {
      encrypt: jest.fn().mockReturnValue('encrypted'),
      decrypt: jest.fn().mockReturnValue('decrypted'),
    };
    mockBroker = {
      verifyCredentials: jest.fn(),
      getPositionsWithCredentials: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: ApiKeysRepository, useValue: mockRepo },
        { provide: EncryptionService, useValue: mockEncryption },
        { provide: 'IBrokerAdapter', useValue: mockBroker },
      ],
    }).compile();

    service = module.get(ApiKeysService);
  });

  it('throws NotFoundException when the user has no API key stored', async () => {
    mockRepo.findByUser.mockResolvedValue(null);

    await expect(service.verify('user-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(mockBroker.verifyCredentials).not.toHaveBeenCalled();
  });

  it('decrypts stored credentials before calling the broker', async () => {
    mockRepo.findByUser.mockResolvedValue(STORED_KEY as never);
    mockBroker.verifyCredentials.mockResolvedValue(true);

    await service.verify('user-1');

    expect(mockEncryption.decrypt).toHaveBeenCalledWith('ek');
    expect(mockEncryption.decrypt).toHaveBeenCalledWith('es');
    expect(mockBroker.verifyCredentials).toHaveBeenCalledWith('decrypted', 'decrypted');
  });

  it('returns { valid: true } when the broker accepts the credentials', async () => {
    mockRepo.findByUser.mockResolvedValue(STORED_KEY as never);
    mockBroker.verifyCredentials.mockResolvedValue(true);

    await expect(service.verify('user-1')).resolves.toEqual({ valid: true });
  });

  it('returns { valid: false } when the broker rejects the credentials', async () => {
    mockRepo.findByUser.mockResolvedValue(STORED_KEY as never);
    mockBroker.verifyCredentials.mockResolvedValue(false);

    await expect(service.verify('user-1')).resolves.toEqual({ valid: false });
  });
});
