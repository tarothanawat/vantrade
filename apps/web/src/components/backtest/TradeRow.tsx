import type { BacktestTradeDto } from '@vantrade/types';
import { formatBarTime, formatCurrency } from '@/lib/backtest-formatters';

export function TradeRow({ trade, index }: { trade: BacktestTradeDto; index: number }) {
  return (
    <tr className="border-t border-gray-800 text-xs">
      <td className="py-1.5 pr-3 text-gray-400">{index + 1}</td>
      <td className="py-1.5 pr-3">
        <span className={`font-semibold uppercase ${trade.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>
          {trade.side}
        </span>
      </td>
      <td className="py-2 pr-3">
        <div className="text-gray-300">{trade.entryPrice.toFixed(2)}</div>
        <div className="text-gray-500">{formatBarTime(trade.entryTime)}</div>
        {trade.entryRsi != null && <div className="text-indigo-400">RSI {trade.entryRsi.toFixed(1)}</div>}
      </td>
      <td className="py-2 pr-3">
        {trade.exitPrice != null && trade.exitTime != null ? (
          <>
            <div className="text-gray-300">{trade.exitPrice.toFixed(2)}</div>
            <div className="text-gray-500">{formatBarTime(trade.exitTime)}</div>
            <div className="text-indigo-400">RSI {trade.exitRsi?.toFixed(1) ?? '—'}</div>
          </>
        ) : (
          <span className="rounded bg-indigo-900/60 px-1.5 py-0.5 text-indigo-300">Open</span>
        )}
      </td>
      <td className="py-2">
        {trade.isOpen ? (
          <span className="text-gray-500">—</span>
        ) : trade.pnl != null ? (
          <span className={trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {formatCurrency(trade.pnl)}
          </span>
        ) : '—'}
      </td>
    </tr>
  );
}
