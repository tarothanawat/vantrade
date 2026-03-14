'use client';

import { subscriptionsClient } from '@/lib/api-client/subscriptions.client';
import { Role, type SubscriptionCreateDto } from '@vantrade/types';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface SubscribeButtonProps {
  blueprintId: string;
}

type StoredUser = {
  role?: Role;
};

export default function SubscribeButton({ blueprintId }: SubscribeButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubscribe() {
    setError('');

    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth/login');
      return;
    }

    const rawUser = localStorage.getItem('user');
    if (rawUser) {
      try {
        const user = JSON.parse(rawUser) as StoredUser;
        if (user.role && user.role !== Role.TESTER) {
          setError('Only TESTER accounts can subscribe to blueprints.');
          return;
        }
      } catch {
        // Ignore malformed local storage and let API enforce auth/rbac.
      }
    }

    setLoading(true);

    try {
      const payload: SubscriptionCreateDto = { blueprintId };
      await subscriptionsClient.create(payload, token);
      router.push('/subscriptions');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to subscribe to blueprint';
      if (message.toLowerCase().includes('unauthorized')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/auth/login');
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleSubscribe}
        disabled={loading}
        className="block w-full rounded-lg bg-indigo-600 py-3 text-center font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Subscribing…' : 'Subscribe to this Blueprint'}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
