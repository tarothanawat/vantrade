'use client';

import type { MarketBarDto, MarketDataTimeframe } from '@vantrade/types';
import { useEffect, useMemo, useRef, useState } from 'react';

type ChartMode = 'line' | 'candles';

interface InteractiveMarketChartProps {
  bars: MarketBarDto[];
  title?: string;
  chartMode: ChartMode;
  showRsi?: boolean;
  rsiPeriod?: number;
  rsiBuyThreshold?: number;
  rsiSellThreshold?: number;
  timeframe?: MarketDataTimeframe;
  showVolume?: boolean;
  showOhlcvOverlay?: boolean;
  showXAxis?: boolean;
  showGridlines?: boolean;
}

// ── Chart layout constants ──────────────────────────────────────────────────
const CHART_W       = 960;
const CHART_H       = 320;
const PADDING       = 32;
const LABEL_W       = 72;
const TOTAL_SVG_W   = CHART_W + LABEL_W;

const X_AXIS_H      = 28;
const VOLUME_H      = 52;
const PRICE_BOTTOM  = CHART_H - X_AXIS_H - VOLUME_H;
const VOL_TOP       = PRICE_BOTTOM;
const VOL_BOTTOM    = CHART_H - X_AXIS_H;
const AXIS_RIGHT    = CHART_W - PADDING;

const MIN_BARS_VISIBLE = 10;

// ── Helpers ──────────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function formatPrice(v: number): string {
  if (!Number.isFinite(v)) return '-';
  if (v >= 1000) return v.toFixed(2);
  if (v >= 1)    return v.toFixed(4);
  return v.toFixed(6);
}

function formatTimestamp(v: Date): string {
  return `${v.toLocaleDateString()} ${v.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatXLabel(ts: Date, tf: MarketDataTimeframe): string {
  if (tf === '1Min' || tf === '5Min' || tf === '15Min')
    return ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (tf === '1Hour')
    return (
      ts.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' +
      ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  return ts.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function computeRsiSeries(closes: number[], period: number): Array<number | null> {
  const p = Math.max(2, Math.floor(period));
  const out: Array<number | null> = Array.from({ length: closes.length }, () => null);
  if (closes.length < p + 1) return out;

  let gSum = 0, lSum = 0;
  for (let i = 1; i <= p; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gSum += d; else lSum += Math.abs(d);
  }
  let ag = gSum / p, al = lSum / p;
  out[p] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);

  for (let i = p + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0, l = d < 0 ? Math.abs(d) : 0;
    ag = (ag * (p - 1) + g) / p;
    al = (al * (p - 1) + l) / p;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

// ── Chart geometry (pure function, memoised by the component) ────────────────
interface ChartGeometry {
  toX: (i: number) => number;
  toY: (v: number) => number;
  fromY: (y: number) => number;
  toVolY: (vol: number) => number;
  candleWidth: number;
  linePath: string;
  min: number; max: number; range: number; maxVolume: number;
  volumes: number[];
  rsi: Array<number | null>;
  toRsiX: (i: number) => number;
  toRsiY: (v: number) => number;
  rsiPath: string;
  RSI_W: number; RSI_H: number; RSI_P: number; RSI_LW: number;
  yAxisLevels: { price: number; y: number }[];
  xAxisLabels: { x: number; label: string }[];
  latest: MarketBarDto;
}

function computeChartGeometry(
  visibleBars: MarketBarDto[],
  rsiPeriod: number,
  timeframe: MarketDataTimeframe,
): ChartGeometry | null {
  if (visibleBars.length === 0) return null;

  const closes  = visibleBars.map((b) => b.close);
  const highs   = visibleBars.map((b) => b.high);
  const lows    = visibleBars.map((b) => b.low);
  const volumes = visibleBars.map((b) => b.volume);

  const rawMin = Math.min(...lows);
  const rawMax = Math.max(...highs);
  const rawRange = Math.max(rawMax - rawMin, 0.0001);
  const margin = rawRange * 0.06;
  const min = rawMin - margin;
  const max = rawMax + margin;
  const range = max - min;
  const maxVolume = Math.max(...volumes, 1);

  const toX = (i: number) =>
    PADDING + (i / Math.max(visibleBars.length - 1, 1)) * (CHART_W - PADDING * 2);
  const toY = (v: number) =>
    PRICE_BOTTOM - ((v - min) / range) * (PRICE_BOTTOM - PADDING);
  const fromY = (y: number) =>
    min + ((PRICE_BOTTOM - y) / Math.max(PRICE_BOTTOM - PADDING, 1)) * range;
  const toVolY = (vol: number) =>
    VOL_BOTTOM - (vol / maxVolume) * (VOL_BOTTOM - VOL_TOP);

  const candleWidth = Math.max(
    2,
    ((CHART_W - PADDING * 2) / Math.max(visibleBars.length, 1)) * 0.55,
  );

  const linePath = closes
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(c)}`)
    .join(' ');

  const rsi = computeRsiSeries(closes, rsiPeriod);

  const RSI_W = 960, RSI_H = 160, RSI_P = 24, RSI_LW = 40;
  const toRsiX = (i: number) =>
    RSI_P + (i / Math.max(visibleBars.length - 1, 1)) * (RSI_W - RSI_P * 2);
  const toRsiY = (v: number) =>
    RSI_H - RSI_P - (clamp(v, 0, 100) / 100) * (RSI_H - RSI_P * 2);

  const rsiPath = rsi
    .map((v, i) => {
      if (v === null) return null;
      const first = rsi.findIndex((x) => x !== null);
      return `${i === first ? 'M' : 'L'} ${toRsiX(i)} ${toRsiY(v)}`;
    })
    .filter((s): s is string => s !== null)
    .join(' ');

  const yAxisLevels = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    price: min + f * range,
    y: toY(min + f * range),
  }));

  const xTarget = 7;
  const xStep   = Math.max((visibleBars.length - 1) / (xTarget - 1), 1);
  const xAxisLabels = Array.from({ length: xTarget }, (_, i) => {
    const idx = Math.min(Math.round(i * xStep), visibleBars.length - 1);
    return { x: toX(idx), label: formatXLabel(visibleBars[idx].timestamp, timeframe) };
  });

  return {
    toX, toY, fromY, toVolY,
    candleWidth, linePath, min, max, range, maxVolume, volumes,
    rsi, toRsiX, toRsiY, rsiPath,
    RSI_W, RSI_H, RSI_P, RSI_LW,
    yAxisLevels, xAxisLabels,
    latest: visibleBars.at(-1)!,
  };
}

// ── OHLCV overlay (SVG <g> sub-component) ────────────────────────────────────
function OhlcvOverlay({ bar, rsi }: { bar: MarketBarDto; rsi: number | null }) {
  const stats = [
    { label: 'O',   value: formatPrice(bar.open) },
    { label: 'H',   value: formatPrice(bar.high) },
    { label: 'L',   value: formatPrice(bar.low) },
    { label: 'C',   value: formatPrice(bar.close) },
    { label: 'Vol', value: bar.volume.toFixed(0) },
    { label: 'RSI', value: rsi === null ? 'N/A' : rsi.toFixed(1) },
  ];
  const oy = PADDING + 14;
  return (
    <g>
      {stats.map(({ label, value }, k) => (
        <g key={label}>
          <text x={PADDING + 6 + k * 90}  y={oy} fill="#6b7280" fontSize="9">{label}</text>
          <text x={PADDING + 22 + k * 90} y={oy} fill="#e2e8f0" fontSize="9" fontWeight="500">{value}</text>
        </g>
      ))}
    </g>
  );
}

// ── RSI panel ────────────────────────────────────────────────────────────────
interface RsiPanelProps {
  chart: ChartGeometry;
  visibleBars: MarketBarDto[];
  activeIndex: number;
  hoveredIndex: number | null;
  rsiBuyThreshold: number;
  rsiSellThreshold: number;
  rsiPeriod: number;
  onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
  onMouseLeave: () => void;
}

function RsiPanel({
  chart: sc, visibleBars, activeIndex, hoveredIndex,
  rsiBuyThreshold, rsiSellThreshold, rsiPeriod,
  onMouseMove, onMouseLeave,
}: RsiPanelProps) {
  const rsiAxisRight = sc.RSI_W - sc.RSI_P;
  const totalRsiW    = sc.RSI_W + sc.RSI_LW;
  const activeRsi    = sc.rsi[activeIndex];

  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-gray-800 bg-gray-900 p-2">
      <svg
        viewBox={`0 0 ${totalRsiW} ${sc.RSI_H}`}
        className="h-40 w-full min-w-[1040px] cursor-crosshair"
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        <line x1={sc.RSI_P} y1={sc.RSI_P} x2={sc.RSI_P} y2={sc.RSI_H - sc.RSI_P} stroke="#374151" strokeWidth="1" />
        <line x1={sc.RSI_P} y1={sc.RSI_H - sc.RSI_P} x2={rsiAxisRight} y2={sc.RSI_H - sc.RSI_P} stroke="#374151" strokeWidth="1" />
        <line x1={rsiAxisRight} y1={sc.RSI_P} x2={rsiAxisRight} y2={sc.RSI_H - sc.RSI_P} stroke="#374151" strokeWidth="1" />

        <line x1={sc.RSI_P} y1={sc.toRsiY(rsiBuyThreshold)}  x2={rsiAxisRight} y2={sc.toRsiY(rsiBuyThreshold)}
          stroke="#10b981" strokeWidth="1" strokeDasharray="4 4" />
        <line x1={sc.RSI_P} y1={sc.toRsiY(rsiSellThreshold)} x2={rsiAxisRight} y2={sc.toRsiY(rsiSellThreshold)}
          stroke="#ef4444" strokeWidth="1" strokeDasharray="4 4" />

        {[0, rsiBuyThreshold, 50, rsiSellThreshold, 100].map((lv, i) => (
          <g key={i}>
            <line x1={rsiAxisRight} y1={sc.toRsiY(lv)} x2={rsiAxisRight + 4} y2={sc.toRsiY(lv)} stroke="#4b5563" strokeWidth="1" />
            <text x={rsiAxisRight + 6} y={sc.toRsiY(lv) + 4} fill="#6b7280" fontSize="9" textAnchor="start">{lv}</text>
          </g>
        ))}

        {sc.rsiPath && <path d={sc.rsiPath} fill="none" stroke="#f59e0b" strokeWidth="2" />}

        <line x1={sc.toRsiX(activeIndex)} y1={sc.RSI_P} x2={sc.toRsiX(activeIndex)} y2={sc.RSI_H - sc.RSI_P}
          stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4" opacity="0.9" />
        {activeRsi !== null && (
          <circle cx={sc.toRsiX(activeIndex)} cy={sc.toRsiY(activeRsi)} r="3" fill="#fde68a" />
        )}

        {activeRsi !== null && hoveredIndex !== null && (
          <>
            <rect x={rsiAxisRight + 1} y={sc.toRsiY(activeRsi) - 9}
              width={sc.RSI_LW - 2} height={18}
              fill="#1e293b" stroke="#475569" strokeWidth="1" rx="3" />
            <text x={rsiAxisRight + sc.RSI_LW / 2} y={sc.toRsiY(activeRsi) + 4}
              fill="#fde68a" fontSize="9" textAnchor="middle">
              {activeRsi.toFixed(1)}
            </text>
          </>
        )}
      </svg>

      <div className="mt-2 grid gap-2 text-xs text-gray-400 sm:grid-cols-3">
        <p>RSI Period: <span className="text-gray-200">{rsiPeriod}</span></p>
        <p>Buy line: <span className="text-emerald-300">{rsiBuyThreshold}</span></p>
        <p>Sell line: <span className="text-rose-300">{rsiSellThreshold}</span></p>
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────
export default function InteractiveMarketChart({
  bars,
  title = 'Market Chart',
  chartMode,
  showRsi       = true,
  rsiPeriod     = 14,
  rsiBuyThreshold  = 30,
  rsiSellThreshold = 70,
  timeframe     = '1Min',
  showVolume    = true,
  showOhlcvOverlay = true,
  showXAxis     = true,
  showGridlines = true,
}: InteractiveMarketChartProps) {

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoveredSvgY,  setHoveredSvgY]  = useState<number | null>(null);
  const [scrollBack,   setScrollBack]   = useState(0);
  const [visibleCount, setVisibleCount] = useState<number | null>(null);
  const [isDragging,   setIsDragging]   = useState(false);

  const dragStartXRef          = useRef(0);
  const dragStartScrollBackRef = useRef(0);
  const svgRef     = useRef<SVGSVGElement>(null);
  const wheelRef   = useRef({ scrollBack: 0, clampedVisible: 0, startIdx: 0, barsLength: 0 });
  const rafRef     = useRef<number | null>(null);
  const hoverRafRef = useRef<number | null>(null);

  // Reset view when a genuinely new dataset arrives
  const prevFirstBarKeyRef = useRef('');
  useEffect(() => {
    const key = bars[0]?.timestamp?.toISOString() ?? '';
    if (key !== prevFirstBarKeyRef.current) {
      setScrollBack(0);
      setVisibleCount(bars.length > MIN_BARS_VISIBLE ? Math.round(bars.length * 0.7) : null);
      prevFirstBarKeyRef.current = key;
    }
  }, [bars]);

  const { clampedVisible, startIdx, visibleBars } = useMemo(() => {
    const total = bars.length;
    const minVis = Math.min(MIN_BARS_VISIBLE, total);
    const cv = clamp(visibleCount ?? total, minVis, total);
    const endIdx = total - Math.max(0, scrollBack);
    const si = Math.max(0, endIdx - cv);
    return { clampedVisible: cv, startIdx: si, visibleBars: bars.slice(si, si + cv) };
  }, [bars, scrollBack, visibleCount]);

  wheelRef.current = { scrollBack, clampedVisible, startIdx, barsLength: bars.length };

  // Non-passive wheel listener
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const { clampedVisible, startIdx, barsLength } = wheelRef.current;
        if (barsLength === 0) return;
        const rect = el.getBoundingClientRect();
        const svgX = (e.clientX - rect.left) * (TOTAL_SVG_W / rect.width);
        const frac = clamp((svgX - PADDING) / (CHART_W - PADDING * 2), 0, 1);
        const factor = e.deltaY > 0 ? 1.15 : 0.87;
        const newVis = clamp(Math.round(clampedVisible * factor), MIN_BARS_VISIBLE, barsLength);
        if (newVis === clampedVisible) return;
        const anchor   = startIdx + frac * (clampedVisible - 1);
        const newStart = anchor   - frac * (newVis - 1);
        const newEnd   = newStart + newVis;
        const newSB    = clamp(Math.round(barsLength - newEnd), 0, barsLength - newVis);
        setVisibleCount(newVis);
        setScrollBack(newSB);
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => {
      el.removeEventListener('wheel', handler);
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, []);

  const chart = useMemo(
    () => computeChartGeometry(visibleBars, rsiPeriod, timeframe),
    [visibleBars, rsiPeriod, timeframe],
  );

  if (!chart) {
    return <p className="text-sm text-gray-500">No bars available for chart rendering.</p>;
  }

  const sc = chart;
  const latestClose = bars.at(-1)?.close ?? sc.latest.close;
  const latestOpen  = bars.at(-1)?.open  ?? sc.latest.open;
  const currentPriceY    = clamp(sc.toY(latestClose), PADDING, PRICE_BOTTOM);
  const currentPriceColor = latestClose >= latestOpen ? '#10b981' : '#ef4444';

  const activeIndex = hoveredIndex !== null ? clamp(hoveredIndex, 0, visibleBars.length - 1) : visibleBars.length - 1;
  const activeBar   = visibleBars[activeIndex];
  const activeRsi   = sc.rsi[activeIndex];
  const crosshairX  = sc.toX(activeIndex);
  const dotY        = sc.toY(activeBar.close);
  const horizontalY = hoveredSvgY !== null ? clamp(hoveredSvgY, PADDING, PRICE_BOTTOM) : dotY;
  const cursorPrice = sc.fromY(horizontalY);

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartXRef.current = e.clientX;
    dragStartScrollBackRef.current = scrollBack;
    setHoveredIndex(null);
    setHoveredSvgY(null);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    if (isDragging) {
      const svgDx = (e.clientX - dragStartXRef.current) * (TOTAL_SVG_W / rect.width);
      const barW  = (CHART_W - PADDING * 2) / Math.max(clampedVisible - 1, 1);
      const delta = Math.round(svgDx / barW);
      setScrollBack(clamp(dragStartScrollBackRef.current + delta, 0, bars.length - clampedVisible));
      return;
    }
    if (hoverRafRef.current !== null) return;
    const clientX = e.clientX, clientY = e.clientY;
    hoverRafRef.current = requestAnimationFrame(() => {
      hoverRafRef.current = null;
      const svgX = (clientX - rect.left) * (TOTAL_SVG_W / rect.width);
      const svgY = clamp((clientY - rect.top) * (CHART_H / rect.height), PADDING, PRICE_BOTTOM);
      const idx  = Math.round(((svgX - PADDING) / Math.max(CHART_W - PADDING * 2, 1)) * (visibleBars.length - 1));
      setHoveredIndex(clamp(idx, 0, visibleBars.length - 1));
      setHoveredSvgY(svgY);
    });
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
  }

  function onPointerLeave() {
    if (hoverRafRef.current !== null) { cancelAnimationFrame(hoverRafRef.current); hoverRafRef.current = null; }
    if (!isDragging) { setHoveredIndex(null); setHoveredSvgY(null); }
  }

  function onRsiMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const totalRsiW = sc.RSI_W + sc.RSI_LW;
    const svgX = (e.clientX - rect.left) * (totalRsiW / rect.width);
    const idx  = Math.round(((svgX - sc.RSI_P) / Math.max(sc.RSI_W - sc.RSI_P * 2, 1)) * (visibleBars.length - 1));
    setHoveredIndex(clamp(idx, 0, visibleBars.length - 1));
    setHoveredSvgY(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <h3 className="font-semibold text-white">{title}</h3>
        <p className="text-gray-400">Last: <span className="text-gray-200">{formatTimestamp(sc.latest.timestamp)}</span></p>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
        <div className="overflow-x-auto">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${TOTAL_SVG_W} ${CHART_H}`}
            className={`h-80 w-full min-w-[1040px] select-none ${isDragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
            onDoubleClick={() => { setScrollBack(0); setVisibleCount(null); }}
          >
            <line x1={PADDING}    y1={PADDING}      x2={PADDING}    y2={PRICE_BOTTOM} stroke="#374151" strokeWidth="1" />
            <line x1={PADDING}    y1={PRICE_BOTTOM} x2={AXIS_RIGHT} y2={PRICE_BOTTOM} stroke="#374151" strokeWidth="1" />
            <line x1={AXIS_RIGHT} y1={PADDING}      x2={AXIS_RIGHT} y2={PRICE_BOTTOM} stroke="#374151" strokeWidth="1" />

            {sc.yAxisLevels.map((lv, i) => (
              <g key={i}>
                <line x1={AXIS_RIGHT} y1={lv.y} x2={AXIS_RIGHT + 4} y2={lv.y} stroke="#4b5563" strokeWidth="1" />
                <text x={AXIS_RIGHT + 8} y={lv.y + 4} fill="#6b7280" fontSize="10" textAnchor="start">{formatPrice(lv.price)}</text>
              </g>
            ))}

            {showGridlines && sc.yAxisLevels.map((lv, i) => (
              <line key={i} x1={PADDING} y1={lv.y} x2={AXIS_RIGHT} y2={lv.y} stroke="#1f2937" strokeWidth="1" strokeDasharray="3 4" />
            ))}

            {showVolume && visibleBars.map((bar, i) => {
              const x = sc.toX(i), isBull = bar.close >= bar.open;
              const top = sc.toVolY(bar.volume), h = Math.max(VOL_BOTTOM - top, 1);
              return <rect key={i} x={x - sc.candleWidth / 2} y={top} width={sc.candleWidth} height={h} fill={isBull ? '#10b981' : '#ef4444'} opacity="0.4" />;
            })}
            {showVolume && <line x1={PADDING} y1={PRICE_BOTTOM} x2={AXIS_RIGHT} y2={PRICE_BOTTOM} stroke="#374151" strokeWidth="1" />}

            {chartMode === 'line' ? (
              <path d={sc.linePath} fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            ) : (
              visibleBars.map((bar, i) => {
                const x = sc.toX(i);
                const openY = sc.toY(bar.open), closeY = sc.toY(bar.close);
                const highY = sc.toY(bar.high), lowY = sc.toY(bar.low);
                const bodyTop = Math.min(openY, closeY), bodyH = Math.max(Math.abs(openY - closeY), 1.5);
                const isBull = bar.close >= bar.open;
                return (
                  <g key={`${bar.timestamp.toISOString()}-${i}`}>
                    <line x1={x} y1={highY} x2={x} y2={lowY} stroke={isBull ? '#34d399' : '#fb7185'} strokeWidth="1.2" />
                    <rect x={x - sc.candleWidth / 2} y={bodyTop} width={sc.candleWidth} height={bodyH} fill={isBull ? '#10b981' : '#ef4444'} opacity="0.9" />
                  </g>
                );
              })
            )}

            <line x1={PADDING} y1={currentPriceY} x2={AXIS_RIGHT} y2={currentPriceY} stroke={currentPriceColor} strokeWidth="1" strokeDasharray="4 3" opacity="0.85" />
            <rect x={AXIS_RIGHT + 1} y={currentPriceY - 10} width={LABEL_W - 2} height={20} fill={currentPriceColor} rx="3" />
            <text x={AXIS_RIGHT + LABEL_W / 2} y={currentPriceY + 4} fill="white" fontSize="10" fontWeight="600" textAnchor="middle">{formatPrice(latestClose)}</text>

            {!isDragging && (
              <>
                <line x1={crosshairX} y1={PADDING} x2={crosshairX} y2={PRICE_BOTTOM} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4" opacity="0.9" />
                <line x1={PADDING} y1={horizontalY} x2={AXIS_RIGHT} y2={horizontalY} stroke="#64748b" strokeWidth="1" strokeDasharray="4 4" opacity="0.8" />
                <circle cx={crosshairX} cy={dotY} r="3.5" fill="#e2e8f0" />
                {hoveredIndex !== null && (
                  <>
                    <rect x={AXIS_RIGHT + 1} y={horizontalY - 10} width={LABEL_W - 2} height={20} fill="#1e293b" stroke="#475569" strokeWidth="1" rx="3" />
                    <text x={AXIS_RIGHT + LABEL_W / 2} y={horizontalY + 4} fill="#e2e8f0" fontSize="10" textAnchor="middle">{formatPrice(cursorPrice)}</text>
                  </>
                )}
              </>
            )}

            {showOhlcvOverlay && <OhlcvOverlay bar={activeBar} rsi={activeRsi} />}

            {showXAxis && sc.xAxisLabels.map(({ x, label }, i) => (
              <text key={i} x={x} y={CHART_H - X_AXIS_H + 14} fill="#6b7280" fontSize="9" textAnchor="middle">{label}</text>
            ))}

            {hoveredIndex !== null && showXAxis && !isDragging && (
              <>
                <rect x={crosshairX - 28} y={CHART_H - X_AXIS_H + 2} width={56} height={16} fill="#1e293b" stroke="#475569" strokeWidth="1" rx="3" />
                <text x={crosshairX} y={CHART_H - X_AXIS_H + 13} fill="#e2e8f0" fontSize="9" textAnchor="middle">{formatXLabel(activeBar.timestamp, timeframe)}</text>
              </>
            )}

            {scrollBack > 0 && (
              <text x={AXIS_RIGHT - 4} y={PADDING + 12} fill="#64748b" fontSize="9" textAnchor="end">{scrollBack} bars back · dbl-click to reset</text>
            )}
          </svg>
        </div>

        {showRsi && (
          <RsiPanel
            chart={sc}
            visibleBars={visibleBars}
            activeIndex={activeIndex}
            hoveredIndex={hoveredIndex}
            rsiBuyThreshold={rsiBuyThreshold}
            rsiSellThreshold={rsiSellThreshold}
            rsiPeriod={rsiPeriod}
            onMouseMove={onRsiMouseMove}
            onMouseLeave={() => setHoveredIndex(null)}
          />
        )}
      </div>
    </div>
  );
}
