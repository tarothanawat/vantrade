'use client';

import { apiKeysClient } from '@/lib/api-client/api-keys.client';
import { ApiError } from '@/lib/api-client/base';
import { ApiKeyCreateSchema, type ApiKeyCreateDto } from '@vantrade/types';
import { useEffect, useState } from 'react';

type SaveStatus = 'idle' | 'saving' | 'saved';

export default function ApiKeysPage() {
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    apiKeysClient
      .hasKey()
      .then(setHasKey)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setError('Please sign in to manage API keys.');
          return;
        }
        setError('Failed to load API key status.');
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSaveStatus('saving');

    const form = event.currentTarget;
    const formData = new FormData(form);
    const raw = {
      alpacaApiKey: formData.get('alpacaApiKey'),
      alpacaApiSecret: formData.get('alpacaApiSecret'),
    };

    const parsed = ApiKeyCreateSchema.safeParse(raw);
    if (!parsed.success) {
      setError('Both key fields are required and must be at least 10 characters.');
      setSaveStatus('idle');
      return;
    }

    try {
      await apiKeysClient.upsert(parsed.data as ApiKeyCreateDto);
      setHasKey(true);
      setSaveStatus('saved');
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save API keys.');
      setSaveStatus('idle');
    }
  }

  async function handleDelete() {
    setError('');

    try {
      await apiKeysClient.remove();
      setHasKey(false);
      setSaveStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove API keys.');
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-gray-500">Loading API key vault…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-white">Broker API Keys</h1>
      <p className="mb-8 text-gray-400">
        Store your Alpaca paper credentials securely. Keys are encrypted before being persisted.
      </p>

      <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900 p-4">
        <p className="text-sm text-gray-300">
          Current status:{' '}
          <span className={hasKey ? 'font-semibold text-emerald-400' : 'font-semibold text-yellow-400'}>
            {hasKey ? 'Configured' : 'Not configured'}
          </span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <div>
          <label htmlFor="alpacaApiKey" className="mb-1 block text-sm text-gray-400">
            Alpaca API Key
          </label>
          <input
            id="alpacaApiKey"
            name="alpacaApiKey"
            type="password"
            autoComplete="off"
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
            placeholder="Enter your Alpaca paper API key"
            required
          />
        </div>

        <div>
          <label htmlFor="alpacaApiSecret" className="mb-1 block text-sm text-gray-400">
            Alpaca API Secret
          </label>
          <input
            id="alpacaApiSecret"
            name="alpacaApiSecret"
            type="password"
            autoComplete="off"
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
            placeholder="Enter your Alpaca paper API secret"
            required
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saveStatus === 'saving'}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveStatus === 'saving' ? 'Saving…' : hasKey ? 'Update Keys' : 'Save Keys'}
          </button>

          {hasKey && (
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg border border-red-900 px-4 py-2 text-sm font-semibold text-red-400 transition-colors hover:border-red-700"
            >
              Remove Keys
            </button>
          )}

          {saveStatus === 'saved' && <span className="text-sm text-emerald-400">Saved securely.</span>}
        </div>
      </form>
    </main>
  );
}
