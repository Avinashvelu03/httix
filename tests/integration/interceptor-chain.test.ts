import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHttix } from '../../src/core/client';
import { HttixResponseError } from '../../src/core/errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = 'https://api.example.com';

const mockJsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    statusText: status === 200 ? 'OK' : String(status),
    headers: { 'Content-Type': 'application/json' },
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

describe('Interceptor chain scenarios', () => {
  // =========================================================================
  // Multiple request interceptors
  // =========================================================================
  describe('Multiple request interceptors modifying config', () => {
    it('should run multiple interceptors in registration order', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ ok: true }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const order: number[] = [];

      client.interceptors.request.use((config) => {
        order.push(1);
        config.headers = {
          ...(config.headers instanceof Headers
            ? Object.fromEntries(config.headers.entries())
            : (config.headers ?? {})),
          'X-First': 'yes',
        };
        return config;
      });

      client.interceptors.request.use((config) => {
        order.push(2);
        config.headers = {
          ...(config.headers instanceof Headers
            ? Object.fromEntries(config.headers.entries())
            : (config.headers ?? {})),
          'X-Second': 'yes',
        };
        return config;
      });

      client.interceptors.request.use((config) => {
        order.push(3);
        config.headers = {
          ...(config.headers instanceof Headers
            ? Object.fromEntries(config.headers.entries())
            : (config.headers ?? {})),
          'X-Third': 'yes',
        };
        return config;
      });

      await client.get('/data');

      expect(order).toEqual([1, 2, 3]);

      const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(req.headers.get('x-first')).toBe('yes');
      expect(req.headers.get('x-second')).toBe('yes');
      expect(req.headers.get('x-third')).toBe('yes');
    });

    it('should allow an interceptor to modify the URL', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ ok: true }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      client.interceptors.request.use((config) => {
        config.url = '/modified' + config.url;
        return config;
      });

      await client.get('/original');

      const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(req.url).toContain('/modified/original');
    });

    it('should allow an interceptor to modify the method', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ ok: true }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      client.interceptors.request.use((config) => {
        config.method = 'POST';
        return config;
      });

      await client.get('/data');

      const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(req.method).toBe('POST');
    });

    it('should pass modified config to subsequent interceptors', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ ok: true }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      // First interceptor adds a header
      client.interceptors.request.use((config) => {
        config.headers = {
          ...(config.headers instanceof Headers
            ? Object.fromEntries(config.headers.entries())
            : (config.headers ?? {})),
          'X-Step1': 'done',
        };
        return config;
      });

      // Second interceptor reads header added by first
      client.interceptors.request.use((config) => {
        const headers = config.headers instanceof Headers
          ? Object.fromEntries(config.headers.entries())
          : (config.headers as Record<string, string> ?? {});
        config.headers = {
          ...headers,
          'X-Step2-ReadStep1': headers['X-Step1'] ?? 'missing',
        };
        return config;
      });

      await client.get('/data');

      const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(req.headers.get('x-step1')).toBe('done');
      expect(req.headers.get('x-step2-readstep1')).toBe('done');
    });

    it('should handle async interceptors', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ ok: true }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      client.interceptors.request.use(async (config) => {
        await new Promise((r) => setTimeout(r, 1));
        config.headers = {
          ...(config.headers instanceof Headers
            ? Object.fromEntries(config.headers.entries())
            : (config.headers ?? {})),
          'X-Async': 'resolved',
        };
        return config;
      });

      await client.get('/data');

      const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(req.headers.get('x-async')).toBe('resolved');
    });
  });

  // =========================================================================
  // Response interceptor transforming data
  // =========================================================================
  describe('Response interceptor transforming data', () => {
    it('should unwrap envelope response { data, meta }', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ data: { items: [1, 2, 3] }, meta: { total: 3 } }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      client.interceptors.response.use((response) => {
        const envelope = response.data as { data: unknown; meta: unknown };
        return {
          ...response,
          data: envelope.data,
        };
      });

      const response = await client.get('/items');
      expect(response.data).toEqual({ items: [1, 2, 3] });
    });

    it('should add metadata to response data', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ name: 'test' }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      client.interceptors.response.use((response) => {
        const enriched = {
          ...(response.data as Record<string, unknown>),
          _timestamp: Date.now(),
          _status: response.status,
        };
        return { ...response, data: enriched };
      });

      const response = await client.get('/data');
      const data = response.data as Record<string, unknown>;
      expect(data.name).toBe('test');
      expect(data._timestamp).toBeDefined();
      expect(data._status).toBe(200);
    });

    it('should run multiple response interceptors in order', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ value: 1 }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const order: number[] = [];

      client.interceptors.response.use((response) => {
        order.push(1);
        const d = response.data as Record<string, unknown>;
        return { ...response, data: { ...d, step1: true } };
      });

      client.interceptors.response.use((response) => {
        order.push(2);
        const d = response.data as Record<string, unknown>;
        return { ...response, data: { ...d, step2: true } };
      });

      const response = await client.get('/data');
      expect(order).toEqual([1, 2]);
      const data = response.data as Record<string, unknown>;
      expect(data.step1).toBe(true);
      expect(data.step2).toBe(true);
    });

    it('should normalize response data shape', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ items: ['a', 'b'], count: 2 }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      client.interceptors.response.use((response) => {
        const raw = response.data as { items: string[]; count: number };
        return {
          ...response,
          data: {
            results: raw.items,
            total: raw.count,
          },
        };
      });

      const response = await client.get('/search');
      const data = response.data as { results: string[]; total: number };
      expect(data.results).toEqual(['a', 'b']);
      expect(data.total).toBe(2);
    });
  });

  // =========================================================================
  // Error interceptor recovering from errors
  // =========================================================================
  describe('Error interceptor recovering from errors', () => {
    it('should recover from 404 with fallback data', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ error: 'Not found' }, 404),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      client.interceptors.response.use(
        (res) => res,
        (error) => {
          if (error instanceof HttixResponseError && error.status === 404) {
            return {
              data: { fallback: true, status: error.status },
              status: 200,
              statusText: 'OK (fallback)',
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

      const response = await client.get('/missing-resource');
      expect(response.ok).toBe(true);
      expect((response.data as { fallback: boolean }).fallback).toBe(true);
    });

    it('should try multiple error interceptors until one recovers', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ error: 'Gone' }, 410),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      // First error interceptor doesn't handle 410
      client.interceptors.response.use(
        (res) => res,
        (error) => {
          // Only handles 404
          if (error instanceof HttixResponseError && error.status === 404) {
            return {
              data: { from: 'first' },
              status: 200,
              statusText: 'OK',
              headers: new Headers(),
              ok: true,
              raw: new Response(),
              timing: 0,
              config: error.config ?? { url: '', method: 'GET' },
            };
          }
          // Return void → not handled → next interceptor gets a chance
        },
      );

      // Second error interceptor handles 410
      client.interceptors.response.use(
        (res) => res,
        (error) => {
          if (error instanceof HttixResponseError && error.status === 410) {
            return {
              data: { from: 'second', recovered: true },
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

      const response = await client.get('/gone');
      expect(response.ok).toBe(true);
      expect((response.data as { from: string }).from).toBe('second');
    });

    it('should re-throw if no interceptor recovers the error', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ error: 'Server Error' }, 500),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      client.interceptors.response.use(
        (res) => res,
        (error) => {
          // Only handles 404, returns void for 500
          if (error instanceof HttixResponseError && error.status === 404) {
            return {
              data: { fallback: true },
              status: 200,
              statusText: 'OK',
              headers: new Headers(),
              ok: true,
              raw: new Response(),
              timing: 0,
              config: error.config ?? { url: '', method: 'GET' },
            };
          }
        },
      );

      await expect(client.get('/server-error')).rejects.toThrow(HttixResponseError);
    });

    it('should handle interceptor that itself throws', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ error: 'Bad' }, 400),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      // Error interceptor that throws (simulating a bug)
      client.interceptors.response.use(
        (res) => res,
        () => {
          throw new Error('Interceptor bug');
        },
      );

      // Should still propagate the original error
      await expect(client.get('/bad')).rejects.toThrow();
    });
  });

  // =========================================================================
  // Auth interceptor + logging interceptor combined
  // =========================================================================
  describe('Auth interceptor + logging interceptor combined', () => {
    it('should add auth header and log request/response', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ secret: 'data' }),
      );

      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        retry: false,
        auth: { type: 'bearer', token: 'secret-token' },
      });

      const logs: string[] = [];

      // Logging interceptor (registered after auth, runs after auth)
      client.interceptors.request.use((config) => {
        logs.push(`→ ${config.method} ${config.url}`);
        return config;
      });

      client.interceptors.response.use((response) => {
        logs.push(`← ${response.status}`);
        return response;
      });

      const response = await client.get('/protected');

      // Auth header should be present
      const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(req.headers.get('authorization')).toBe('Bearer secret-token');

      // Logging should have captured both request and response
      expect(logs).toContain('→ GET /protected');
      expect(logs).toContain('← 200');

      // Data should be correct
      expect(response.data).toEqual({ secret: 'data' });
    });

    it('should apply auth, add request ID, and log all in the correct order', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ result: 'ok' }),
      );

      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        retry: false,
        auth: { type: 'bearer', token: 'token-abc' },
      });

      const order: string[] = [];

      // Auth is registered first (in constructor)
      // Request ID interceptor registered second
      client.interceptors.request.use((config) => {
        order.push('request-id-interceptor');
        config.headers = {
          ...(config.headers instanceof Headers
            ? Object.fromEntries(config.headers.entries())
            : (config.headers ?? {})),
          'X-Request-ID': 'req-12345',
        };
        return config;
      });

      // Logging interceptor registered third
      client.interceptors.request.use((config) => {
        order.push('logging-interceptor');
        const headers = config.headers instanceof Headers
          ? Object.fromEntries(config.headers.entries())
          : (config.headers as Record<string, string> ?? {});
        order.push(`auth-header=${headers['Authorization'] ?? 'missing'}`);
        return config;
      });

      await client.get('/api/data');

      // Auth runs first, then request-id, then logging
      expect(order).toEqual([
        'request-id-interceptor',
        'logging-interceptor',
        'auth-header=Bearer token-abc',
      ]);

      const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(req.headers.get('authorization')).toBe('Bearer token-abc');
      expect(req.headers.get('x-request-id')).toBe('req-12345');
    });

    it('should log errors through the logging interceptor even on failure', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ error: 'Forbidden' }, 403),
      );

      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        retry: false,
        auth: { type: 'bearer', token: 'bad-token' },
      });

      const logs: string[] = [];

      client.interceptors.request.use((config) => {
        logs.push(`→ ${config.method} ${config.url}`);
        return config;
      });

      client.interceptors.response.use(
        (response) => {
          logs.push(`← ${response.status}`);
          return response;
        },
        (error) => {
          logs.push(`✕ ${(error as HttixResponseError).status ?? 'unknown'}`);
          throw error; // re-throw after logging
        },
      );

      await expect(client.get('/admin')).rejects.toThrow(HttixResponseError);
      expect(logs).toEqual(['→ GET /admin', '✕ 403']);
    });
  });
});
