import BlueprintCard from '@/components/marketplace/BlueprintCard';
import { blueprintsClient } from '@/lib/api-client/blueprints.client';
import type { Blueprint } from '@vantrade/types';

export const revalidate = 60; // ISR — refresh every 60 s

export default async function MarketplacePage() {
  let blueprints: Blueprint[] = [];

  try {
    blueprints = await blueprintsClient.getAll();
  } catch {
    // Render empty state gracefully
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-3xl font-bold text-white">Strategy Marketplace</h1>
      <p className="mb-8 text-gray-400">
        Verified algorithmic trading blueprints you can subscribe to instantly.
      </p>

      {blueprints.length === 0 ? (
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
