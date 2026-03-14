import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <h1 className="text-5xl font-bold tracking-tight text-white">VanTrade</h1>
      <p className="max-w-md text-center text-lg text-gray-400">
        A multi-tenant algorithmic strategy marketplace. Publish, verify, and execute trading
        blueprints — powered by Alpaca Paper Trading.
      </p>
      <div className="flex gap-4">
        <Link
          href="/auth/login"
          className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-500 transition-colors"
        >
          Sign In
        </Link>
        <Link
          href="/marketplace"
          className="rounded-lg border border-gray-700 px-6 py-3 font-semibold text-gray-300 hover:border-gray-500 transition-colors"
        >
          Browse Marketplace
        </Link>
      </div>
    </main>
  );
}
