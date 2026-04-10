import { TradeSignal } from '@vantrade/types';
import { calculatePnL, calculateRSI, calculateSMA, calculateUnrealisedPnL, generateSignal } from './trading.engine';

describe('calculateRSI', () => {
  it('throws when not enough data points', () => {
    expect(() => calculateRSI([1, 2], 14)).toThrow();
  });

  it('returns 100 when there are only gains', () => {
    const prices = Array.from({ length: 15 }, (_, i) => i + 1);
    expect(calculateRSI(prices, 14)).toBe(100);
  });

  it('returns 0 when there are only losses', () => {
    const prices = Array.from({ length: 15 }, (_, i) => 15 - i);
    expect(calculateRSI(prices, 14)).toBeCloseTo(0, 1);
  });

  it('returns a value between 0 and 100', () => {
    const prices = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.15, 43.61, 44.33,
      44.83, 45.1, 45.15, 46.92, 46.85,
    ];
    const rsi = calculateRSI(prices, 14);
    expect(rsi).toBeGreaterThan(0);
    expect(rsi).toBeLessThan(100);
  });
});

describe('calculateSMA', () => {
  it('throws when not enough data points', () => {
    expect(() => calculateSMA([1, 2], 5)).toThrow();
  });

  it('calculates the simple average of last N prices', () => {
    expect(calculateSMA([10, 20, 30, 40, 50], 3)).toBeCloseTo(40);
  });

  it('uses only the last period values', () => {
    expect(calculateSMA([100, 1, 2, 3], 3)).toBeCloseTo(2);
  });
});

describe('generateSignal', () => {
  it('returns BUY when RSI is below buy threshold', () => {
    expect(generateSignal(25, 30, 70)).toBe(TradeSignal.BUY);
  });

  it('returns SELL when RSI is above sell threshold', () => {
    expect(generateSignal(75, 30, 70)).toBe(TradeSignal.SELL);
  });

  it('returns HOLD when RSI is between thresholds', () => {
    expect(generateSignal(50, 30, 70)).toBe(TradeSignal.HOLD);
  });

  it('returns BUY when RSI equals the buy threshold', () => {
    expect(generateSignal(30, 30, 70)).toBe(TradeSignal.BUY);
  });

  it('returns SELL when RSI equals the sell threshold', () => {
    expect(generateSignal(70, 30, 70)).toBe(TradeSignal.SELL);
  });
});

describe('calculatePnL', () => {
  it('returns positive PnL for a profitable buy position', () => {
    expect(calculatePnL(100, 120, 10, 'buy')).toBeCloseTo(200);
  });

  it('returns negative PnL for a losing buy position', () => {
    expect(calculatePnL(100, 80, 10, 'buy')).toBeCloseTo(-200);
  });

  it('returns positive PnL for a profitable sell position', () => {
    expect(calculatePnL(120, 100, 10, 'sell')).toBeCloseTo(200);
  });

  it('returns negative PnL for a losing sell position', () => {
    expect(calculatePnL(80, 100, 10, 'sell')).toBeCloseTo(-200);
  });

  it('returns 0 when entry and exit prices are equal', () => {
    expect(calculatePnL(100, 100, 5, 'buy')).toBeCloseTo(0);
  });
});

describe('calculateUnrealisedPnL', () => {
  it('returns positive unrealised PnL when price has risen', () => {
    expect(calculateUnrealisedPnL(100, 115, 10)).toBeCloseTo(150);
  });

  it('returns negative unrealised PnL when price has fallen', () => {
    expect(calculateUnrealisedPnL(100, 90, 10)).toBeCloseTo(-100);
  });

  it('returns 0 when current price equals entry price', () => {
    expect(calculateUnrealisedPnL(100, 100, 10)).toBeCloseTo(0);
  });
});
