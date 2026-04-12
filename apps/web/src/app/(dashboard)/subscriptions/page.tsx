'use client';

import { subscriptionsClient } from '@/lib/api-client/subscriptions.client';
import type { Subscription, SubscriptionStatsResponseDto, TradeLog } from '@vantrade/types';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type SubscriptionWithDetails = Subscription & {
  blueprint?: {
    id: string;
    title: string;
  };
  tradeLogs?: TradeLog[];
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function formatWinRate(winCount: number, lossCount: number): string {
  if (winCount + lossCount === 0) return 'N/A';
  return `${((winCount / (winCount + lossCount)) * 100).toFixed(1)}%`;
}

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionWithDetails[]>([]);
  const [stats, setStats] = useState<Record<string, SubscriptionStatsResponseDto>>({});
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    subscriptionsClient
      .getMine()
      .then((data) => {
        const subs = data as SubscriptionWithDetails[];
        setSubscriptions(subs);

        if (subs.length === 0) return;

        setStatsLoading(true);
        Promise.allSettled(subs.map((s) => subscriptionsClient.getStats(s.id).then((st) => ({ id: s.id, st }))))
          .then((results) => {
            const map: Record<string, SubscriptionStatsResponseDto> = {};
            for (const result of results) {
              if (result.status === 'fulfilled') {
                map[result.value.id] = result.value.st;
              }
            }
            setStats(map);
          })
          .finally(() => setStatsLoading(false));
      })
      .catch(() => setError('Failed to load subscriptions'))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(id: string, currentlyActive: boolean) {
    try {
      const updated = await subscriptionsClient.toggle(id, !currentlyActive);
      setSubscriptions((prev: SubscriptionWithDetails[]) =>
        prev.map((s) => (s.id === id ? { ...s, isActive: updated.isActive } : s)),
      );
    } catch {
      setError('Failed to toggle subscription');
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this subscription?')) return;
    try {
      await subscriptionsClient.remove(id);
      setSubscriptions((prev: SubscriptionWithDetails[]) => prev.filter((s) => s.id !== id));
    } catch {
      setError('Failed to remove subscription');
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-gray-500">Loading subscriptions…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">My Subscriptions</h1>
        <Link
          href="/marketplace"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
        >
          + Subscribe to Blueprint
        </Link>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {subscriptions.length === 0 ? (
        <p className="text-gray-500">
          No active subscriptions yet.{' '}
          <Link href="/marketplace" className="text-indigo-400 hover:underline">
            Browse blueprints
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {subscriptions.map((sub) => {
            const subStats = stats[sub.id];
            return (
              <div
                key={sub.id}
                className="rounded-xl border border-gray-800 bg-gray-900 px-6 py-4"
              >
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
                      <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
                        <p className="text-xs text-gray-500">Total P&amp;L</p>
                        {statsLoading && !subStats ? (
                          <p className="mt-0.5 text-sm font-semibold text-gray-600">—</p>
                        ) : subStats ? (
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
                      </div>
                      <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
                        <p className="text-xs text-gray-500">Win Rate</p>
                        {statsLoading && !subStats ? (
                          <p className="mt-0.5 text-sm font-semibold text-gray-600">—</p>
                        ) : subStats ? (
                          <p className="mt-0.5 text-sm font-semibold text-white">
                            {formatWinRate(subStats.winCount, subStats.lossCount)}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-sm font-semibold text-gray-600">—</p>
                        )}
                      </div>
                      <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
                        <p className="text-xs text-gray-500">Trades</p>
                        {statsLoading && !subStats ? (
                          <p className="mt-0.5 text-sm font-semibold text-gray-600">—</p>
                        ) : subStats ? (
                          <p className="mt-0.5 text-sm font-semibold text-white">
                            {subStats.totalTrades}
                            <span className="ml-1.5 text-xs text-gray-500">
                              ({subStats.winCount}W / {subStats.lossCount}L)
                            </span>
                          </p>
                        ) : (
                          <p className="mt-0.5 text-sm font-semibold text-gray-600">—</p>
                        )}
                      </div>
                    </div>

                    {/* Recent trade logs */}
                    <div className="mt-3 rounded-lg border border-gray-800 bg-gray-950 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Recent Trade Logs
                      </p>
                      {!sub.tradeLogs || sub.tradeLogs.length === 0 ? (
                        <p className="text-xs text-gray-500">No execution logs yet.</p>
                      ) : (
                        <ul className="space-y-1 text-xs">
                          {sub.tradeLogs.slice(0, 3).map((log) => (
                            <li key={log.id} className="text-gray-300">
                              <span className="font-semibold uppercase">{log.side}</span> · {log.symbol} · {log.quantity} @ {log.price.toFixed(2)} ·{' '}
                              <span className="text-gray-400">{log.status}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        sub.isActive
                          ? 'bg-emerald-900 text-emerald-400'
                          : 'bg-gray-800 text-gray-400'
                      }`}
                    >
                      {sub.isActive ? 'Active' : 'Paused'}
                    </span>
                    <button
                      onClick={() => handleToggle(sub.id, sub.isActive)}
                      className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500 transition-colors"
                    >
                      {sub.isActive ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      onClick={() => handleRemove(sub.id)}
                      className="rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-400 hover:border-red-700 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
