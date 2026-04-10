import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
