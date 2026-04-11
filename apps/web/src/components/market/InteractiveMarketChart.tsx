'use client';

import type { MarketBarDto } from '@vantrade/types';
import { useMemo, useState } from 'react';

type ChartMode = 'line' | 'candles';

interface InteractiveMarketChartProps {
  bars: MarketBarDto[];
  title?: string;
  chartMode: ChartMode;
  showRsi?: boolean;
  rsiPeriod?: number;
  rsiBuyThreshold?: number;
  rsiSellThreshold?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value >= 1000) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toFixed(6);
}

function formatTimestamp(value: Date): string {
  return `${value.toLocaleDateString()} ${value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function computeRsiSeries(closes: number[], period: number): Array<number | null> {
  const safePeriod = Math.max(2, Math.floor(period));
  const output: Array<number | null> = Array.from({ length: closes.length }, () => null);
  if (closes.length < safePeriod + 1) return output;

  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= safePeriod; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }

  let avgGain = gainSum / safePeriod;
  let avgLoss = lossSum / safePeriod;

  output[safePeriod] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = safePeriod + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (safePeriod - 1) + gain) / safePeriod;
    avgLoss = (avgLoss * (safePeriod - 1) + loss) / safePeriod;

    output[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return output;
}

export default function InteractiveMarketChart({
  bars,
  title = 'Market Chart',
  chartMode,
  showRsi = true,
  rsiPeriod = 14,
  rsiBuyThreshold = 30,
  rsiSellThreshold = 70,
}: InteractiveMarketChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  // Free Y position in SVG coordinates — tracks cursor Y independently of bar snapping
  const [hoveredSvgY, setHoveredSvgY] = useState<number | null>(null);

  const chart = useMemo(() => {
    if (bars.length === 0) return null;

    const width = 960;
    const height = 320;
    const padding = 32;
    // Extra space to the right of the chart area for Y-axis price labels
    const labelWidth = 72;

    const closes = bars.map((bar) => bar.close);
    const highs = bars.map((bar) => bar.high);
    const lows = bars.map((bar) => bar.low);

    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const range = Math.max(max - min, 0.0001);

    const toX = (index: number) =>
      padding + (index / Math.max(bars.length - 1, 1)) * (width - padding * 2);
    const toY = (value: number) =>
      height - padding - ((value - min) / range) * (height - padding * 2);
    // Inverse of toY — converts an SVG Y coordinate back to a price
    const fromY = (svgY: number) =>
      min + ((height - padding - svgY) / Math.max(height - padding * 2, 1)) * range;

    const linePath = closes
      .map((close, index) => `${index === 0 ? 'M' : 'L'} ${toX(index)} ${toY(close)}`)
      .join(' ');

    const candleWidth = Math.max(2, ((width - padding * 2) / Math.max(bars.length, 1)) * 0.55);
    const rsi = computeRsiSeries(closes, rsiPeriod);

    const rsiWidth = 960;
    const rsiHeight = 160;
    const rsiPadding = 24;
    const rsiLabelWidth = 40;

    const toRsiX = (index: number) =>
      rsiPadding + (index / Math.max(bars.length - 1, 1)) * (rsiWidth - rsiPadding * 2);
    const toRsiY = (value: number) =>
      rsiHeight - rsiPadding - (clamp(value, 0, 100) / 100) * (rsiHeight - rsiPadding * 2);
    const fromRsiY = (svgY: number) =>
      clamp(((rsiHeight - rsiPadding - svgY) / Math.max(rsiHeight - rsiPadding * 2, 1)) * 100, 0, 100);

    const rsiPath = rsi
      .map((value, index) => {
        if (value === null) return null;
        return `${index === rsi.findIndex((v) => v !== null) ? 'M' : 'L'} ${toRsiX(index)} ${toRsiY(value)}`;
      })
      .filter((segment): segment is string => segment !== null)
      .join(' ');

    // 5 evenly-spaced Y-axis price levels
    const yAxisLevels = [0, 0.25, 0.5, 0.75, 1].map((frac) => ({
      price: min + frac * range,
      y: toY(min + frac * range),
    }));

    return {
      width,
      height,
      padding,
      labelWidth,
      linePath,
      min,
      max,
      range,
      toX,
      toY,
      fromY,
      candleWidth,
      rsi,
      rsiWidth,
      rsiHeight,
      rsiPadding,
      rsiLabelWidth,
      toRsiX,
      toRsiY,
      fromRsiY,
      rsiPath,
      latest: bars.at(-1)!,
      yAxisLevels,
    };
  }, [bars, rsiPeriod]);

  if (!chart) {
    return <p className="text-sm text-gray-500">No bars available for chart rendering.</p>;
  }

  const safeChart = chart;

  const activeIndex = hoveredIndex !== null ? clamp(hoveredIndex, 0, bars.length - 1) : bars.length - 1;
  const activeBar = bars[activeIndex];
  const activeRsi = safeChart.rsi[activeIndex];
  const crosshairX = safeChart.toX(activeIndex);
  // Dot stays at bar's close price; horizontal line follows cursor Y freely
  const dotY = safeChart.toY(activeBar.close);
  const horizontalY = hoveredSvgY !== null ? hoveredSvgY : dotY;
  const cursorPrice = safeChart.fromY(horizontalY);

  // Current price indicator
  const currentPriceY = safeChart.toY(safeChart.latest.close);
  const currentPriceColor = safeChart.latest.close >= safeChart.latest.open ? '#10b981' : '#ef4444';

  // Right edge of the chart area (where the Y-axis sits)
  const axisRight = safeChart.width - safeChart.padding;
  const rsiAxisRight = safeChart.rsiWidth - safeChart.rsiPadding;

  const totalSvgWidth = safeChart.width + safeChart.labelWidth;
  const totalRsiSvgWidth = safeChart.rsiWidth + safeChart.rsiLabelWidth;

  function onMainMouseMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;

    const scaleX = totalSvgWidth / rect.width;
    const scaleY = safeChart.height / rect.height;

    const svgX = (event.clientX - rect.left) * scaleX;
    const svgY = clamp((event.clientY - rect.top) * scaleY, safeChart.padding, safeChart.height - safeChart.padding);

    const idx = Math.round(
      ((svgX - safeChart.padding) / Math.max(safeChart.width - safeChart.padding * 2, 1)) * (bars.length - 1),
    );

    setHoveredIndex(clamp(idx, 0, bars.length - 1));
    setHoveredSvgY(svgY);
  }

  function onMainMouseLeave() {
    setHoveredIndex(null);
    setHoveredSvgY(null);
  }

  function onRsiMouseMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;

    const scaleX = totalRsiSvgWidth / rect.width;
    const svgX = (event.clientX - rect.left) * scaleX;

    const idx = Math.round(
      ((svgX - safeChart.rsiPadding) / Math.max(safeChart.rsiWidth - safeChart.rsiPadding * 2, 1)) * (bars.length - 1),
    );

    setHoveredIndex(clamp(idx, 0, bars.length - 1));
    setHoveredSvgY(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <h3 className="font-semibold text-white">{title}</h3>
        <p className="text-gray-400">
          Last: <span className="text-gray-200">{formatTimestamp(chart.latest.timestamp)}</span>
        </p>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
        <div className="mb-3 grid gap-2 text-xs text-gray-400 sm:grid-cols-3 lg:grid-cols-6">
          <p>
            O <span className="text-gray-200">{formatPrice(activeBar.open)}</span>
          </p>
          <p>
            H <span className="text-gray-200">{formatPrice(activeBar.high)}</span>
          </p>
          <p>
            L <span className="text-gray-200">{formatPrice(activeBar.low)}</span>
          </p>
          <p>
            C <span className="text-gray-200">{formatPrice(activeBar.close)}</span>
          </p>
          <p>
            Vol <span className="text-gray-200">{activeBar.volume.toFixed(2)}</span>
          </p>
          <p>
            RSI <span className="text-gray-200">{activeRsi === null ? 'N/A' : activeRsi.toFixed(2)}</span>
          </p>
        </div>

        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${totalSvgWidth} ${safeChart.height}`}
            className="h-80 w-full min-w-[1040px] cursor-crosshair"
            onMouseMove={onMainMouseMove}
            onMouseLeave={onMainMouseLeave}
          >
            {/* Chart border */}
            <line
              x1={safeChart.padding}
              y1={safeChart.padding}
              x2={safeChart.padding}
              y2={safeChart.height - safeChart.padding}
              stroke="#374151"
              strokeWidth="1"
            />
            <line
              x1={safeChart.padding}
              y1={safeChart.height - safeChart.padding}
              x2={axisRight}
              y2={safeChart.height - safeChart.padding}
              stroke="#374151"
              strokeWidth="1"
            />
            <line
              x1={axisRight}
              y1={safeChart.padding}
              x2={axisRight}
              y2={safeChart.height - safeChart.padding}
              stroke="#374151"
              strokeWidth="1"
            />

            {/* Y-axis price ticks and labels */}
            {safeChart.yAxisLevels.map((level, i) => (
              <g key={i}>
                <line x1={axisRight} y1={level.y} x2={axisRight + 4} y2={level.y} stroke="#4b5563" strokeWidth="1" />
                <text x={axisRight + 8} y={level.y + 4} fill="#6b7280" fontSize="10" textAnchor="start">
                  {formatPrice(level.price)}
                </text>
              </g>
            ))}

            {/* Price series */}
            {chartMode === 'line' ? (
              <path
                d={safeChart.linePath}
                fill="none"
                stroke="#818cf8"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : (
              <>
                {bars.map((bar, index) => {
                  const x = safeChart.toX(index);
                  const openY = safeChart.toY(bar.open);
                  const closeY = safeChart.toY(bar.close);
                  const highY = safeChart.toY(bar.high);
                  const lowY = safeChart.toY(bar.low);
                  const bodyTop = Math.min(openY, closeY);
                  const bodyHeight = Math.max(Math.abs(openY - closeY), 1.5);
                  const isBull = bar.close >= bar.open;

                  return (
                    <g key={`${bar.timestamp.toISOString()}-${index}`}>
                      <line
                        x1={x}
                        y1={highY}
                        x2={x}
                        y2={lowY}
                        stroke={isBull ? '#34d399' : '#fb7185'}
                        strokeWidth="1.2"
                      />
                      <rect
                        x={x - safeChart.candleWidth / 2}
                        y={bodyTop}
                        width={safeChart.candleWidth}
                        height={bodyHeight}
                        fill={isBull ? '#10b981' : '#ef4444'}
                        opacity="0.9"
                      />
                    </g>
                  );
                })}
              </>
            )}

            {/* Current price line — always visible */}
            <line
              x1={safeChart.padding}
              y1={currentPriceY}
              x2={axisRight}
              y2={currentPriceY}
              stroke={currentPriceColor}
              strokeWidth="1"
              strokeDasharray="4 3"
              opacity="0.85"
            />
            <rect
              x={axisRight + 1}
              y={currentPriceY - 10}
              width={safeChart.labelWidth - 2}
              height={20}
              fill={currentPriceColor}
              rx="3"
            />
            <text
              x={axisRight + safeChart.labelWidth / 2}
              y={currentPriceY + 4}
              fill="white"
              fontSize="10"
              fontWeight="600"
              textAnchor="middle"
            >
              {formatPrice(safeChart.latest.close)}
            </text>

            {/* Crosshair — vertical snaps to bar, horizontal follows cursor Y freely */}
            <line
              x1={crosshairX}
              y1={safeChart.padding}
              x2={crosshairX}
              y2={safeChart.height - safeChart.padding}
              stroke="#94a3b8"
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.9"
            />
            <line
              x1={safeChart.padding}
              y1={horizontalY}
              x2={axisRight}
              y2={horizontalY}
              stroke="#64748b"
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.8"
            />
            {/* Dot stays at bar close price */}
            <circle cx={crosshairX} cy={dotY} r="3.5" fill="#e2e8f0" />

            {/* Cursor price badge on Y-axis — shows price at cursor Y level */}
            {hoveredIndex !== null && (
              <>
                <rect
                  x={axisRight + 1}
                  y={horizontalY - 10}
                  width={safeChart.labelWidth - 2}
                  height={20}
                  fill="#1e293b"
                  stroke="#475569"
                  strokeWidth="1"
                  rx="3"
                />
                <text
                  x={axisRight + safeChart.labelWidth / 2}
                  y={horizontalY + 4}
                  fill="#e2e8f0"
                  fontSize="10"
                  textAnchor="middle"
                >
                  {formatPrice(cursorPrice)}
                </text>
              </>
            )}
          </svg>
        </div>

        {showRsi && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-gray-800 bg-gray-900 p-2">
            <svg
              viewBox={`0 0 ${totalRsiSvgWidth} ${safeChart.rsiHeight}`}
              className="h-40 w-full min-w-[1040px] cursor-crosshair"
              onMouseMove={onRsiMouseMove}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* RSI chart border */}
              <line
                x1={safeChart.rsiPadding}
                y1={safeChart.rsiPadding}
                x2={safeChart.rsiPadding}
                y2={safeChart.rsiHeight - safeChart.rsiPadding}
                stroke="#374151"
                strokeWidth="1"
              />
              <line
                x1={safeChart.rsiPadding}
                y1={safeChart.rsiHeight - safeChart.rsiPadding}
                x2={rsiAxisRight}
                y2={safeChart.rsiHeight - safeChart.rsiPadding}
                stroke="#374151"
                strokeWidth="1"
              />
              <line
                x1={rsiAxisRight}
                y1={safeChart.rsiPadding}
                x2={rsiAxisRight}
                y2={safeChart.rsiHeight - safeChart.rsiPadding}
                stroke="#374151"
                strokeWidth="1"
              />

              {/* RSI threshold lines */}
              <line
                x1={safeChart.rsiPadding}
                y1={safeChart.toRsiY(rsiBuyThreshold)}
                x2={rsiAxisRight}
                y2={safeChart.toRsiY(rsiBuyThreshold)}
                stroke="#10b981"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <line
                x1={safeChart.rsiPadding}
                y1={safeChart.toRsiY(rsiSellThreshold)}
                x2={rsiAxisRight}
                y2={safeChart.toRsiY(rsiSellThreshold)}
                stroke="#ef4444"
                strokeWidth="1"
                strokeDasharray="4 4"
              />

              {/* RSI Y-axis labels */}
              {[0, rsiBuyThreshold, 50, rsiSellThreshold, 100].map((level, i) => (
                <g key={i}>
                  <line
                    x1={rsiAxisRight}
                    y1={safeChart.toRsiY(level)}
                    x2={rsiAxisRight + 4}
                    y2={safeChart.toRsiY(level)}
                    stroke="#4b5563"
                    strokeWidth="1"
                  />
                  <text
                    x={rsiAxisRight + 6}
                    y={safeChart.toRsiY(level) + 4}
                    fill="#6b7280"
                    fontSize="9"
                    textAnchor="start"
                  >
                    {level}
                  </text>
                </g>
              ))}

              {safeChart.rsiPath && (
                <path d={safeChart.rsiPath} fill="none" stroke="#f59e0b" strokeWidth="2" />
              )}

              {/* RSI crosshair */}
              <line
                x1={safeChart.toRsiX(activeIndex)}
                y1={safeChart.rsiPadding}
                x2={safeChart.toRsiX(activeIndex)}
                y2={safeChart.rsiHeight - safeChart.rsiPadding}
                stroke="#94a3b8"
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.9"
              />
              {activeRsi !== null && (
                <circle
                  cx={safeChart.toRsiX(activeIndex)}
                  cy={safeChart.toRsiY(activeRsi)}
                  r="3"
                  fill="#fde68a"
                />
              )}

              {/* RSI cursor badge */}
              {activeRsi !== null && hoveredIndex !== null && (
                <>
                  <rect
                    x={rsiAxisRight + 1}
                    y={safeChart.toRsiY(activeRsi) - 9}
                    width={safeChart.rsiLabelWidth - 2}
                    height={18}
                    fill="#1e293b"
                    stroke="#475569"
                    strokeWidth="1"
                    rx="3"
                  />
                  <text
                    x={rsiAxisRight + safeChart.rsiLabelWidth / 2}
                    y={safeChart.toRsiY(activeRsi) + 4}
                    fill="#fde68a"
                    fontSize="9"
                    textAnchor="middle"
                  >
                    {activeRsi.toFixed(1)}
                  </text>
                </>
              )}
            </svg>

            <div className="mt-2 grid gap-2 text-xs text-gray-400 sm:grid-cols-3">
              <p>
                RSI Period: <span className="text-gray-200">{rsiPeriod}</span>
              </p>
              <p>
                Buy line: <span className="text-emerald-300">{rsiBuyThreshold}</span>
              </p>
              <p>
                Sell line: <span className="text-rose-300">{rsiSellThreshold}</span>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
