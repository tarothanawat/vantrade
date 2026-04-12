'use client';

import BlueprintCard from '@/components/blueprints/BlueprintCard';
import RsiPreviewChart from '@/components/blueprints/RsiPreviewChart';
import InteractiveMarketChart from '@/components/market/InteractiveMarketChart';
import BacktestPreviewPanel from '@/components/marketplace/BacktestPreviewPanel';
import { useMarketBars } from '@/hooks/use-market-bars';
import { blueprintsClient } from '@/lib/api-client/blueprints.client';
import {
  BlueprintCreateSchema,
  BlueprintExecutionModeSchema,
  BlueprintUpdateSchema,
  MarketDataTimeframeSchema,
  type Blueprint,
  type BlueprintCreateDto,
  type BlueprintUpdateDto,
  type MarketDataTimeframe,
} from '@vantrade/types';
import { useEffect, useMemo, useState } from 'react';

type FormState = {
  title: string;
  description: string;
  symbol: string;
  executionTimeframe: MarketDataTimeframe;
  executionMode: 'BUY_LOW_SELL_HIGH' | 'SELL_HIGH_BUY_LOW';
  rsiPeriod: string;
  rsiBuyThreshold: string;
  rsiSellThreshold: string;
  maPeriod: string;
  quantity: string;
};

const initialForm: FormState = {
  title: '',
  description: '',
  symbol: 'AAPL',
  executionTimeframe: '1Min',
  executionMode: 'BUY_LOW_SELL_HIGH',
  rsiPeriod: '14',
  rsiBuyThreshold: '30',
  rsiSellThreshold: '70',
  maPeriod: '50',
  quantity: '1',
};

const executionTimeframeOptions = MarketDataTimeframeSchema.options;
const executionModeOptions = BlueprintExecutionModeSchema.options;

const symbolPresets: Array<{
  symbol: string;
  label: string;
  market: 'Crypto' | 'US Equities' | 'ETF';
  hours: '24/7' | 'Market Hours';
}> = [
  { symbol: 'BTCUSD', label: 'Bitcoin', market: 'Crypto', hours: '24/7' },
  { symbol: 'ETHUSD', label: 'Ethereum', market: 'Crypto', hours: '24/7' },
  { symbol: 'SOLUSD', label: 'Solana', market: 'Crypto', hours: '24/7' },
  { symbol: 'AAPL', label: 'Apple', market: 'US Equities', hours: 'Market Hours' },
  { symbol: 'NVDA', label: 'NVIDIA', market: 'US Equities', hours: 'Market Hours' },
  { symbol: 'SPY', label: 'S&P 500 ETF', market: 'ETF', hours: 'Market Hours' },
];

const profilePresets: Array<{
  name: string;
  summary: string;
  rsiPeriod: number;
  buy: number;
  sell: number;
  maPeriod: number;
  quantity: number;
  executionTimeframe: MarketDataTimeframe;
  suggestedTitle: string;
  suggestedDescription: string;
}> = [
  {
    name: 'Conservative Swing',
    summary: 'Wider RSI bands, lower trade frequency, lower size.',
    rsiPeriod: 21,
    buy: 25,
    sell: 75,
    maPeriod: 100,
    quantity: 0.5,
    executionTimeframe: '15Min',
    suggestedTitle: 'RSI Conservative Swing',
    suggestedDescription:
      'Conservative swing setup using wider RSI bands and longer MA filter to reduce churn and emphasize stronger reversals.',
  },
  {
    name: 'Balanced Mean Reversion',
    summary: 'Default all-round profile for steady testing.',
    rsiPeriod: 14,
    buy: 30,
    sell: 70,
    maPeriod: 50,
    quantity: 1,
    executionTimeframe: '5Min',
    suggestedTitle: 'RSI Mean Reversion',
    suggestedDescription:
      'Balanced RSI mean-reversion template intended for general market conditions with moderate turnover.',
  },
  {
    name: 'High Frequency Reversion',
    summary: 'Tighter spread and shorter RSI for more signal activity.',
    rsiPeriod: 7,
    buy: 40,
    sell: 60,
    maPeriod: 20,
    quantity: 1.5,
    executionTimeframe: '1Min',
    suggestedTitle: 'RSI High Frequency Reversion',
    suggestedDescription:
      'Higher-activity profile with tighter RSI thresholds that can produce frequent entries/exits for rapid testing.',
  },
  {
    name: 'Crypto 24/7 Baseline',
    summary: 'Designed for around-the-clock symbols like BTCUSD/ETHUSD.',
    rsiPeriod: 12,
    buy: 32,
    sell: 68,
    maPeriod: 34,
    quantity: 0.2,
    executionTimeframe: '5Min',
    suggestedTitle: 'RSI Crypto 24/7 Baseline',
    suggestedDescription:
      'Template tuned for continuous crypto markets to validate heartbeat execution over nights and weekends.',
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export default function MyBlueprintsPage() {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<FormState>(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [marketChartMode, setMarketChartMode] = useState<'line' | 'candles'>('candles');
  const [expandedBacktest, setExpandedBacktest] = useState<string | null>(null);

  const { bars: marketBars, loading: marketLoading, error: marketError } = useMarketBars(
    form.symbol,
    form.executionTimeframe,
  );

  useEffect(() => {
    blueprintsClient
      .getMine()
      .then(setBlueprints)
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to load your blueprints';
        setError(message);
      })
      .finally(() => setLoading(false));
  }, []);

  function setField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSuccess('');
  }

  function applyProfilePreset(profileName: string) {
    const preset = profilePresets.find((item) => item.name === profileName);
    if (!preset) return;

    setForm((prev) => ({
      ...prev,
      title: prev.title.trim() ? prev.title : `${preset.suggestedTitle} — ${prev.symbol || 'BTCUSD'}`,
      description: prev.description.trim() ? prev.description : preset.suggestedDescription,
      executionTimeframe: preset.executionTimeframe,
      rsiPeriod: String(preset.rsiPeriod),
      rsiBuyThreshold: String(preset.buy),
      rsiSellThreshold: String(preset.sell),
      maPeriod: String(preset.maPeriod),
      quantity: String(preset.quantity),
    }));
    setSuccess(`Applied ${profileName} preset`);
  }

  const strategyDraft = useMemo(() => {
    return {
      title: form.title.trim(),
      description: form.description.trim(),
      parameters: {
        symbol: form.symbol.trim().toUpperCase(),
        executionTimeframe: form.executionTimeframe,
        executionMode: form.executionMode,
        rsiPeriod: Number(form.rsiPeriod),
        rsiBuyThreshold: Number(form.rsiBuyThreshold),
        rsiSellThreshold: Number(form.rsiSellThreshold),
        maPeriod: Number(form.maPeriod),
        quantity: Number(form.quantity),
      },
    };
  }, [
    form.description,
    form.executionMode,
    form.executionTimeframe,
    form.maPeriod,
    form.quantity,
    form.rsiBuyThreshold,
    form.rsiPeriod,
    form.rsiSellThreshold,
    form.symbol,
    form.title,
  ]);

  const createValidation = useMemo(() => BlueprintCreateSchema.safeParse(strategyDraft), [strategyDraft]);
  const updateValidation = useMemo(() => BlueprintUpdateSchema.safeParse(strategyDraft), [strategyDraft]);

  const thresholdConflict = Number(form.rsiBuyThreshold) >= Number(form.rsiSellThreshold);
  const canCreate = createValidation.success && !thresholdConflict;
  const canUpdate = updateValidation.success && !thresholdConflict;

  function fieldError(fieldName: keyof FormState): string | null {
    if (createValidation.success) return null;

    const targetPathByField: Record<keyof FormState, string[]> = {
      title: ['title'],
      description: ['description'],
      symbol: ['parameters', 'symbol'],
      executionTimeframe: ['parameters', 'executionTimeframe'],
      executionMode: ['parameters', 'executionMode'],
      rsiPeriod: ['parameters', 'rsiPeriod'],
      rsiBuyThreshold: ['parameters', 'rsiBuyThreshold'],
      rsiSellThreshold: ['parameters', 'rsiSellThreshold'],
      maPeriod: ['parameters', 'maPeriod'],
      quantity: ['parameters', 'quantity'],
    };

    const targetPath = targetPathByField[fieldName];
    const issue = createValidation.error.issues.find((candidate) => {
      if (candidate.path.length !== targetPath.length) return false;
      return targetPath.every((segment, index) => candidate.path[index] === segment);
    });

    return issue?.message ?? null;
  }

  function parseCreatePayload(): BlueprintCreateDto | null {
    const parsed = BlueprintCreateSchema.safeParse(strategyDraft);
    if (!parsed.success) {
      setError('Please check form values. Ensure all numbers and thresholds are valid.');
      return null;
    }

    if (parsed.data.parameters.rsiBuyThreshold >= parsed.data.parameters.rsiSellThreshold) {
      setError('Buy threshold must be lower than sell threshold.');
      return null;
    }

    return parsed.data;
  }

  function parseUpdatePayload(): BlueprintUpdateDto | null {
    const parsed = BlueprintUpdateSchema.safeParse(strategyDraft);
    if (!parsed.success) {
      setError('Please check form values before updating.');
      return null;
    }

    if (
      parsed.data.parameters?.rsiBuyThreshold !== undefined &&
      parsed.data.parameters?.rsiSellThreshold !== undefined &&
      parsed.data.parameters.rsiBuyThreshold >= parsed.data.parameters.rsiSellThreshold
    ) {
      setError('Buy threshold must be lower than sell threshold.');
      return null;
    }

    return parsed.data;
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const payload = parseCreatePayload();
    if (!payload) return;

    setSaving(true);

    try {
      const created = await blueprintsClient.create(payload);
      setBlueprints((prev) => [created, ...prev]);
      setForm(initialForm);
      setSuccess('Blueprint created successfully.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create blueprint';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(bp: Blueprint) {
    const params = bp.parameters as {
      symbol: string;
      executionTimeframe?: MarketDataTimeframe;
      executionMode?: 'BUY_LOW_SELL_HIGH' | 'SELL_HIGH_BUY_LOW';
      rsiPeriod: number;
      rsiBuyThreshold: number;
      rsiSellThreshold: number;
      maPeriod: number;
      quantity: number;
    };

    setEditingId(bp.id);
    setForm({
      title: bp.title,
      description: bp.description,
      symbol: params.symbol,
      executionTimeframe: params.executionTimeframe ?? '1Min',
      executionMode: params.executionMode ?? 'BUY_LOW_SELL_HIGH',
      rsiPeriod: String(params.rsiPeriod),
      rsiBuyThreshold: String(params.rsiBuyThreshold),
      rsiSellThreshold: String(params.rsiSellThreshold),
      maPeriod: String(params.maPeriod),
      quantity: String(params.quantity),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(initialForm);
    setError('');
    setSuccess('');
  }

  async function handleUpdate() {
    if (!editingId) return;
    setError('');

    const payload = parseUpdatePayload();
    if (!payload) return;

    setSaving(true);

    try {
      const updated = await blueprintsClient.update(editingId, payload);
      setBlueprints((prev) => prev.map((bp) => (bp.id === editingId ? updated : bp)));
      setSuccess('Blueprint updated successfully.');
      cancelEdit();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update blueprint';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this blueprint?')) return;
    setError('');

    try {
      await blueprintsClient.remove(id);
      setBlueprints((prev) => prev.filter((bp) => bp.id !== id));
      setSuccess('Blueprint deleted.');
      if (editingId === id) cancelEdit();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete blueprint';
      setError(message);
    }
  }

  const preview = useMemo(() => {
    const rsiPeriod = clamp(Number(form.rsiPeriod) || 14, 2, 100);
    const buyThreshold = clamp(Number(form.rsiBuyThreshold) || 30, 0, 100);
    const sellThreshold = clamp(Number(form.rsiSellThreshold) || 70, 0, 100);
    const points = Array.from({ length: 56 }, (_, i) => {
      const wave = Math.sin(i / (rsiPeriod / 3)) * 18;
      const wave2 = Math.cos(i / (rsiPeriod / 5)) * 10;
      const drift = (i % 9) - 4;
      return clamp(50 + wave + wave2 + drift, 0, 100);
    });

    const lastRsi = points.at(-1) ?? 50;
    const signal = lastRsi < buyThreshold ? 'BUY zone' : lastRsi > sellThreshold ? 'SELL zone' : 'HOLD zone';
    const spread = sellThreshold - buyThreshold;
    const activityScore = clamp(100 - spread + (30 - Math.min(rsiPeriod, 30)) * 1.5, 0, 100);
    const riskScore = clamp((100 - spread) * 0.7 + Number(form.quantity || 1) * 8, 0, 100);
    const profile = activityScore > 70 ? 'High activity' : activityScore > 45 ? 'Moderate activity' : 'Low activity';

    return { points, buyThreshold, sellThreshold, lastRsi, signal, spread, activityScore, riskScore, profile };
  }, [form.quantity, form.rsiBuyThreshold, form.rsiPeriod, form.rsiSellThreshold]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-3xl font-bold text-white">My Blueprints</h1>
      <p className="mb-8 text-gray-400">Create, edit, and manage the strategies you publish.</p>

      {error && <p className="mb-4 text-sm text-red-400" aria-live="polite">{error}</p>}
      {success && <p className="mb-4 text-sm text-emerald-400" aria-live="polite">{success}</p>}

      <section className="mb-8 rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <h2 className="mb-4 text-xl font-semibold text-white">{editingId ? 'Edit Blueprint' : 'Create Blueprint'}</h2>
        <p className="mb-5 text-sm text-gray-500">
          Tip: Use concise titles, clear descriptions, and realistic thresholds. Live market data is shown below when available.
        </p>

        <div className="mb-5 flex flex-wrap gap-2">
          {symbolPresets.map((ticker) => (
            <button
              key={ticker.symbol}
              type="button"
              onClick={() => setField('symbol', ticker.symbol)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                form.symbol.toUpperCase() === ticker.symbol
                  ? 'border-indigo-500 bg-indigo-950 text-indigo-200'
                  : 'border-gray-700 text-gray-300 hover:border-gray-500'
              }`}
              title={`${ticker.label} · ${ticker.market} · ${ticker.hours}`}
            >
              <span className="font-semibold">{ticker.symbol}</span>{' '}
              <span className="text-[10px] opacity-80">({ticker.hours})</span>
            </button>
          ))}
        </div>

        <p className="mb-4 text-xs text-gray-500">
          Tip: Pick <span className="font-semibold text-emerald-300">24/7 crypto symbols</span> for continuous end-to-end testing.
        </p>

        <div className="mb-6 grid gap-2 md:grid-cols-2">
          {profilePresets.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => applyProfilePreset(preset.name)}
              className="rounded-xl border border-gray-700 px-3 py-2 text-left text-xs text-gray-300 transition-colors hover:border-indigo-500 hover:text-indigo-300"
            >
              <p className="font-semibold">Apply {preset.name}</p>
              <p className="mt-0.5 text-[11px] text-gray-400">{preset.summary}</p>
            </button>
          ))}
        </div>

        <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="bp-title" className="mb-1 block text-sm font-medium text-gray-300">Blueprint Title</label>
            <input
              id="bp-title"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white"
              placeholder="RSI Mean Reversion — AAPL"
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-gray-500">{form.title.trim().length}/100 characters</p>
            {fieldError('title') && <p className="mt-1 text-xs text-red-400">{fieldError('title')}</p>}
          </div>

          <div>
            <label htmlFor="bp-symbol" className="mb-1 block text-sm font-medium text-gray-300">Symbol</label>
            <input
              id="bp-symbol"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white uppercase"
              placeholder="AAPL"
              value={form.symbol}
              onChange={(e) => setField('symbol', e.target.value.toUpperCase())}
              required
            />
            {fieldError('symbol') && <p className="mt-1 text-xs text-red-400">{fieldError('symbol')}</p>}
          </div>

          <div className="md:col-span-2">
            <label htmlFor="bp-description" className="mb-1 block text-sm font-medium text-gray-300">Description</label>
            <textarea
              id="bp-description"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white"
              placeholder="Describe market conditions, entry/exit logic, and risk assumptions..."
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              rows={3}
              required
            />
            <p className="mt-1 text-xs text-gray-500">{form.description.trim().length}/1000 characters</p>
            {fieldError('description') && <p className="mt-1 text-xs text-red-400">{fieldError('description')}</p>}
          </div>

          <div>
            <label htmlFor="bp-rsi-period" className="mb-1 block text-sm font-medium text-gray-300">RSI Period</label>
            <input
              id="bp-rsi-period"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white"
              type="number" min={2} max={100}
              value={form.rsiPeriod}
              onChange={(e) => setField('rsiPeriod', e.target.value)}
              required
            />
            {fieldError('rsiPeriod') && <p className="mt-1 text-xs text-red-400">{fieldError('rsiPeriod')}</p>}
          </div>

          <div>
            <label htmlFor="bp-ma-period" className="mb-1 block text-sm font-medium text-gray-300">MA Period</label>
            <input
              id="bp-ma-period"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white"
              type="number" min={2} max={200}
              value={form.maPeriod}
              onChange={(e) => setField('maPeriod', e.target.value)}
              required
            />
            {fieldError('maPeriod') && <p className="mt-1 text-xs text-red-400">{fieldError('maPeriod')}</p>}
          </div>

          <div>
            <label htmlFor="bp-exec-timeframe" className="mb-1 block text-sm font-medium text-gray-300">Execution Timeframe</label>
            <select
              id="bp-exec-timeframe"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white"
              value={form.executionTimeframe}
              onChange={(event) => setField('executionTimeframe', event.target.value as MarketDataTimeframe)}
            >
              {executionTimeframeOptions.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
            </select>
            {fieldError('executionTimeframe') && <p className="mt-1 text-xs text-red-400">{fieldError('executionTimeframe')}</p>}
          </div>

          <div>
            <label htmlFor="bp-exec-mode" className="mb-1 block text-sm font-medium text-gray-300">Execution Mode</label>
            <select
              id="bp-exec-mode"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white"
              value={form.executionMode}
              onChange={(event) => setField('executionMode', event.target.value as FormState['executionMode'])}
            >
              {executionModeOptions.map((mode) => (
                <option key={mode} value={mode}>
                  {mode === 'BUY_LOW_SELL_HIGH' ? 'Buy low → Sell high' : 'Sell high → Buy low'}
                </option>
              ))}
            </select>
            {fieldError('executionMode') && <p className="mt-1 text-xs text-red-400">{fieldError('executionMode')}</p>}
          </div>

          <div>
            <label htmlFor="bp-buy-threshold" className="mb-1 block text-sm font-medium text-gray-300">Buy Threshold (RSI &lt;)</label>
            <input
              id="bp-buy-threshold"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white"
              type="number" step="0.01" min={0} max={100}
              value={form.rsiBuyThreshold}
              onChange={(e) => setField('rsiBuyThreshold', e.target.value)}
              required
            />
            <input
              aria-label="Buy threshold slider"
              className="mt-2 w-full accent-emerald-500"
              type="range" min={0} max={100} step={0.5}
              value={Number(form.rsiBuyThreshold) || 0}
              onChange={(e) => setField('rsiBuyThreshold', e.target.value)}
            />
            {fieldError('rsiBuyThreshold') && <p className="mt-1 text-xs text-red-400">{fieldError('rsiBuyThreshold')}</p>}
          </div>

          <div>
            <label htmlFor="bp-sell-threshold" className="mb-1 block text-sm font-medium text-gray-300">Sell Threshold (RSI &gt;)</label>
            <input
              id="bp-sell-threshold"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white"
              type="number" step="0.01" min={0} max={100}
              value={form.rsiSellThreshold}
              onChange={(e) => setField('rsiSellThreshold', e.target.value)}
              required
            />
            <input
              aria-label="Sell threshold slider"
              className="mt-2 w-full accent-rose-500"
              type="range" min={0} max={100} step={0.5}
              value={Number(form.rsiSellThreshold) || 0}
              onChange={(e) => setField('rsiSellThreshold', e.target.value)}
            />
            {fieldError('rsiSellThreshold') && <p className="mt-1 text-xs text-red-400">{fieldError('rsiSellThreshold')}</p>}
            {thresholdConflict && (
              <p className="mt-1 text-xs text-red-400">Buy threshold must stay lower than sell threshold.</p>
            )}
          </div>

          <div className="md:col-span-2">
            <label htmlFor="bp-qty" className="mb-1 block text-sm font-medium text-gray-300">Order Quantity</label>
            <input
              id="bp-qty"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white"
              type="number" step="0.01" min={0.01}
              value={form.quantity}
              onChange={(e) => setField('quantity', e.target.value)}
              required
            />
            {fieldError('quantity') && <p className="mt-1 text-xs text-red-400">{fieldError('quantity')}</p>}
          </div>

          <div className="md:col-span-2 flex gap-3">
            {!editingId ? (
              <button type="submit" disabled={saving || !canCreate} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">
                {saving ? 'Creating…' : 'Create Blueprint'}
              </button>
            ) : (
              <>
                <button type="button" onClick={handleUpdate} disabled={saving || !canUpdate} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60">
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
                <button type="button" onClick={cancelEdit} className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-gray-500">
                  Cancel
                </button>
              </>
            )}
          </div>
        </form>

        <div className="mt-6 rounded-xl border border-gray-800 bg-gray-950 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-300">Live Market Chart Preview</h3>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => setMarketChartMode('candles')}
                className={`rounded-lg px-3 py-1.5 ${marketChartMode === 'candles' ? 'bg-indigo-600 text-white' : 'border border-gray-700 text-gray-300'}`}
              >
                Candles
              </button>
              <button
                type="button"
                onClick={() => setMarketChartMode('line')}
                className={`rounded-lg px-3 py-1.5 ${marketChartMode === 'line' ? 'bg-indigo-600 text-white' : 'border border-gray-700 text-gray-300'}`}
              >
                Line
              </button>
            </div>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="bp-market-tf" className="mb-1 block text-xs text-gray-400">Timeframe</label>
              <select
                id="bp-market-tf"
                value={form.executionTimeframe}
                onChange={(event) => setField('executionTimeframe', event.target.value as MarketDataTimeframe)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white"
              >
                {(['1Min', '5Min', '15Min', '1Hour', '1Day'] as MarketDataTimeframe[]).map((tf) => (
                  <option key={tf} value={tf}>{tf}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end text-xs text-gray-400">
              <p>Symbol source: <span className="text-gray-200">{form.symbol || 'N/A'}</span></p>
            </div>
          </div>

          {marketError && <p className="mb-3 text-xs text-red-400">{marketError}</p>}
          {marketLoading && <p className="mb-3 text-xs text-gray-500">Loading market bars...</p>}

          {marketBars.length > 0 ? (
            <InteractiveMarketChart
              bars={marketBars}
              chartMode={marketChartMode}
              title={`${form.symbol || 'Symbol'} · ${form.executionTimeframe}`}
              timeframe={form.executionTimeframe}
              showRsi
              rsiPeriod={Number(form.rsiPeriod) || 14}
              rsiBuyThreshold={Number(form.rsiBuyThreshold) || 30}
              rsiSellThreshold={Number(form.rsiSellThreshold) || 70}
              showVolume
              showOhlcvOverlay
              showXAxis
              showGridlines
            />
          ) : !marketLoading ? (
            <p className="text-xs text-gray-500">No live bars returned for this symbol/timeframe. Showing backup strategy preview below.</p>
          ) : null}
        </div>

        {marketBars.length === 0 && !marketLoading && (
          <RsiPreviewChart preview={preview} />
        )}

        {createValidation.success && (
          <BacktestPreviewPanel params={createValidation.data.parameters} />
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">Your Published Blueprints</h2>

        {loading ? (
          <p className="text-gray-500">Loading your blueprints…</p>
        ) : blueprints.length === 0 ? (
          <p className="text-gray-500">No blueprints yet. Create your first one above.</p>
        ) : (
          <div className="space-y-4">
            {blueprints.map((bp) => (
              <BlueprintCard
                key={bp.id}
                blueprint={bp}
                expandedBacktest={expandedBacktest}
                onEdit={startEdit}
                onDelete={handleDelete}
                onToggleBacktest={(id) => setExpandedBacktest(expandedBacktest === id ? null : id)}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
