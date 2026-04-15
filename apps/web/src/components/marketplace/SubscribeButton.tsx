'use client';

import { useSession } from '@/components/providers/SessionProvider';
import { subscriptionsClient } from '@/lib/api-client/subscriptions.client';
import { Role, type SubscriptionCreateDto } from '@vantrade/types';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const SYMBOL_OPTIONS: Array<{ symbol: string; label: string; tag: string }> = [
  { symbol: 'BTCUSD', label: 'Bitcoin',     tag: 'Crypto 24/7' },
  { symbol: 'ETHUSD', label: 'Ethereum',    tag: 'Crypto 24/7' },
  { symbol: 'SOLUSD', label: 'Solana',      tag: 'Crypto 24/7' },
  { symbol: 'AAPL',   label: 'Apple',       tag: 'US Equities' },
  { symbol: 'NVDA',   label: 'NVIDIA',      tag: 'US Equities' },
  { symbol: 'SPY',    label: 'S&P 500 ETF', tag: 'ETF'         },
];

interface SubscribeButtonProps {
  blueprintId: string;
  defaultSymbol: string;
}

export default function SubscribeButton({ blueprintId, defaultSymbol }: SubscribeButtonProps) {
  const router = useRouter();
  const { user, loading: sessionLoading } = useSession();
  const [selectedSymbol, setSelectedSymbol] = useState(defaultSymbol);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Ensure the blueprint's default symbol is always in the list even if not in presets.
  const options = SYMBOL_OPTIONS.some((o) => o.symbol === defaultSymbol)
    ? SYMBOL_OPTIONS
    : [{ symbol: defaultSymbol, label: defaultSymbol, tag: 'Blueprint default' }, ...SYMBOL_OPTIONS];

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
      const payload: SubscriptionCreateDto = {
        blueprintId,
        symbolOverride: selectedSymbol !== defaultSymbol ? selectedSymbol : undefined,
      };
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
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-400">
          Run this strategy on
        </label>
        <select
          value={selectedSymbol}
          onChange={(e) => setSelectedSymbol(e.target.value)}
          disabled={loading}
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none disabled:opacity-50"
        >
          {options.map((opt) => (
            <option key={opt.symbol} value={opt.symbol}>
              {opt.symbol} — {opt.label} ({opt.tag})
              {opt.symbol === defaultSymbol ? ' · blueprint default' : ''}
            </option>
          ))}
        </select>
        {selectedSymbol !== defaultSymbol && (
          <p className="mt-1 text-xs text-yellow-500">
            Overriding blueprint default ({defaultSymbol}) with {selectedSymbol}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={handleSubscribe}
        disabled={loading}
        className="block w-full rounded-lg bg-indigo-600 py-3 text-center font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Subscribing…' : `Subscribe · ${selectedSymbol}`}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
