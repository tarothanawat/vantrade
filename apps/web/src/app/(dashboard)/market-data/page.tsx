'use client';

import InteractiveMarketChart from '@/components/market/InteractiveMarketChart';
import { marketDataClient } from '@/lib/api-client/market-data.client';
import {
  MarketDataBarsQuerySchema,
  type MarketBarDto,
  type MarketDataTimeframe,
} from '@vantrade/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

const symbolOptions = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'AAPL', 'SPY', 'TSLA'];

// Sensible bar counts per timeframe — auto-selected, no manual input needed
const TIMEFRAME_LIMITS: Record<MarketDataTimeframe, number> = {
  '1Min': 120,
  '5Min': 100,
  '15Min': 96,
  '1Hour': 72,
  '1Day': 90,
};

// Auto-refresh cadence matched to timeframe granularity
const TIMEFRAME_REFRESH: Record<MarketDataTimeframe, number> = {
  '1Min': 10,
  '5Min': 20,
  '15Min': 30,
  '1Hour': 60,
  '1Day': 300,
};

const TIMEFRAME_LABELS: Record<MarketDataTimeframe, string> = {
  '1Min': '1m',
  '5Min': '5m',
  '15Min': '15m',
  '1Hour': '1h',
  '1Day': '1D',
};

type ChartMode = 'line' | 'candles';

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value >= 1000) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toFixed(6);
}

export default function MarketDataPage() {
  const [symbol, setSymbol] = useState('BTCUSD');
  const [customSymbolMode, setCustomSymbolMode] = useState(false);
  const [customSymbolText, setCustomSymbolText] = useState('');
  const [timeframe, setTimeframe] = useState<MarketDataTimeframe>('1Min');
  const [chartMode, setChartMode] = useState<ChartMode>('candles');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [bars, setBars] = useState<MarketBarDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Derived — no manual state needed
  const limit = TIMEFRAME_LIMITS[timeframe];
  const refreshSeconds = TIMEFRAME_REFRESH[timeframe];

  const loadBars = useCallback(async () => {
    setLoading(true);
    setError('');

    const parsed = MarketDataBarsQuerySchema.safeParse({ symbol, timeframe, limit });
    if (!parsed.success) {
      setError('Invalid market data query.');
      setLoading(false);
      return;
    }

    try {
      const response = await marketDataClient.getBars(parsed.data);
      setBars(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch market bars');
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe, limit]);

  useEffect(() => {
    void loadBars();
  }, [loadBars]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => void loadBars(), refreshSeconds * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, refreshSeconds, loadBars]);

  const summary = useMemo(() => {
    if (bars.length === 0) return null;
    const highs = bars.map((bar) => bar.high);
    const lows = bars.map((bar) => bar.low);
    const latest = bars.at(-1)!;
    const first = bars.at(0)!;
    const change = latest.close - first.open;
    const changePct = (change / Math.max(first.open, 0.0000001)) * 100;
    return {
      latest,
      change,
      changePct,
      max: Math.max(...highs),
      min: Math.min(...lows),
    };
  }, [bars]);

  function commitCustomSymbol() {
    const trimmed = customSymbolText.trim().toUpperCase();
    if (trimmed) setSymbol(trimmed);
    setCustomSymbolMode(false);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-3xl font-bold text-white">Market Data</h1>
      <p className="mb-6 text-gray-400">
        Live OHLC bars for crypto and equities via Alpaca market data.
      </p>

      {/* ── Toolbar ── */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">

        {/* Symbol selector */}
        {!customSymbolMode ? (
          <select
            value={symbolOptions.includes(symbol) ? symbol : '__custom__'}
            onChange={(e) => {
              if (e.target.value === '__custom__') {
                setCustomSymbolMode(true);
                setCustomSymbolText(symbol);
              } else {
                setSymbol(e.target.value);
              }
            }}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm font-medium text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {symbolOptions.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
            <option value="__custom__">Custom…</option>
          </select>
        ) : (
          <div className="flex items-center gap-1">
            <input
              value={customSymbolText}
              onChange={(e) => setCustomSymbolText(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') commitCustomSymbol(); }}
              className="w-24 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="SYMBOL"
              autoFocus
            />
            <button
              onClick={commitCustomSymbol}
              className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500"
            >
              OK
            </button>
            <button
              onClick={() => setCustomSymbolMode(false)}
              className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* Divider */}
        <span className="hidden h-5 w-px bg-gray-700 sm:block" />

        {/* Timeframe tab bar — single unified control */}
        <div className="flex gap-1">
          {(Object.keys(TIMEFRAME_LABELS) as MarketDataTimeframe[]).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                timeframe === tf
                  ? 'bg-indigo-600 text-white'
                  : 'border border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              {TIMEFRAME_LABELS[tf]}
            </button>
          ))}
        </div>

        {/* Divider */}
        <span className="hidden h-5 w-px bg-gray-700 sm:block" />

        {/* Chart type */}
        <div className="flex gap-1">
          {(['candles', 'line'] as ChartMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setChartMode(mode)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                chartMode === mode
                  ? 'bg-indigo-600 text-white'
                  : 'border border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              {mode === 'candles' ? 'Candles' : 'Line'}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <span className="flex-1" />

        {/* Live / Pause toggle */}
        <button
          onClick={() => setAutoRefresh((v) => !v)}
          className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
            autoRefresh
              ? 'bg-emerald-800 text-white hover:bg-emerald-700'
              : 'border border-gray-700 text-gray-400 hover:text-white'
          }`}
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              autoRefresh ? 'animate-pulse bg-emerald-400' : 'bg-gray-500'
            }`}
          />
          {autoRefresh ? 'Live' : 'Paused'}
        </button>
      </div>

      {/* ── Compact summary strip ── */}
      {summary && (
        <div className="mb-4 flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <span className="text-2xl font-bold text-white">
            {formatPrice(summary.latest.close)}
          </span>
          <span
            className={`text-sm font-medium ${summary.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
          >
            {summary.change >= 0 ? '+' : ''}
            {formatPrice(summary.change)}&nbsp;
            ({summary.changePct >= 0 ? '+' : ''}
            {summary.changePct.toFixed(2)}%)
          </span>
          <span className="text-sm text-gray-400">
            H <span className="text-gray-200">{formatPrice(summary.max)}</span>
          </span>
          <span className="text-sm text-gray-400">
            L <span className="text-gray-200">{formatPrice(summary.min)}</span>
          </span>
          {loading && (
            <span className="animate-pulse text-xs text-gray-500">Refreshing…</span>
          )}
        </div>
      )}

      {error && <p className="mb-4 text-sm text-rose-400">{error}</p>}

      {/* ── Chart ── */}
      {bars.length > 0 ? (
        <InteractiveMarketChart
          bars={bars}
          chartMode={chartMode}
          title={`${symbol} · ${TIMEFRAME_LABELS[timeframe]}`}
          timeframe={timeframe}
          showRsi
          rsiPeriod={14}
          rsiBuyThreshold={30}
          rsiSellThreshold={70}
          showVolume
          showOhlcvOverlay
          showXAxis
          showGridlines
        />
      ) : (
        !loading && <p className="text-gray-500">No data available for this query.</p>
      )}
    </main>
  );
}
