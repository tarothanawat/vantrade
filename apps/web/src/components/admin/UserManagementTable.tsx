import type { UserListItemDto } from '@vantrade/types';
import { Role } from '@vantrade/types';

interface Props {
  users: UserListItemDto[];
  pendingRoles: Record<string, Role>;
  onPendingRoleChange: (userId: string, role: Role) => void;
  onAssignRole: (userId: string) => void;
}

export function UserManagementTable({ users, pendingRoles, onPendingRoleChange, onAssignRole }: Props) {
  if (users.length === 0) {
    return <p className="text-gray-500">No users found.</p>;
  }

  return (
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
                  onChange={(e) => onPendingRoleChange(u.id, e.target.value as Role)}
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
                  onClick={() => onAssignRole(u.id)}
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
  );
}
