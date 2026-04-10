import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BlueprintsRepository } from '../blueprints/blueprints.repository';
import { TradeLogsRepository } from '../trade-logs/trade-logs.repository';
import { SubscriptionsRepository } from './subscriptions.repository';
import { SubscriptionsService } from './subscriptions.service';

const SUBSCRIPTION = { id: 'sub-1', userId: 'user-1', blueprintId: 'bp-1', isActive: true };

const MOCK_STATS = {
  totalTrades: 10,
  executedTrades: 6,
  buyCount: 3,
  sellCount: 3,
  holdCount: 4,
  totalPnl: 150.5,
  winCount: 2,
  lossCount: 1,
};

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let mockSubsRepo: jest.Mocked<Pick<SubscriptionsRepository, 'findById' | 'findByUser' | 'create' | 'findExisting' | 'delete' | 'setActive'>>;
  let mockBlueprintsRepo: jest.Mocked<Pick<BlueprintsRepository, 'findById'>>;
  let mockTradeLogsRepo: jest.Mocked<Pick<TradeLogsRepository, 'findBySubscription' | 'getStats'>>;

  beforeEach(async () => {
    mockSubsRepo = {
      findById: jest.fn(),
      findByUser: jest.fn(),
      create: jest.fn(),
      findExisting: jest.fn(),
      delete: jest.fn(),
      setActive: jest.fn(),
    };
    mockBlueprintsRepo = { findById: jest.fn() };
    mockTradeLogsRepo = {
      findBySubscription: jest.fn().mockResolvedValue([]),
      getStats: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: SubscriptionsRepository, useValue: mockSubsRepo },
        { provide: BlueprintsRepository, useValue: mockBlueprintsRepo },
        { provide: TradeLogsRepository, useValue: mockTradeLogsRepo },
      ],
    }).compile();

    service = module.get(SubscriptionsService);
  });

  describe('getStats()', () => {
    it('throws NotFoundException when subscription does not exist', async () => {
      mockSubsRepo.findById.mockResolvedValue(null);

      await expect(service.getStats('sub-missing', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(mockTradeLogsRepo.getStats).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when subscription belongs to a different user', async () => {
      mockSubsRepo.findById.mockResolvedValue({ ...SUBSCRIPTION, userId: 'other-user' } as never);

      await expect(service.getStats('sub-1', 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockTradeLogsRepo.getStats).not.toHaveBeenCalled();
    });

    it('returns aggregated stats for the subscription', async () => {
      mockSubsRepo.findById.mockResolvedValue(SUBSCRIPTION as never);
      mockTradeLogsRepo.getStats.mockResolvedValue(MOCK_STATS);

      const result = await service.getStats('sub-1', 'user-1');

      expect(result).toEqual(MOCK_STATS);
      expect(mockTradeLogsRepo.getStats).toHaveBeenCalledWith('sub-1');
    });
  });

  describe('findTradeLogsBySubscription() pagination', () => {
    it('passes take and skip through to the repository', async () => {
      mockSubsRepo.findById.mockResolvedValue(SUBSCRIPTION as never);
      mockTradeLogsRepo.findBySubscription.mockResolvedValue([]);

      await service.findTradeLogsBySubscription('sub-1', 'user-1', 10, 20);

      expect(mockTradeLogsRepo.findBySubscription).toHaveBeenCalledWith('sub-1', 10, 20);
    });

    it('passes undefined take/skip when not provided (no limit)', async () => {
      mockSubsRepo.findById.mockResolvedValue(SUBSCRIPTION as never);
      mockTradeLogsRepo.findBySubscription.mockResolvedValue([]);

      await service.findTradeLogsBySubscription('sub-1', 'user-1');

      expect(mockTradeLogsRepo.findBySubscription).toHaveBeenCalledWith('sub-1', undefined, undefined);
    });

    it('throws ForbiddenException when subscription belongs to another user', async () => {
      mockSubsRepo.findById.mockResolvedValue({ ...SUBSCRIPTION, userId: 'other-user' } as never);

      await expect(
        service.findTradeLogsBySubscription('sub-1', 'user-1', 10, 0),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
