import { TradeSignal } from '@vantrade/types';

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
