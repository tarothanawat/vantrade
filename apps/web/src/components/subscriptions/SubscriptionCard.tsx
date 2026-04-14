import type { SubscriptionStatsResponseDto, TradeLog } from '@vantrade/types';
import type { SubscriptionWithDetails } from '@/hooks/use-subscriptions';

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
          <p className="font-semibold text-white">{sub.blueprint?.title ?? 'Subscribed Blueprint'}</p>
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
            <StatCell label="Total P&L" loading={statsLoading && !subStats}>
              {subStats ? (
                <p
                  className={`mt-0.5 text-sm font-semibold ${
                    subStats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {formatCurrency(subStats.totalPnl)}
                </p>
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
                  {subStats.totalTrades}
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
          <RecentTradeLogs tradeLogs={sub.tradeLogs} />
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

function RecentTradeLogs({ tradeLogs }: { tradeLogs: TradeLog[] | undefined }) {
  return (
    <div className="mt-3 rounded-lg border border-gray-800 bg-gray-950 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Recent Trade Logs</p>
      {!tradeLogs || tradeLogs.length === 0 ? (
        <p className="text-xs text-gray-500">No execution logs yet.</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {tradeLogs.slice(0, 3).map((log) => (
            <li key={log.id} className="text-gray-300">
              <span className="font-semibold uppercase">{log.side}</span> · {log.symbol} · {log.quantity} @{' '}
              {log.price.toFixed(2)} · <span className="text-gray-400">{log.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
