type RsiPreview = {
  points: number[];
  buyThreshold: number;
  sellThreshold: number;
  lastRsi: number;
  signal: string;
  spread: number;
  activityScore: number;
  riskScore: number;
  profile: string;
};

const CHART_WIDTH = 680;
const CHART_HEIGHT = 220;

export default function RsiPreviewChart({ preview }: { preview: RsiPreview }) {
  const chartPath = preview.points
    .map((value, index) => {
      const x = (index / (preview.points.length - 1)) * CHART_WIDTH;
      const y = CHART_HEIGHT - (value / 100) * CHART_HEIGHT;
      return `${x},${y}`;
    })
    .join(' ');

  const buyY = CHART_HEIGHT - (preview.buyThreshold / 100) * CHART_HEIGHT;
  const sellY = CHART_HEIGHT - (preview.sellThreshold / 100) * CHART_HEIGHT;
  const signalColor =
    preview.signal === 'BUY zone'
      ? 'text-emerald-300'
      : preview.signal === 'SELL zone'
        ? 'text-rose-300'
        : 'text-indigo-300';

  return (
    <div className="mt-6 rounded-xl border border-gray-800 bg-gray-950 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
          Backup Strategy Preview (RSI)
        </h3>
        <div className="text-xs text-gray-400">
          Latest RSI: <span className="font-semibold text-white">{preview.lastRsi.toFixed(1)}</span>{' '}
          · Signal: <span className={`font-semibold ${signalColor}`}>{preview.signal}</span>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
          <p className="text-xs text-gray-500">Threshold Spread</p>
          <p className="text-lg font-semibold text-white">{preview.spread.toFixed(1)}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
          <p className="text-xs text-gray-500">Activity Score</p>
          <p className="text-lg font-semibold text-indigo-300">{preview.activityScore.toFixed(0)}/100</p>
          <p className="text-xs text-gray-500">{preview.profile}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
          <p className="text-xs text-gray-500">Risk Proxy</p>
          <p className="text-lg font-semibold text-amber-300">{preview.riskScore.toFixed(0)}/100</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900 p-2">
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-56 w-full min-w-[680px]">
          <rect x="0" y={sellY} width={CHART_WIDTH} height={CHART_HEIGHT - sellY} fill="rgba(239,68,68,0.07)" />
          <rect x="0" y={buyY} width={CHART_WIDTH} height={CHART_HEIGHT - buyY} fill="rgba(16,185,129,0.07)" />
          <line x1="0" y1={buyY} x2={CHART_WIDTH} y2={buyY} stroke="#10b981" strokeDasharray="6 6" strokeWidth="2" />
          <line x1="0" y1={sellY} x2={CHART_WIDTH} y2={sellY} stroke="#ef4444" strokeDasharray="6 6" strokeWidth="2" />
          <polyline fill="none" stroke="#818cf8" strokeWidth="3" points={chartPath} />
          <circle
            cx={CHART_WIDTH}
            cy={CHART_HEIGHT - (preview.lastRsi / 100) * CHART_HEIGHT}
            r="4"
            fill="#818cf8"
          />
        </svg>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-gray-400 sm:grid-cols-3">
        <p><span className="text-emerald-400">Buy line</span>: RSI below {preview.buyThreshold.toFixed(1)}</p>
        <p><span className="text-red-400">Sell line</span>: RSI above {preview.sellThreshold.toFixed(1)}</p>
        <p><span className="text-indigo-300">Blue line</span>: synthetic RSI trend preview</p>
      </div>
    </div>
  );
}
