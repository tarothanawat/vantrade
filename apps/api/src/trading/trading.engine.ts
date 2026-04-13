import { OrderSide, TradeSignal } from '@vantrade/types';
import type { IctParametersDto, MarketBarDto } from '@vantrade/types';

// ---------------------------------------------------------------------------
// RSI (Relative Strength Index)
// ---------------------------------------------------------------------------

/**
 * Calculates RSI for a price series using Wilder's smoothing method.
 * Requires at least `period + 1` data points.
 */
export function calculateRSI(prices: number[], period: number): number {
  if (prices.length < period + 1) {
    throw new Error(`RSI requires at least ${period + 1} data points, got ${prices.length}`);
  }

  // Compute initial gains and losses
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }

  avgGain /= period;
  avgLoss /= period;

  // Wilder's smoothing for remaining prices
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// ---------------------------------------------------------------------------
// Moving Average
// ---------------------------------------------------------------------------

/**
 * Simple Moving Average of the last `period` prices.
 */
export function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) {
    throw new Error(`SMA requires at least ${period} data points, got ${prices.length}`);
  }
  const slice = prices.slice(-period);
  return slice.reduce((sum, p) => sum + p, 0) / period;
}

// ---------------------------------------------------------------------------
// Signal generation
// ---------------------------------------------------------------------------

/**
 * Generates a trading signal from the current RSI and current price vs SMA.
 * BUY:  RSI <= buyThreshold  (oversold)
 * SELL: RSI >= sellThreshold (overbought)
 * HOLD: otherwise
 */
export function generateSignal(
  rsi: number,
  rsiBuyThreshold: number,
  rsiSellThreshold: number,
): TradeSignal {
  if (rsi <= rsiBuyThreshold) return TradeSignal.BUY;
  if (rsi >= rsiSellThreshold) return TradeSignal.SELL;
  return TradeSignal.HOLD;
}

// ---------------------------------------------------------------------------
// PnL
// ---------------------------------------------------------------------------

/**
 * Calculates realised PnL for a closed position.
 * Positive = profit, Negative = loss.
 */
export function calculatePnL(
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  side: 'buy' | 'sell',
): number {
  if (side === 'buy') return (exitPrice - entryPrice) * quantity;
  return (entryPrice - exitPrice) * quantity;
}

/**
 * Calculates unrealised PnL for an open position.
 */
export function calculateUnrealisedPnL(
  entryPrice: number,
  currentPrice: number,
  quantity: number,
): number {
  return (currentPrice - entryPrice) * quantity;
}

// =============================================================================
// ICT / Smart Money Concepts — Pure Functions
// =============================================================================

// ---------------------------------------------------------------------------
// Bar Aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregates fine-grained bars into a higher timeframe by grouping into
 * fixed-size windows. Trailing partial windows are dropped.
 *
 * Examples:
 *   aggregateBars(m5Bars, 3)  → M15 bars (3 × M5)
 *   aggregateBars(m5Bars, 12) → H1 bars  (12 × M5)
 */
export function aggregateBars(bars: MarketBarDto[], n: number): MarketBarDto[] {
  if (n <= 0 || bars.length < n) return [];
  const result: MarketBarDto[] = [];
  for (let i = 0; i + n <= bars.length; i += n) {
    const window = bars.slice(i, i + n);
    result.push({
      symbol: window[0].symbol,
      timestamp: window[0].timestamp,
      open: window[0].open,
      high: Math.max(...window.map((b) => b.high)),
      low: Math.min(...window.map((b) => b.low)),
      close: window[n - 1].close,
      volume: window.reduce((s, b) => s + b.volume, 0),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Swing Point Detection
// ---------------------------------------------------------------------------

export interface SwingPoint {
  index: number;
  price: number;
  type: 'HIGH' | 'LOW';
  timestamp: Date;
}

/**
 * Detects local swing highs and lows using a symmetric rolling lookback window.
 * A bar at index i is a swing HIGH if its high is the highest in
 * [i - lookback, i + lookback]. Similarly for swing LOW using the low.
 *
 * Requires at least `2 * lookback + 1` bars.
 */
export function detectSwingPoints(bars: MarketBarDto[], lookback: number): SwingPoint[] {
  const swings: SwingPoint[] = [];
  for (let i = lookback; i < bars.length - lookback; i++) {
    const window = bars.slice(i - lookback, i + lookback + 1);
    const maxHigh = Math.max(...window.map((b) => b.high));
    const minLow = Math.min(...window.map((b) => b.low));
    if (bars[i].high === maxHigh) {
      swings.push({ index: i, price: bars[i].high, type: 'HIGH', timestamp: bars[i].timestamp });
    }
    if (bars[i].low === minLow) {
      swings.push({ index: i, price: bars[i].low, type: 'LOW', timestamp: bars[i].timestamp });
    }
  }
  // Sort chronologically in case a bar is both a swing HIGH and LOW (flat range)
  return swings.sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------------------
// Market Structure — BOS / CHoCH
// ---------------------------------------------------------------------------

export type StructureBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface MarketStructure {
  bias: StructureBias;
  /** The swing point whose level was broken to confirm the current bias. */
  lastBOS: SwingPoint | null;
  /** The swing point whose break signalled a reversal (Change of Character). */
  lastCHoCH: SwingPoint | null;
}

/**
 * Derives market structure bias from an ordered swing-point sequence.
 *
 * Algorithm:
 *   - Tracks the most recent confirmed HIGH and LOW swing points.
 *   - If the latest close breaks above the last confirmed HIGH → BOS (bullish continuation)
 *     or CHoCH (was bearish, now turning bullish).
 *   - If the latest close breaks below the last confirmed LOW  → BOS (bearish continuation)
 *     or CHoCH (was bullish, now turning bearish).
 *   - Requires at least 4 alternating swing points to confirm a bias.
 */
export function detectMarketStructure(bars: MarketBarDto[], swings: SwingPoint[]): MarketStructure {
  if (swings.length < 4) {
    return { bias: 'NEUTRAL', lastBOS: null, lastCHoCH: null };
  }

  const currentClose = bars.at(-1)!.close;
  let bias: StructureBias = 'NEUTRAL';
  let lastBOS: SwingPoint | null = null;
  let lastCHoCH: SwingPoint | null = null;

  // Separate into ordered HIGHs and LOWs
  const highs = swings.filter((s) => s.type === 'HIGH');
  const lows  = swings.filter((s) => s.type === 'LOW');

  if (highs.length < 2 || lows.length < 2) {
    return { bias: 'NEUTRAL', lastBOS: null, lastCHoCH: null };
  }

  const prevHigh = highs[highs.length - 2];
  const lastHigh = highs[highs.length - 1];
  const prevLow  = lows[lows.length - 2];
  const lastLow  = lows[lows.length - 1];

  const isHH = lastHigh.price > prevHigh.price;
  const isHL = lastLow.price  > prevLow.price;
  const isLH = lastHigh.price < prevHigh.price;
  const isLL = lastLow.price  < prevLow.price;

  if (isHH && isHL) {
    bias = 'BULLISH';
  } else if (isLH && isLL) {
    bias = 'BEARISH';
  }

  // BOS: current price extends beyond the most recent opposing swing
  if (bias === 'BULLISH' && currentClose > lastHigh.price) {
    lastBOS = lastHigh;
  } else if (bias === 'BEARISH' && currentClose < lastLow.price) {
    lastBOS = lastLow;
  }

  // CHoCH: current price breaks the structure against the existing bias
  if (bias === 'BULLISH' && currentClose < lastLow.price) {
    lastCHoCH = lastLow;
    bias = 'BEARISH';
  } else if (bias === 'BEARISH' && currentClose > lastHigh.price) {
    lastCHoCH = lastHigh;
    bias = 'BULLISH';
  }

  return { bias, lastBOS, lastCHoCH };
}

// ---------------------------------------------------------------------------
// Order Block Detection
// ---------------------------------------------------------------------------

export interface OrderBlock {
  type: 'BULLISH' | 'BEARISH';
  high: number;
  low: number;
  midpoint: number;
  originIndex: number;
  timestamp: Date;
  /** False when price has fully traded through the zone (invalidated). */
  isValid: boolean;
}

/**
 * Finds the most recent valid Order Block of the requested type.
 *
 * A BULLISH OB is the last bearish (red) candle immediately before a bullish
 * impulse of at least `impulseMinBars` consecutive up-closes that creates a BOS.
 * A BEARISH OB is the last bullish candle before a bearish impulse.
 *
 * Invalidation: the OB is marked invalid if a subsequent close fully trades
 * through its range (below the low for bullish, above the high for bearish).
 */
export function detectOrderBlock(
  bars: MarketBarDto[],
  type: 'BULLISH' | 'BEARISH',
  impulseMinBars = 3,
): OrderBlock | null {
  if (bars.length < impulseMinBars + 2) return null;

  for (let i = bars.length - impulseMinBars - 1; i >= 1; i--) {
    const candidate = bars[i];
    const isBearishCandle = candidate.close < candidate.open;
    const isBullishCandle = candidate.close > candidate.open;

    if (type === 'BULLISH' && !isBearishCandle) continue;
    if (type === 'BEARISH' && !isBullishCandle) continue;

    // Verify the impulse following the candidate
    const impulse = bars.slice(i + 1, i + 1 + impulseMinBars);
    if (impulse.length < impulseMinBars) continue;

    const isImpulseUp   = impulse.every((b) => b.close > b.open);
    const isImpulseDown = impulse.every((b) => b.close < b.open);

    if (type === 'BULLISH' && !isImpulseUp) continue;
    if (type === 'BEARISH' && !isImpulseDown) continue;

    const ob: OrderBlock = {
      type,
      high: candidate.high,
      low: candidate.low,
      midpoint: (candidate.high + candidate.low) / 2,
      originIndex: i,
      timestamp: candidate.timestamp,
      isValid: true,
    };

    // Check if any later bar has invalidated the OB
    const laterBars = bars.slice(i + 1);
    if (type === 'BULLISH') {
      ob.isValid = !laterBars.some((b) => b.close < ob.low);
    } else {
      ob.isValid = !laterBars.some((b) => b.close > ob.high);
    }

    return ob;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Fair Value Gap Detection
// ---------------------------------------------------------------------------

export interface FairValueGap {
  type: 'BULLISH' | 'BEARISH';
  high: number;
  low: number;
  midpoint: number;
  originIndex: number;
  timestamp: Date;
  /** False when price has fully mitigated (closed through) the gap. */
  isValid: boolean;
}

/**
 * Finds the most recent unmitigated Fair Value Gap.
 *
 * BULLISH FVG (gap up): bars[i-1].high < bars[i+1].low
 *   → gap zone is [bars[i-1].high, bars[i+1].low]
 * BEARISH FVG (gap down): bars[i-1].low > bars[i+1].high
 *   → gap zone is [bars[i+1].high, bars[i-1].low]
 *
 * `minGapPct`: the gap must be at least this % of bars[i].close (filters noise).
 * Mitigation: a later bar closing inside or through the gap invalidates it.
 */
export function detectFairValueGap(
  bars: MarketBarDto[],
  type: 'BULLISH' | 'BEARISH',
  minGapPct = 0.001,
): FairValueGap | null {
  if (bars.length < 3) return null;

  for (let i = bars.length - 2; i >= 1; i--) {
    const prev = bars[i - 1];
    const curr = bars[i];
    const next = bars[i + 1];

    let gapHigh: number;
    let gapLow: number;

    if (type === 'BULLISH') {
      if (prev.high >= next.low) continue;
      gapLow  = prev.high;
      gapHigh = next.low;
    } else {
      if (prev.low <= next.high) continue;
      gapLow  = next.high;
      gapHigh = prev.low;
    }

    const gapSize = gapHigh - gapLow;
    const minGap = curr.close * (minGapPct / 100);
    if (gapSize < minGap) continue;

    const fvg: FairValueGap = {
      type,
      high: gapHigh,
      low: gapLow,
      midpoint: (gapHigh + gapLow) / 2,
      originIndex: i,
      timestamp: curr.timestamp,
      isValid: true,
    };

    // Mitigation check: any subsequent bar closing inside the gap
    const laterBars = bars.slice(i + 2);
    if (type === 'BULLISH') {
      fvg.isValid = !laterBars.some((b) => b.close <= fvg.high);
    } else {
      fvg.isValid = !laterBars.some((b) => b.close >= fvg.low);
    }

    return fvg;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Premium / Discount Zone Classification
// ---------------------------------------------------------------------------

/**
 * Returns whether a price is in the "discount" (<49%), "premium" (>51%), or
 * "equilibrium" zone of the trading range defined by rangeHigh and rangeLow.
 *
 * ICT rule: buy in discount zones, sell in premium zones.
 */
export function classifyPriceZone(
  price: number,
  rangeHigh: number,
  rangeLow: number,
): 'PREMIUM' | 'DISCOUNT' | 'AT_EQUILIBRIUM' {
  const range = rangeHigh - rangeLow;
  if (range <= 0) return 'AT_EQUILIBRIUM';
  const pct = (price - rangeLow) / range;
  if (pct > 0.51) return 'PREMIUM';
  if (pct < 0.49) return 'DISCOUNT';
  return 'AT_EQUILIBRIUM';
}

// ---------------------------------------------------------------------------
// Liquidity Sweep Detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the last bar swept a swing level (wicked past it)
 * then closed back inside — a classic smart-money stop hunt signature.
 *
 * HIGH_SWEEP: last bar's high > swingLevel AND close < swingLevel
 * LOW_SWEEP:  last bar's low  < swingLevel AND close > swingLevel
 */
export function hasLiquiditySweep(
  bars: MarketBarDto[],
  swingLevel: number,
  type: 'HIGH_SWEEP' | 'LOW_SWEEP',
): boolean {
  const last = bars.at(-1);
  if (!last) return false;
  if (type === 'HIGH_SWEEP') return last.high > swingLevel && last.close < swingLevel;
  return last.low < swingLevel && last.close > swingLevel;
}

// ---------------------------------------------------------------------------
// Limit Order Fill Simulation (backtest utility)
// ---------------------------------------------------------------------------

/**
 * Simulates whether a pending bracket limit order would fill on the given bar
 * using the bar's high and low range.
 *
 * Priority: SL wins when both TP and SL are touched in the same bar
 * (conservative — avoids overstating backtest performance).
 *
 * Returns 'TP', 'SL', or null (still pending).
 */
export function checkLimitOrderFill(
  bar: MarketBarDto,
  position: { side: 'buy' | 'sell'; stopLossPrice: number; takeProfitPrice: number },
): 'TP' | 'SL' | null {
  const { side, stopLossPrice, takeProfitPrice } = position;
  if (side === 'buy') {
    if (bar.low  <= stopLossPrice)   return 'SL';
    if (bar.high >= takeProfitPrice) return 'TP';
  } else {
    if (bar.high >= stopLossPrice)   return 'SL';
    if (bar.low  <= takeProfitPrice) return 'TP';
  }
  return null;
}

// ---------------------------------------------------------------------------
// ICT Signal Orchestrator
// ---------------------------------------------------------------------------

export interface IctSignalResult {
  signal: TradeSignal;
  side: OrderSide | null;
  limitPrice: number | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  /** Human-readable diagnostic — persisted in TradeLog.status for observability. */
  reason: string;
}

/**
 * Full ICT A+ setup checklist. All five conditions must pass; the first
 * failure short-circuits with `signal: HOLD` and a descriptive reason.
 *
 * Checklist:
 *   1. H1 bias is clearly BULLISH or BEARISH (not NEUTRAL)
 *   2. M15 structure aligns with H1 bias
 *   3. M5 has a valid OB or FVG in the correct direction
 *   4. Current M5 price is in DISCOUNT (buy) or PREMIUM (sell) of H1 range
 *   5. If requireLiquiditySweep: sweep confirmation present on M5
 *
 * Entry price = zone midpoint. SL = entry ± slPoints. TP = entry ± (slPoints × minRR).
 */
export function generateIctSignal(ctx: {
  h1Bars: MarketBarDto[];
  m15Bars: MarketBarDto[];
  m5Bars: MarketBarDto[];
  params: IctParametersDto;
  currentTime: Date;
}): IctSignalResult {
  const { h1Bars, m15Bars, m5Bars, params } = ctx;
  const hold = (reason: string): IctSignalResult => ({
    signal: TradeSignal.HOLD,
    side: null,
    limitPrice: null,
    stopLossPrice: null,
    takeProfitPrice: null,
    reason,
  });

  // ── 1. H1 Bias ────────────────────────────────────────────────────────────
  const h1Swings = detectSwingPoints(h1Bars, params.swingLookback);
  const h1Structure = detectMarketStructure(h1Bars, h1Swings);
  if (h1Structure.bias === 'NEUTRAL') return hold('NO_H1_BIAS');

  const isBullish = h1Structure.bias === 'BULLISH';

  // ── 2. M15 Confirmation ───────────────────────────────────────────────────
  const m15Swings = detectSwingPoints(m15Bars, params.swingLookback);
  const m15Structure = detectMarketStructure(m15Bars, m15Swings);
  if (m15Structure.bias !== h1Structure.bias) return hold('M15_NO_CONFIRM');

  // ── 3. M5 Entry Zone (OB or FVG) ─────────────────────────────────────────
  const obType = isBullish ? 'BULLISH' : 'BEARISH';
  let entryZoneHigh = 0;
  let entryZoneLow  = 0;
  let entryContext  = '';

  let foundZone = false;

  if (params.useOrderBlocks) {
    const ob = detectOrderBlock(m5Bars, obType);
    if (ob?.isValid) {
      entryZoneHigh = ob.high;
      entryZoneLow  = ob.low;
      entryContext  = 'OB';
      foundZone     = true;
    }
  }

  if (!foundZone && params.useFairValueGaps) {
    const fvg = detectFairValueGap(m5Bars, obType, params.fvgMinGapPct);
    if (fvg?.isValid) {
      entryZoneHigh = fvg.high;
      entryZoneLow  = fvg.low;
      entryContext  = 'FVG';
      foundZone     = true;
    }
  }

  if (!foundZone) return hold('NO_M5_ENTRY_ZONE');

  const entryPrice = (entryZoneHigh + entryZoneLow) / 2;

  // ── 4. Premium / Discount Zone ────────────────────────────────────────────
  const h1Highs = h1Swings.filter((s) => s.type === 'HIGH');
  const h1Lows  = h1Swings.filter((s) => s.type === 'LOW');
  if (h1Highs.length === 0 || h1Lows.length === 0) return hold('NO_H1_RANGE');

  const rangeHigh = Math.max(...h1Highs.map((s) => s.price));
  const rangeLow  = Math.min(...h1Lows.map((s) => s.price));
  const zone = classifyPriceZone(entryPrice, rangeHigh, rangeLow);

  if (isBullish && zone !== 'DISCOUNT') return hold('NOT_IN_DISCOUNT');
  if (!isBullish && zone !== 'PREMIUM')  return hold('NOT_IN_PREMIUM');

  // ── 5. Optional Liquidity Sweep Confirmation ──────────────────────────────
  if (params.requireLiquiditySweep) {
    const sweepType = isBullish ? 'LOW_SWEEP' : 'HIGH_SWEEP';
    const nearestSwingLevel = isBullish
      ? Math.min(...h1Lows.map((s) => s.price))
      : Math.max(...h1Highs.map((s) => s.price));
    if (!hasLiquiditySweep(m5Bars, nearestSwingLevel, sweepType)) {
      return hold('NO_LIQUIDITY_SWEEP');
    }
  }

  // ── Build bracket prices ──────────────────────────────────────────────────
  const side = isBullish ? OrderSide.BUY : OrderSide.SELL;
  const stopLossPrice    = isBullish ? entryPrice - params.slPoints : entryPrice + params.slPoints;
  const takeProfitPrice  = isBullish ? entryPrice + params.slPoints * params.minRR
                                     : entryPrice - params.slPoints * params.minRR;

  return {
    signal: isBullish ? TradeSignal.BUY : TradeSignal.SELL,
    side,
    limitPrice: entryPrice,
    stopLossPrice,
    takeProfitPrice,
    reason: `${entryContext}:${side}@${entryPrice.toFixed(2)}`,
  };
}
