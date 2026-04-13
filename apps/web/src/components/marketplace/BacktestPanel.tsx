'use client';

import { blueprintsClient } from '@/lib/api-client/blueprints.client';
import type { BacktestResultDto, BacktestTradeDto, MarketDataTimeframe } from '@vantrade/types';
import { useState } from 'react';

interface Props {
  blueprintId: string;
  defaultSymbol: string;
  defaultTimeframe: MarketDataTimeframe;
}

const TIMEFRAMES: MarketDataTimeframe[] = ['1Min', '5Min', '15Min', '1Hour', '1Day'];
const LIMITS = [100, 250, 500, 1000, 2000, 5000] as const;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function formatWinRate(winCount: number, lossCount: number): string {
  if (winCount + lossCount === 0) return 'N/A';
  return `${((winCount / (winCount + lossCount)) * 100).toFixed(1)}%`;
}

function EquityCurve({ data }: { data: { timestamp: string; equity: number }[] }) {
  if (data.length < 2) return null;

  const W = 400;
  const H = 80;
  const pad = 4;

  const equities = data.map((d) => d.equity);
  const min = Math.min(...equities);
  const max = Math.max(...equities);
  const range = max - min || 1;

  const points = data
    .map((d, i) => {
      const x = pad + (i / (data.length - 1)) * (W - pad * 2);
      const y = pad + (1 - (d.equity - min) / range) * (H - pad * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const lastEquity = equities[equities.length - 1];
  const lineColor = lastEquity >= 0 ? '#34d399' : '#f87171';

  return (
    <div className="mt-4 rounded-lg border border-gray-800 bg-gray-950 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Equity Curve</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke={lineColor} strokeWidth="1.5" />
        <line x1={pad} y1={H / 2} x2={W - pad} y2={H / 2} stroke="#374151" strokeWidth="0.5" strokeDasharray="4 4" />
      </svg>
    </div>
  );
}

function formatBarTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}

function TradeRow({ trade, index }: { trade: BacktestTradeDto; index: number }) {
  return (
    <tr className="border-t border-gray-800 text-xs">
      <td className="py-1.5 pr-3 text-gray-400">{index + 1}</td>
      <td className="py-1.5 pr-3">
        <span className={`font-semibold uppercase ${trade.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>
          {trade.side}
        </span>
      </td>
      <td className="py-2 pr-3">
        <div className="text-gray-300">{trade.entryPrice.toFixed(2)}</div>
        <div className="text-gray-500">{formatBarTime(trade.entryTime)}</div>
        {trade.entryRsi != null && <div className="text-indigo-400">RSI {trade.entryRsi.toFixed(1)}</div>}
      </td>
      <td className="py-2 pr-3">
        {trade.exitPrice != null && trade.exitTime != null ? (
          <>
            <div className="text-gray-300">{trade.exitPrice.toFixed(2)}</div>
            <div className="text-gray-500">{formatBarTime(trade.exitTime)}</div>
            <div className="text-indigo-400">RSI {trade.exitRsi?.toFixed(1) ?? '—'}</div>
          </>
        ) : (
          <span className="rounded bg-indigo-900/60 px-1.5 py-0.5 text-indigo-300">Open</span>
        )}
      </td>
      <td className="py-2">
        {trade.isOpen ? (
          <span className="text-gray-500">—</span>
        ) : trade.pnl != null ? (
          <span className={trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {formatCurrency(trade.pnl)}
          </span>
        ) : (
          '—'
        )}
      </td>
    </tr>
  );
}

export default function BacktestPanel({ blueprintId, defaultSymbol, defaultTimeframe }: Props) {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [timeframe, setTimeframe] = useState<MarketDataTimeframe>(defaultTimeframe);
  const [limit, setLimit] = useState<number>(500);
  const [result, setResult] = useState<BacktestResultDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleRunBacktest() {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await blueprintsClient.runBacktest(blueprintId, {
        symbol: symbol.trim().toUpperCase() || undefined,
        timeframe,
        limit,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backtest failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-6">
      <h2 className="mb-4 text-lg font-bold text-white">Backtest Strategy</h2>
      <p className="mb-5 text-sm text-gray-400">
        Simulate this strategy against historical data. Override the symbol to test across different markets.
      </p>

      {/* Controls */}
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Symbol</label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder={defaultSymbol}
            maxLength={10}
            className="w-28 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Timeframe</label>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as MarketDataTimeframe)}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            {TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Bars</label>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            {LIMITS.map((l) => (
              <option key={l} value={l}>{l} bars</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col justify-end">
          <button
            onClick={handleRunBacktest}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Running…' : 'Run Backtest'}
          </button>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {result && (
        <div className="mt-6">
          {/* Summary metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
              <p className="text-xs text-gray-500">Total P&amp;L</p>
              <p className={`mt-0.5 text-base font-bold ${result.totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrency(result.totalPnL)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
              <p className="text-xs text-gray-500">Win Rate</p>
              <p className="mt-0.5 text-base font-bold text-white">
                {formatWinRate(result.winCount, result.lossCount)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
              <p className="text-xs text-gray-500">Trades</p>
              <p className="mt-0.5 text-base font-bold text-white">{result.totalTrades}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
              <p className="text-xs text-gray-500">Win / Loss</p>
              <p className="mt-0.5 text-sm font-bold text-white">
                <span className="text-emerald-400">{result.winCount}W</span>
                {' / '}
                <span className="text-red-400">{result.lossCount}L</span>
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
              <p className="text-xs text-gray-500">Bars Analyzed</p>
              <p className="mt-0.5 text-base font-bold text-white">{result.barsAnalyzed}</p>
            </div>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            {result.symbol} · {result.timeframe}
          </p>

          {/* Equity curve */}
          {result.equityCurve.length >= 2 && <EquityCurve data={result.equityCurve} />}

          {/* Trade list */}
          {result.trades.length > 0 && (
            <div className="mt-4 rounded-lg border border-gray-800 bg-gray-950 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Simulated Trades</p>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs text-gray-500">
                      <th className="pb-1.5 pr-3">#</th>
                      <th className="pb-1.5 pr-3">Side</th>
                      <th className="pb-1.5 pr-3">Entry · Time · RSI</th>
                      <th className="pb-1.5 pr-3">Exit · Time · RSI</th>
                      <th className="pb-1.5">P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.map((trade, i) => (
                      <TradeRow key={i} trade={trade} index={i} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result.trades.length === 0 && (
            <p className="mt-4 text-sm text-gray-500">
              No trades were triggered during this period. The RSI thresholds may not have been crossed.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
