'use client';

import { useSession } from '@/components/providers/SessionProvider';
import { subscriptionsClient } from '@/lib/api-client/subscriptions.client';
import { Role, type SubscriptionCreateDto } from '@vantrade/types';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface SubscribeButtonProps {
  blueprintId: string;
}

export default function SubscribeButton({ blueprintId }: SubscribeButtonProps) {
  const router = useRouter();
  const { user, loading: sessionLoading } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubscribe() {
    setError('');

    if (sessionLoading) {
      setError('Checking session… please try again.');
      return;
    }

    if (!user) {
      router.push('/auth/login');
      return;
    }

    if (user.role !== Role.TESTER) {
      setError('Only TESTER accounts can subscribe to blueprints.');
      return;
    }

    setLoading(true);

    try {
      const payload: SubscriptionCreateDto = { blueprintId };
      await subscriptionsClient.create(payload);
      router.push('/subscriptions');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to subscribe to blueprint';
      if (message.toLowerCase().includes('unauthorized')) {
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
