import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHttix } from '../../src/core/client';
import {
  HttixResponseError,
  HttixRequestError,
} from '../../src/core/errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = 'https://api.example.com';

const mockJsonResponse = (
  data: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
) =>
  new Response(JSON.stringify(data), {
    status,
    statusText:
      status === 200
        ? 'OK'
        : status === 201
          ? 'Created'
          : status === 204
            ? 'No Content'
            : status === 404
              ? 'Not Found'
              : status === 422
                ? 'Unprocessable Entity'
                : status === 500
                  ? 'Internal Server Error'
                  : String(status),
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Real-world API scenarios', () => {
  // =========================================================================
  // REST API CRUD operations
  // =========================================================================
  describe('REST API CRUD operations', () => {
    const users = [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
    ];

    it('GET /users should return list of users', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ data: users, total: 2 }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.get('/users');

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data).toEqual({ data: users, total: 2 });

      const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(req.method).toBe('GET');
      expect(req.url).toContain('/users');
    });

    it('GET /users/:id should return a single user', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ data: users[0] }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.get('/users/:id', { params: { id: 1 } });

      expect(response.ok).toBe(true);
      expect(response.data).toEqual({ data: users[0] });

      const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(req.url).toContain('/users/1');
    });

    it('POST /users should create a new user and return 201', async () => {
      const newUser = { name: 'Charlie', email: 'charlie@example.com' };
      const createdUser = { id: 3, ...newUser };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ data: createdUser }, 201),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.post('/users', newUser);

      expect(response.status).toBe(201);
      expect(response.ok).toBe(true);
      expect(response.data).toEqual({ data: createdUser });

      const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(req.method).toBe('POST');
    });

    it('PUT /users/:id should fully update a user', async () => {
      const updatedUser = { id: 1, name: 'Alice Updated', email: 'alice.new@example.com' };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ data: updatedUser }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.put('/users/:id', updatedUser, { params: { id: 1 } });

      expect(response.ok).toBe(true);
      expect(response.data).toEqual({ data: updatedUser });

      const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(req.method).toBe('PUT');
      expect(req.url).toContain('/users/1');
    });

    it('PATCH /users/:id should partially update a user', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ data: { id: 1, name: 'Alice Patched', email: 'alice@example.com' } }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.patch('/users/:id', { name: 'Alice Patched' }, { params: { id: 1 } });

      expect(response.ok).toBe(true);
      expect((response.data as { data: { name: string } }).data.name).toBe('Alice Patched');

      const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(req.method).toBe('PATCH');
    });

    it('DELETE /users/:id should return 204 No Content', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(null, { status: 204, statusText: 'No Content' }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.delete('/users/:id', { params: { id: 1 } });

      expect(response.status).toBe(204);
      expect(response.ok).toBe(true);
      expect(response.data).toBeUndefined();

      const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(req.method).toBe('DELETE');
    });

    it('should handle a full CRUD workflow end-to-end', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      // 1. Create
      const newUser = { name: 'Dave', email: 'dave@example.com' };
      fetchMock.mockResolvedValue(mockJsonResponse({ data: { id: 10, ...newUser } }, 201));
      const createRes = await client.post('/users', newUser);
      expect(createRes.status).toBe(201);
      expect((createRes.data as { data: { id: number } }).data.id).toBe(10);

      // 2. Read
      fetchMock.mockResolvedValue(mockJsonResponse({ data: { id: 10, ...newUser } }));
      const readRes = await client.get('/users/:id', { params: { id: 10 } });
      expect(readRes.ok).toBe(true);

      // 3. Update
      fetchMock.mockResolvedValue(mockJsonResponse({ data: { id: 10, name: 'Dave Updated', email: 'dave@example.com' } }));
      const updateRes = await client.put('/users/:id', { name: 'Dave Updated', email: 'dave@example.com' }, { params: { id: 10 } });
      expect(updateRes.ok).toBe(true);

      // 4. Delete
      fetchMock.mockResolvedValue(new Response(null, { status: 204, statusText: 'No Content' }));
      const deleteRes = await client.delete('/users/:id', { params: { id: 10 } });
      expect(deleteRes.status).toBe(204);

      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });

  // =========================================================================
  // Auth flow with token refresh
  // =========================================================================
  describe('Auth flow with token refresh', () => {
    it('should include auth header on requests', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ data: 'protected' }),
      );

      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        retry: false,
        auth: { type: 'bearer', token: 'my-access-token' },
      });

      await client.get('/protected');

      const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(req.headers.get('authorization')).toBe('Bearer my-access-token');
    });

    it('should trigger token refresh on 401 and update token for future requests', async () => {
      const refreshToken = vi.fn().mockResolvedValue('new-access-token');
      const authConfig = {
        type: 'bearer' as const,
        token: 'old-token',
        refreshToken,
      };

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        retry: false,
        auth: authConfig,
      });

      // First request returns 401 → triggers refresh
      fetchMock.mockResolvedValue(mockJsonResponse({ error: 'Unauthorized' }, 401));

      await expect(client.get('/protected')).rejects.toThrow(HttixResponseError);
      expect(refreshToken).toHaveBeenCalledTimes(1);
      expect(authConfig.token).toBe('new-access-token');

      // Second request should use refreshed token
      fetchMock.mockResolvedValue(mockJsonResponse({ data: 'success' }));
      const response = await client.get('/protected');

      expect(response.ok).toBe(true);
      const [req] = fetchMock.mock.calls[1];
      expect(req.headers.get('authorization')).toBe('Bearer new-access-token');
    });

    it('should use dynamic token from a function', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ data: 'ok' }),
      );

      const getToken = vi.fn().mockReturnValue('dynamic-token-123');

      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        retry: false,
        auth: { type: 'bearer', token: getToken },
      });

      await client.get('/protected');
      expect(getToken).toHaveBeenCalledTimes(1);

      const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(req.headers.get('authorization')).toBe('Bearer dynamic-token-123');
    });
  });

  // =========================================================================
  // Paginated list fetching
  // =========================================================================
  describe('Paginated list fetching', () => {
    it('should fetch multiple pages with offset pagination', async () => {
      const page1 = [{ id: 1 }, { id: 2 }];
      const page2 = [{ id: 3 }];
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;

      // First call returns full page, second returns partial page (fewer items = last page)
      fetchMock
        .mockResolvedValueOnce(mockJsonResponse(page1))
        .mockResolvedValueOnce(mockJsonResponse(page2));

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const allItems: unknown[] = [];

      for await (const page of client.paginate('/items', {
        pagination: { style: 'offset', pageSize: 2, dataExtractor: (d: unknown) => d as unknown[] },
      })) {
        allItems.push(...page);
      }

      expect(allItems).toEqual([...page1, ...page2]);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Verify first page query params
      const [req1] = fetchMock.mock.calls[0];
      expect(req1.url).toContain('offset=0');
      expect(req1.url).toContain('limit=2');

      // Verify second page query params
      const [req2] = fetchMock.mock.calls[1];
      expect(req2.url).toContain('offset=2');
      expect(req2.url).toContain('limit=2');
    });

    it('should respect maxPages limit', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      // Use mockImplementation to create a fresh Response each call
      // (mockResolvedValue reuses the same Response whose body can only be consumed once)
      fetchMock.mockImplementation(async () =>
        mockJsonResponse([{ id: 1 }, { id: 2 }]),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const pages: unknown[][] = [];

      for await (const page of client.paginate('/items', {
        pagination: {
          style: 'offset',
          pageSize: 2,
          maxPages: 2,
          dataExtractor: (d: unknown) => d as unknown[],
        },
      })) {
        pages.push(page);
      }

      // Should only fetch 2 pages even though data keeps coming
      expect(pages).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should stop when page returns empty array', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValue(mockJsonResponse([]));

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const pages: unknown[][] = [];

      for await (const page of client.paginate('/items', {
        pagination: { style: 'offset', pageSize: 10, dataExtractor: (d: unknown) => d as unknown[] },
      })) {
        pages.push(page);
      }

      expect(pages).toHaveLength(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Error handling chain
  // =========================================================================
  describe('Error handling chain', () => {
    it('should handle 404 error and extract error data', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ error: 'User not found', code: 'NOT_FOUND' }, 404),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      try {
        await client.get('/users/999');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttixResponseError);
        const err = error as HttixResponseError;
        expect(err.status).toBe(404);
        expect(err.data).toEqual({ error: 'User not found', code: 'NOT_FOUND' });
        expect(err.config).toBeDefined();
        if (err.config) {
          expect(err.config.url).toBe('/users/999');
        }
      }
    });

    it('should handle 422 validation error', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse(
          { errors: [{ field: 'email', message: 'Invalid email format' }] },
          422,
        ),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      try {
        await client.post('/users', { name: 'Test', email: 'invalid' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttixResponseError);
        const err = error as HttixResponseError;
        expect(err.status).toBe(422);
        expect((err.data as { errors: unknown[] }).errors).toHaveLength(1);
      }
    });

    it('should recover from errors using error interceptor', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ error: 'Not found' }, 404),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      client.interceptors.response.use(
        (res) => res,
        (error) => {
          if (error instanceof HttixResponseError && error.status === 404) {
            return {
              data: { fallback: true, originalStatus: error.status },
              status: 200,
              statusText: 'OK',
              headers: new Headers(),
              ok: true,
              raw: new Response(),
              timing: 0,
              config: error.config ?? { url: '', method: 'GET' },
            };
          }
          throw error;
        },
      );

      const response = await client.get('/maybe-missing');
      expect(response.ok).toBe(true);
      expect((response.data as { fallback: boolean }).fallback).toBe(true);
      expect((response.data as { originalStatus: number }).originalStatus).toBe(404);
    });

    it('should handle network failure gracefully', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new TypeError('Failed to fetch'),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      try {
        await client.get('/offline');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttixRequestError);
        expect((error as HttixRequestError).message).toBeDefined();
      }
    });

    it('should not throw when throwOnError is false', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ error: 'Server error' }, 500),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.get('/error', { throwOnError: false });

      expect(response.status).toBe(500);
      expect(response.ok).toBe(false);
      expect(response.data).toEqual({ error: 'Server error' });
    });
  });

  // =========================================================================
  // Interceptor + retry combined
  // =========================================================================
  describe('Interceptor + retry combined', () => {
    it('should apply interceptor then retry on 500', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      let callCount = 0;

      fetchMock.mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          return mockJsonResponse({ error: 'Internal Server Error' }, 500);
        }
        return mockJsonResponse({ data: 'recovered' });
      });

      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        retry: {
          attempts: 3,
          backoff: 'fixed',
          baseDelay: 1,
          maxDelay: 1,
          jitter: false,
        },
      });

      // Add request interceptor
      client.interceptors.request.use((config) => {
        config.headers = {
          ...(config.headers instanceof Headers
            ? Object.fromEntries(config.headers.entries())
            : (config.headers ?? {})),
          'X-Custom-Header': 'intercepted',
        };
        return config;
      });

      const response = await client.get('/flaky');

      expect(response.ok).toBe(true);
      expect(response.data).toEqual({ data: 'recovered' });
      expect(callCount).toBe(3);

      // Verify interceptor applied to all retry attempts
      for (const call of fetchMock.mock.calls) {
        const req = call[0] as Request;
        expect(req.headers.get('x-custom-header')).toBe('intercepted');
      }
    });

    it('should add logging interceptor that tracks request/response', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ data: 'ok' }),
      );

      const log: string[] = [];

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      // Request interceptor logs
      client.interceptors.request.use((config) => {
        log.push(`REQ ${config.method} ${config.url}`);
        return config;
      });

      // Response interceptor logs
      client.interceptors.response.use((response) => {
        log.push(`RES ${response.status}`);
        return response;
      });

      await client.get('/data');

      expect(log).toEqual(['REQ GET /data', 'RES 200']);
    });

    it('should combine middleware, interceptor, and retry', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      let callCount = 0;

      fetchMock.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return mockJsonResponse({ error: 'Server Error' }, 500);
        }
        return mockJsonResponse({ data: 'success' });
      });

      const order: string[] = [];

      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        retry: {
          attempts: 3,
          backoff: 'fixed',
          baseDelay: 1,
          maxDelay: 1,
          jitter: false,
        },
      });

      // Middleware runs before and after the entire request lifecycle (including retries)
      client.use(async (ctx, next) => {
        order.push('mw-before');
        await next();
        order.push('mw-after');
      });

      // Interceptor runs per request attempt
      client.interceptors.request.use((config) => {
        order.push('interceptor-before');
        return config;
      });

      client.interceptors.response.use((response) => {
        order.push('interceptor-after');
        return response;
      });

      const response = await client.get('/combined');

      expect(response.ok).toBe(true);
      expect(callCount).toBe(2);
      // Middleware runs once (wraps the entire lifecycle)
      expect(order).toContain('mw-before');
      expect(order).toContain('mw-after');
      // Interceptor runs once before the retry loop begins
      // (interceptors execute in request() before doFetch's retryRequest)
      expect(order.filter((x) => x === 'interceptor-before').length).toBe(1);
    });
  });
});
