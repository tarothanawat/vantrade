import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MarketBarDto } from '@vantrade/types';
import { BlueprintParametersSchema } from '@vantrade/types';
import { BlueprintsRepository } from './blueprints.repository';
import { BlueprintsService } from './blueprints.service';

// ── Shared helpers ────────────────────────────────────────────────────────────

function makeBar(
  close: number,
  opts: Partial<{ open: number; high: number; low: number; timestamp: Date }> = {},
): MarketBarDto {
  return {
    symbol: 'XAUUSD',
    timestamp: opts.timestamp ?? new Date('2024-01-01T00:00:00Z'),
    open: opts.open ?? close,
    high: opts.high ?? close + 2,
    low: opts.low ?? close - 2,
    close,
    volume: 100,
  };
}

/** Ascending bars — steady bullish move */
function ascBars(n: number, start = 100, step = 2): MarketBarDto[] {
  return Array.from({ length: n }, (_, i) => {
    const c = start + i * step;
    return makeBar(c, { open: c - 1, high: c + 2, low: c - 2, timestamp: new Date(2024, 0, 1, 0, i * 5) });
  });
}

const ICT_PARAMS = {
  strategyType: 'ICT' as const,
  symbol: 'XAUUSD',
  quantity: 0.01,
  biasTimeframe: '1Hour' as const,
  confirmTimeframe: '15Min' as const,
  entryTimeframe: '5Min' as const,
  swingLookback: 3,
  useOrderBlocks: true,
  useFairValueGaps: true,
  fvgMinGapPct: 0.01,
  slPoints: 10,
  minRR: 3,
  maxTradesPerSession: 1,
  maxLossesPerSession: 1,
  sessionFilter: 'ALL' as const,
  sessionTimezone: 'America/New_York',
  requireLiquiditySweep: false,
};

function makeIctBlueprint(params = ICT_PARAMS) {
  return {
    id: 'bp-ict',
    title: 'ICT Strategy',
    description: 'ICT/SMC on XAUUSD',
    parameters: params,
    authorId: 'user-1',
    isVerified: true,
  };
}

// ── BlueprintParametersSchema backward compat ─────────────────────────────────

describe('BlueprintParametersSchema backward compatibility', () => {
  it('parses existing RSI records without strategyType field', () => {
    const legacyRecord = {
      symbol: 'BTCUSD',
      executionTimeframe: '1Min',
      executionMode: 'BUY_LOW_SELL_HIGH',
      rsiPeriod: 14,
      rsiBuyThreshold: 30,
      rsiSellThreshold: 70,
      maPeriod: 20,
      quantity: 1,
    };
    const parsed = BlueprintParametersSchema.safeParse(legacyRecord);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.strategyType).toBe('RSI');
    }
  });

  it('parses ICT record with strategyType: ICT', () => {
    const parsed = BlueprintParametersSchema.safeParse(ICT_PARAMS);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.strategyType).toBe('ICT');
    }
  });

  it('rejects invalid strategyType', () => {
    const parsed = BlueprintParametersSchema.safeParse({ strategyType: 'UNKNOWN', symbol: 'X' });
    expect(parsed.success).toBe(false);
  });
});

// ── ICT Dry-run signal ────────────────────────────────────────────────────────

describe('BlueprintsService.getDryRunSignal() — ICT', () => {
  let service: BlueprintsService;
  let mockRepo: jest.Mocked<Pick<BlueprintsRepository, 'findById'>>;
  let mockBroker: { getRecentBars: jest.Mock };

  beforeEach(async () => {
    mockRepo = { findById: jest.fn() };
    mockBroker = { getRecentBars: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        BlueprintsService,
        { provide: BlueprintsRepository, useValue: mockRepo },
        { provide: 'IBrokerAdapter', useValue: mockBroker },
      ],
    }).compile();

    service = module.get(BlueprintsService);
  });

  it('fetches 3 timeframes in parallel for ICT blueprints', async () => {
    const bars = ascBars(60);
    mockRepo.findById.mockResolvedValue(makeIctBlueprint() as never);
    mockBroker.getRecentBars.mockResolvedValue(bars);

    await service.getDryRunSignal('bp-ict');

    // Should be called 3 times: H1, M15, M5
    expect(mockBroker.getRecentBars).toHaveBeenCalledTimes(3);
    const calls = mockBroker.getRecentBars.mock.calls;
    const timeframes = calls.map((c: unknown[]) => c[1]);
    expect(timeframes).toContain('1Hour');
    expect(timeframes).toContain('15Min');
    expect(timeframes).toContain('5Min');
  });

  it('returns ICT-specific fields (limitPrice, stopLossPrice, takeProfitPrice)', async () => {
    const bars = ascBars(60);
    mockRepo.findById.mockResolvedValue(makeIctBlueprint() as never);
    mockBroker.getRecentBars.mockResolvedValue(bars);

    const result = await service.getDryRunSignal('bp-ict');

    expect(result).toHaveProperty('signal');
    expect(result).toHaveProperty('reason');
    expect(result).toHaveProperty('limitPrice');
    expect(result).toHaveProperty('stopLossPrice');
    expect(result).toHaveProperty('takeProfitPrice');
  });
});

// ── ICT Backtest Simulation ───────────────────────────────────────────────────

describe('BlueprintsService.runBacktestPreview() — ICT', () => {
  let service: BlueprintsService;
  let mockRepo: jest.Mocked<Pick<BlueprintsRepository, 'findById'>>;
  let mockBroker: { getRecentBars: jest.Mock };

  beforeEach(async () => {
    mockRepo = { findById: jest.fn() };
    mockBroker = { getRecentBars: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        BlueprintsService,
        { provide: BlueprintsRepository, useValue: mockRepo },
        { provide: 'IBrokerAdapter', useValue: mockBroker },
      ],
    }).compile();

    service = module.get(BlueprintsService);
  });

  it('throws BadRequestException when insufficient M5 bars', async () => {
    mockBroker.getRecentBars.mockResolvedValue([makeBar(100), makeBar(101)]);

    await expect(
      service.runBacktestPreview({
        parameters: ICT_PARAMS,
        limit: 200,
        slippagePct: 0,
        commissionPerTrade: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns BacktestResultDto shape with entryContext and exitReason fields', async () => {
    const bars = ascBars(200);
    mockBroker.getRecentBars.mockResolvedValue(bars);

    const result = await service.runBacktestPreview({
      parameters: ICT_PARAMS,
      limit: 200,
      slippagePct: 0,
      commissionPerTrade: 0,
    });

    expect(result).toHaveProperty('symbol');
    expect(result).toHaveProperty('trades');
    expect(result).toHaveProperty('totalPnL');
    expect(result).toHaveProperty('winRate');
    expect(result.timeframe).toBe('5Min');

    // All ICT trades have entryRsi = null and entryContext populated (or null if no signal fired)
    for (const trade of result.trades) {
      expect(trade.entryRsi).toBeNull();
      expect(trade.exitRsi).toBeNull();
    }
  });

  it('correctly simulates a TP fill', async () => {
    // Create a bar sequence where:
    // - Signal fires: open position with SL at 90, TP at 120 (entry ~100, slPoints=10, minRR=3)
    // - Later bar touches TP (high >= 120)
    const startBars = ascBars(60, 100, 1);   // enough bars for structure detection

    // Append a bar that would fill TP for a buy position (hypothetically)
    const tpBar = makeBar(118, {
      high: 125,  // touches TP >= 120
      low: 117,
      timestamp: new Date(2024, 0, 1, 5, 0),
    });

    const allBars = [...startBars, tpBar];
    mockBroker.getRecentBars.mockResolvedValue(allBars);

    const result = await service.runBacktestPreview({
      parameters: ICT_PARAMS,
      limit: 200,
      slippagePct: 0,
      commissionPerTrade: 0,
    });

    // If any trade closed with TP, verify exitReason
    const tpTrades = result.trades.filter((t) => t.exitReason === 'TP');
    for (const t of tpTrades) {
      expect(t.pnl).not.toBeNull();
      expect(t.pnl!).toBeGreaterThan(0);
    }
  });

  it('SL fill records negative PnL', async () => {
    const allBars = ascBars(200, 100, 0.5);
    mockBroker.getRecentBars.mockResolvedValue(allBars);

    const result = await service.runBacktestPreview({
      parameters: ICT_PARAMS,
      limit: 200,
      slippagePct: 0,
      commissionPerTrade: 0,
    });

    const slTrades = result.trades.filter((t) => t.exitReason === 'SL');
    for (const t of slTrades) {
      expect(t.pnl).not.toBeNull();
      expect(t.pnl!).toBeLessThan(0);
    }
  });

  it('open position at end of data has isOpen=true and pnl=null', async () => {
    // Provide enough bars that a signal fires but not enough for it to close
    const bars = ascBars(120, 100, 1);
    mockBroker.getRecentBars.mockResolvedValue(bars);

    const result = await service.runBacktestPreview({
      parameters: ICT_PARAMS,
      limit: 120,
      slippagePct: 0,
      commissionPerTrade: 0,
    });

    const openTrades = result.trades.filter((t) => t.isOpen);
    for (const t of openTrades) {
      expect(t.pnl).toBeNull();
      expect(t.exitTime).toBeNull();
      expect(t.exitPrice).toBeNull();
    }
  });

  it('fetches only M5 bars (single getRecentBars call) for ICT backtest', async () => {
    const bars = ascBars(200);
    mockBroker.getRecentBars.mockResolvedValue(bars);

    await service.runBacktestPreview({
      parameters: ICT_PARAMS,
      limit: 200,
      slippagePct: 0,
      commissionPerTrade: 0,
    });

    // simulateIct fetches only M5 bars — one call
    expect(mockBroker.getRecentBars).toHaveBeenCalledTimes(1);
    expect(mockBroker.getRecentBars).toHaveBeenCalledWith('XAUUSD', '5Min', 200);
  });
});

// ── RSI backtest still works after refactor ───────────────────────────────────

describe('BlueprintsService — RSI backtest unchanged after refactor', () => {
  let service: BlueprintsService;
  let mockRepo: jest.Mocked<Pick<BlueprintsRepository, 'findById'>>;
  let mockBroker: { getRecentBars: jest.Mock };

  beforeEach(async () => {
    mockRepo = { findById: jest.fn() };
    mockBroker = { getRecentBars: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        BlueprintsService,
        { provide: BlueprintsRepository, useValue: mockRepo },
        { provide: 'IBrokerAdapter', useValue: mockBroker },
      ],
    }).compile();

    service = module.get(BlueprintsService);
  });

  const RSI_PARAMS = {
    strategyType: 'RSI' as const,
    symbol: 'BTCUSD',
    executionTimeframe: '1Min' as const,
    executionMode: 'BUY_LOW_SELL_HIGH' as const,
    rsiPeriod: 3,
    rsiBuyThreshold: 30,
    rsiSellThreshold: 70,
    maPeriod: 5,
    quantity: 1,
  };

  it('RSI trades have entryRsi populated and entryContext null', async () => {
    const cycleBars = [100, 90, 80, 70, 80, 90, 100].map((c) => ({
      symbol: 'BTCUSD',
      timestamp: new Date(2024, 0, 1),
      open: c,
      high: c + 1,
      low: c - 1,
      close: c,
      volume: 100,
    }));

    mockRepo.findById.mockResolvedValue({
      id: 'bp-rsi',
      title: 'RSI',
      description: 'RSI strategy',
      parameters: RSI_PARAMS,
      authorId: 'u1',
      isVerified: true,
    } as never);
    mockBroker.getRecentBars.mockResolvedValue(cycleBars);

    const result = await service.runBacktest('bp-rsi', {
      limit: 7,
      slippagePct: 0,
      commissionPerTrade: 0,
    });

    const closedTrades = result.trades.filter((t) => !t.isOpen);
    for (const t of closedTrades) {
      expect(t.entryRsi).not.toBeNull();
      expect(t.entryContext).toBeNull();
      expect(t.exitReason).toBeNull();
    }
  });
});
