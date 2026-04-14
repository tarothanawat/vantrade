'use client';

import { subscriptionsClient } from '@/lib/api-client/subscriptions.client';
import type { Subscription, SubscriptionStatsResponseDto, TradeLog } from '@vantrade/types';
import { useEffect, useState } from 'react';

export type SubscriptionWithDetails = Subscription & {
  blueprint?: {
    id: string;
    title: string;
  };
  tradeLogs?: TradeLog[];
};

export function useSubscriptions() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionWithDetails[]>([]);
  const [stats, setStats] = useState<Record<string, SubscriptionStatsResponseDto>>({});
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const subs = (await subscriptionsClient.getMine()) as SubscriptionWithDetails[];
        setSubscriptions(subs);

        if (subs.length === 0) return;

        setStatsLoading(true);
        const results = await Promise.allSettled(
          subs.map((s) => subscriptionsClient.getStats(s.id).then((st) => ({ id: s.id, st }))),
        );

        const map: Record<string, SubscriptionStatsResponseDto> = {};
        for (const result of results) {
          if (result.status === 'fulfilled') {
            map[result.value.id] = result.value.st;
          }
        }
        setStats(map);
      } catch {
        setError('Failed to load subscriptions');
      } finally {
        setLoading(false);
        setStatsLoading(false);
      }
    }

    void load();
  }, []);

  async function handleToggle(id: string, currentlyActive: boolean) {
    try {
      const updated = await subscriptionsClient.toggle(id, !currentlyActive);
      setSubscriptions((prev) => prev.map((s) => (s.id === id ? { ...s, isActive: updated.isActive } : s)));
    } catch {
      setError('Failed to toggle subscription');
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this subscription?')) return;
    try {
      await subscriptionsClient.remove(id);
      setSubscriptions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      setError('Failed to remove subscription');
    }
  }

  return { subscriptions, stats, loading, statsLoading, error, handleToggle, handleRemove };
}
