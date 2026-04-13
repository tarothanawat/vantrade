import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiKeysRepository } from '../api-keys/api-keys.repository';
import { EncryptionService } from '../encryption/encryption.service';
import { PositionsService } from './positions.service';

const STORED_KEY = { encryptedKey: 'ek', encryptedSecret: 'es', userId: 'user-1' };

const MOCK_POSITIONS = [
  { symbol: 'BTCUSD', quantity: 1, averageEntryPrice: 50000, currentPrice: 55000, unrealizedPnl: 5000 },
  { symbol: 'AAPL', quantity: 10, averageEntryPrice: 150, currentPrice: 160, unrealizedPnl: 100 },
];

describe('PositionsService.getPositions()', () => {
  let service: PositionsService;
  let mockRepo: jest.Mocked<Pick<ApiKeysRepository, 'findByUser'>>;
  let mockEncryption: jest.Mocked<Pick<EncryptionService, 'decrypt'>>;
  let mockBroker: { getPositionsWithCredentials: jest.Mock };

  beforeEach(async () => {
    mockRepo = { findByUser: jest.fn() };
    mockEncryption = { decrypt: jest.fn().mockReturnValue('decrypted') };
    mockBroker = { getPositionsWithCredentials: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        PositionsService,
        { provide: ApiKeysRepository, useValue: mockRepo },
        { provide: EncryptionService, useValue: mockEncryption },
        { provide: 'IBrokerAdapter', useValue: mockBroker },
      ],
    }).compile();

    service = module.get(PositionsService);
  });

  it('throws NotFoundException when the user has no API key configured', async () => {
    mockRepo.findByUser.mockResolvedValue([] as never);

    await expect(service.getPositions('user-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(mockBroker.getPositionsWithCredentials).not.toHaveBeenCalled();
  });

  it('decrypts stored credentials before calling the broker', async () => {
    mockRepo.findByUser.mockResolvedValue([STORED_KEY] as never);
    mockBroker.getPositionsWithCredentials.mockResolvedValue([]);

    await service.getPositions('user-1');

    expect(mockEncryption.decrypt).toHaveBeenCalledWith('ek');
    expect(mockEncryption.decrypt).toHaveBeenCalledWith('es');
    expect(mockBroker.getPositionsWithCredentials).toHaveBeenCalledWith('decrypted', 'decrypted');
  });

  it('returns the positions array from the broker', async () => {
    mockRepo.findByUser.mockResolvedValue([STORED_KEY] as never);
    mockBroker.getPositionsWithCredentials.mockResolvedValue(MOCK_POSITIONS);

    const result = await service.getPositions('user-1');

    expect(result).toEqual(MOCK_POSITIONS);
  });

  it('returns an empty array when the user has no open positions', async () => {
    mockRepo.findByUser.mockResolvedValue([STORED_KEY] as never);
    mockBroker.getPositionsWithCredentials.mockResolvedValue([]);

    await expect(service.getPositions('user-1')).resolves.toEqual([]);
  });
});
