'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/auth/login');
  }

  const navLinks = [
    { href: '/marketplace', label: 'Marketplace' },
    { href: '/subscriptions', label: 'My Bots' },
    { href: '/admin', label: 'Admin' },
  ];

  return (
    <header className="border-b border-gray-800 bg-gray-950 px-6 py-4">
      <nav className="mx-auto flex max-w-6xl items-center justify-between">
        <Link href="/marketplace" className="text-lg font-bold text-white tracking-tight">
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
          <button
            onClick={handleLogout}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-500 transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>
    </header>
  );
}
