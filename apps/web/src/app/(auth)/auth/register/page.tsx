'use client';

import { authClient } from '@/lib/api-client/auth.client';
import type { RegisterDto } from '@vantrade/types';
import { RegisterSchema, Role } from '@vantrade/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const raw = {
      email: formData.get('email'),
      password: formData.get('password'),
      role: formData.get('role'),
    };

    const parsed = RegisterSchema.safeParse(raw);
    if (!parsed.success) {
      setError('Please check your inputs.');
      setLoading(false);
      return;
    }

    try {
      const response = await authClient.register(parsed.data as RegisterDto);
      localStorage.setItem('user', JSON.stringify(response.user));
      router.push('/marketplace');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-8">
        <h1 className="mb-6 text-2xl font-bold text-white">Create your VanTrade account</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-gray-400">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-gray-400">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
              placeholder="Min 8 characters"
            />
          </div>

          <div>
            <label htmlFor="role" className="mb-1 block text-sm text-gray-400">I want to…</label>
            <select
              id="role"
              name="role"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white focus:border-indigo-500 focus:outline-none"
              defaultValue={Role.TESTER}
            >
              <option value={Role.TESTER}>Test strategies (Tester)</option>
              <option value={Role.PROVIDER}>Publish strategies (Provider)</option>
            </select>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg bg-indigo-600 py-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-indigo-400 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
