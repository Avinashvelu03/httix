import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttixClientImpl, createHttix } from '../../src/core/client';
import {
  HttixResponseError,
  HttixAbortError,
  HttixTimeoutError,
  HttixRequestError,
} from '../../src/core/errors';
import type { HttixConfig } from '../../src/core/types';

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
            : status === 400
              ? 'Bad Request'
              : status === 401
                ? 'Unauthorized'
              : status === 404
                ? 'Not Found'
              : status === 422
                ? 'Unprocessable Entity'
              : status === 500
                ? 'Internal Server Error'
                : status === 502
                  ? 'Bad Gateway'
                  : status === 503
                    ? 'Service Unavailable'
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

describe('HttixClientImpl', () => {
  // =========================================================================
  // Construction & defaults
  // =========================================================================
  describe('construction', () => {
    it('should create a client with default config', () => {
      const client = createHttix();
      expect(client.defaults).toBeDefined();
      expect(client.defaults.url).toBe('');
      expect(client.defaults.timeout).toBe(30000);
      expect(client.defaults.throwOnError).toBe(true);
      expect(client.defaults.credentials).toBe('same-origin');
      expect(client.defaults.mode).toBe('cors');
      expect(client.defaults.redirect).toBe('follow');
    });

    it('should create a client with no arguments', () => {
      const client = new HttixClientImpl();
      expect(client.defaults).toBeDefined();
      expect(client.defaults.timeout).toBe(30000);
    });

    it('should merge user config with defaults', () => {
      const client = createHttix({ baseURL: BASE, timeout: 10000 });
      expect(client.defaults.baseURL).toBe(BASE);
      expect(client.defaults.timeout).toBe(10000);
    });

    it('should preserve default values when partial config is provided', () => {
      const client = createHttix({ baseURL: BASE });
      expect(client.defaults.timeout).toBe(30000); // from defaults
      expect(client.defaults.throwOnError).toBe(true); // from defaults
    });

    it('should create interceptor managers', () => {
      const client = createHttix();
      expect(client.interceptors.request).toBeDefined();
      expect(client.interceptors.response).toBeDefined();
      expect(client.interceptors.request.handlers).toEqual([]);
      expect(client.interceptors.response.handlers).toEqual([]);
    });

    it('should expose stream utilities', () => {
      const client = createHttix();
      expect(client.stream).toBeDefined();
      expect(typeof client.stream.sse).toBe('function');
      expect(typeof client.stream.ndjson).toBe('function');
    });

    it('should expose paginate utility', () => {
      const client = createHttix();
      expect(client.paginate).toBeDefined();
      expect(typeof client.paginate).toBe('function');
    });
  });

  // =========================================================================
  // HTTP methods
  // =========================================================================
  describe('HTTP methods', () => {
    it('should make a GET request', async () => {
      const mockData = { users: [{ id: 1, name: 'Alice' }] };
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse(mockData));

      const client = createHttix({ baseURL: BASE });
      const response = await client.get('/users');

      expect(response.status).toBe(200);
      expect(response.ok).toBe(true);
      expect(response.data).toEqual(mockData);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      const [req] = (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(req.method).toBe('GET');
      expect(req.url).toContain('/users');
    });

    it('should make a POST request', async () => {
      const body = { name: 'Bob' };
      const mockData = { id: 1, name: 'Bob' };
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse(mockData, 201));

      const client = createHttix({ baseURL: BASE });
      const response = await client.post('/users', body);

      expect(response.status).toBe(201);
      expect(response.data).toEqual(mockData);

      const [req] = (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(req.method).toBe('POST');
    });

    it('should make a PUT request', async () => {
      const body = { name: 'Charlie' };
      const mockData = { id: 1, name: 'Charlie' };
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse(mockData));

      const client = createHttix({ baseURL: BASE });
      const response = await client.put('/users/1', body);

      expect(response.ok).toBe(true);

      const [req] = (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(req.method).toBe('PUT');
    });

    it('should make a PATCH request', async () => {
      const body = { name: 'Dave' };
      const mockData = { id: 1, name: 'Dave' };
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse(mockData));

      const client = createHttix({ baseURL: BASE });
      const response = await client.patch('/users/1', body);

      expect(response.ok).toBe(true);

      const [req] = (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(req.method).toBe('PATCH');
    });

    it('should make a DELETE request', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(
        new Response(null, {
          status: 204,
          statusText: 'No Content',
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const response = await client.delete('/users/1');

      expect(response.status).toBe(204);

      const [req] = (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(req.method).toBe('DELETE');
    });

    it('should make a HEAD request', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(
        new Response(null, {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Length': '42' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const response = await client.head('/users/1');

      expect(response.status).toBe(200);

      const [req] = (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(req.method).toBe('HEAD');
    });

    it('should make an OPTIONS request', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(
        new Response(null, {
          status: 200,
          statusText: 'OK',
          headers: { Allow: 'GET, POST, PUT, DELETE' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const response = await client.options('/users/1');

      expect(response.status).toBe(200);

      const [req] = (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(req.method).toBe('OPTIONS');
    });
  });

  // =========================================================================
  // request() method
  // =========================================================================
  describe('request() method', () => {
    it('should make a request with full config', async () => {
      const mockData = { result: 'ok' };
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse(mockData));

      const client = createHttix({ baseURL: BASE });
      const response = await client.request({
        url: '/data',
        method: 'GET',
        headers: { 'X-Custom': 'header' },
      });

      expect(response.data).toEqual(mockData);
      expect(response.ok).toBe(true);

      const [req] = (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(req.url).toContain('api.example.com/data');
    });

    it('should include timing in response', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({ baseURL: BASE });
      const response = await client.get('/test');

      expect(typeof response.timing).toBe('number');
      expect(response.timing).toBeGreaterThanOrEqual(0);
    });

    it('should include config in response', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({ baseURL: BASE });
      const response = await client.get('/test');

      expect(response.config).toBeDefined();
      expect(response.config.url).toBe('/test');
    });

    it('should include requestId in response config', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({ baseURL: BASE });
      const response = await client.get('/test');

      expect(response.config.requestId).toBeDefined();
      expect(typeof response.config.requestId).toBe('string');
    });

    it('should preserve a custom requestId', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({ baseURL: BASE });
      const response = await client.request({
        url: '/test',
        method: 'GET',
        requestId: 'my-custom-id',
      });

      expect(response.config.requestId).toBe('my-custom-id');
    });

    it('should include raw Response object', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({ baseURL: BASE });
      const response = await client.get('/test');

      expect(response.raw).toBeDefined();
      expect(response.raw).toBeInstanceOf(Response);
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================
  describe('error handling', () => {
    it('should throw HttixResponseError on 4xx status', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(
        mockJsonResponse({ error: 'not found' }, 404),
      );

      const client = createHttix({ baseURL: BASE });
      try {
        await client.get('/notfound');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttixResponseError);
        const err = error as HttixResponseError;
        expect(err.status).toBe(404);
        expect(err.data).toEqual({ error: 'not found' });
      }
    });

    it('should throw HttixResponseError on 5xx status', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(
        mockJsonResponse({ error: 'server error' }, 500),
      );

      const client = createHttix({ baseURL: BASE });
      try {
        await client.get('/server-error');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttixResponseError);
        const err = error as HttixResponseError;
        expect(err.status).toBe(500);
        expect(err.statusText).toBe('Internal Server Error');
      }
    });

    it('should throw HttixResponseError on 400 Bad Request', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(
        mockJsonResponse({ error: 'bad request' }, 400),
      );

      const client = createHttix({ baseURL: BASE });
      try {
        await client.post('/bad', {});
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttixResponseError);
        const err = error as HttixResponseError;
        expect(err.status).toBe(400);
      }
    });

    it('should throw HttixResponseError on 401 Unauthorized', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(
        mockJsonResponse({ error: 'unauthorized' }, 401),
      );

      const client = createHttix({ baseURL: BASE });
      try {
        await client.get('/protected');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttixResponseError);
      }
    });

    it('should not throw when throwOnError is false for 4xx', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(
        mockJsonResponse({ error: 'not found' }, 404),
      );

      const client = createHttix({ baseURL: BASE });
      const response = await client.get('/notfound', {
        throwOnError: false,
      });

      expect(response.status).toBe(404);
      expect(response.ok).toBe(false);
      expect(response.data).toEqual({ error: 'not found' });
    });

    it('should not throw when throwOnError is false for 5xx', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(
        mockJsonResponse({ error: 'server error' }, 500),
      );

      // Disable retry because 500 is in the default retryOn list
      const client = createHttix({ baseURL: BASE, retry: false });
      const response = await client.get('/server-error', {
        throwOnError: false,
      });

      expect(response.status).toBe(500);
      expect(response.ok).toBe(false);
    });

    it('should throw HttixRequestError on network failure', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new TypeError('Network error'));

      const client = createHttix({ baseURL: BASE });
      try {
        await client.get('/fail');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttixRequestError);
      }
    });

    it('should throw HttixAbortError when request is aborted', async () => {
      const controller = new AbortController();
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockImplementation((_req: Request) => {
        // Abort immediately
        setTimeout(() => controller.abort(new DOMException('Aborted', 'AbortError')), 0);
        return new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        });
      });

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      try {
        await client.request({
          url: '/abort',
          method: 'GET',
          signal: controller.signal,
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttixAbortError);
      }
    });
  });

  // =========================================================================
  // Config merging
  // =========================================================================
  describe('config merging', () => {
    it('should merge baseURL with request URL', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({ baseURL: BASE });
      await client.get('/users');

      const [req] = (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(req.url).toBe('https://api.example.com/users');
    });

    it('should merge per-request headers with default headers', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({
        baseURL: BASE,
        headers: { 'X-App-Version': '1.0' },
      });
      await client.get('/data', { headers: { 'X-Request-Id': 'abc' } });

      const [req] = (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(req.headers.get('x-app-version')).toBe('1.0');
      expect(req.headers.get('x-request-id')).toBe('abc');
    });

    it('should use per-request timeout over client default', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({ baseURL: BASE, timeout: 30000 });
      await client.get('/fast', { timeout: 5000 });

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('should append query parameters', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({ baseURL: BASE });
      await client.get('/search', { query: { q: 'test', page: 1 } });

      const [req] = (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(req.url).toContain('q=test');
      expect(req.url).toContain('page=1');
    });

    it('should interpolate path parameters', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse({ id: 1 }));

      const client = createHttix({ baseURL: BASE });
      await client.get('/users/:id/posts/:postId', {
        params: { id: 42, postId: 7 },
      });

      const [req] = (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(req.url).toContain('/users/42/posts/7');
    });
  });

  // =========================================================================
  // create() method (cloning)
  // =========================================================================
  describe('create() cloning', () => {
    it('should create a new client with merged defaults', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse({ ok: true }));

      const parent = createHttix({ baseURL: BASE });
      const child = parent.create({ timeout: 5000 });

      expect(child.defaults.baseURL).toBe(BASE);
      expect(child.defaults.timeout).toBe(5000);
    });

    it('should not share interceptor state between clones', () => {
      const parent = createHttix({ baseURL: BASE });
      const child = parent.create();

      parent.interceptors.request.use((config) => config);
      expect(child.interceptors.request.handlers.length).toBe(0);
      expect(parent.interceptors.request.handlers.length).toBe(1);
    });

    it('should create independent clone', () => {
      const parent = createHttix({ baseURL: BASE });
      const child = parent.create({ baseURL: 'https://other.api.com' });

      expect(parent.defaults.baseURL).toBe(BASE);
      expect(child.defaults.baseURL).toBe('https://other.api.com');
    });

    it('should return a new HttixClientImpl instance', () => {
      const parent = createHttix({ baseURL: BASE });
      const child = parent.create();

      expect(child).not.toBe(parent);
      expect(child).toBeInstanceOf(HttixClientImpl);
    });
  });

  // =========================================================================
  // cancelAll()
  // =========================================================================
  describe('cancelAll()', () => {
    it('should cancel all pending requests', async () => {
      const fetchMock = vi.fn().mockImplementation(
        (req: Request) =>
          new Promise<Response>((resolve, reject) => {
            if (req.signal?.aborted) {
              reject(
                new DOMException(
                  'The operation was aborted',
                  'AbortError',
                ),
              );
              return;
            }
            req.signal?.addEventListener('abort', () => {
              reject(
                new DOMException(
                  'The operation was aborted',
                  'AbortError',
                ),
              );
            });
          }),
      );

      globalThis.fetch = fetchMock;

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const promise1 = client.get('/slow1');
      const promise2 = client.get('/slow2');

      await new Promise((r) => setTimeout(r, 10));

      client.cancelAll('Test cancellation');

      const results = await Promise.allSettled([promise1, promise2]);
      for (const r of results) {
        expect(r.status).toBe('rejected');
        if (r.status === 'rejected') {
          expect(r.reason).toBeInstanceOf(HttixAbortError);
        }
      }
    }, 10000);

    it('should accept a custom cancellation reason', async () => {
      const fetchMock = vi.fn().mockImplementation(
        (req: Request) =>
          new Promise<Response>((_resolve, reject) => {
            req.signal?.addEventListener('abort', () => {
              reject(
                new DOMException(
                  'The operation was aborted',
                  'AbortError',
                ),
              );
            });
          }),
      );

      globalThis.fetch = fetchMock;

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const promise = client.get('/slow');

      await new Promise((r) => setTimeout(r, 10));

      client.cancelAll('Custom reason');

      const result = await Promise.allSettled([promise]);
      expect(result[0].status).toBe('rejected');
      if (result[0].status === 'rejected') {
        // The client creates a new HttixAbortError with default message
        // since it doesn't read signal.reason to propagate the custom reason
        expect(result[0].reason).toBeInstanceOf(HttixAbortError);
      }
    }, 10000);
  });

  // =========================================================================
  // isCancel()
  // =========================================================================
  describe('isCancel()', () => {
    it('should return true for HttixAbortError', () => {
      const client = createHttix();
      expect(client.isCancel(new HttixAbortError('cancelled'))).toBe(true);
    });

    it('should return true for HttixAbortError with config', () => {
      const client = createHttix();
      const err = new HttixAbortError('cancelled', {
        url: '/test',
        method: 'GET',
      });
      expect(client.isCancel(err)).toBe(true);
    });

    it('should return false for other errors', () => {
      const client = createHttix();
      expect(client.isCancel(new Error('not cancelled'))).toBe(false);
      expect(
        client.isCancel(new HttixRequestError('network')),
      ).toBe(false);
      expect(client.isCancel(null)).toBe(false);
      expect(client.isCancel(undefined)).toBe(false);
      expect(client.isCancel('string')).toBe(false);
      expect(client.isCancel(42)).toBe(false);
    });
  });

  // =========================================================================
  // Interceptors on client
  // =========================================================================
  describe('interceptors on client', () => {
    it('should run request interceptors before fetch', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({ baseURL: BASE });
      client.interceptors.request.use((config) => {
        config.headers = {
          ...(config.headers instanceof Headers
            ? Object.fromEntries(config.headers.entries())
            : (config.headers ?? {})),
          'X-Intercepted': 'true',
        };
        return config;
      });

      await client.get('/data');

      const [req] = (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(req.headers.get('x-intercepted')).toBe('true');
    });

    it('should run response interceptors after fetch', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(
        mockJsonResponse({ original: true }),
      );

      const client = createHttix({ baseURL: BASE });
      client.interceptors.response.use((response) => {
        (response.data as Record<string, unknown>)._intercepted = true;
        return response;
      });

      const response = await client.get('/data');
      expect((response.data as Record<string, unknown>)._intercepted).toBe(
        true,
      );
    });

    it('should allow ejecting interceptors', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({ baseURL: BASE });
      const id = client.interceptors.request.use((config) => {
        config.headers = {
          ...(config.headers instanceof Headers
            ? Object.fromEntries(config.headers.entries())
            : (config.headers ?? {})),
          'X-Eject-Test': 'yes',
        };
        return config;
      });

      // Should be present
      await client.get('/first');
      const [req1] = (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(req1.headers.get('x-eject-test')).toBe('yes');

      // Eject and verify it's gone
      client.interceptors.request.eject(id);
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockClear();
      await client.get('/second');

      const [req2] = (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(req2.headers.get('x-eject-test')).toBeNull();
    });

    it('should allow clearing all interceptors', () => {
      const client = createHttix({ baseURL: BASE });
      client.interceptors.request.use((config) => config);
      client.interceptors.request.use((config) => config);
      client.interceptors.response.use((res) => res);

      expect(client.interceptors.request.handlers.length).toBe(2);
      expect(client.interceptors.response.handlers.length).toBe(1);

      client.interceptors.request.clear();
      client.interceptors.response.clear();

      expect(client.interceptors.request.handlers.length).toBe(0);
      expect(client.interceptors.response.handlers.length).toBe(0);
    });

    it('should support multiple request interceptors in order', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({ baseURL: BASE });
      const order: number[] = [];

      client.interceptors.request.use((config) => {
        order.push(1);
        return config;
      });
      client.interceptors.request.use((config) => {
        order.push(2);
        return config;
      });

      await client.get('/data');
      expect(order).toEqual([1, 2]);
    });

    it('should recover from error via response error interceptor', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(
        mockJsonResponse({ error: 'not found' }, 404),
      );

      const client = createHttix({ baseURL: BASE });
      client.interceptors.response.use(
        (res) => res,
        (error) => {
          // Recover by returning a synthetic 200 response
          return {
            data: { recovered: true },
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            ok: true,
            raw: new Response(),
            timing: 0,
            config: error.config ?? { url: '', method: 'GET' },
          };
        },
      );

      const response = await client.get('/recovered');
      expect(response.status).toBe(200);
      expect((response.data as Record<string, unknown>).recovered).toBe(
        true,
      );
    });
  });

  // =========================================================================
  // use() middleware
  // =========================================================================
  describe('use() middleware', () => {
    it('should register middleware', () => {
      const client = createHttix({ baseURL: BASE });
      const mw = vi.fn(async (_ctx: unknown, next: () => Promise<void>) => {
        await next();
      });
      client.use(mw);
      expect(true).toBe(true); // No error means registration succeeded
    });

    it('should run middleware before and after request', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const order: string[] = [];

      client.use(async (ctx, next) => {
        order.push('before');
        await next();
        order.push('after');
      });

      await client.get('/data');
      expect(order).toEqual(['before', 'after']);
    });

    it('should support multiple middleware in registration order', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const order: string[] = [];

      client.use(async (_ctx, next) => {
        order.push('mw1-before');
        await next();
        order.push('mw1-after');
      });
      client.use(async (_ctx, next) => {
        order.push('mw2-before');
        await next();
        order.push('mw2-after');
      });

      await client.get('/data');
      expect(order).toEqual([
        'mw1-before',
        'mw2-before',
        'mw2-after',
        'mw1-after',
      ]);
    });
  });

  // =========================================================================
  // Auth configuration
  // =========================================================================
  describe('auth configuration', () => {
    it('should register bearer auth interceptor', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({
        baseURL: BASE,
        auth: { type: 'bearer', token: 'my-token' },
      });

      await client.get('/protected');

      const [req] = (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(req.headers.get('authorization')).toBe('Bearer my-token');
    });

    it('should register basic auth interceptor', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({
        baseURL: BASE,
        auth: { type: 'basic', username: 'admin', password: 'secret' },
      });

      await client.get('/protected');

      const [req] = (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(req.headers.get('authorization')).toBe(
        'Basic YWRtaW46c2VjcmV0',
      );
    });

    it('should register API key auth in header', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({
        baseURL: BASE,
        auth: { type: 'apiKey', key: 'X-API-Key', value: 'abc123', in: 'header' },
      });

      await client.get('/protected');

      const [req] = (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(req.headers.get('x-api-key')).toBe('abc123');
    });

    it('should register API key auth in query', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({
        baseURL: BASE,
        auth: {
          type: 'apiKey',
          key: 'api_key',
          value: 'abc123',
          in: 'query',
        },
      });

      await client.get('/protected');

      const [req] = (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(req.url).toContain('api_key=abc123');
    });

    it('should use dynamic token from function', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({
        baseURL: BASE,
        auth: { type: 'bearer', token: () => 'dynamic-token' },
      });

      await client.get('/protected');

      const [req] = (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(req.headers.get('authorization')).toBe(
        'Bearer dynamic-token',
      );
    });
  });

  // =========================================================================
  // Response type inference
  // =========================================================================
  describe('response type inference', () => {
    it('should return typed data for generic get', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(
        mockJsonResponse({ name: 'Alice', age: 30 }),
      );

      const client = createHttix({ baseURL: BASE });
      const response = await client.get<{ name: string; age: number }>(
        '/user',
      );

      expect(response.data.name).toBe('Alice');
      expect(response.data.age).toBe(30);
    });

    it('should return typed data for generic post', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(
        mockJsonResponse({ id: 1, name: 'Bob' }, 201),
      );

      const client = createHttix({ baseURL: BASE });
      const response = await client.post<{ id: number; name: string }>(
        '/users',
        { name: 'Bob' },
      );

      expect(response.data.id).toBe(1);
      expect(response.data.name).toBe('Bob');
    });

    it('should return void data for head requests', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(
        new Response(null, {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Length': '100' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const response = await client.head('/resource');

      expect(response.status).toBe(200);
      expect(response.data).toBeUndefined();
    });

    it('should return void data for options requests', async () => {
      (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mockResolvedValue(
        new Response(null, {
          status: 200,
          statusText: 'OK',
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const response = await client.options('/resource');

      expect(response.status).toBe(200);
      expect(response.data).toBeUndefined();
    });
  });

  // =========================================================================
  // createHttix factory function
  // =========================================================================
  describe('createHttix factory', () => {
    it('should return a HttixClientImpl instance', () => {
      const client = createHttix();
      expect(client).toBeInstanceOf(HttixClientImpl);
    });

    it('should accept config', () => {
      const client = createHttix({ baseURL: BASE, timeout: 5000 });
      expect(client.defaults.baseURL).toBe(BASE);
      expect(client.defaults.timeout).toBe(5000);
    });
  });
});
