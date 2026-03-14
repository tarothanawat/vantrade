'use client';

import { blueprintsClient } from '@/lib/api-client/blueprints.client';
import type { Blueprint } from '@vantrade/types';
import { useEffect, useState } from 'react';

export default function AdminPage() {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    blueprintsClient
      .getAll()
      .then(setBlueprints)
      .catch(() => setError('Failed to load blueprints'))
      .finally(() => setLoading(false));
  }, []);

  async function handleVerify(id: string, verified: boolean) {
    const token = localStorage.getItem('token') ?? '';
    try {
      const updated = await blueprintsClient.verify(id, verified, token);
      setBlueprints((prev: Blueprint[]) =>
        prev.map((bp) => (bp.id === id ? { ...bp, isVerified: updated.isVerified } : bp)),
      );
    } catch {
      setError('Failed to update verification status');
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-gray-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-white">Admin — Blueprint Review</h1>
      <p className="mb-8 text-gray-400">Verify or reject strategy blueprints before they appear in the marketplace.</p>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {blueprints.length === 0 ? (
        <p className="text-gray-500">No blueprints to review.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900 text-left text-gray-400">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Author</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 bg-gray-950">
              {blueprints.map((bp) => (
                <tr key={bp.id}>
                  <td className="px-4 py-3 font-medium text-white">{bp.title}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{bp.authorId}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        bp.isVerified
                          ? 'bg-emerald-900 text-emerald-400'
                          : 'bg-yellow-900 text-yellow-400'
                      }`}
                    >
                      {bp.isVerified ? 'Verified' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {!bp.isVerified && (
                        <button
                          onClick={() => handleVerify(bp.id, true)}
                          className="rounded-lg bg-emerald-700 px-3 py-1 text-xs text-white hover:bg-emerald-600 transition-colors"
                        >
                          Verify
                        </button>
                      )}
                      {bp.isVerified && (
                        <button
                          onClick={() => handleVerify(bp.id, false)}
                          className="rounded-lg bg-red-800 px-3 py-1 text-xs text-white hover:bg-red-700 transition-colors"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
