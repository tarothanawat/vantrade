export function EquityCurve({ data }: { data: { timestamp: string; equity: number }[] }) {
  if (data.length < 2) return null;

  const W = 400;
  const H = 80;
  const pad = 4;

  const equities = data.map((d) => d.equity);
  const min = Math.min(...equities);
  const max = Math.max(...equities);
  const range = max - min || 1;

  const points = data
    .map((d, i) => {
      const x = pad + (i / (data.length - 1)) * (W - pad * 2);
      const y = pad + (1 - (d.equity - min) / range) * (H - pad * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const lineColor = equities[equities.length - 1] >= 0 ? '#34d399' : '#f87171';

  return (
    <div className="mt-4 rounded-lg border border-gray-800 bg-gray-950 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Equity Curve</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke={lineColor} strokeWidth="1.5" />
        <line x1={pad} y1={H / 2} x2={W - pad} y2={H / 2} stroke="#374151" strokeWidth="0.5" strokeDasharray="4 4" />
      </svg>
    </div>
  );
}
