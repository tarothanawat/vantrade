import { Test } from '@nestjs/testing';
import { OrderSide, OrderStatus, TradeSignal } from '@vantrade/types';
import { EncryptionService } from '../encryption/encryption.service';
import { SubscriptionsRepository } from '../subscriptions/subscriptions.repository';
import { TradeLogsRepository } from '../trade-logs/trade-logs.repository';
import { HeartbeatService } from './heartbeat.service';

// A 24/7 crypto symbol avoids market-hours guards during CI runs at any time of day.
const VALID_PARAMS = {
  symbol: 'BTCUSD',
  executionTimeframe: '1Min',
  executionMode: 'BUY_LOW_SELL_HIGH',
  rsiPeriod: 3,
  rsiBuyThreshold: 30,
  rsiSellThreshold: 70,
  maPeriod: 5,
  quantity: 1,
};

// Neutral oscillating prices → RSI ≈ 67 (HOLD: 30 < 67 < 70)
const HOLD_BARS = [
  { close: 100, open: 99, high: 101, low: 99, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
  { close: 101, open: 100, high: 102, low: 100, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
  { close: 100, open: 101, high: 102, low: 99, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
  { close: 101, open: 100, high: 102, low: 100, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
];

// Steadily declining prices → RSI = 0 (BUY: 0 ≤ rsiBuyThreshold 30)
const BUY_BARS = [
  { close: 100, open: 101, high: 102, low: 99, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
  { close: 90, open: 100, high: 101, low: 89, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
  { close: 80, open: 90, high: 91, low: 79, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
  { close: 70, open: 80, high: 81, low: 69, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
];

// Steadily rising prices → RSI = 100 (SELL: 100 ≥ rsiSellThreshold 70)
const SELL_BARS = [
  { close: 70, open: 69, high: 72, low: 69, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
  { close: 80, open: 70, high: 82, low: 70, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
  { close: 90, open: 80, high: 92, low: 80, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
  { close: 100, open: 90, high: 102, low: 90, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
];

function makeSub(
  params = VALID_PARAMS as Record<string, unknown>,
  apiKeys: { encryptedKey: string; encryptedSecret: string }[] = [
    { encryptedKey: 'ek', encryptedSecret: 'es' },
  ],
) {
  return {
    id: 'sub-1',
    isActive: true,
    blueprint: { parameters: params, title: 'Test Blueprint' },
    user: { id: 'user-1', apiKeys },
  };
}

describe('HeartbeatService', () => {
  let service: HeartbeatService;
  let mockBroker: {
    getRecentBars: jest.Mock;
    placeOrderWithCredentials: jest.Mock;
    getHistoricalPrices: jest.Mock;
    getLatestPrice: jest.Mock;
    placeOrder: jest.Mock;
    getPositions: jest.Mock;
  };
  let mockSubsRepo: jest.Mocked<Pick<SubscriptionsRepository, 'findAllActive'>>;
  let mockTradeLogsRepo: jest.Mocked<Pick<TradeLogsRepository, 'create' | 'findLatestTradeSideBySubscription'>>;
  let mockEncryptionService: jest.Mocked<Pick<EncryptionService, 'decrypt'>>;

  beforeEach(async () => {
    mockBroker = {
      getRecentBars: jest.fn(),
      placeOrderWithCredentials: jest.fn(),
      getHistoricalPrices: jest.fn(),
      getLatestPrice: jest.fn(),
      placeOrder: jest.fn(),
      getPositions: jest.fn(),
    };

    mockSubsRepo = { findAllActive: jest.fn() };
    mockTradeLogsRepo = {
      create: jest.fn().mockResolvedValue({}),
      findLatestTradeSideBySubscription: jest.fn().mockResolvedValue(null),
    };
    mockEncryptionService = {
      decrypt: jest.fn().mockReturnValue('decrypted-key'),
    };

    const module = await Test.createTestingModule({
      providers: [
        HeartbeatService,
        { provide: 'IBrokerAdapter', useValue: mockBroker },
        { provide: SubscriptionsRepository, useValue: mockSubsRepo },
        { provide: TradeLogsRepository, useValue: mockTradeLogsRepo },
        { provide: EncryptionService, useValue: mockEncryptionService },
      ],
    }).compile();

    service = module.get<HeartbeatService>(HeartbeatService);
  });

  describe('tick()', () => {
    it('does nothing when there are no active subscriptions', async () => {
      mockSubsRepo.findAllActive.mockResolvedValue([]);

      await service.tick();

      expect(mockBroker.getRecentBars).not.toHaveBeenCalled();
      expect(mockTradeLogsRepo.create).not.toHaveBeenCalled();
    });

    it('logs HOLD when RSI signal is HOLD', async () => {
      mockSubsRepo.findAllActive.mockResolvedValue([makeSub() as never]);
      mockBroker.getRecentBars.mockResolvedValue(HOLD_BARS);

      await service.tick();

      expect(mockBroker.placeOrderWithCredentials).not.toHaveBeenCalled();
      expect(mockTradeLogsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionId: 'sub-1',
          side: TradeSignal.HOLD,
          quantity: 0,
          status: 'signal_hold',
        }),
      );
    });

    it('places a BUY order and logs it when RSI is oversold and BUY is the expected side', async () => {
      mockSubsRepo.findAllActive.mockResolvedValue([makeSub() as never]);
      mockBroker.getRecentBars.mockResolvedValue(BUY_BARS);
      mockTradeLogsRepo.findLatestTradeSideBySubscription.mockResolvedValue(null);
      mockBroker.placeOrderWithCredentials.mockResolvedValue({
        orderId: 'order-1',
        symbol: 'BTCUSD',
        side: OrderSide.BUY,
        quantity: 1,
        filledPrice: 70,
        status: OrderStatus.FILLED,
      });

      await service.tick();

      expect(mockBroker.placeOrderWithCredentials).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: 'BTCUSD', side: OrderSide.BUY, quantity: 1 }),
        'decrypted-key',
        'decrypted-key',
      );
      expect(mockTradeLogsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionId: 'sub-1',
          side: TradeSignal.BUY,
          price: 70,
          status: OrderStatus.FILLED,
        }),
      );
    });

    it('places a SELL order when RSI is overbought and SELL is the expected side', async () => {
      mockSubsRepo.findAllActive.mockResolvedValue([makeSub() as never]);
      mockBroker.getRecentBars.mockResolvedValue(SELL_BARS);
      // Last trade was BUY → next expected is SELL
      mockTradeLogsRepo.findLatestTradeSideBySubscription.mockResolvedValue({
        side: OrderSide.BUY,
      });
      mockBroker.placeOrderWithCredentials.mockResolvedValue({
        orderId: 'order-2',
        symbol: 'BTCUSD',
        side: OrderSide.SELL,
        quantity: 1,
        filledPrice: 100,
        status: OrderStatus.FILLED,
      });

      await service.tick();

      expect(mockBroker.placeOrderWithCredentials).toHaveBeenCalledWith(
        expect.objectContaining({ side: OrderSide.SELL }),
        'decrypted-key',
        'decrypted-key',
      );
    });

    it('logs HOLD (waiting) when signal direction does not match the expected alternating side', async () => {
      mockSubsRepo.findAllActive.mockResolvedValue([makeSub() as never]);
      mockBroker.getRecentBars.mockResolvedValue(BUY_BARS); // RSI = 0 → BUY signal
      // Last trade was BUY → next expected is SELL, so BUY signal should be skipped
      mockTradeLogsRepo.findLatestTradeSideBySubscription.mockResolvedValue({
        side: OrderSide.BUY,
      });

      await service.tick();

      expect(mockBroker.placeOrderWithCredentials).not.toHaveBeenCalled();
      expect(mockTradeLogsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          side: TradeSignal.HOLD,
          status: 'signal_buy_waiting_sell',
        }),
      );
    });

    it('uses per-user decrypted credentials, never hardcoded keys', async () => {
      mockSubsRepo.findAllActive.mockResolvedValue([makeSub() as never]);
      mockBroker.getRecentBars.mockResolvedValue(BUY_BARS);
      mockTradeLogsRepo.findLatestTradeSideBySubscription.mockResolvedValue(null);
      mockBroker.placeOrderWithCredentials.mockResolvedValue({
        orderId: 'o',
        symbol: 'BTCUSD',
        side: OrderSide.BUY,
        quantity: 1,
        filledPrice: 70,
        status: OrderStatus.FILLED,
      });

      await service.tick();

      expect(mockEncryptionService.decrypt).toHaveBeenCalledWith('ek');
      expect(mockEncryptionService.decrypt).toHaveBeenCalledWith('es');
    });

    it('skips a subscription when the user has no API key stored', async () => {
      mockSubsRepo.findAllActive.mockResolvedValue([makeSub(VALID_PARAMS, []) as never]);

      await service.tick();

      expect(mockBroker.getRecentBars).not.toHaveBeenCalled();
      expect(mockTradeLogsRepo.create).not.toHaveBeenCalled();
    });

    it('skips a subscription when blueprint parameters fail Zod validation', async () => {
      // Missing required fields → safeParse fails
      mockSubsRepo.findAllActive.mockResolvedValue([makeSub({ symbol: '' }) as never]);

      await service.tick();

      expect(mockBroker.getRecentBars).not.toHaveBeenCalled();
      expect(mockTradeLogsRepo.create).not.toHaveBeenCalled();
    });

    it('skips a subscription when there are not enough bars for RSI', async () => {
      mockSubsRepo.findAllActive.mockResolvedValue([makeSub() as never]);
      // rsiPeriod=3 requires 4 bars; only provide 2
      mockBroker.getRecentBars.mockResolvedValue(HOLD_BARS.slice(0, 2));

      await service.tick();

      expect(mockBroker.placeOrderWithCredentials).not.toHaveBeenCalled();
      expect(mockTradeLogsRepo.create).not.toHaveBeenCalled();
    });

    it('continues processing remaining subscriptions when one throws', async () => {
      const sub1 = { ...makeSub(), id: 'sub-1' };
      const sub2 = { ...makeSub(), id: 'sub-2' };

      mockSubsRepo.findAllActive.mockResolvedValue([sub1, sub2] as never[]);
      mockBroker.getRecentBars
        .mockRejectedValueOnce(new Error('Alpaca rate limit'))
        .mockResolvedValueOnce(HOLD_BARS);
      mockTradeLogsRepo.findLatestTradeSideBySubscription.mockResolvedValue(null);

      // Should not throw
      await expect(service.tick()).resolves.toBeUndefined();

      // sub-2 should still be processed
      expect(mockTradeLogsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionId: 'sub-2' }),
      );
    });
  });
});
