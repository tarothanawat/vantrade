'use client';

import { EquityCurve } from '@/components/backtest/EquityCurve';
import { TradeRow } from '@/components/backtest/TradeRow';
import { blueprintsClient } from '@/lib/api-client/blueprints.client';
import { formatCurrency, formatWinRate } from '@/lib/backtest-formatters';
import type { BacktestResultDto, BlueprintParametersDto, MarketDataTimeframe } from '@vantrade/types';
import { useEffect, useState } from 'react';

interface Props {
  params: BlueprintParametersDto;
}

const TIMEFRAMES: MarketDataTimeframe[] = ['1Min', '5Min', '15Min', '1Hour', '1Day'];
const LIMITS = [100, 250, 500, 1000, 2000, 5000] as const;

export default function BacktestPreviewPanel({ params }: Props) {
  const defaultTimeframe: MarketDataTimeframe =
    params.strategyType === 'RSI' ? params.executionTimeframe : params.entryTimeframe;

  const [testSymbol, setTestSymbol] = useState('');
  const [testTimeframe, setTestTimeframe] = useState<MarketDataTimeframe>(defaultTimeframe);
  const [limit, setLimit] = useState<number>(500);
  const [result, setResult] = useState<BacktestResultDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Keep timeframe in sync when the form's execution timeframe changes
  useEffect(() => {
    setTestTimeframe(defaultTimeframe);
  }, [defaultTimeframe]);

  const effectiveSymbol = testSymbol.trim().toUpperCase() || params.symbol;

  async function handleRun() {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await blueprintsClient.previewBacktest({
        parameters: params,
        testSymbol: testSymbol.trim().toUpperCase() || undefined,
        testTimeframe,
        limit,
        slippagePct: 0,
        commissionPerTrade: 0,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backtest failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-gray-800 bg-gray-950 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-300">Backtest Current Config</h3>
        <p className="text-xs text-gray-500">
          {params.strategyType === 'RSI'
            ? `Strategy: ${params.symbol} · ${params.executionTimeframe} · RSI(${params.rsiPeriod}) · Buy < ${params.rsiBuyThreshold} · Sell > ${params.rsiSellThreshold}`
            : `Strategy: ${params.symbol} · ICT · Entry ${params.entryTimeframe} · SL ${params.slPoints}pt · RR ${params.minRR}`
          }
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Test Symbol <span className="text-gray-600">(blank = {params.symbol})</span></label>
          <input
            type="text"
            value={testSymbol}
            onChange={(e) => setTestSymbol(e.target.value.toUpperCase())}
            placeholder={params.symbol}
            maxLength={10}
            className="w-28 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Timeframe</label>
          <select
            value={testTimeframe}
            onChange={(e) => setTestTimeframe(e.target.value as MarketDataTimeframe)}
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
            onClick={handleRun}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Running…' : `Run Backtest on ${effectiveSymbol}`}
          </button>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {result && (
        <div className="mt-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
              <p className="text-xs text-gray-500">Total P&amp;L</p>
              <p className={`mt-0.5 text-base font-bold ${result.totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrency(result.totalPnL)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
              <p className="text-xs text-gray-500">Win Rate</p>
              <p className="mt-0.5 text-base font-bold text-white">
                {formatWinRate(result.winCount, result.lossCount)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
              <p className="text-xs text-gray-500">Trades</p>
              <p className="mt-0.5 text-base font-bold text-white">{result.totalTrades}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
              <p className="text-xs text-gray-500">Win / Loss</p>
              <p className="mt-0.5 text-sm font-bold">
                <span className="text-emerald-400">{result.winCount}W</span>
                {' / '}
                <span className="text-red-400">{result.lossCount}L</span>
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
              <p className="text-xs text-gray-500">Bars</p>
              <p className="mt-0.5 text-base font-bold text-white">{result.barsAnalyzed}</p>
            </div>
          </div>

          <p className="mt-2 text-xs text-gray-500">{result.symbol} · {result.timeframe}</p>

          {result.equityCurve.length >= 2 && <EquityCurve data={result.equityCurve} />}

          {result.trades.length > 0 && (
            <div className="mt-4 rounded-lg border border-gray-800 bg-gray-900 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Simulated Trades</p>
              <div className="max-h-52 overflow-y-auto">
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
              No trades triggered. The RSI thresholds were not crossed in this period.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
