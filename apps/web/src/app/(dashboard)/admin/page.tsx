'use client';

import { BlueprintReviewTable } from '@/components/admin/BlueprintReviewTable';
import { UserManagementTable } from '@/components/admin/UserManagementTable';
import { useAdmin } from '@/hooks/use-admin';
import { type Role } from '@vantrade/types';

export default function AdminPage() {
  const { blueprints, users, pendingRoles, setPendingRoles, loading, error, handleVerify, handleAssignRole } =
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
