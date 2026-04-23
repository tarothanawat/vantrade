'use client';

import type { SubscriptionStatsResponseDto, TradeLog } from '@vantrade/types';
import type { SubscriptionWithDetails } from '@/hooks/use-subscriptions';
import { subscriptionsClient } from '@/lib/api-client/subscriptions.client';
import { useState } from 'react';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function formatWinRate(winCount: number, lossCount: number): string {
  if (winCount + lossCount === 0) return 'N/A';
  return `${((winCount / (winCount + lossCount)) * 100).toFixed(1)}%`;
}

function StatCell({
  label,
  loading,
  children,
}: {
  label: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      {loading ? <p className="mt-0.5 text-sm font-semibold text-gray-600">—</p> : children}
    </div>
  );
}

interface Props {
  subscription: SubscriptionWithDetails;
  stats: SubscriptionStatsResponseDto | undefined;
  statsLoading: boolean;
  onToggle: (id: string, currentlyActive: boolean) => void;
  onRemove: (id: string) => void;
}

export function SubscriptionCard({ subscription: sub, stats: subStats, statsLoading, onToggle, onRemove }: Props) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 px-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-white">{sub.blueprint?.title ?? 'Subscribed Blueprint'}</p>
            {sub.symbolOverride ? (
              <span className="rounded-full bg-indigo-900/60 px-2 py-0.5 text-xs font-semibold text-indigo-300">
                {sub.symbolOverride}
              </span>
            ) : null}
          </div>
          <p className="mt-1 font-mono text-xs text-gray-500">ID: {sub.blueprintId}</p>
          <p className="mt-1 text-xs text-gray-500">
            Since{' '}
            {new Date(sub.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </p>

          {/* Performance stats */}
          <div className="mt-3 grid grid-cols-3 gap-3">
            <StatCell label="Realized P&L" loading={statsLoading && !subStats}>
              {subStats ? (
                <>
                  <p
                    className={`mt-0.5 text-sm font-semibold ${
                      subStats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {formatCurrency(subStats.totalPnl)}
                  </p>
                  {subStats.unrealizedPnl !== 0 && (
                    <p className={`text-xs ${subStats.unrealizedPnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {subStats.unrealizedPnl >= 0 ? '+' : ''}{formatCurrency(subStats.unrealizedPnl)} open
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-0.5 text-sm font-semibold text-gray-600">—</p>
              )}
            </StatCell>

            <StatCell label="Win Rate" loading={statsLoading && !subStats}>
              {subStats ? (
                <p className="mt-0.5 text-sm font-semibold text-white">
                  {formatWinRate(subStats.winCount, subStats.lossCount)}
                </p>
              ) : (
                <p className="mt-0.5 text-sm font-semibold text-gray-600">—</p>
              )}
            </StatCell>

            <StatCell label="Trades" loading={statsLoading && !subStats}>
              {subStats ? (
                <p className="mt-0.5 text-sm font-semibold text-white">
                  {subStats.executedTrades}
                  <span className="ml-1.5 text-xs text-gray-500">
                    ({subStats.winCount}W / {subStats.lossCount}L)
                  </span>
                </p>
              ) : (
                <p className="mt-0.5 text-sm font-semibold text-gray-600">—</p>
              )}
            </StatCell>
          </div>

          {/* Recent trade logs */}
          <RecentTradeLogs subscriptionId={sub.id} tradeLogs={sub.tradeLogs} />
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              sub.isActive ? 'bg-emerald-900 text-emerald-400' : 'bg-gray-800 text-gray-400'
            }`}
          >
            {sub.isActive ? 'Active' : 'Paused'}
          </span>
          <button
            onClick={() => onToggle(sub.id, sub.isActive)}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500 transition-colors"
          >
            {sub.isActive ? 'Pause' : 'Resume'}
          </button>
          <button
            onClick={() => onRemove(sub.id)}
            className="rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-400 hover:border-red-700 transition-colors"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Status → human-readable reason ──────────────────────────────────────────

const ALPACA_STATUS_LABELS: Record<string, string> = {
  accepted:       'Order accepted by broker',
  filled:         'Order filled',
  pending_new:    'Order pending',
  new:            'Order placed',
  partially_filled: 'Partially filled',
  canceled:       'Order canceled',
  expired:        'Order expired',
  replaced:       'Order replaced',
};

const ICT_HOLD_LABELS: Record<string, string> = {
  NO_H1_BIAS:          'No clear hourly trend',
  M15_NO_CONFIRM:      'M15 trend does not confirm H1',
  NO_M5_ENTRY_ZONE:    'No order block or FVG on M5',
  NO_H1_RANGE:         'Could not define H1 price range',
  NOT_IN_DISCOUNT:     'Price not in discount zone (buy setup)',
  NOT_IN_PREMIUM:      'Price not in premium zone (sell setup)',
  NO_LIQUIDITY_SWEEP:  'No liquidity sweep confirmation',
};

function statusToReason(status: string): string {
  if (status.startsWith('ict_hold:')) {
    const code = status.slice('ict_hold:'.length);
    return ICT_HOLD_LABELS[code] ?? code;
  }
  if (status.startsWith('bracket_entry:')) return 'ICT bracket order placed — waiting for TP or SL';
  if (status === 'bracket_exit:tp') return 'Exited at Take Profit';
  if (status === 'bracket_exit:sl') return 'Exited at Stop Loss';
  if (status === 'signal_hold') return 'RSI in neutral zone — no signal';
  if (status.startsWith('signal_')) {
    const m = status.match(/^signal_(\w+)_waiting_(\w+)$/);
    if (m) return `${m[1].toUpperCase()} signal received — waiting for ${m[2].toUpperCase()} turn`;
  }
  return ALPACA_STATUS_LABELS[status] ?? status;
}

// ── Round pairing ─────────────────────────────────────────────────────────────

interface TradeRound {
  roundNumber: number;
  entry: TradeLog;
  exit: TradeLog | null; // null = open position
  pnl: number | null;
}

function buildRounds(logs: TradeLog[]): { rounds: TradeRound[]; holdCount: number } {
  // logs come newest-first from the API — reverse to pair chronologically
  const chronological = [...logs].reverse();
  const executed = chronological.filter((l) => l.side === 'buy' || l.side === 'sell');
  const holdCount = chronological.filter((l) => l.side === 'hold').length;

  // If the log window starts mid-round (first visible log is an exit leg that has pnl
  // stored, while its matching entry lies outside the fetched window), skip it so the
  // entry/exit pairing stays aligned.  Only exit legs ever have a non-null pnl in the DB.
  const startIdx = executed.length > 0 && executed[0].pnl !== null ? 1 : 0;

  const rounds: TradeRound[] = [];
  let i = startIdx;
  while (i < executed.length) {
    const entry = executed[i];
    const exit = executed[i + 1] ?? null;
    // Only pair if the exit is the opposite side (a real close, not another entry)
    const isValidExit = exit !== null && exit.side !== entry.side;
    rounds.push({
      roundNumber: rounds.length + 1,
      entry,
      exit: isValidExit ? exit : null,
      pnl: isValidExit ? (exit.pnl ?? null) : null,
    });
    i += isValidExit ? 2 : 1;
  }

  return { rounds: rounds.reverse(), holdCount }; // newest rounds first
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmt(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(new Date(date));
}

function fmtPrice(price: number): string {
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Component ─────────────────────────────────────────────────────────────────

const ROUNDS_PER_PAGE = 5;
const LOGS_FETCH_SIZE = 20;

function RecentTradeLogs({ subscriptionId, tradeLogs: initialLogs }: { subscriptionId: string; tradeLogs: TradeLog[] | undefined }) {
  const [allLogs, setAllLogs] = useState<TradeLog[]>(initialLogs ?? []);
  const [visibleRounds, setVisibleRounds] = useState(ROUNDS_PER_PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  // If the initial batch is a full 40-log embed, there may be more on the server
  const [hasMore, setHasMore] = useState((initialLogs?.length ?? 0) >= 40);

  if (allLogs.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-gray-800 bg-gray-950 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Trade Log</p>
        <p className="text-xs text-gray-500">No execution logs yet.</p>
      </div>
    );
  }

  const { rounds, holdCount } = buildRounds(allLogs);
  const visibleSlice = rounds.slice(0, visibleRounds);
  const canExpandLocally = visibleRounds < rounds.length;
  const needsServerFetch = !canExpandLocally && hasMore;

  async function loadMoreFromServer() {
    setLoadingMore(true);
    try {
      const fetched = await subscriptionsClient.getTradeLogs(subscriptionId, LOGS_FETCH_SIZE, allLogs.length);
      setAllLogs((prev) => [...prev, ...fetched]);
      if (fetched.length < LOGS_FETCH_SIZE) setHasMore(false);
      setVisibleRounds((prev) => prev + ROUNDS_PER_PAGE);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-gray-800 bg-gray-950 p-3 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Trade Log</p>

      {rounds.length === 0 ? (
        <p className="text-xs text-gray-500">No executed orders yet.</p>
      ) : (
        visibleSlice.map((round) => (
          <div key={round.entry.id} className="rounded-md border border-gray-800 bg-gray-900 p-3 text-xs space-y-2">
            {/* Round header */}
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-400">Round #{round.roundNumber}</span>
              {round.pnl !== null ? (
                <span className={`font-semibold ${round.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {round.pnl >= 0 ? '+' : ''}{formatCurrency(round.pnl)}
                </span>
              ) : round.exit === null ? (
                <span className="rounded-full bg-yellow-900/50 px-2 py-0.5 text-yellow-400 font-semibold">Open</span>
              ) : (
                <span className="font-semibold text-gray-500">—</span>
              )}
            </div>

            {/* Entry row */}
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
              <span className={`font-bold uppercase ${round.entry.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>
                {round.entry.side === 'buy' ? '▲ BUY' : '▼ SELL'}
              </span>
              <span className="text-gray-300 font-mono">{round.entry.symbol} × {round.entry.quantity} @ ${fmtPrice(round.entry.price)}</span>

              <span className="text-gray-600">when</span>
              <span className="text-gray-400">{fmt(round.entry.executedAt)}</span>

              <span className="text-gray-600">why</span>
              <span className="text-gray-400">{statusToReason(round.entry.status)}</span>
            </div>

            {/* Exit row */}
            {round.exit ? (
              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 border-t border-gray-800 pt-2">
                <span className={`font-bold uppercase ${round.exit.side === 'sell' ? 'text-red-400' : 'text-emerald-400'}`}>
                  {round.exit.side === 'sell' ? '▼ SELL' : '▲ BUY'}
                </span>
                <span className="text-gray-300 font-mono">{round.exit.symbol} × {round.exit.quantity} @ ${fmtPrice(round.exit.price)}</span>

                <span className="text-gray-600">when</span>
                <span className="text-gray-400">{fmt(round.exit.executedAt)}</span>

                <span className="text-gray-600">why</span>
                <span className="text-gray-400">{statusToReason(round.exit.status)}</span>
              </div>
            ) : (
              <div className="border-t border-gray-800 pt-2 text-gray-500 italic">
                Position still open — exit not yet executed
              </div>
            )}
          </div>
        ))
      )}

      {/* Pagination controls */}
      {(canExpandLocally || needsServerFetch) && (
        <button
          onClick={
            canExpandLocally
              ? () => setVisibleRounds((prev) => prev + ROUNDS_PER_PAGE)
              : loadMoreFromServer
          }
          disabled={loadingMore}
          className="w-full rounded-md border border-gray-700 py-1.5 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-200 transition-colors disabled:opacity-50"
        >
          {loadingMore ? 'Loading…' : `Show more (${rounds.length - visibleRounds > 0 ? rounds.length - visibleRounds : '+'} rounds)`}
        </button>
      )}

      {visibleRounds > ROUNDS_PER_PAGE && (
        <button
          onClick={() => setVisibleRounds(ROUNDS_PER_PAGE)}
          className="w-full rounded-md py-1 text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          Show less
        </button>
      )}

      {holdCount > 0 && (
        <p className="text-xs text-gray-600">{holdCount} tick{holdCount !== 1 ? 's' : ''} skipped (signal in neutral zone or wrong turn)</p>
      )}
    </div>
  );
}
