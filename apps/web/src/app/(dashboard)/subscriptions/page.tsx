'use client';

import { subscriptionsClient } from '@/lib/api-client/subscriptions.client';
import type { Subscription } from '@vantrade/types';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token') ?? '';
    subscriptionsClient
      .getMine(token)
      .then(setSubscriptions)
      .catch(() => setError('Failed to load subscriptions'))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(id: string, currentlyActive: boolean) {
    const token = localStorage.getItem('token') ?? '';
    try {
      const updated = await subscriptionsClient.toggle(id, !currentlyActive, token);
      setSubscriptions((prev: Subscription[]) =>
        prev.map((s) => (s.id === id ? { ...s, isActive: updated.isActive } : s)),
      );
    } catch {
      setError('Failed to toggle subscription');
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this subscription?')) return;
    const token = localStorage.getItem('token') ?? '';
    try {
      await subscriptionsClient.remove(id, token);
      setSubscriptions((prev: Subscription[]) => prev.filter((s) => s.id !== id));
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
          {subscriptions.map((sub) => (
            <div
              key={sub.id}
              className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-6 py-4"
            >
              <div>
                <p className="font-semibold text-white">
                  Blueprint ID: <span className="font-mono text-sm text-gray-400">{sub.blueprintId}</span>
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Since{' '}
                  {new Date(sub.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
              </div>

              <div className="flex items-center gap-3">
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
          ))}
        </div>
      )}
    </main>
  );
}
