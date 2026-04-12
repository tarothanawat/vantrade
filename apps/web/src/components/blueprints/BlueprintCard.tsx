import BacktestPanel from '@/components/marketplace/BacktestPanel';
import type { Blueprint, MarketDataTimeframe } from '@vantrade/types';

type BlueprintParams = {
  symbol: string;
  executionTimeframe?: MarketDataTimeframe;
  executionMode?: 'BUY_LOW_SELL_HIGH' | 'SELL_HIGH_BUY_LOW';
  rsiPeriod: number;
  rsiBuyThreshold: number;
  rsiSellThreshold: number;
  maPeriod: number;
  quantity: number;
};

type Props = {
  blueprint: Blueprint;
  expandedBacktest: string | null;
  onEdit: (bp: Blueprint) => void;
  onDelete: (id: string) => void;
  onToggleBacktest: (id: string) => void;
};

export default function BlueprintCard({
  blueprint: bp,
  expandedBacktest,
  onEdit,
  onDelete,
  onToggleBacktest,
}: Props) {
  const params = bp.parameters as BlueprintParams;

  return (
    <article key={bp.id} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{bp.title}</h3>
          <p className="mt-1 text-sm text-gray-400">{bp.description}</p>
          <p className="mt-2 text-xs text-gray-500">
            {params.symbol} · Exec {params.executionTimeframe ?? '1Min'} ·{' '}
            {params.executionMode === 'SELL_HIGH_BUY_LOW' ? 'Sell high → Buy low' : 'Buy low → Sell high'} ·
            RSI({params.rsiPeriod}) · Buy &lt; {params.rsiBuyThreshold} · Sell &gt; {params.rsiSellThreshold} ·
            MA({params.maPeriod}) · Qty {params.quantity}
          </p>
          <p className="mt-2 text-xs text-gray-600">
            Updated{' '}
            {new Date(bp.updatedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              bp.isVerified ? 'bg-emerald-900 text-emerald-400' : 'bg-yellow-900 text-yellow-400'
            }`}
          >
            {bp.isVerified ? 'Verified' : 'Pending'}
          </span>
          <button
            onClick={() => onToggleBacktest(bp.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
              expandedBacktest === bp.id
                ? 'border-indigo-500 bg-indigo-950 text-indigo-300'
                : 'border-gray-700 text-gray-300 hover:border-indigo-500'
            }`}
          >
            {expandedBacktest === bp.id ? 'Hide Backtest' : 'Backtest'}
          </button>
          <button
            onClick={() => onEdit(bp)}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(bp.id)}
            className="rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-400 hover:border-red-700"
          >
            Delete
          </button>
        </div>
      </div>

      {expandedBacktest === bp.id && (
        <div className="mt-4 border-t border-gray-800 pt-4">
          <BacktestPanel
            blueprintId={bp.id}
            defaultSymbol={params.symbol}
            defaultTimeframe={params.executionTimeframe ?? '1Min'}
          />
        </div>
      )}
    </article>
  );
}
