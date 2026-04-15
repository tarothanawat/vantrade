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
    getPositionsWithCredentials: jest.Mock;
    verifyCredentials: jest.Mock;
  };
  let mockSubsRepo: jest.Mocked<Pick<SubscriptionsRepository, 'findAllActive'>>;
  let mockTradeLogsRepo: jest.Mocked<Pick<TradeLogsRepository, 'create' | 'findLatestTradeSideBySubscription' | 'findLastExecutedBySubscription'>>;
  let mockEncryptionService: jest.Mocked<Pick<EncryptionService, 'decrypt'>>;

  beforeEach(async () => {
    mockBroker = {
      getRecentBars: jest.fn(),
      placeOrderWithCredentials: jest.fn(),
      getHistoricalPrices: jest.fn(),
      getLatestPrice: jest.fn(),
      placeOrder: jest.fn(),
      getPositions: jest.fn(),
      getPositionsWithCredentials: jest.fn(),
      verifyCredentials: jest.fn(),
    };

    mockSubsRepo = { findAllActive: jest.fn() };
    mockTradeLogsRepo = {
      create: jest.fn().mockResolvedValue({}),
      findLatestTradeSideBySubscription: jest.fn().mockResolvedValue(null),
      findLastExecutedBySubscription: jest.fn().mockResolvedValue(null),
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

  describe('getStatus()', () => {
    it('returns null lastRunAt and nextRunAt before the first tick', () => {
      const status = service.getStatus();
      expect(status.lastRunAt).toBeNull();
      expect(status.nextRunAt).toBeNull();
      expect(status.lastActiveCount).toBe(0);
    });

    it('returns lastRunAt, nextRunAt 60s later, and activeCount after a tick', async () => {
      mockSubsRepo.findAllActive.mockResolvedValue([makeSub() as never]);
      mockBroker.getRecentBars.mockResolvedValue(HOLD_BARS);

      const before = Date.now();
      await service.tick();
      const after = Date.now();

      const status = service.getStatus();
      expect(status.lastRunAt).toBeInstanceOf(Date);
      expect(status.lastRunAt!.getTime()).toBeGreaterThanOrEqual(before);
      expect(status.lastRunAt!.getTime()).toBeLessThanOrEqual(after);
      expect(status.nextRunAt!.getTime()).toBeCloseTo(status.lastRunAt!.getTime() + 60_000, -2);
      expect(status.lastActiveCount).toBe(1);
    });

    it('updates lastActiveCount on each tick', async () => {
      mockSubsRepo.findAllActive.mockResolvedValue([]);
      await service.tick();
      expect(service.getStatus().lastActiveCount).toBe(0);

      mockSubsRepo.findAllActive.mockResolvedValue([makeSub() as never, makeSub() as never]);
      mockBroker.getRecentBars.mockResolvedValue(HOLD_BARS);
      await service.tick();
      expect(service.getStatus().lastActiveCount).toBe(2);
    });
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

    it('falls back to current bar price when filledPrice is 0 (order not yet settled)', async () => {
      // Alpaca returns filled_avg_price: null → filledPrice = 0.
      // The logged price must be the bar close (currentPrice), not 0.
      mockSubsRepo.findAllActive.mockResolvedValue([makeSub() as never]);
      mockBroker.getRecentBars.mockResolvedValue(BUY_BARS); // last close = 70
      mockTradeLogsRepo.findLatestTradeSideBySubscription.mockResolvedValue(null);
      mockBroker.placeOrderWithCredentials.mockResolvedValue({
        orderId: 'o', symbol: 'BTCUSD', side: OrderSide.BUY, quantity: 1,
        filledPrice: 0,
        status: OrderStatus.PENDING,
      });

      await service.tick();

      expect(mockTradeLogsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ price: 70 }),
      );
    });

    it('uses the actual filledPrice when it is non-zero', async () => {
      mockSubsRepo.findAllActive.mockResolvedValue([makeSub() as never]);
      mockBroker.getRecentBars.mockResolvedValue(BUY_BARS); // last close = 70
      mockTradeLogsRepo.findLatestTradeSideBySubscription.mockResolvedValue(null);
      mockBroker.placeOrderWithCredentials.mockResolvedValue({
        orderId: 'o', symbol: 'BTCUSD', side: OrderSide.BUY, quantity: 1,
        filledPrice: 68.50,
        status: OrderStatus.FILLED,
      });

      await service.tick();

      expect(mockTradeLogsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ price: 68.50 }),
      );
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

// ─────────────────────────────────────────────────────────────────────────────
// PnL calculation — BUY_LOW_SELL_HIGH
// ─────────────────────────────────────────────────────────────────────────────

describe('HeartbeatService PnL — BUY_LOW_SELL_HIGH', () => {
  let service: HeartbeatService;
  let mockBroker: { getRecentBars: jest.Mock; placeOrderWithCredentials: jest.Mock };
  let mockSubsRepo: { findAllActive: jest.Mock };
  let mockTradeLogsRepo: {
    create: jest.Mock;
    findLatestTradeSideBySubscription: jest.Mock;
    findLastExecutedBySubscription: jest.Mock;
  };

  const BLS_PARAMS = { ...VALID_PARAMS, executionMode: 'BUY_LOW_SELL_HIGH' };

  beforeEach(async () => {
    mockBroker = { getRecentBars: jest.fn(), placeOrderWithCredentials: jest.fn() };
    mockSubsRepo = { findAllActive: jest.fn() };
    mockTradeLogsRepo = {
      create: jest.fn().mockResolvedValue({}),
      findLatestTradeSideBySubscription: jest.fn().mockResolvedValue(null),
      findLastExecutedBySubscription: jest.fn().mockResolvedValue(null),
    };

    const module = await Test.createTestingModule({
      providers: [
        HeartbeatService,
        { provide: 'IBrokerAdapter', useValue: mockBroker },
        { provide: SubscriptionsRepository, useValue: mockSubsRepo },
        { provide: TradeLogsRepository, useValue: mockTradeLogsRepo },
        { provide: EncryptionService, useValue: { decrypt: jest.fn().mockReturnValue('k') } },
      ],
    }).compile();

    service = module.get(HeartbeatService);
  });

  it('entry BUY (first trade) records pnl: null', async () => {
    mockSubsRepo.findAllActive.mockResolvedValue([makeSub(BLS_PARAMS) as never]);
    mockBroker.getRecentBars.mockResolvedValue(BUY_BARS);
    mockTradeLogsRepo.findLatestTradeSideBySubscription.mockResolvedValue(null);
    mockBroker.placeOrderWithCredentials.mockResolvedValue({
      orderId: 'o1', symbol: 'BTCUSD', side: OrderSide.BUY,
      quantity: 1, filledPrice: 100, status: OrderStatus.FILLED,
    });

    await service.tick();

    expect(mockTradeLogsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ side: TradeSignal.BUY, pnl: null }),
    );
  });

  it('exit SELL records correct positive PnL (buy low, sell high)', async () => {
    // Entry was @ 100, exit SELL fill @ 120 → pnl = +20
    mockSubsRepo.findAllActive.mockResolvedValue([makeSub(BLS_PARAMS) as never]);
    mockBroker.getRecentBars.mockResolvedValue(SELL_BARS);
    mockTradeLogsRepo.findLatestTradeSideBySubscription.mockResolvedValue({ side: OrderSide.BUY });
    mockTradeLogsRepo.findLastExecutedBySubscription.mockResolvedValue({ price: 100 } as never);
    mockBroker.placeOrderWithCredentials.mockResolvedValue({
      orderId: 'o2', symbol: 'BTCUSD', side: OrderSide.SELL,
      quantity: 1, filledPrice: 120, status: OrderStatus.FILLED,
    });

    await service.tick();

    expect(mockTradeLogsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ side: TradeSignal.SELL, pnl: 20 }),
    );
  });

  it('exit SELL records correct negative PnL (losing trade)', async () => {
    // Entry was @ 100, exit SELL fill @ 80 → pnl = -20
    mockSubsRepo.findAllActive.mockResolvedValue([makeSub(BLS_PARAMS) as never]);
    mockBroker.getRecentBars.mockResolvedValue(SELL_BARS);
    mockTradeLogsRepo.findLatestTradeSideBySubscription.mockResolvedValue({ side: OrderSide.BUY });
    mockTradeLogsRepo.findLastExecutedBySubscription.mockResolvedValue({ price: 100 } as never);
    mockBroker.placeOrderWithCredentials.mockResolvedValue({
      orderId: 'o3', symbol: 'BTCUSD', side: OrderSide.SELL,
      quantity: 1, filledPrice: 80, status: OrderStatus.FILLED,
    });

    await service.tick();

    expect(mockTradeLogsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ side: TradeSignal.SELL, pnl: -20 }),
    );
  });

  it('PnL scales with quantity', async () => {
    // Entry @ 100, exit @ 110, qty = 5 → pnl = +50
    const qtyParams = { ...BLS_PARAMS, quantity: 5 };
    mockSubsRepo.findAllActive.mockResolvedValue([makeSub(qtyParams) as never]);
    mockBroker.getRecentBars.mockResolvedValue(SELL_BARS);
    mockTradeLogsRepo.findLatestTradeSideBySubscription.mockResolvedValue({ side: OrderSide.BUY });
    mockTradeLogsRepo.findLastExecutedBySubscription.mockResolvedValue({ price: 100 } as never);
    mockBroker.placeOrderWithCredentials.mockResolvedValue({
      orderId: 'o4', symbol: 'BTCUSD', side: OrderSide.SELL,
      quantity: 5, filledPrice: 110, status: OrderStatus.FILLED,
    });

    await service.tick();

    expect(mockTradeLogsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ pnl: 50 }),
    );
  });

  it('regression: second entry BUY (after a SELL exit) records pnl: null, not a spurious PnL', async () => {
    // This is the exact bug from the screenshot.
    // State: last executed side = SELL (prior round's exit). Signal fires BUY (new entry).
    // Before the fix, lastTradeSide !== null caused PnL to be computed on this entry leg.
    mockSubsRepo.findAllActive.mockResolvedValue([makeSub(BLS_PARAMS) as never]);
    mockBroker.getRecentBars.mockResolvedValue(BUY_BARS);
    mockTradeLogsRepo.findLatestTradeSideBySubscription.mockResolvedValue({ side: OrderSide.SELL });
    mockBroker.placeOrderWithCredentials.mockResolvedValue({
      orderId: 'o5', symbol: 'BTCUSD', side: OrderSide.BUY,
      quantity: 1, filledPrice: 130, status: OrderStatus.FILLED,
    });

    await service.tick();

    expect(mockTradeLogsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ side: TradeSignal.BUY, pnl: null }),
    );
    // findLastExecutedBySubscription must NOT be called for an entry leg
    expect(mockTradeLogsRepo.findLastExecutedBySubscription).not.toHaveBeenCalled();
  });

  it('full round-trip: BUY → SELL produces correct cumulative PnL with no spurious records', async () => {
    // Simulate the exact sequence from the screenshot that produced -$505 instead of -$193.
    // Round 1: BUY @ 73911.50 (entry, pnl=null)
    // Round 1: SELL @ 73862.91 (exit, pnl = 73862.91 - 73911.50 = -48.59)
    // Round 2: BUY @ 74179.98 (entry again, pnl MUST be null — the regression)
    // Round 2: SELL @ 74035.54 (exit, pnl = 74035.54 - 74179.98 = -144.44)
    // Total expected PnL across the two exit legs: -193.03 (not -505)

    const sub = makeSub(BLS_PARAMS) as never;

    // --- Round 1 entry: BUY ---
    mockSubsRepo.findAllActive.mockResolvedValue([sub]);
    mockBroker.getRecentBars.mockResolvedValue(BUY_BARS);
    mockTradeLogsRepo.findLatestTradeSideBySubscription.mockResolvedValue(null);
    mockBroker.placeOrderWithCredentials.mockResolvedValue({
      orderId: 'r1-buy', symbol: 'BTCUSD', side: OrderSide.BUY,
      quantity: 1, filledPrice: 73911.50, status: OrderStatus.FILLED,
    });
    await service.tick();
    expect(mockTradeLogsRepo.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ side: TradeSignal.BUY, price: 73911.50, pnl: null }),
    );

    // --- Round 1 exit: SELL ---
    mockBroker.getRecentBars.mockResolvedValue(SELL_BARS);
    mockTradeLogsRepo.findLatestTradeSideBySubscription.mockResolvedValue({ side: OrderSide.BUY });
    mockTradeLogsRepo.findLastExecutedBySubscription.mockResolvedValue({ price: 73911.50 } as never);
    mockBroker.placeOrderWithCredentials.mockResolvedValue({
      orderId: 'r1-sell', symbol: 'BTCUSD', side: OrderSide.SELL,
      quantity: 1, filledPrice: 73862.91, status: OrderStatus.FILLED,
    });
    await service.tick();
    expect(mockTradeLogsRepo.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ side: TradeSignal.SELL, price: 73862.91, pnl: expect.closeTo(-48.59, 1) }),
    );

    // --- Round 2 entry: BUY (regression check) ---
    mockBroker.getRecentBars.mockResolvedValue(BUY_BARS);
    mockTradeLogsRepo.findLatestTradeSideBySubscription.mockResolvedValue({ side: OrderSide.SELL });
    mockTradeLogsRepo.findLastExecutedBySubscription.mockClear();
    mockBroker.placeOrderWithCredentials.mockResolvedValue({
      orderId: 'r2-buy', symbol: 'BTCUSD', side: OrderSide.BUY,
      quantity: 1, filledPrice: 74179.98, status: OrderStatus.FILLED,
    });
    await service.tick();
    expect(mockTradeLogsRepo.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ side: TradeSignal.BUY, price: 74179.98, pnl: null }),
    );
    expect(mockTradeLogsRepo.findLastExecutedBySubscription).not.toHaveBeenCalled();

    // --- Round 2 exit: SELL ---
    mockBroker.getRecentBars.mockResolvedValue(SELL_BARS);
    mockTradeLogsRepo.findLatestTradeSideBySubscription.mockResolvedValue({ side: OrderSide.BUY });
    mockTradeLogsRepo.findLastExecutedBySubscription.mockResolvedValue({ price: 74179.98 } as never);
    mockBroker.placeOrderWithCredentials.mockResolvedValue({
      orderId: 'r2-sell', symbol: 'BTCUSD', side: OrderSide.SELL,
      quantity: 1, filledPrice: 74035.54, status: OrderStatus.FILLED,
    });
    await service.tick();
    expect(mockTradeLogsRepo.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ side: TradeSignal.SELL, price: 74035.54, pnl: expect.closeTo(-144.44, 1) }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PnL calculation — SELL_HIGH_BUY_LOW
// ─────────────────────────────────────────────────────────────────────────────

describe('HeartbeatService PnL — SELL_HIGH_BUY_LOW', () => {
  let service: HeartbeatService;
  let mockBroker: { getRecentBars: jest.Mock; placeOrderWithCredentials: jest.Mock };
  let mockSubsRepo: { findAllActive: jest.Mock };
  let mockTradeLogsRepo: {
    create: jest.Mock;
    findLatestTradeSideBySubscription: jest.Mock;
    findLastExecutedBySubscription: jest.Mock;
  };

  const SHB_PARAMS = { ...VALID_PARAMS, executionMode: 'SELL_HIGH_BUY_LOW' };

  beforeEach(async () => {
    mockBroker = { getRecentBars: jest.fn(), placeOrderWithCredentials: jest.fn() };
    mockSubsRepo = { findAllActive: jest.fn() };
    mockTradeLogsRepo = {
      create: jest.fn().mockResolvedValue({}),
      findLatestTradeSideBySubscription: jest.fn().mockResolvedValue(null),
      findLastExecutedBySubscription: jest.fn().mockResolvedValue(null),
    };

    const module = await Test.createTestingModule({
      providers: [
        HeartbeatService,
        { provide: 'IBrokerAdapter', useValue: mockBroker },
        { provide: SubscriptionsRepository, useValue: mockSubsRepo },
        { provide: TradeLogsRepository, useValue: mockTradeLogsRepo },
        { provide: EncryptionService, useValue: { decrypt: jest.fn().mockReturnValue('k') } },
      ],
    }).compile();

    service = module.get(HeartbeatService);
  });

  it('entry SELL (first trade) records pnl: null', async () => {
    mockSubsRepo.findAllActive.mockResolvedValue([makeSub(SHB_PARAMS) as never]);
    mockBroker.getRecentBars.mockResolvedValue(SELL_BARS); // RSI=100 → SELL
    mockTradeLogsRepo.findLatestTradeSideBySubscription.mockResolvedValue(null);
    mockBroker.placeOrderWithCredentials.mockResolvedValue({
      orderId: 'o1', symbol: 'BTCUSD', side: OrderSide.SELL,
      quantity: 1, filledPrice: 100, status: OrderStatus.FILLED,
    });

    await service.tick();

    expect(mockTradeLogsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ side: TradeSignal.SELL, pnl: null }),
    );
  });

  it('exit BUY records correct positive PnL (sell high, buy low)', async () => {
    // Short entry @ 100, exit BUY @ 80 → pnl = 100 - 80 = +20
    mockSubsRepo.findAllActive.mockResolvedValue([makeSub(SHB_PARAMS) as never]);
    mockBroker.getRecentBars.mockResolvedValue(BUY_BARS); // RSI=0 → BUY
    mockTradeLogsRepo.findLatestTradeSideBySubscription.mockResolvedValue({ side: OrderSide.SELL });
    mockTradeLogsRepo.findLastExecutedBySubscription.mockResolvedValue({ price: 100 } as never);
    mockBroker.placeOrderWithCredentials.mockResolvedValue({
      orderId: 'o2', symbol: 'BTCUSD', side: OrderSide.BUY,
      quantity: 1, filledPrice: 80, status: OrderStatus.FILLED,
    });

    await service.tick();

    expect(mockTradeLogsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ side: TradeSignal.BUY, pnl: 20 }),
    );
  });

  it('exit BUY records correct negative PnL (short moves against us)', async () => {
    // Short entry @ 80, exit BUY @ 100 → pnl = 80 - 100 = -20
    mockSubsRepo.findAllActive.mockResolvedValue([makeSub(SHB_PARAMS) as never]);
    mockBroker.getRecentBars.mockResolvedValue(BUY_BARS);
    mockTradeLogsRepo.findLatestTradeSideBySubscription.mockResolvedValue({ side: OrderSide.SELL });
    mockTradeLogsRepo.findLastExecutedBySubscription.mockResolvedValue({ price: 80 } as never);
    mockBroker.placeOrderWithCredentials.mockResolvedValue({
      orderId: 'o3', symbol: 'BTCUSD', side: OrderSide.BUY,
      quantity: 1, filledPrice: 100, status: OrderStatus.FILLED,
    });

    await service.tick();

    expect(mockTradeLogsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ side: TradeSignal.BUY, pnl: -20 }),
    );
  });

  it('regression: second entry SELL (after a BUY exit) records pnl: null', async () => {
    // Mirrors the BUY_LOW_SELL_HIGH regression but for the short mode.
    mockSubsRepo.findAllActive.mockResolvedValue([makeSub(SHB_PARAMS) as never]);
    mockBroker.getRecentBars.mockResolvedValue(SELL_BARS);
    mockTradeLogsRepo.findLatestTradeSideBySubscription.mockResolvedValue({ side: OrderSide.BUY });
    mockBroker.placeOrderWithCredentials.mockResolvedValue({
      orderId: 'o4', symbol: 'BTCUSD', side: OrderSide.SELL,
      quantity: 1, filledPrice: 110, status: OrderStatus.FILLED,
    });

    await service.tick();

    expect(mockTradeLogsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ side: TradeSignal.SELL, pnl: null }),
    );
    expect(mockTradeLogsRepo.findLastExecutedBySubscription).not.toHaveBeenCalled();
  });
});
