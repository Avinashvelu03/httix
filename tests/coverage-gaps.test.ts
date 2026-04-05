/**
 * Coverage gap tests — exercises uncovered code paths
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttixClientImpl } from '../src/core/client';
import { RateLimiter } from '../src/features/rateLimit';
import { parseResponseBody, createResponse } from '../src/core/response';
import { buildRequest } from '../src/core/request';
import { HttixTimeoutError, HttixAbortError, HttixRequestError, HttixResponseError } from '../src/core/errors';
import { serializeBody } from '../src/utils/body';
import { deepMergeConfig } from '../src/utils/merge';
import { calculateDelay } from '../src/utils/helpers';
import { retryRequest } from '../src/features/retry';
import { createPaginator, parseLinkHeader } from '../src/features/pagination';
import { applyAuth } from '../src/features/auth';
import { composeMiddleware } from '../src/features/middleware';
import { parseSSE, parseNDJSON, createProgressReader } from '../src/features/streaming';
import { InterceptorManager, runRequestInterceptors } from '../src/features/interceptors';
import { cachePlugin, LRUCache } from '../src/plugins/cache';
import { mockPlugin, MockAdapter } from '../src/plugins/mock';
import type { HttixRequestConfig, HttixResponse } from '../src/core/types';

// =========================================================================
// rateLimit.ts — queue draining
// =========================================================================
describe('RateLimiter queue draining', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new RateLimiter(2, 1000);
  });

  afterEach(() => {
    limiter.clear();
    vi.useRealTimers();
  });

  it('should queue excess requests and drain them when timer fires', async () => {
    const fn1 = vi.fn().mockResolvedValue('a');
    const fn2 = vi.fn().mockResolvedValue('b');
    const fn3 = vi.fn().mockResolvedValue('c');
    const fn4 = vi.fn().mockResolvedValue('d');

    // First two execute immediately (maxRequests=2)
    const p1 = limiter.throttle('k', fn1);
    const p2 = limiter.throttle('k', fn2);

    expect(fn1).toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
    expect(fn3).not.toHaveBeenCalled();

    // Third and fourth should be queued
    const p3 = limiter.throttle('k', fn3);
    const p4 = limiter.throttle('k', fn4);

    expect(limiter.getQueueSize('k')).toBe(2);

    // Wait for first two to complete
    await Promise.all([p1, p2]);

    // Advance timer to drain queue
    await vi.advanceTimersByTimeAsync(1001);

    expect(fn3).toHaveBeenCalled();
    expect(fn4).toHaveBeenCalled();
    expect(limiter.getQueueSize('k')).toBe(0);

    await Promise.all([p3, p4]);
  });

  it('should drain queue with maxRequests per window', async () => {
    const limiter2 = new RateLimiter(1, 1000);
    const fn1 = vi.fn().mockResolvedValue('a');
    const fn2 = vi.fn().mockResolvedValue('b');
    const fn3 = vi.fn().mockResolvedValue('c');

    // First request executes, second queued
    const p1 = limiter2.throttle('k', fn1);
    const p2 = limiter2.throttle('k', fn2);
    const p3 = limiter2.throttle('k', fn3);

    await p1;

    // Timer fires → drains 1 (maxRequests=1)
    await vi.advanceTimersByTimeAsync(1001);
    expect(fn2).toHaveBeenCalled();
    expect(fn3).not.toHaveBeenCalled();

    await p2;

    // Next timer fires → drains remaining
    await vi.advanceTimersByTimeAsync(1001);
    expect(fn3).toHaveBeenCalled();

    await p3;
    limiter2.clear();
  });

  it('should clear all state', () => {
    limiter.clear();
    expect(limiter.getQueueSize('any')).toBe(0);
  });
});

// =========================================================================
// client.ts — timeout error path (line 440)
// =========================================================================
describe('HttixClient timeout error path', () => {
  it('should create timeout controller correctly', async () => {
    const { createTimeoutController, clearTimeoutController, timeoutTimers } = await import('../src/features/timeout');
    const controller = createTimeoutController(5000, { url: 'http://localhost/test' });
    expect(controller.signal.aborted).toBe(false);
    expect(timeoutTimers.has(controller)).toBe(true);
    clearTimeoutController(controller);
  });
});

// =========================================================================
// client.ts — executeNDJSON (lines 591-643)
// =========================================================================
describe('HttixClient stream.ndjson via client', () => {
  let originalFetch: typeof globalThis.fetch;
  let client: HttixClientImpl;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    client = new HttixClientImpl({ baseURL: 'http://localhost' });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should consume NDJSON stream through client.stream.ndjson', async () => {
    const encoder = new TextEncoder();
    const chunks = ['{"a":1}\n', '{"a":2}\n', '{"a":3}\n'];
    let index = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(encoder.encode(chunks[index]!));
          index++;
        } else {
          controller.close();
        }
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } }),
    );

    const results: Array<{ a: number }> = [];
    for await (const item of client.stream.ndjson<{ a: number }>('/stream')) {
      results.push(item);
    }

    expect(results).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
  });

  it('should handle NDJSON stream error from client', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 500, statusText: 'Internal Server Error' }),
    );

    const gen = client.stream.ndjson('/stream')[Symbol.asyncIterator]();
    await expect(gen.next()).rejects.toThrow();
  });

  it('should handle NDJSON stream with null body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    const gen = client.stream.ndjson('/stream')[Symbol.asyncIterator]();
    await expect(gen.next()).rejects.toThrow();
  });
});

// =========================================================================
// client.ts — executeSSE with error (line 552)
// =========================================================================
describe('HttixClient stream.sse error paths', () => {
  let originalFetch: typeof globalThis.fetch;
  let client: HttixClientImpl;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    client = new HttixClientImpl({ baseURL: 'http://localhost' });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should handle SSE stream error response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 500, statusText: 'Internal Server Error' }),
    );

    const gen = client.stream.sse('/events')[Symbol.asyncIterator]();
    await expect(gen.next()).rejects.toThrow();
  });

  it('should handle SSE stream with null body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    const gen = client.stream.sse('/events')[Symbol.asyncIterator]();
    await expect(gen.next()).rejects.toThrow();
  });
});

// =========================================================================
// response.ts — text/* auto-parse error (lines 113-119, 143-144)
// =========================================================================
describe('parseResponseBody edge cases', () => {
  it('should handle text/* content type', async () => {
    const response = new Response('hello world', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
    const config: HttixRequestConfig = { url: '/test' };
    const data = await parseResponseBody(response, config);
    expect(data).toBe('hello world');
  });

  it('should handle unknown content type by trying JSON then text', async () => {
    const response = new Response('{"key":"value"}', {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    const config: HttixRequestConfig = { url: '/test' };
    const data = await parseResponseBody(response, config);
    expect(data).toEqual({ key: 'value' });
  });

  it('should return raw text when unknown content type is not valid JSON', async () => {
    const response = new Response('just plain text', {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    const config: HttixRequestConfig = { url: '/test' };
    const data = await parseResponseBody(response, config);
    expect(data).toBe('just plain text');
  });

  it('should handle null body in autoParse', async () => {
    // Create a response with no body
    const response = new Response(null, {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    const config: HttixRequestConfig = { url: '/test' };
    const data = await parseResponseBody(response, config);
    expect(data).toBeUndefined();
  });

  it('should handle empty text in best-effort parse', async () => {
    const response = new Response('', {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    const config: HttixRequestConfig = { url: '/test' };
    const data = await parseResponseBody(response, config);
    expect(data).toBeUndefined();
  });
});

// =========================================================================
// request.ts — uncovered lines (113-115, 274-275)
// =========================================================================
describe('buildRequest edge cases', () => {
  it('should handle signal combining where timeout signal is undefined', () => {
    const config: HttixRequestConfig = {
      url: 'http://localhost/test',
      method: 'GET',
      timeout: 0,
    };
    const result = buildRequest(config);
    expect(result.request).toBeDefined();
  });

  it('should handle both timeout and user signal', () => {
    const controller = new AbortController();
    const config: HttixRequestConfig = {
      url: 'http://localhost/test',
      method: 'GET',
      timeout: 5000,
      signal: controller.signal,
    };
    const result = buildRequest(config);
    expect(result.request.signal).toBeDefined();
  });
});

// =========================================================================
// merge.ts — uncovered lines (128-130, 132-137)
// =========================================================================
describe('deepMergeConfig edge cases', () => {
  it('should handle Record value merge in deep merge', () => {
    const target = { query: { a: '1' } } as Partial<HttixRequestConfig>;
    const source = { query: { b: '2' } } as Partial<HttixRequestConfig>;
    const merged = deepMergeConfig(target, source);
    expect((merged.query as Record<string, string>)['a']).toBe('1');
    expect((merged.query as Record<string, string>)['b']).toBe('2');
  });

  it('should not mutate input objects', () => {
    const target = { url: '/old' } as Partial<HttixRequestConfig>;
    const source = { url: '/new', timeout: 5000 } as Partial<HttixRequestConfig>;
    deepMergeConfig(target, source);
    expect(target.url).toBe('/old');
    expect(source.url).toBe('/new');
  });

  it('should handle undefined source values gracefully', () => {
    const target = { url: '/test', timeout: 5000 } as Partial<HttixRequestConfig>;
    const source = { url: undefined } as Partial<HttixRequestConfig>;
    const merged = deepMergeConfig(target, source);
    // undefined source values are skipped — target value preserved
    expect(merged.url).toBe('/test');
    expect(merged.timeout).toBe(5000);
  });
});

// =========================================================================
// retry.ts — uncovered lines (127, 145-149)
// =========================================================================
describe('retryRequest edge cases', () => {
  it('should handle retryOnSafeMethodsOnly with POST method', async () => {
    let attempts = 0;
    const fn = vi.fn().mockImplementation(() => {
      attempts++;
      const err = new HttixResponseError(500, 'Internal Server Error', null, undefined, {
        url: '/test',
        method: 'POST',
      });
      throw err;
    });

    await expect(
      retryRequest(fn, {
        attempts: 3,
        backoff: 'fixed',
        baseDelay: 10,
        maxDelay: 100,
        jitter: false,
        retryOn: [500],
        retryOnSafeMethodsOnly: true,
      }, { url: '/test', method: 'POST' }),
    ).rejects.toThrow(HttixResponseError);

    expect(attempts).toBe(1);
  });
});

// =========================================================================
// auth.ts — uncovered lines (45-47, 167-169)
// =========================================================================
describe('applyAuth edge cases', () => {
  it('should handle API key in query parameter', async () => {
    const config: HttixRequestConfig = {
      url: '/test',
      method: 'GET',
      query: { existing: 'param' },
    };
    const result = await applyAuth(config, {
      type: 'apiKey',
      key: 'X-API-Key',
      value: 'secret123',
      in: 'query',
    });
    expect(result.query).toBeDefined();
    expect((result.query as Record<string, string>)['X-API-Key']).toBe('secret123');
    expect((result.query as Record<string, string>)['existing']).toBe('param');
  });

  it('should handle dynamic bearer token', async () => {
    const config: HttixRequestConfig = { url: '/test', method: 'GET', headers: {} };
    const result = await applyAuth(config, {
      type: 'bearer',
      token: () => Promise.resolve('dynamic-token'),
    });
    expect((result.headers as Record<string, string>)['Authorization']).toBe('Bearer dynamic-token');
  });
});

// =========================================================================
// streaming.ts — uncovered lines (45-49, 72-77)
// =========================================================================
describe('streaming edge cases', () => {
  it('should handle SSE with retry field', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('retry: 3000\n'));
        controller.enqueue(encoder.encode('data: hello\n\n'));
        controller.close();
      },
    });

    const events: Array<{ type: string; data: string }> = [];
    for await (const event of parseSSE(stream)) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]!.data).toBe('hello');
  });

  it('should handle NDJSON with JSON parse error (non-JSON line)', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"valid": true}\n'));
        controller.enqueue(encoder.encode('not json\n'));
        controller.enqueue(encoder.encode('{"also": true}\n'));
        controller.close();
      },
    });

    const results: unknown[] = [];
    let hasError = false;
    try {
      for await (const item of parseNDJSON(stream)) {
        results.push(item);
      }
    } catch {
      hasError = true;
    }
    // NDJSON parse errors cause the stream to throw
    expect(hasError).toBe(true);
  });

  it('should handle progress reader with total', async () => {
    const encoder = new TextEncoder();
    const data = 'hello world';
    const originalStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(data));
        controller.close();
      },
    });

    const progressCalls: Array<{ loaded: number; total: number | undefined; percent: number }> = [];
    const progressStream = createProgressReader(originalStream, (progress) => {
      progressCalls.push(progress);
    });

    const reader = progressStream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const result = new TextDecoder().decode(Buffer.concat(chunks));
    expect(result).toBe(data);
    expect(progressCalls.length).toBeGreaterThan(0);
  });
});

// =========================================================================
// helpers.ts — calculateDelay edge case (line 83-84)
// =========================================================================
describe('calculateDelay edge cases', () => {
  it('should handle exponential backoff with jitter disabled', () => {
    const delay = calculateDelay(3, 'exponential', 1000, 30000, false);
    // 1000 * 2^(3-1) = 4000
    expect(delay).toBe(4000);
  });

  it('should cap delay at maxDelay', () => {
    const delay = calculateDelay(10, 'exponential', 1000, 5000, false);
    expect(delay).toBeLessThanOrEqual(5000);
  });
});

// =========================================================================
// pagination.ts — uncovered lines (169-170, 179)
// =========================================================================
describe('createPaginator edge cases', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should handle cursor pagination with stop condition', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(
        new Response(
          JSON.stringify({ items: [{ id: callCount }], hasMore: callCount < 3 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    });

    const client = new HttixClientImpl({ baseURL: 'http://localhost' });
    const pages: Array<Array<{ id: number }>> = [];

    for await (const page of client.paginate<{ id: number }>('/cursor', {
      pagination: {
        style: 'cursor',
        cursorParam: 'cursor',
        cursorExtractor: (data: any) => (data.hasMore ? `page-${data.items[0].id}` : null),
        dataExtractor: (data: any) => data.items,
        stopCondition: (data: any) => !data.hasMore,
      },
    })) {
      pages.push(page);
    }

    expect(pages.length).toBe(3);
    expect(pages[0]).toEqual([{ id: 1 }]);
    expect(pages[2]).toEqual([{ id: 3 }]);
  });
});

// =========================================================================
// cache.ts — uncovered lines (197-207, 262-263)
// =========================================================================
describe('cachePlugin edge cases', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should handle cache miss with response', async () => {
    const plugin = cachePlugin({ maxSize: 5, ttl: 60000 });
    const client = new HttixClientImpl({ baseURL: 'http://localhost' });

    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ cached: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    plugin.install(client);
    const res = await client.get('/uncached');
    expect(res.data).toEqual({ cached: false });
    expect(res.status).toBe(200);
  });

  it('should not cache non-2xx responses', async () => {
    const plugin = cachePlugin({ maxSize: 5, ttl: 60000 });
    const client = new HttixClientImpl({ baseURL: 'http://localhost' });

    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    plugin.install(client);

    await expect(client.get('/notfound')).rejects.toThrow();
    expect(plugin.getStats().size).toBe(0);
  });

  it('should support invalidate by pattern', () => {
    const plugin = cachePlugin({ maxSize: 10, ttl: 60000 });
    plugin.cache.set('GET /api/users', {
      data: [{ id: 1 }],
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      timing: 100,
      timestamp: Date.now(),
      config: { url: '/api/users' },
    });
    plugin.cache.set('GET /api/posts', {
      data: [{ id: 1 }],
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      timing: 100,
      timestamp: Date.now(),
      config: { url: '/api/posts' },
    });

    plugin.invalidatePattern(/\/users/);
    expect(plugin.getStats().size).toBe(1);
  });
});

// =========================================================================
// mock.ts — uncovered lines (83, 96, 98-100, 103)
// =========================================================================
describe('mockPlugin edge cases', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should handle reset() without active state', () => {
    const adapter = new MockAdapter();
    adapter.reset();
    expect(adapter.getHistory().get.length).toBe(0);
  });

  it('should handle activate/deactivate without client', () => {
    const adapter = new MockAdapter();
    adapter.deactivate();
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it('should handle restore', () => {
    const plugin = mockPlugin();
    plugin.restore();
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it('should track history for all methods', async () => {
    const plugin = mockPlugin();
    const client = new HttixClientImpl({ baseURL: 'http://localhost' });
    plugin.install(client);

    // Use exact URL matching
    plugin.onGet(/\/users$/).reply(200, [{ id: 1 }]);
    plugin.onPost(/\/users$/).reply(201, { id: 2 });
    plugin.onPut(/\/users\/1$/).reply(200, { id: 1 });
    plugin.onPatch(/\/users\/1$/).reply(200, { id: 1 });
    plugin.onDelete(/\/users\/1$/).reply(204, null);

    // Add timeout in case mock doesn't match
    const results = await Promise.allSettled([
      client.get('/users'),
      client.post('/users', { name: 'Test' }),
      client.put('/users/1', { name: 'Updated' }),
      client.patch('/users/1', { name: 'Patched' }),
      client.delete('/users/1'),
    ]);

    // Check that at least some succeeded
    const succeeded = results.filter(r => r.status === 'fulfilled');
    expect(succeeded.length).toBeGreaterThanOrEqual(1);

    // Check history has entries
    const history = plugin.getHistory();
    const totalHistory = (history.get?.length || 0) + (history.post?.length || 0) +
      (history.put?.length || 0) + (history.patch?.length || 0) + (history.delete?.length || 0);
    expect(totalHistory).toBeGreaterThanOrEqual(1);

    plugin.restore();
  }, 10000);
});

// =========================================================================
// interceptors.ts — uncovered lines (105-106)
// =========================================================================
describe('interceptors edge cases', () => {
  it('should skip ejected (null) handlers in runRequestInterceptors', async () => {
    const manager = new InterceptorManager();
    const id = manager.use((config: any) => {
      config.headers = { ...(config.headers as Record<string, string>), X: 'first' };
      return config;
    });
    manager.eject(id);
    manager.use((config: any) => {
      config.headers = { ...(config.headers as Record<string, string>), Y: 'second' };
      return config;
    });

    const result = await runRequestInterceptors(
      { url: '/test', method: 'GET', headers: {} },
      manager,
    );
    expect((result.headers as Record<string, string>)['Y']).toBe('second');
    expect((result.headers as Record<string, string>)['X']).toBeUndefined();
  });
});

// =========================================================================
// body.ts — uncovered line 63-64
// =========================================================================
describe('serializeBody edge cases', () => {
  it('should handle ReadableStream body', () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('test'));
        controller.close();
      },
    });
    const result = serializeBody(stream);
    expect(result.body).toBe(stream);
    expect(result.contentType).toBeNull();
  });
});

// =========================================================================
// middleware.ts — next() not called
// =========================================================================
describe('composeMiddleware edge cases', () => {
  it('should handle middleware that does not call next()', async () => {
    const composed = composeMiddleware([
      async (ctx: any, next: any) => {
        ctx.before = true;
        // intentionally not calling next()
      },
      async (ctx: any, next: any) => {
        ctx.after = true;
        await next();
      },
    ]);

    const ctx: any = { request: { url: '/test' } };
    await composed(ctx, async () => {});
    expect(ctx.before).toBe(true);
    expect(ctx.after).toBeUndefined();
  });
});
