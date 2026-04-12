import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MarketBarDto } from '@vantrade/types';
import { TradeSignal } from '@vantrade/types';
import { BlueprintsRepository } from './blueprints.repository';
import { BlueprintsService } from './blueprints.service';

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

function makeBlueprint(params = VALID_PARAMS as Record<string, unknown>) {
  return { id: 'bp-1', title: 'Test', description: 'A test blueprint', parameters: params, authorId: 'user-1', isVerified: true };
}

// Neutral prices → RSI ≈ 67 (HOLD)
const HOLD_BARS = [
  { close: 100, open: 99, high: 101, low: 99, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
  { close: 101, open: 100, high: 102, low: 100, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
  { close: 100, open: 101, high: 102, low: 99, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
  { close: 101, open: 100, high: 102, low: 100, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
];

// Declining prices → RSI = 0 (BUY)
const BUY_BARS = [
  { close: 100, open: 101, high: 102, low: 99, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
  { close: 90, open: 100, high: 101, low: 89, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
  { close: 80, open: 90, high: 91, low: 79, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
  { close: 70, open: 80, high: 81, low: 69, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
];

// Rising prices → RSI = 100 (SELL)
const SELL_BARS = [
  { close: 70, open: 69, high: 72, low: 69, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
  { close: 80, open: 70, high: 82, low: 70, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
  { close: 90, open: 80, high: 92, low: 80, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
  { close: 100, open: 90, high: 102, low: 90, volume: 100, symbol: 'BTCUSD', timestamp: new Date() },
];

// Helper: build a minimal MarketBarDto with a specific close price
function bar(close: number, dayOffset = 0): MarketBarDto {
  return {
    symbol: 'BTCUSD',
    close,
    open: close,
    high: close,
    low: close,
    volume: 100,
    timestamp: new Date(2024, 0, dayOffset + 1),
  };
}

// Price sequence [100,90,80,70,80,90,100] (rsiPeriod=3):
//   i=3 (price=70): RSI=0  → BUY  → open long
//   i=6 (price=100): RSI≈70 → SELL → close long, PnL=(100-70)*qty
const TRADE_CYCLE_BARS = [100, 90, 80, 70, 80, 90, 100].map(bar);

// Reverse sequence for SELL_HIGH_BUY_LOW [70,80,90,100,90,80,70]:
//   i=3 (price=100): RSI=100 → SELL → open short
//   i=6 (price=70):  RSI≈30  → BUY  → close short, PnL=(100-70)*qty
const SHORT_CYCLE_BARS = [70, 80, 90, 100, 90, 80, 70].map(bar);

// Only declining prices — triggers BUY but no SELL
const BUY_ONLY_BARS = [100, 90, 80, 70].map(bar);

describe('BlueprintsService.getDryRunSignal()', () => {
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

  it('throws NotFoundException when the blueprint does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(service.getDryRunSignal('bp-missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(mockBroker.getRecentBars).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when blueprint parameters are invalid', async () => {
    mockRepo.findById.mockResolvedValue(makeBlueprint({ symbol: '' }) as never);

    await expect(service.getDryRunSignal('bp-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(mockBroker.getRecentBars).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when the broker returns insufficient bars', async () => {
    mockRepo.findById.mockResolvedValue(makeBlueprint() as never);
    // rsiPeriod=3 needs 4 bars; only return 2
    mockBroker.getRecentBars.mockResolvedValue(HOLD_BARS.slice(0, 2));

    await expect(service.getDryRunSignal('bp-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requests the correct number of bars (rsiPeriod + 1)', async () => {
    mockRepo.findById.mockResolvedValue(makeBlueprint() as never);
    mockBroker.getRecentBars.mockResolvedValue(HOLD_BARS);

    await service.getDryRunSignal('bp-1');

    expect(mockBroker.getRecentBars).toHaveBeenCalledWith('BTCUSD', '1Min', 4); // rsiPeriod(3) + 1
  });

  it('returns HOLD signal with correct symbol and latest close price', async () => {
    mockRepo.findById.mockResolvedValue(makeBlueprint() as never);
    mockBroker.getRecentBars.mockResolvedValue(HOLD_BARS);

    const result = await service.getDryRunSignal('bp-1');

    expect(result.symbol).toBe('BTCUSD');
    expect(result.signal).toBe(TradeSignal.HOLD);
    expect(result.price).toBe(101); // last bar's close
    expect(typeof result.rsi).toBe('number');
  });

  it('returns BUY signal when prices are declining (RSI oversold)', async () => {
    mockRepo.findById.mockResolvedValue(makeBlueprint() as never);
    mockBroker.getRecentBars.mockResolvedValue(BUY_BARS);

    const result = await service.getDryRunSignal('bp-1');

    expect(result.signal).toBe(TradeSignal.BUY);
    expect(result.rsi).toBeLessThanOrEqual(30);
    expect(result.price).toBe(70);
  });

  it('returns SELL signal when prices are rising (RSI overbought)', async () => {
    mockRepo.findById.mockResolvedValue(makeBlueprint() as never);
    mockBroker.getRecentBars.mockResolvedValue(SELL_BARS);

    const result = await service.getDryRunSignal('bp-1');

    expect(result.signal).toBe(TradeSignal.SELL);
    expect(result.rsi).toBeGreaterThanOrEqual(70);
    expect(result.price).toBe(100);
  });
});

describe('BlueprintsService.runBacktest()', () => {
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

  it('throws NotFoundException when blueprint does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(service.runBacktest('bp-missing', { limit: 200 })).rejects.toBeInstanceOf(NotFoundException);
    expect(mockBroker.getRecentBars).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when blueprint parameters are invalid', async () => {
    mockRepo.findById.mockResolvedValue(makeBlueprint({ symbol: '' }) as never);

    await expect(service.runBacktest('bp-1', { limit: 200 })).rejects.toBeInstanceOf(BadRequestException);
    expect(mockBroker.getRecentBars).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when limit is less than rsiPeriod + 1', async () => {
    mockRepo.findById.mockResolvedValue(makeBlueprint() as never); // rsiPeriod=3, needs limit≥4

    await expect(service.runBacktest('bp-1', { limit: 3 })).rejects.toBeInstanceOf(BadRequestException);
    expect(mockBroker.getRecentBars).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when broker returns insufficient bars', async () => {
    mockRepo.findById.mockResolvedValue(makeBlueprint() as never);
    mockBroker.getRecentBars.mockResolvedValue(BUY_ONLY_BARS.slice(0, 2)); // only 2, need 4

    await expect(service.runBacktest('bp-1', { limit: 200 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses symbol override from query instead of blueprint symbol', async () => {
    mockRepo.findById.mockResolvedValue(makeBlueprint() as never);
    mockBroker.getRecentBars.mockResolvedValue(TRADE_CYCLE_BARS);

    await service.runBacktest('bp-1', { symbol: 'AAPL', limit: 200 });

    expect(mockBroker.getRecentBars).toHaveBeenCalledWith('AAPL', expect.any(String), expect.any(Number));
  });

  it('falls back to blueprint symbol when no override is provided', async () => {
    mockRepo.findById.mockResolvedValue(makeBlueprint() as never);
    mockBroker.getRecentBars.mockResolvedValue(TRADE_CYCLE_BARS);

    await service.runBacktest('bp-1', { limit: 200 });

    expect(mockBroker.getRecentBars).toHaveBeenCalledWith('BTCUSD', expect.any(String), expect.any(Number));
  });

  it('BUY_LOW_SELL_HIGH: opens long on BUY signal and closes on SELL signal', async () => {
    mockRepo.findById.mockResolvedValue(makeBlueprint() as never); // BUY_LOW_SELL_HIGH, qty=1
    mockBroker.getRecentBars.mockResolvedValue(TRADE_CYCLE_BARS);

    const result = await service.runBacktest('bp-1', { limit: 200 });

    expect(result.totalTrades).toBe(1);
    expect(result.trades[0].side).toBe('buy');
    expect(result.trades[0].entryPrice).toBe(70);
    expect(result.trades[0].exitPrice).toBe(100);
    expect(result.trades[0].pnl).toBe(30); // (100-70) * qty=1
    expect(result.trades[0].isOpen).toBe(false);
    expect(result.totalPnL).toBe(30);
    expect(result.winCount).toBe(1);
    expect(result.lossCount).toBe(0);
    expect(result.winRate).toBe(100);
  });

  it('records entryRsi at the BUY signal and exitRsi at the SELL signal', async () => {
    mockRepo.findById.mockResolvedValue(makeBlueprint() as never);
    mockBroker.getRecentBars.mockResolvedValue(TRADE_CYCLE_BARS);

    const result = await service.runBacktest('bp-1', { limit: 200 });
    const trade = result.trades[0];

    // Entry RSI triggered BUY (must be ≤ rsiBuyThreshold=30)
    expect(trade.entryRsi).toBeLessThanOrEqual(30);
    // Exit RSI triggered SELL (must be ≥ rsiSellThreshold=70)
    expect(trade.exitRsi).toBeGreaterThanOrEqual(70);
    // entryTime and exitTime are ISO strings from bar timestamps
    expect(typeof trade.entryTime).toBe('string');
    expect(typeof trade.exitTime).toBe('string');
  });

  it('records entryRsi for an open position and leaves exitRsi null', async () => {
    mockRepo.findById.mockResolvedValue(makeBlueprint() as never);
    mockBroker.getRecentBars.mockResolvedValue(BUY_ONLY_BARS);

    const result = await service.runBacktest('bp-1', { limit: 200 });
    const trade = result.trades[0];

    expect(trade.entryRsi).toBeLessThanOrEqual(30);
    expect(trade.exitRsi).toBeNull();
    expect(trade.exitTime).toBeNull();
  });

  it('SELL_HIGH_BUY_LOW: opens short on SELL signal and closes on BUY signal', async () => {
    mockRepo.findById.mockResolvedValue(
      makeBlueprint({ ...VALID_PARAMS, executionMode: 'SELL_HIGH_BUY_LOW' }) as never,
    );
    mockBroker.getRecentBars.mockResolvedValue(SHORT_CYCLE_BARS);

    const result = await service.runBacktest('bp-1', { limit: 200 });

    expect(result.totalTrades).toBe(1);
    expect(result.trades[0].side).toBe('sell');
    expect(result.trades[0].entryPrice).toBe(100);
    expect(result.trades[0].exitPrice).toBe(70);
    expect(result.trades[0].pnl).toBe(30); // (100-70) * qty=1
    expect(result.trades[0].isOpen).toBe(false);
    expect(result.winRate).toBe(100);
  });

  it('records an open position when bars end before a closing signal', async () => {
    mockRepo.findById.mockResolvedValue(makeBlueprint() as never);
    mockBroker.getRecentBars.mockResolvedValue(BUY_ONLY_BARS); // BUY at i=3, no SELL follows

    const result = await service.runBacktest('bp-1', { limit: 200 });

    expect(result.totalTrades).toBe(1);
    expect(result.trades[0].isOpen).toBe(true);
    expect(result.trades[0].exitPrice).toBeNull();
    expect(result.trades[0].pnl).toBeNull();
    // Open trades must not count toward win/loss
    expect(result.winCount).toBe(0);
    expect(result.lossCount).toBe(0);
    expect(result.totalPnL).toBe(0);
  });

  it('returns winRate 0 when there are no closed trades', async () => {
    mockRepo.findById.mockResolvedValue(makeBlueprint() as never);
    mockBroker.getRecentBars.mockResolvedValue(BUY_ONLY_BARS);

    const result = await service.runBacktest('bp-1', { limit: 200 });

    expect(result.winRate).toBe(0);
  });

  it('builds the equity curve with one point per closed trade', async () => {
    mockRepo.findById.mockResolvedValue(makeBlueprint() as never);
    mockBroker.getRecentBars.mockResolvedValue(TRADE_CYCLE_BARS);

    const result = await service.runBacktest('bp-1', { limit: 200 });

    expect(result.equityCurve).toHaveLength(1);
    expect(result.equityCurve[0].equity).toBe(30);
  });

  it('returns correct barsAnalyzed count', async () => {
    mockRepo.findById.mockResolvedValue(makeBlueprint() as never);
    mockBroker.getRecentBars.mockResolvedValue(TRADE_CYCLE_BARS);

    const result = await service.runBacktest('bp-1', { limit: 200 });

    expect(result.barsAnalyzed).toBe(TRADE_CYCLE_BARS.length);
  });
});
