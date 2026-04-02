'use client';

import InteractiveMarketChart from '@/components/market/InteractiveMarketChart';
import { marketDataClient } from '@/lib/api-client/market-data.client';
import {
    MarketDataBarsQuerySchema,
    MarketDataTimeframeSchema,
    type MarketBarDto,
    type MarketDataTimeframe,
} from '@vantrade/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

const symbolOptions = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'AAPL', 'SPY', 'TSLA'];
const timeframeOptions = MarketDataTimeframeSchema.options;

type ChartMode = 'line' | 'candles';

function formatDateLabel(value: Date): string {
  return `${value.toLocaleDateString()} ${value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value >= 1000) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toFixed(6);
}

export default function MarketDataPage() {
  const [symbol, setSymbol] = useState('BTCUSD');
  const [timeframe, setTimeframe] = useState<MarketDataTimeframe>('1Min');
  const [limit, setLimit] = useState(120);
  const [chartMode, setChartMode] = useState<ChartMode>('candles');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshSeconds, setRefreshSeconds] = useState(15);
  const [bars, setBars] = useState<MarketBarDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

    const intervalMs = Math.max(5, refreshSeconds) * 1000;
    const id = setInterval(() => {
      void loadBars();
    }, intervalMs);

    return () => clearInterval(id);
  }, [autoRefresh, refreshSeconds, loadBars]);

  const summary = useMemo(() => {
    if (bars.length === 0) return null;

    const highs = bars.map((bar) => bar.high);
    const lows = bars.map((bar) => bar.low);
    const volumes = bars.map((bar) => bar.volume);
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
      avgVolume: volumes.reduce((sum, value) => sum + value, 0) / Math.max(volumes.length, 1),
    };
  }, [bars]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-3xl font-bold text-white">Market Data Graph</h1>
      <p className="mb-8 text-gray-400">
        Visualize recent OHLC bars for crypto and equities using Alpaca market data.
      </p>

      <section className="mb-6 grid gap-4 rounded-2xl border border-gray-800 bg-gray-900 p-5 md:grid-cols-4">
        <div>
          <label htmlFor="symbol" className="mb-1 block text-sm text-gray-400">Symbol</label>
          <div className="flex gap-2">
            <select
              id="symbol"
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
            >
              {symbolOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <input
              aria-label="Custom symbol"
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase())}
              className="w-32 rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-white"
              placeholder="Custom"
            />
          </div>
        </div>

        <div>
          <label htmlFor="timeframe" className="mb-1 block text-sm text-gray-400">Timeframe</label>
          <select
            id="timeframe"
            value={timeframe}
            onChange={(event) => setTimeframe(event.target.value as MarketDataTimeframe)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
          >
            {timeframeOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="limit" className="mb-1 block text-sm text-gray-400">Bars</label>
          <input
            id="limit"
            type="number"
            min={10}
            max={500}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value || 120))}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
          />
        </div>

        <div className="flex items-end">
          <button
            onClick={() => void loadBars()}
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
          >
            {loading ? 'Loading…' : 'Refresh Graph'}
          </button>
        </div>
      </section>

      <section className="mb-6 grid gap-4 rounded-2xl border border-gray-800 bg-gray-900 p-5 md:grid-cols-4">
        <div>
          <p className="mb-1 block text-sm text-gray-400">Chart Mode</p>
          <div className="flex gap-2">
            <button
              onClick={() => setChartMode('candles')}
              className={`rounded-lg px-3 py-2 text-sm ${chartMode === 'candles' ? 'bg-indigo-600 text-white' : 'border border-gray-700 text-gray-300'}`}
            >
              Candles
            </button>
            <button
              onClick={() => setChartMode('line')}
              className={`rounded-lg px-3 py-2 text-sm ${chartMode === 'line' ? 'bg-indigo-600 text-white' : 'border border-gray-700 text-gray-300'}`}
            >
              Line
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="auto-refresh" className="mb-1 block text-sm text-gray-400">Auto Refresh</label>
          <select
            id="auto-refresh"
            value={autoRefresh ? 'on' : 'off'}
            onChange={(event) => setAutoRefresh(event.target.value === 'on')}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
          >
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </div>

        <div>
          <label htmlFor="refresh-seconds" className="mb-1 block text-sm text-gray-400">Refresh Every (sec)</label>
          <input
            id="refresh-seconds"
            type="number"
            min={5}
            max={300}
            value={refreshSeconds}
            onChange={(event) => setRefreshSeconds(Number(event.target.value || 15))}
            disabled={!autoRefresh}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white disabled:opacity-60"
          />
        </div>

        <div>
          <p className="mb-1 block text-sm text-gray-400">Quick Timeframes</p>
          <div className="grid grid-cols-3 gap-2">
            {(['1Min', '5Min', '1Hour'] as MarketDataTimeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`rounded-lg px-2 py-2 text-xs ${timeframe === tf ? 'bg-emerald-700 text-white' : 'border border-gray-700 text-gray-300'}`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {summary ? (
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-gray-300">
              Latest close: <span className="font-semibold text-white">{formatPrice(summary.latest.close)}</span>
            </p>
            <p className="text-gray-400">
              Last bar: {formatDateLabel(summary.latest.timestamp)}
            </p>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
              <p className="text-xs text-gray-500">Change</p>
              <p className={`text-lg font-semibold ${summary.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {summary.change >= 0 ? '+' : ''}{formatPrice(summary.change)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
              <p className="text-xs text-gray-500">Change %</p>
              <p className={`text-lg font-semibold ${summary.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {summary.changePct >= 0 ? '+' : ''}{summary.changePct.toFixed(2)}%
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
              <p className="text-xs text-gray-500">High</p>
              <p className="text-lg font-semibold text-gray-100">{formatPrice(summary.max)}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
              <p className="text-xs text-gray-500">Low</p>
              <p className="text-lg font-semibold text-gray-100">{formatPrice(summary.min)}</p>
            </div>
          </div>

          <InteractiveMarketChart
            bars={bars}
            chartMode={chartMode}
            title={`${symbol} · ${timeframe}`}
            showRsi
            rsiPeriod={14}
            rsiBuyThreshold={30}
            rsiSellThreshold={70}
          />

          <div className="mt-4 grid gap-3 text-xs text-gray-400 sm:grid-cols-3">
            <p>Avg Volume: <span className="text-gray-200">{summary.avgVolume.toFixed(2)}</span></p>
            <p>Latest: <span className="text-gray-200">{formatPrice(summary.latest.close)}</span></p>
            <p>Bars loaded: <span className="text-gray-200">{bars.length}</span></p>
          </div>
        </section>
      ) : (
        <p className="text-gray-500">No data available for this query.</p>
      )}
    </main>
  );
}
