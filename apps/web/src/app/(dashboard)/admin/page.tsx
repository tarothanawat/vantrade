'use client';

import { BlueprintReviewTable } from '@/components/admin/BlueprintReviewTable';
import { UserManagementTable } from '@/components/admin/UserManagementTable';
import { useAdmin } from '@/hooks/use-admin';
import { type Role } from '@vantrade/types';

export default function AdminPage() {
  const { blueprints, users, pendingRoles, setPendingRoles, loading, error, handleVerify, handleAssignRole, triggering, lastTriggeredAt, handleTriggerHeartbeat } =
    useAdmin();

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

      <section className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-6">
        <h2 className="mb-1 text-lg font-bold text-yellow-400">Heartbeat — Manual Trigger</h2>
        <p className="mb-4 text-sm text-gray-400">
          Force one heartbeat tick immediately. All active subscriptions will be evaluated and orders placed where signals fire.
        </p>
        <div className="flex items-center gap-4">
          <button
            onClick={handleTriggerHeartbeat}
            disabled={triggering}
            className="rounded-md bg-yellow-500 px-5 py-2 text-sm font-semibold text-black transition hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {triggering ? 'Triggering…' : 'Trigger Heartbeat Now'}
          </button>
          {lastTriggeredAt && (
            <span className="text-xs text-gray-400">
              Last triggered: {new Date(lastTriggeredAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </section>

      <section>
        <h1 className="mb-2 text-2xl font-bold text-white">Admin — Blueprint Review</h1>
        <p className="mb-6 text-gray-400">Verify or reject strategy blueprints before they appear in the marketplace.</p>
        <BlueprintReviewTable blueprints={blueprints} onVerify={handleVerify} />
      </section>

      <section>
        <h2 className="mb-2 text-2xl font-bold text-white">User Management</h2>
        <p className="mb-6 text-gray-400">Assign roles to users. New registrations default to Tester.</p>
        <UserManagementTable
          users={users}
          pendingRoles={pendingRoles}
          onPendingRoleChange={(id, role: Role) => setPendingRoles((prev) => ({ ...prev, [id]: role }))}
          onAssignRole={handleAssignRole}
        />
      </section>
    </main>
  );
}
