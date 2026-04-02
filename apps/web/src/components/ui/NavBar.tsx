'use client';

import { useSession } from '@/components/providers/SessionProvider';
import { Role } from '@vantrade/types';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo } from 'react';

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useSession();

  const navLinks = useMemo(() => {
    const baseLinks = [
      { href: '/marketplace', label: 'Marketplace' },
      { href: '/market-data', label: 'Market Data' },
    ];

    if (user?.role === Role.TESTER) {
      return [
        ...baseLinks,
        { href: '/subscriptions', label: 'My Bots' },
        { href: '/api-keys', label: 'API Keys' },
      ];
    }

    if (user?.role === Role.ADMIN) {
      return [...baseLinks, { href: '/admin', label: 'Admin' }];
    }

    if (user?.role === Role.PROVIDER) {
      return [...baseLinks, { href: '/my-blueprints', label: 'My Blueprints' }];
    }

    return baseLinks;
  }, [user?.role]);

  async function handleLogout() {
    await logout();
    router.push('/auth/login');
  }

  const roleLabel = user?.role ? user.role.toLowerCase() : 'guest';

  return (
    <header className="border-b border-gray-800 bg-gray-950 px-6 py-4">
      <nav className="mx-auto flex max-w-6xl items-center justify-between">
        <Link href="/" className="text-lg font-bold text-white tracking-tight">
          Van<span className="text-indigo-400">Trade</span>
        </Link>

        <div className="flex items-center gap-6">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-sm transition-colors ${
                pathname.startsWith(href)
                  ? 'font-semibold text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {label}
            </Link>
          ))}

          <span className="hidden rounded-full border border-gray-700 px-2.5 py-1 text-xs uppercase tracking-wide text-gray-300 sm:inline-flex">
            {roleLabel}
          </span>

          {user ? (
            <button
              onClick={handleLogout}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:border-gray-500"
            >
              Sign out
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/auth/login"
                className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:border-gray-500"
              >
                Sign in
              </Link>
              <Link
                href="/auth/register"
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
