import type { Blueprint } from '@vantrade/types';

interface Props {
  blueprints: Blueprint[];
  onVerify: (id: string, verified: boolean) => void;
}

export function BlueprintReviewTable({ blueprints, onVerify }: Props) {
  if (blueprints.length === 0) {
    return <p className="text-gray-500">No blueprints to review.</p>;
  }

  return (
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
                    bp.isVerified ? 'bg-emerald-900 text-emerald-400' : 'bg-yellow-900 text-yellow-400'
                  }`}
                >
                  {bp.isVerified ? 'Verified' : 'Pending'}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  {!bp.isVerified && (
                    <button
                      onClick={() => onVerify(bp.id, true)}
                      className="rounded-lg bg-emerald-700 px-3 py-1 text-xs text-white hover:bg-emerald-600 transition-colors"
                    >
                      Verify
                    </button>
                  )}
                  {bp.isVerified && (
                    <button
                      onClick={() => onVerify(bp.id, false)}
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
  );
}
