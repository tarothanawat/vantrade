'use client';

import { blueprintsClient } from '@/lib/api-client/blueprints.client';
import { usersClient } from '@/lib/api-client/users.client';
import type { Blueprint, UserListItemDto } from '@vantrade/types';
import { Role } from '@vantrade/types';
import { useEffect, useState } from 'react';

export default function AdminPage() {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [users, setUsers] = useState<UserListItemDto[]>([]);
  const [pendingRoles, setPendingRoles] = useState<Record<string, Role>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([blueprintsClient.getAllAdmin(), usersClient.listUsers()])
      .then(([bps, us]) => {
        setBlueprints(bps);
        setUsers(us);
      })
      .catch(() => setError('Failed to load admin data'))
      .finally(() => setLoading(false));
  }, []);

  async function handleVerify(id: string, verified: boolean) {
    try {
      const updated = await blueprintsClient.verify(id, verified);
      setBlueprints((prev: Blueprint[]) =>
        prev.map((bp) => (bp.id === id ? { ...bp, isVerified: updated.isVerified } : bp)),
      );
    } catch {
      setError('Failed to update verification status');
    }
  }

  async function handleAssignRole(id: string) {
    const role = pendingRoles[id];
    if (!role) return;
    try {
      const updated = await usersClient.assignRole(id, role);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role: updated.role } : u)));
      setPendingRoles((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch {
      setError('Failed to assign role');
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
    <main className="mx-auto max-w-5xl px-4 py-10 space-y-12">
      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Blueprint Review */}
      <section>
        <h1 className="mb-2 text-2xl font-bold text-white">Admin — Blueprint Review</h1>
        <p className="mb-6 text-gray-400">Verify or reject strategy blueprints before they appear in the marketplace.</p>

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
      </section>

      {/* User Management */}
      <section>
        <h2 className="mb-2 text-2xl font-bold text-white">User Management</h2>
        <p className="mb-6 text-gray-400">Assign roles to users. New registrations default to Tester.</p>

        {users.length === 0 ? (
          <p className="text-gray-500">No users found.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-900 text-left text-gray-400">
                <tr>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Current Role</th>
                  <th className="px-4 py-3">Assign Role</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 bg-gray-950">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3 text-white">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-gray-700 px-2 py-0.5 text-xs uppercase tracking-wide text-gray-300">
                        {u.role.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={pendingRoles[u.id] ?? u.role}
                        onChange={(e) =>
                          setPendingRoles((prev) => ({ ...prev, [u.id]: e.target.value as Role }))
                        }
                        className="rounded-lg border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
                      >
                        {Object.values(Role).map((r) => (
                          <option key={r} value={r}>
                            {r.charAt(0) + r.slice(1).toLowerCase()}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleAssignRole(u.id)}
                        disabled={!pendingRoles[u.id] || pendingRoles[u.id] === u.role}
                        className="rounded-lg bg-indigo-700 px-3 py-1 text-xs text-white hover:bg-indigo-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Assign
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
