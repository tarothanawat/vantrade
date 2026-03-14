'use client';

import { authClient } from '@/lib/api-client/auth.client';
import { ApiError } from '@/lib/api-client/base';
import { Role } from '@vantrade/types';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type UserSession = {
  id?: string;
  email?: string;
  role?: Role;
};

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserSession | null>(null);

  useEffect(() => {
    let isMounted = true;

    authClient
      .me()
      .then((session) => {
        if (!isMounted) return;
        setUser(session.user);
        localStorage.setItem('user', JSON.stringify(session.user));
      })
      .catch((err) => {
        if (!isMounted) return;

        if (err instanceof ApiError && err.status === 401) {
          localStorage.removeItem('user');
          setUser(null);
          return;
        }

        setUser(null);
      });

    return () => {
      isMounted = false;
    };
  }, [pathname]);

  const navLinks = useMemo(() => {
    const baseLinks = [{ href: '/marketplace', label: 'Marketplace' }];

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
    try {
      await authClient.logout();
    } catch {
      // best-effort logout; continue local cleanup
    }

    localStorage.removeItem('user');
    setUser(null);
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
