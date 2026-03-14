import { blueprintsClient } from '@/lib/api-client/blueprints.client';
import type { Blueprint } from '@vantrade/types';
import Link from 'next/link';

interface Props {
  params: { id: string };
}

export default async function BlueprintDetailPage({ params }: Props) {
  let blueprint: Blueprint | null = null;

  try {
    blueprint = await blueprintsClient.getById(params.id);
  } catch {
    // handled below
  }

  if (!blueprint) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-gray-400">Blueprint not found.</p>
        <Link href="/marketplace" className="mt-4 inline-block text-indigo-400 hover:underline">
          ← Back to Marketplace
        </Link>
      </main>
    );
  }

  const params2 = blueprint.parameters as {
    symbol: string;
    rsiPeriod: number;
    rsiBuyThreshold: number;
    rsiSellThreshold: number;
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/marketplace" className="mb-6 inline-block text-sm text-indigo-400 hover:underline">
        ← Back to Marketplace
      </Link>

      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8">
        <div className="mb-4 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">{blueprint.title}</h1>
          {blueprint.isVerified && (
            <span className="rounded-full bg-emerald-900 px-3 py-1 text-xs font-semibold text-emerald-400">
              ✓ Verified
            </span>
          )}
        </div>

        <p className="mb-6 text-gray-400">{blueprint.description}</p>

        <div className="mb-6 grid grid-cols-2 gap-4 rounded-xl bg-gray-800 p-4 text-sm">
          <div><span className="text-gray-500">Symbol</span><p className="mt-1 font-semibold text-white">{params2.symbol}</p></div>
          <div><span className="text-gray-500">RSI Period</span><p className="mt-1 font-semibold text-white">{params2.rsiPeriod}</p></div>
          <div><span className="text-gray-500">Buy Threshold (RSI &lt;)</span><p className="mt-1 font-semibold text-emerald-400">{params2.rsiBuyThreshold}</p></div>
          <div><span className="text-gray-500">Sell Threshold (RSI &gt;)</span><p className="mt-1 font-semibold text-red-400">{params2.rsiSellThreshold}</p></div>
        </div>

        <a
          href="/auth/login"
          className="block rounded-lg bg-indigo-600 py-3 text-center font-semibold text-white hover:bg-indigo-500 transition-colors"
        >
          Subscribe to this Blueprint
        </a>
      </div>
    </main>
  );
}
