'use client';

import { SubscriptionCard } from '@/components/subscriptions/SubscriptionCard';
import { useSubscriptions } from '@/hooks/use-subscriptions';
import Link from 'next/link';

export default function SubscriptionsPage() {
  const { subscriptions, stats, loading, statsLoading, error, handleToggle, handleRemove } = useSubscriptions();

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
            <SubscriptionCard
              key={sub.id}
              subscription={sub}
              stats={stats[sub.id]}
              statsLoading={statsLoading}
              onToggle={handleToggle}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </main>
  );
}
