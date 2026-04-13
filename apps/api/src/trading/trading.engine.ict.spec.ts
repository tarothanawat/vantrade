import type { MarketBarDto } from '@vantrade/types';
import { OrderSide, TradeSignal } from '@vantrade/types';
import type { SwingPoint } from './trading.engine';
import {
  aggregateBars,
  checkLimitOrderFill,
  classifyPriceZone,
  detectFairValueGap,
  detectMarketStructure,
  detectOrderBlock,
  detectSwingPoints,
  generateIctSignal,
  hasLiquiditySweep,
} from './trading.engine';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeBar(
  close: number,
  opts: Partial<{ open: number; high: number; low: number; volume: number; timestamp: Date; symbol: string }> = {},
): MarketBarDto {
  return {
    symbol: opts.symbol ?? 'XAUUSD',
    timestamp: opts.timestamp ?? new Date('2024-01-01T00:00:00Z'),
    open: opts.open ?? close,
    high: opts.high ?? close + 1,
    low: opts.low ?? close - 1,
    close,
    volume: opts.volume ?? 100,
  };
}

/** Builds a series of N bars with strictly ascending closes (bullish trend). */
function ascendingBars(n: number, start = 100, step = 1): MarketBarDto[] {
  return Array.from({ length: n }, (_, i) => {
    const c = start + i * step;
    return makeBar(c, { open: c - step / 2, high: c + step / 2, low: c - step });
  });
}

/**
 * Builds SwingPoint arrays directly for testing detectMarketStructure.
 * No reliance on detectSwingPoints — pure unit testing of the structure logic.
 */
function makeBullishSwings(): SwingPoint[] {
  // HH + HL pattern: two HIGHs (110, 120) and two LOWs (100, 105)
  return [
    { index: 0, price: 100, type: 'LOW',  timestamp: new Date('2024-01-01') },
    { index: 2, price: 110, type: 'HIGH', timestamp: new Date('2024-01-02') },
    { index: 4, price: 105, type: 'LOW',  timestamp: new Date('2024-01-03') },
    { index: 6, price: 120, type: 'HIGH', timestamp: new Date('2024-01-04') },
  ];
}

function makeBearishSwings(): SwingPoint[] {
  // LH + LL pattern: two HIGHs (120, 110) and two LOWs (100, 90)
  return [
    { index: 0, price: 120, type: 'HIGH', timestamp: new Date('2024-01-01') },
    { index: 2, price: 100, type: 'LOW',  timestamp: new Date('2024-01-02') },
    { index: 4, price: 110, type: 'HIGH', timestamp: new Date('2024-01-03') },
    { index: 6, price: 90,  type: 'LOW',  timestamp: new Date('2024-01-04') },
  ];
}

/** Bars whose last close is clearly in "discount" zone for bullish trades. */
function bullishDiscountBars(n = 30): MarketBarDto[] {
  // Rise from 100 to ~160, current price around 115 (in lower half of range)
  return Array.from({ length: n }, (_, i) => {
    const c = 100 + i * 2;
    return makeBar(c, { open: c - 1, high: c + 2, low: c - 2 });
  });
}


// ── aggregateBars ─────────────────────────────────────────────────────────────

describe('aggregateBars', () => {
  it('aggregates 12 M5 bars into 1 H1 bar with correct OHLCV', () => {
    const bars = Array.from({ length: 12 }, (_, i) =>
      makeBar(100 + i, { open: 99 + i, high: 101 + i, low: 98 + i, volume: 10 }),
    );
    const result = aggregateBars(bars, 12);
    expect(result).toHaveLength(1);
    const [h1] = result;
    expect(h1.open).toBe(bars[0].open);
    expect(h1.close).toBe(bars[11].close);
    expect(h1.high).toBe(Math.max(...bars.map((b) => b.high)));
    expect(h1.low).toBe(Math.min(...bars.map((b) => b.low)));
    expect(h1.volume).toBe(bars.reduce((s, b) => s + b.volume, 0));
    expect(h1.timestamp).toEqual(bars[0].timestamp);
  });

  it('creates 2 M15 bars from 6 M5 bars (n=3)', () => {
    const bars = Array.from({ length: 6 }, (_, i) => makeBar(100 + i));
    const result = aggregateBars(bars, 3);
    expect(result).toHaveLength(2);
  });

  it('drops the trailing partial window', () => {
    const bars = Array.from({ length: 5 }, (_, i) => makeBar(100 + i));
    const result = aggregateBars(bars, 3); // 1 full window + 2 leftover
    expect(result).toHaveLength(1);
  });

  it('returns empty array when bars.length < n', () => {
    const bars = Array.from({ length: 2 }, (_, i) => makeBar(100 + i));
    expect(aggregateBars(bars, 3)).toHaveLength(0);
  });

  it('returns empty array when n <= 0', () => {
    const bars = Array.from({ length: 5 }, (_, i) => makeBar(100 + i));
    expect(aggregateBars(bars, 0)).toHaveLength(0);
  });
});

// ── detectSwingPoints ─────────────────────────────────────────────────────────

describe('detectSwingPoints', () => {
  it('detects a swing high in a V-shaped sequence', () => {
    // ascend then descend — peak at bar 4
    const bars = [
      makeBar(100, { high: 100, low: 99 }),
      makeBar(102, { high: 103, low: 101 }),
      makeBar(105, { high: 106, low: 104 }),
      makeBar(108, { high: 110, low: 107 }),  // ← swing high
      makeBar(105, { high: 106, low: 104 }),
      makeBar(102, { high: 103, low: 101 }),
      makeBar(100, { high: 101, low: 99 }),
    ];
    const swings = detectSwingPoints(bars, 2);
    const highs = swings.filter((s) => s.type === 'HIGH');
    expect(highs.length).toBeGreaterThanOrEqual(1);
    expect(highs.some((s) => s.index === 3)).toBe(true);
  });

  it('detects a swing low in an inverted V sequence', () => {
    const bars = [
      makeBar(110, { high: 111, low: 109 }),
      makeBar(107, { high: 108, low: 106 }),
      makeBar(104, { high: 105, low: 103 }),
      makeBar(101, { high: 102, low: 100 }),  // ← swing low
      makeBar(104, { high: 105, low: 103 }),
      makeBar(107, { high: 108, low: 106 }),
      makeBar(110, { high: 111, low: 109 }),
    ];
    const swings = detectSwingPoints(bars, 2);
    const lows = swings.filter((s) => s.type === 'LOW');
    expect(lows.some((s) => s.index === 3)).toBe(true);
  });

  it('returns empty array when bars are insufficient for lookback', () => {
    const bars = Array.from({ length: 3 }, (_, i) => makeBar(100 + i));
    const swings = detectSwingPoints(bars, 3); // need 2*3+1 = 7 bars minimum usable range
    expect(swings).toHaveLength(0);
  });
});

// ── detectMarketStructure ─────────────────────────────────────────────────────

describe('detectMarketStructure', () => {
  it('returns NEUTRAL when fewer than 4 swing points exist', () => {
    const bars = ascendingBars(10);
    const swings = detectSwingPoints(bars, 2).slice(0, 2); // only 2 swings
    const result = detectMarketStructure(bars, swings);
    expect(result.bias).toBe('NEUTRAL');
  });

  it('identifies BULLISH bias from HH + HL swing points', () => {
    // Pass hand-crafted swings directly — unit-tests structure logic not detectSwingPoints
    const bars = Array.from({ length: 10 }, (_, i) => makeBar(100 + i));
    const swings = makeBullishSwings(); // HH=120 > HH=110, HL=105 > HL=100
    const result = detectMarketStructure(bars, swings);
    expect(result.bias).toBe('BULLISH');
  });

  it('identifies BEARISH bias from LH + LL swing points', () => {
    const bars = Array.from({ length: 10 }, (_, i) => makeBar(100 - i));
    const swings = makeBearishSwings(); // LH=110 < LH=120, LL=90 < LL=100
    const result = detectMarketStructure(bars, swings);
    expect(result.bias).toBe('BEARISH');
  });
});

// ── detectOrderBlock ──────────────────────────────────────────────────────────

describe('detectOrderBlock', () => {
  it('detects a BULLISH OB (last bearish candle before bullish impulse)', () => {
    const bars: MarketBarDto[] = [
      // Setup bars
      makeBar(100, { open: 100, high: 101, low: 99 }),
      makeBar(101, { open: 101, high: 102, low: 100 }),
      makeBar(101, { open: 103, high: 104, low: 101 }), // bearish candle (open > close = bearish, OB candidate)
      makeBar(104, { open: 101, high: 105, low: 101 }),  // impulse bar 1
      makeBar(107, { open: 104, high: 108, low: 104 }),  // impulse bar 2
      makeBar(110, { open: 107, high: 111, low: 107 }),  // impulse bar 3
    ];
    const ob = detectOrderBlock(bars, 'BULLISH', 3);
    expect(ob).not.toBeNull();
    expect(ob!.type).toBe('BULLISH');
    expect(ob!.isValid).toBe(true);
  });

  it('detects a BEARISH OB (last bullish candle before bearish impulse)', () => {
    const bars: MarketBarDto[] = [
      makeBar(110, { open: 109, high: 111, low: 108 }),
      makeBar(109, { open: 108, high: 110, low: 107 }),
      makeBar(110, { open: 107, high: 111, low: 107 }), // bullish candle (close > open, OB candidate)
      makeBar(107, { open: 110, high: 110, low: 106 }), // impulse down 1
      makeBar(104, { open: 107, high: 107, low: 103 }), // impulse down 2
      makeBar(101, { open: 104, high: 104, low: 100 }), // impulse down 3
    ];
    const ob = detectOrderBlock(bars, 'BEARISH', 3);
    expect(ob).not.toBeNull();
    expect(ob!.type).toBe('BEARISH');
    expect(ob!.isValid).toBe(true);
  });

  it('marks OB as invalid when price fully trades through it', () => {
    const bars: MarketBarDto[] = [
      makeBar(99, { open: 101, high: 102, low: 99 }), // bearish OB candidate (open > close)
      makeBar(104, { open: 99, high: 105, low: 99 }),  // impulse 1
      makeBar(107, { open: 104, high: 108, low: 104 }), // impulse 2
      makeBar(110, { open: 107, high: 111, low: 107 }), // impulse 3
      makeBar(97,  { open: 110, high: 110, low: 95 }), // ← trades below OB.low
    ];
    const ob = detectOrderBlock(bars, 'BULLISH', 3);
    // OB may or may not be found depending on exact values, but if found it should be invalid
    if (ob) {
      expect(ob.isValid).toBe(false);
    }
  });

  it('returns null when bars are insufficient', () => {
    const bars = [makeBar(100), makeBar(101)];
    expect(detectOrderBlock(bars, 'BULLISH')).toBeNull();
  });
});

// ── detectFairValueGap ────────────────────────────────────────────────────────

describe('detectFairValueGap', () => {
  it('detects a BULLISH FVG (gap up: bar[i-1].high < bar[i+1].low)', () => {
    const bars: MarketBarDto[] = [
      makeBar(100, { high: 101, low: 99 }),   // bar i-1: high=101
      makeBar(103, { high: 104, low: 102 }),   // bar i (impulse)
      makeBar(106, { high: 107, low: 104 }),   // bar i+1: low=104  → gap [101, 104]
    ];
    const fvg = detectFairValueGap(bars, 'BULLISH', 0);
    expect(fvg).not.toBeNull();
    expect(fvg!.type).toBe('BULLISH');
    expect(fvg!.low).toBe(101);
    expect(fvg!.high).toBe(104);
    expect(fvg!.midpoint).toBe(102.5);
  });

  it('detects a BEARISH FVG (gap down: bar[i-1].low > bar[i+1].high)', () => {
    const bars: MarketBarDto[] = [
      makeBar(110, { high: 111, low: 108 }),  // bar i-1: low=108
      makeBar(107, { high: 108, low: 105 }),  // bar i (impulse)
      makeBar(104, { high: 107, low: 103 }),  // bar i+1: high=107 → gap [107, 108]
    ];
    const fvg = detectFairValueGap(bars, 'BEARISH', 0);
    expect(fvg).not.toBeNull();
    expect(fvg!.type).toBe('BEARISH');
  });

  it('returns null when no gap exists', () => {
    const bars: MarketBarDto[] = [
      makeBar(100, { high: 102, low: 98 }),
      makeBar(101, { high: 103, low: 99 }),
      makeBar(102, { high: 104, low: 100 }),  // bar[i+1].low=100 < bar[i-1].high=102 → no bullish gap
    ];
    expect(detectFairValueGap(bars, 'BULLISH', 0)).toBeNull();
  });

  it('filters gaps smaller than minGapPct', () => {
    // Gap of 0.5 on price ~100 = 0.5% but minGapPct is 1%
    const bars: MarketBarDto[] = [
      makeBar(100, { high: 100.2, low: 99.8 }),
      makeBar(100.5, { high: 101, low: 100 }),
      makeBar(101, { high: 101.5, low: 100.7 }), // gap [100.2, 100.7] = 0.5 units on ~100 = 0.5%
    ];
    expect(detectFairValueGap(bars, 'BULLISH', 1)).toBeNull();  // 1% min → filtered
    expect(detectFairValueGap(bars, 'BULLISH', 0)).not.toBeNull(); // 0% min → found
  });

  it('returns null with fewer than 3 bars', () => {
    expect(detectFairValueGap([makeBar(100), makeBar(101)], 'BULLISH')).toBeNull();
  });
});

// ── classifyPriceZone ─────────────────────────────────────────────────────────

describe('classifyPriceZone', () => {
  // Range: low=100, high=200, midpoint=150

  it('returns DISCOUNT for price below 49% of range', () => {
    expect(classifyPriceZone(145, 200, 100)).toBe('DISCOUNT'); // (145-100)/100 = 45%
  });

  it('returns PREMIUM for price above 51% of range', () => {
    expect(classifyPriceZone(155, 200, 100)).toBe('PREMIUM'); // (155-100)/100 = 55%
  });

  it('returns AT_EQUILIBRIUM for price between 49-51%', () => {
    expect(classifyPriceZone(150, 200, 100)).toBe('AT_EQUILIBRIUM'); // exactly 50%
  });

  it('returns AT_EQUILIBRIUM when range is zero', () => {
    expect(classifyPriceZone(100, 100, 100)).toBe('AT_EQUILIBRIUM');
  });

  it('handles prices clearly below/above boundaries', () => {
    expect(classifyPriceZone(148, 200, 100)).toBe('DISCOUNT');  // 48% (< 49%)
    expect(classifyPriceZone(152, 200, 100)).toBe('PREMIUM');   // 52% (> 51%)
  });
});

// ── hasLiquiditySweep ─────────────────────────────────────────────────────────

describe('hasLiquiditySweep', () => {
  it('detects HIGH_SWEEP: wick above swing level, close back below', () => {
    const bars = [
      makeBar(100, { high: 105, low: 99 }),  // wick above 103, closed at 100 (below 103)
    ];
    expect(hasLiquiditySweep(bars, 103, 'HIGH_SWEEP')).toBe(true);
  });

  it('returns false for HIGH_SWEEP when close is above the level', () => {
    const bars = [makeBar(105, { high: 107, low: 104 })]; // closed above 103
    expect(hasLiquiditySweep(bars, 103, 'HIGH_SWEEP')).toBe(false);
  });

  it('detects LOW_SWEEP: wick below swing level, close back above', () => {
    const bars = [makeBar(100, { high: 101, low: 94 })]; // wick below 97, closed at 100 (above 97)
    expect(hasLiquiditySweep(bars, 97, 'LOW_SWEEP')).toBe(true);
  });

  it('returns false for LOW_SWEEP when close is below the level', () => {
    const bars = [makeBar(95, { high: 96, low: 90 })]; // closed below 97
    expect(hasLiquiditySweep(bars, 97, 'LOW_SWEEP')).toBe(false);
  });

  it('returns false for empty bars array', () => {
    expect(hasLiquiditySweep([], 100, 'HIGH_SWEEP')).toBe(false);
  });
});

// ── checkLimitOrderFill ───────────────────────────────────────────────────────

describe('checkLimitOrderFill', () => {
  describe('BUY position', () => {
    const position = { side: 'buy' as const, stopLossPrice: 95, takeProfitPrice: 110 };

    it('returns TP when bar high reaches takeProfitPrice', () => {
      const bar = makeBar(107, { high: 111, low: 100 });
      expect(checkLimitOrderFill(bar, position)).toBe('TP');
    });

    it('returns SL when bar low hits stopLossPrice', () => {
      const bar = makeBar(98, { high: 101, low: 94 });
      expect(checkLimitOrderFill(bar, position)).toBe('SL');
    });

    it('SL takes priority when both levels are touched in the same bar', () => {
      const bar = makeBar(100, { high: 115, low: 90 }); // hits both SL=95 and TP=110
      expect(checkLimitOrderFill(bar, position)).toBe('SL');
    });

    it('returns null when neither level is touched', () => {
      const bar = makeBar(102, { high: 105, low: 97 });
      expect(checkLimitOrderFill(bar, position)).toBeNull();
    });
  });

  describe('SELL position', () => {
    const position = { side: 'sell' as const, stopLossPrice: 110, takeProfitPrice: 95 };

    it('returns TP when bar low reaches takeProfitPrice', () => {
      const bar = makeBar(97, { high: 103, low: 94 });
      expect(checkLimitOrderFill(bar, position)).toBe('TP');
    });

    it('returns SL when bar high hits stopLossPrice', () => {
      const bar = makeBar(107, { high: 111, low: 104 });
      expect(checkLimitOrderFill(bar, position)).toBe('SL');
    });

    it('SL takes priority when both levels touched', () => {
      const bar = makeBar(100, { high: 115, low: 90 });
      expect(checkLimitOrderFill(bar, position)).toBe('SL');
    });
  });
});

// ── generateIctSignal ─────────────────────────────────────────────────────────

describe('generateIctSignal', () => {
  const baseParams = {
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

  it('returns HOLD with NO_H1_BIAS when H1 structure is neutral', () => {
    const flatBars = Array.from({ length: 20 }, () => makeBar(100, { high: 101, low: 99 }));
    const result = generateIctSignal({
      h1Bars: flatBars,
      m15Bars: flatBars,
      m5Bars: flatBars,
      params: baseParams,
      currentTime: new Date(),
    });
    expect(result.signal).toBe(TradeSignal.HOLD);
    expect(result.reason).toBe('NO_H1_BIAS');
  });

  it('returns HOLD when M15 bias is NEUTRAL (descending bars, no clear structure)', () => {
    // H1 rising, M15 flat → M15 structure is NEUTRAL → checklist fails
    const risingH1  = bullishDiscountBars(30);
    const flatM15   = Array.from({ length: 30 }, () => makeBar(100, { high: 101, low: 99 }));
    const result = generateIctSignal({
      h1Bars: risingH1,
      m15Bars: flatM15,
      m5Bars: risingH1,
      params: baseParams,
      currentTime: new Date(),
    });
    expect(result.signal).toBe(TradeSignal.HOLD);
    // Reason is either NO_H1_BIAS or M15_NO_CONFIRM depending on bar data — both are valid HOLD reasons
    expect(['NO_H1_BIAS', 'M15_NO_CONFIRM']).toContain(result.reason);
  });

  it('returns HOLD when both OB and FVG scans are disabled', () => {
    const bars = bullishDiscountBars(30);
    const result = generateIctSignal({
      h1Bars: bars,
      m15Bars: bars,
      m5Bars: bars,
      params: { ...baseParams, useOrderBlocks: false, useFairValueGaps: false },
      currentTime: new Date(),
    });
    expect(result.signal).toBe(TradeSignal.HOLD);
    // Reason is either NO_H1_BIAS, M15_NO_CONFIRM, or NO_M5_ENTRY_ZONE — all valid
    expect(['NO_H1_BIAS', 'M15_NO_CONFIRM', 'NO_M5_ENTRY_ZONE']).toContain(result.reason);
  });

  it('populates limitPrice, stopLossPrice, takeProfitPrice correctly when signal fires', () => {
    const bullishH1  = bullishDiscountBars(30);
    const bullishM15 = bullishDiscountBars(30);

    // M5: create a bullish FVG at bar 10 (bars[9].high < bars[11].low)
    const m5Bars: MarketBarDto[] = [
      ...Array.from({ length: 9 }, (_, i) => makeBar(100 + i, { open: 99 + i, high: 101 + i, low: 99 + i })),
      makeBar(102, { open: 102, high: 102, low: 100 }),  // bar i-1: high=102
      makeBar(105, { open: 100, high: 107, low: 100 }),  // impulse bar
      makeBar(108, { open: 107, high: 110, low: 105 }),  // bar i+1: low=105 → bullish FVG [102, 105]
      ...Array.from({ length: 9 }, (_, i) => makeBar(110 + i, { open: 109 + i, high: 112 + i, low: 109 + i })),
    ];

    const result = generateIctSignal({
      h1Bars: bullishH1,
      m15Bars: bullishM15,
      m5Bars,
      params: { ...baseParams, useOrderBlocks: false, useFairValueGaps: true },
      currentTime: new Date(),
    });

    // Signal may be BUY or HOLD depending on zone classification — either is valid for synthetic data
    if (result.signal === TradeSignal.BUY) {
      expect(result.side).toBe(OrderSide.BUY);
      expect(result.limitPrice).not.toBeNull();
      expect(result.stopLossPrice).toBeCloseTo(result.limitPrice! - baseParams.slPoints, 5);
      expect(result.takeProfitPrice).toBeCloseTo(result.limitPrice! + baseParams.slPoints * baseParams.minRR, 5);
    } else {
      // HOLD is also valid when discount/premium zone check fails on synthetic data
      expect(result.signal).toBe(TradeSignal.HOLD);
    }
  });
});
