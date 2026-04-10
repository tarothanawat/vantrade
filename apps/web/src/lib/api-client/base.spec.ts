import { ApiError, apiClient } from './base';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function mockFetchOk(body: unknown, status = 200): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response);
}

function mockFetchError(status: number, body: unknown): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: 'Error',
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response);
}

describe('ApiError', () => {
  it('exposes the HTTP status code', () => {
    const err = new ApiError(404, 'Not found');
    expect(err.status).toBe(404);
  });

  it('is an instance of Error', () => {
    expect(new ApiError(500, 'Server error')).toBeInstanceOf(Error);
  });

  it('has the name ApiError', () => {
    expect(new ApiError(401, 'Unauthorized').name).toBe('ApiError');
  });

  it('carries the message', () => {
    expect(new ApiError(403, 'Forbidden').message).toBe('Forbidden');
  });
});

describe('apiClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('get()', () => {
    it('calls the correct URL with GET method', async () => {
      mockFetchOk({ data: 'ok' });

      await apiClient.get('/blueprints');

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/api/blueprints`,
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('attaches Authorization header when a token is provided', async () => {
      mockFetchOk({});

      await apiClient.get('/auth/me', 'my-token');

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer my-token' }),
        }),
      );
    });

    it('returns the parsed JSON body on success', async () => {
      const payload = { id: '1', title: 'Test' };
      mockFetchOk(payload);

      const result = await apiClient.get('/blueprints/1');

      expect(result).toEqual(payload);
    });

    it('throws ApiError with the correct status on a 404', async () => {
      mockFetchError(404, { message: 'Blueprint not found' });

      await expect(apiClient.get('/blueprints/missing')).rejects.toMatchObject({
        status: 404,
        message: 'Blueprint not found',
      });
    });

    it('throws ApiError on a 401 Unauthorized response', async () => {
      mockFetchError(401, { message: 'Unauthorized' });

      await expect(apiClient.get('/auth/me')).rejects.toBeInstanceOf(ApiError);
    });

    it('validates the response body against a Zod schema when provided', async () => {
      const { z } = await import('zod');
      const Schema = z.object({ id: z.string(), value: z.number() });

      mockFetchOk({ id: 'abc', value: 42 });
      const result = await apiClient.get('/test', undefined, Schema);
      expect(result).toEqual({ id: 'abc', value: 42 });
    });

    it('throws ApiError 500 when the response does not match the schema', async () => {
      const { z } = await import('zod');
      const Schema = z.object({ id: z.string(), value: z.number() });

      mockFetchOk({ id: 123, value: 'not-a-number' }); // wrong types

      await expect(apiClient.get('/test', undefined, Schema)).rejects.toMatchObject({
        status: 500,
      });
    });

    it('returns undefined for 204 No Content responses', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: jest.fn(),
      } as unknown as Response);

      const result = await apiClient.get('/subscriptions/1');
      expect(result).toBeUndefined();
    });
  });

  describe('post()', () => {
    it('serialises the request body as JSON', async () => {
      mockFetchOk({ token: 'abc' });
      const dto = { email: 'a@b.com', password: 'pass' };

      await apiClient.post('/auth/login', dto);

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(dto),
        }),
      );
    });

    it('throws ApiError on a 409 Conflict', async () => {
      mockFetchError(409, { message: 'Email already in use' });

      await expect(apiClient.post('/auth/register', {})).rejects.toMatchObject({
        status: 409,
        message: 'Email already in use',
      });
    });
  });

  describe('patch()', () => {
    it('calls the endpoint with PATCH method and serialised body', async () => {
      mockFetchOk({ id: '1', isVerified: true });

      await apiClient.patch('/blueprints/1/verify', { isVerified: true });

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/api/blueprints/1/verify`,
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('delete()', () => {
    it('calls the endpoint with DELETE method', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: jest.fn(),
      } as unknown as Response);

      await apiClient.delete('/subscriptions/1');

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/api/subscriptions/1`,
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });
});
