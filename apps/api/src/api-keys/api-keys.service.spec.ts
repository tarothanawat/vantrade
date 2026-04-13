import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EncryptionService } from '../encryption/encryption.service';
import { ApiKeysRepository } from './api-keys.repository';
import { ApiKeysService } from './api-keys.service';

const STORED_KEY = { encryptedKey: 'ek', encryptedSecret: 'es', userId: 'user-1', label: 'default', broker: 'alpaca' };

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let mockRepo: jest.Mocked<Pick<ApiKeysRepository, 'findByUser' | 'findByUserAndLabel' | 'upsert' | 'delete'>>;
  let mockEncryption: jest.Mocked<Pick<EncryptionService, 'encrypt' | 'decrypt'>>;
  let mockBroker: { verifyCredentials: jest.Mock };

  beforeEach(async () => {
    mockRepo = {
      findByUser: jest.fn(),
      findByUserAndLabel: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    };
    mockEncryption = {
      encrypt: jest.fn().mockReturnValue('encrypted'),
      decrypt: jest.fn().mockReturnValue('decrypted'),
    };
    mockBroker = {
      verifyCredentials: jest.fn(),
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

  describe('upsert()', () => {
    it('encrypts both key and secret before storing', async () => {
      mockRepo.upsert.mockResolvedValue(STORED_KEY as never);

      await service.upsert({ alpacaApiKey: 'raw-key', alpacaApiSecret: 'raw-secret', label: 'default' }, 'user-1');

      expect(mockEncryption.encrypt).toHaveBeenCalledWith('raw-key');
      expect(mockEncryption.encrypt).toHaveBeenCalledWith('raw-secret');
      expect(mockRepo.upsert).toHaveBeenCalledWith('user-1', {
        encryptedKey: 'encrypted',
        encryptedSecret: 'encrypted',
        label: 'default',
      });
    });

    it('returns a confirmation message', async () => {
      mockRepo.upsert.mockResolvedValue(STORED_KEY as never);

      const result = await service.upsert({ alpacaApiKey: 'k', alpacaApiSecret: 's', label: 'default' }, 'user-1');

      expect(result).toEqual({ message: 'API key stored securely' });
    });

    it('stores a custom label when provided', async () => {
      mockRepo.upsert.mockResolvedValue({ ...STORED_KEY, label: 'test-account' } as never);

      await service.upsert({ alpacaApiKey: 'k', alpacaApiSecret: 's', label: 'test-account' }, 'user-1');

      expect(mockRepo.upsert).toHaveBeenCalledWith('user-1', expect.objectContaining({ label: 'test-account' }));
    });
  });

  describe('hasKey()', () => {
    it('returns true when the user has at least one key', async () => {
      mockRepo.findByUser.mockResolvedValue([STORED_KEY] as never[]);

      await expect(service.hasKey('user-1')).resolves.toBe(true);
    });

    it('returns false when the user has no keys', async () => {
      mockRepo.findByUser.mockResolvedValue([]);

      await expect(service.hasKey('user-1')).resolves.toBe(false);
    });
  });

  describe('listKeys()', () => {
    it('returns label and broker for each stored key', async () => {
      mockRepo.findByUser.mockResolvedValue([
        { ...STORED_KEY, label: 'default' },
        { ...STORED_KEY, label: 'test-account' },
      ] as never[]);

      const result = await service.listKeys('user-1');

      expect(result).toEqual([
        { label: 'default', broker: 'alpaca' },
        { label: 'test-account', broker: 'alpaca' },
      ]);
    });

    it('returns an empty array when no keys are stored', async () => {
      mockRepo.findByUser.mockResolvedValue([]);

      await expect(service.listKeys('user-1')).resolves.toEqual([]);
    });
  });

  describe('remove()', () => {
    it('throws NotFoundException when no key with that label exists', async () => {
      mockRepo.findByUserAndLabel.mockResolvedValue(null);

      await expect(service.remove({ label: 'default' }, 'user-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('deletes the key by userId and label when found', async () => {
      mockRepo.findByUserAndLabel.mockResolvedValue(STORED_KEY as never);
      mockRepo.delete.mockResolvedValue(STORED_KEY as never);

      await service.remove({ label: 'default' }, 'user-1');

      expect(mockRepo.delete).toHaveBeenCalledWith('user-1', 'default');
    });

    it('returns a confirmation message', async () => {
      mockRepo.findByUserAndLabel.mockResolvedValue(STORED_KEY as never);
      mockRepo.delete.mockResolvedValue(STORED_KEY as never);

      const result = await service.remove({ label: 'default' }, 'user-1');

      expect(result).toEqual({ message: 'API key removed' });
    });
  });

  describe('verify()', () => {
    it('throws NotFoundException when the user has no API key stored', async () => {
      mockRepo.findByUserAndLabel.mockResolvedValue(null);

      await expect(service.verify('user-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(mockBroker.verifyCredentials).not.toHaveBeenCalled();
    });

    it('decrypts stored credentials before calling the broker', async () => {
      mockRepo.findByUserAndLabel.mockResolvedValue(STORED_KEY as never);
      mockBroker.verifyCredentials.mockResolvedValue(true);

      await service.verify('user-1');

      expect(mockEncryption.decrypt).toHaveBeenCalledWith('ek');
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('es');
      expect(mockBroker.verifyCredentials).toHaveBeenCalledWith('decrypted', 'decrypted');
    });

    it('returns { valid: true } when the broker accepts the credentials', async () => {
      mockRepo.findByUserAndLabel.mockResolvedValue(STORED_KEY as never);
      mockBroker.verifyCredentials.mockResolvedValue(true);

      await expect(service.verify('user-1')).resolves.toEqual({ valid: true });
    });

    it('returns { valid: false } when the broker rejects the credentials', async () => {
      mockRepo.findByUserAndLabel.mockResolvedValue(STORED_KEY as never);
      mockBroker.verifyCredentials.mockResolvedValue(false);

      await expect(service.verify('user-1')).resolves.toEqual({ valid: false });
    });

    it('uses the provided label when verifying a non-default key', async () => {
      mockRepo.findByUserAndLabel.mockResolvedValue({ ...STORED_KEY, label: 'test-account' } as never);
      mockBroker.verifyCredentials.mockResolvedValue(true);

      await service.verify('user-1', 'test-account');

      expect(mockRepo.findByUserAndLabel).toHaveBeenCalledWith('user-1', 'test-account');
    });
  });
});
