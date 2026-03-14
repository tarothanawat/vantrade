'use client';

import { blueprintsClient } from '@/lib/api-client/blueprints.client';
import {
  BlueprintCreateSchema,
  BlueprintUpdateSchema,
  type Blueprint,
  type BlueprintCreateDto,
  type BlueprintUpdateDto,
} from '@vantrade/types';
import { useEffect, useState } from 'react';

type FormState = {
  title: string;
  description: string;
  symbol: string;
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
  rsiPeriod: '14',
  rsiBuyThreshold: '30',
  rsiSellThreshold: '70',
  maPeriod: '50',
  quantity: '1',
};

export default function MyBlueprintsPage() {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<FormState>(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);

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
  }

  function parseCreatePayload(): BlueprintCreateDto | null {
    const candidate = {
      title: form.title.trim(),
      description: form.description.trim(),
      parameters: {
        symbol: form.symbol.trim().toUpperCase(),
        rsiPeriod: Number(form.rsiPeriod),
        rsiBuyThreshold: Number(form.rsiBuyThreshold),
        rsiSellThreshold: Number(form.rsiSellThreshold),
        maPeriod: Number(form.maPeriod),
        quantity: Number(form.quantity),
      },
    };

    const parsed = BlueprintCreateSchema.safeParse(candidate);
    if (!parsed.success) {
      setError('Please check form values. Ensure all numbers and thresholds are valid.');
      return null;
    }

    return parsed.data;
  }

  function parseUpdatePayload(): BlueprintUpdateDto | null {
    const candidate = {
      title: form.title.trim(),
      description: form.description.trim(),
      parameters: {
        symbol: form.symbol.trim().toUpperCase(),
        rsiPeriod: Number(form.rsiPeriod),
        rsiBuyThreshold: Number(form.rsiBuyThreshold),
        rsiSellThreshold: Number(form.rsiSellThreshold),
        maPeriod: Number(form.maPeriod),
        quantity: Number(form.quantity),
      },
    };

    const parsed = BlueprintUpdateSchema.safeParse(candidate);
    if (!parsed.success) {
      setError('Please check form values before updating.');
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
      if (editingId === id) cancelEdit();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete blueprint';
      setError(message);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-3xl font-bold text-white">My Blueprints</h1>
      <p className="mb-8 text-gray-400">Create, edit, and manage the strategies you publish.</p>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <section className="mb-8 rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <h2 className="mb-4 text-xl font-semibold text-white">{editingId ? 'Edit Blueprint' : 'Create Blueprint'}</h2>
        <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
          <input className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white" placeholder="Title" value={form.title} onChange={(e) => setField('title', e.target.value)} required />
          <input className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white" placeholder="Symbol (e.g., AAPL)" value={form.symbol} onChange={(e) => setField('symbol', e.target.value)} required />
          <textarea className="md:col-span-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white" placeholder="Description" value={form.description} onChange={(e) => setField('description', e.target.value)} rows={3} required />

          <input className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white" type="number" placeholder="RSI Period" value={form.rsiPeriod} onChange={(e) => setField('rsiPeriod', e.target.value)} required />
          <input className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white" type="number" placeholder="MA Period" value={form.maPeriod} onChange={(e) => setField('maPeriod', e.target.value)} required />
          <input className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white" type="number" step="0.01" placeholder="Buy Threshold" value={form.rsiBuyThreshold} onChange={(e) => setField('rsiBuyThreshold', e.target.value)} required />
          <input className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white" type="number" step="0.01" placeholder="Sell Threshold" value={form.rsiSellThreshold} onChange={(e) => setField('rsiSellThreshold', e.target.value)} required />
          <input className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white md:col-span-2" type="number" step="0.01" placeholder="Quantity" value={form.quantity} onChange={(e) => setField('quantity', e.target.value)} required />

          <div className="md:col-span-2 flex gap-3">
            {!editingId ? (
              <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">
                {saving ? 'Creating…' : 'Create Blueprint'}
              </button>
            ) : (
              <>
                <button type="button" onClick={handleUpdate} disabled={saving} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60">
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
                <button type="button" onClick={cancelEdit} className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-gray-500">
                  Cancel
                </button>
              </>
            )}
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">Your Published Blueprints</h2>

        {loading ? (
          <p className="text-gray-500">Loading your blueprints…</p>
        ) : blueprints.length === 0 ? (
          <p className="text-gray-500">No blueprints yet. Create your first one above.</p>
        ) : (
          <div className="space-y-4">
            {blueprints.map((bp) => {
              const params = bp.parameters as {
                symbol: string;
                rsiPeriod: number;
                rsiBuyThreshold: number;
                rsiSellThreshold: number;
                maPeriod: number;
                quantity: number;
              };

              return (
                <article key={bp.id} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{bp.title}</h3>
                      <p className="mt-1 text-sm text-gray-400">{bp.description}</p>
                      <p className="mt-2 text-xs text-gray-500">
                        {params.symbol} · RSI({params.rsiPeriod}) · Buy &lt; {params.rsiBuyThreshold} · Sell &gt; {params.rsiSellThreshold} · MA({params.maPeriod}) · Qty {params.quantity}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${bp.isVerified ? 'bg-emerald-900 text-emerald-400' : 'bg-yellow-900 text-yellow-400'}`}>
                        {bp.isVerified ? 'Verified' : 'Pending'}
                      </span>
                      <button onClick={() => startEdit(bp)} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(bp.id)} className="rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-400 hover:border-red-700">
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
