import BlueprintCard from '@/components/marketplace/BlueprintCard';
import { blueprintsClient } from '@/lib/api-client/blueprints.client';
import type { Blueprint } from '@vantrade/types';

export const dynamic = 'force-dynamic';

export default async function MarketplacePage() {
  let blueprints: Blueprint[] = [];
  let loadError = '';

  try {
    blueprints = await blueprintsClient.getAll();
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Failed to load marketplace data';
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-3xl font-bold text-white">Strategy Marketplace</h1>
      <p className="mb-8 text-gray-400">
        Verified algorithmic trading blueprints you can subscribe to instantly.
      </p>

      {loadError ? (
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-4">
          <p className="text-sm text-red-300">Unable to load marketplace right now.</p>
          <p className="mt-1 text-xs text-red-200/90">{loadError}</p>
          <p className="mt-2 text-xs text-gray-400">
            Make sure the API is running and reachable at <code>http://localhost:4000/api/blueprints</code>.
          </p>
        </div>
      ) : blueprints.length === 0 ? (
        <p className="text-gray-500">No verified blueprints yet. Check back soon.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {blueprints.map((bp) => (
            <BlueprintCard key={bp.id} blueprint={bp} />
          ))}
        </div>
      )}
    </main>
  );
}
