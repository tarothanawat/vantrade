import type { Blueprint } from '@vantrade/types';
import Link from 'next/link';

interface Props {
  blueprint: Blueprint;
}

export default function BlueprintCard({ blueprint }: Props) {
  const params = blueprint.parameters as {
    symbol: string;
    executionMode?: 'BUY_LOW_SELL_HIGH' | 'SELL_HIGH_BUY_LOW';
    rsiPeriod: number;
    rsiBuyThreshold: number;
    rsiSellThreshold: number;
  };

  const executionModeLabel =
    params.executionMode === 'SELL_HIGH_BUY_LOW'
      ? 'Sell high → Buy low'
      : 'Buy low → Sell high';

  return (
    <div className="flex flex-col rounded-2xl border border-gray-800 bg-gray-900 p-6 hover:border-indigo-700 transition-colors">
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-full bg-gray-800 px-3 py-1 text-xs font-semibold text-gray-300">
          {params.symbol}
        </span>
        {blueprint.isVerified && (
          <span className="rounded-full bg-emerald-900 px-3 py-1 text-xs font-semibold text-emerald-400">
            ✓ Verified
          </span>
        )}
      </div>

      <h2 className="mb-2 text-lg font-semibold text-white">{blueprint.title}</h2>
      <p className="mb-4 flex-1 text-sm text-gray-400 line-clamp-3">{blueprint.description}</p>

      <div className="mb-4 grid grid-cols-2 gap-2 text-xs text-gray-500">
        <div>RSI Period: <span className="text-gray-300">{params.rsiPeriod}</span></div>
        <div>Buy &lt; <span className="text-emerald-400">{params.rsiBuyThreshold}</span></div>
        <div className="col-span-2">Mode: <span className="text-indigo-300">{executionModeLabel}</span></div>
        <div>Sell &gt; <span className="text-red-400">{params.rsiSellThreshold}</span></div>
      </div>

      <Link
        href={`/marketplace/${blueprint.id}`}
        className="mt-auto rounded-lg bg-indigo-600 py-2 text-center text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
      >
        View Blueprint
      </Link>
    </div>
  );
}
