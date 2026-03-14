/**
 * Base API client — typed fetch wrapper for the NestJS REST API.
 * All requests go here; no business logic lives in the web app.
 */

import type { ZodType } from 'zod';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
  schema?: ZodType<T>,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? res.statusText);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  const payload = (await res.json()) as unknown;
  if (!schema) return payload as T;

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(500, `Invalid API response for ${path}`);
  }

  return parsed.data;
}

export const apiClient = {
  get: <T>(path: string, token?: string, schema?: ZodType<T>) =>
    request<T>(path, { method: 'GET' }, token, schema),

  post: <T>(path: string, body: unknown, token?: string, schema?: ZodType<T>) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }, token, schema),

  patch: <T>(path: string, body: unknown, token?: string, schema?: ZodType<T>) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }, token, schema),

  delete: <T>(path: string, token?: string, schema?: ZodType<T>) =>
    request<T>(path, { method: 'DELETE' }, token, schema),
};
