/**
 * coverage-final.test.ts — Surgical tests for every remaining branch/line gap.
 *
 * Gaps targeted (per the last coverage run):
 *   core/client.ts        lines 377-378  isDedupEnabled() → false
 *   core/client.ts        lines 390-391  generateDedupKey() with custom key fn
 *   core/request.ts       line  156      URL already has '?' → append '&'
 *   features/interceptors line  93       null handler in runResponseInterceptors
 *   features/interceptors line  127      null handler in runResponseErrorInterceptors
 *   features/pagination   line  39       parseLinkHeader — link part with no rel=""
 *   features/pagination   line  134      paginate without dataExtractor (else branch)
 *   features/pagination   line  184      link header exists but has no 'next' rel
 *   plugins/cache         lines 129,138  defaultKeyGenerator — falsy baseURL / method
 *   plugins/cache         line  180      request interceptor — falsy method → || 'GET'
 *   plugins/cache         line  229      response interceptor — falsy method → || 'GET'
 *   plugins/logger        line  72       plain-object headers branch
 *   plugins/mock          line  80       URL instance input to mockFetch
 *   plugins/mock          line  100      plain object headers in RequestInit
 *   utils/merge           lines 114-115  deepMergePlainObjects — undefined source value
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttixClientImpl } from '../src/core/client';
import { buildRequest } from '../src/core/request';
import { retryRequest } from '../src/features/retry';
import { parseLinkHeader } from '../src/features/pagination';
import {
  InterceptorManager,
  runResponseInterceptors,
  runResponseErrorInterceptors,
} from '../src/features/interceptors';
import { cachePlugin } from '../src/plugins/cache';
import { MockAdapter, mockPlugin } from '../src/plugins/mock';
import { loggerPlugin } from '../src/plugins/logger';
import { deepMergeConfig } from '../src/utils/merge';
import { HttixResponseError } from '../src/core/errors';
import type { HttixRequestConfig, HttixResponse } from '../src/core/types';

// =========================================================================
// core/client.ts — isDedupEnabled() → false  (lines 377-378)
// =========================================================================
describe('HttixClientImpl.isDedupEnabled — false branch', () => {
  it('returns false when dedupConfig is false (accessed via private cast)', () => {
    // Create a client with dedup enabled so the deduplicator is initialised
    const client = new HttixClientImpl({
      baseURL: 'http://localhost',
      dedup: true,
    });
    // Manually flip dedupConfig to false to exercise the unreachable-in-practice branch
    (client as unknown as Record<string, unknown>)['dedupConfig'] = false;
    const result = (
      client as unknown as { isDedupEnabled: () => boolean }
    ).isDedupEnabled();
    expect(result).toBe(false);
  });

  it('returns false when dedupConfig is undefined (accessed via private cast)', () => {
    const client = new HttixClientImpl({
      baseURL: 'http://localhost',
      dedup: true,
    });
    (client as unknown as Record<string, unknown>)['dedupConfig'] = undefined;
    const result = (
      client as unknown as { isDedupEnabled: () => boolean }
    ).isDedupEnabled();
    expect(result).toBe(false);
  });
});

// =========================================================================
// core/client.ts — generateDedupKey() with custom key fn  (lines 390-391)
// =========================================================================
describe('HttixClientImpl.generateDedupKey — custom generateKey', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('uses a custom generateKey function from DedupConfig', async () => {
    const customKeyFn = vi.fn((c: HttixRequestConfig) => `custom:${c.url}`);
    const client = new HttixClientImpl({
      baseURL: 'http://localhost',
      dedup: { enabled: true, generateKey: customKeyFn },
    });

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await client.get('/dedup-custom-key');
    expect(customKeyFn).toHaveBeenCalled();
  });
});

// =========================================================================
// core/request.ts — URL already has '?'  (line 156)
// =========================================================================
describe('buildRequest — URL with existing query string', () => {
  it('appends query params with "&" when URL already contains "?"', () => {
    const config: HttixRequestConfig = {
      url: 'http://localhost/test?existing=1',
      method: 'GET',
      query: { foo: 'bar' },
    };
    const { request } = buildRequest(config);
    expect(request.url).toContain('existing=1');
    expect(request.url).toContain('foo=bar');
    // '&' separator used, not a second '?'
    expect(request.url).not.toMatch(/\?.*\?/);
  });
});

// =========================================================================
// features/interceptors.ts — null handler skip in runResponseInterceptors
// (line 93)
// =========================================================================
describe('runResponseInterceptors — ejected (null) handler is skipped', () => {
  it('skips null handlers and continues with remaining handlers', async () => {
    const manager = new InterceptorManager<
      (r: HttixResponse<unknown>) => HttixResponse<unknown>,
      (e: unknown) => void
    >();

    // Add first handler then eject it — it becomes null in the handlers array
    const id = manager.use((r) => {
      (r as Record<string, unknown>)['_firstRan'] = true;
      return r;
    });
    manager.eject(id);

    // Second handler is active
    manager.use((r) => {
      (r as Record<string, unknown>)['_secondRan'] = true;
      return r;
    });

    const fakeResponse = {
      data: null,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      ok: true,
      raw: new Response(),
      timing: 0,
      config: { url: '/test' },
    } as HttixResponse<unknown>;

    const result = await runResponseInterceptors(fakeResponse, manager);
    expect((result as Record<string, unknown>)['_secondRan']).toBe(true);
    expect((result as Record<string, unknown>)['_firstRan']).toBeUndefined();
  });
});

// =========================================================================
// features/interceptors.ts — null handler skip in runResponseErrorInterceptors
// (line 127)
// =========================================================================
describe('runResponseErrorInterceptors — ejected (null) handler is skipped', () => {
  it('skips null response error handler and rethrows when no handler resolves', async () => {
    const manager = new InterceptorManager<
      (r: HttixResponse<unknown>) => HttixResponse<unknown>,
      (e: unknown) => Promise<HttixResponse<unknown>>
    >();

    // Register handler with a rejected handler, then eject it
    const id = manager.use(
      (r) => r,
      async () => {
        return {
          data: 'recovered',
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
          ok: true,
          raw: new Response(),
          timing: 0,
          config: { url: '/test' },
        } as HttixResponse<unknown>;
      },
    );
    manager.eject(id);

    const error = new HttixResponseError(500, 'Server Error', null, undefined, {
      url: '/test',
    });

    // No active handlers → original error should be re-thrown
    await expect(runResponseErrorInterceptors(error, manager)).rejects.toThrow(
      HttixResponseError,
    );
  });
});

// =========================================================================
// features/pagination.ts — parseLinkHeader with no rel attribute  (line 39)
// =========================================================================
describe('parseLinkHeader — link part without rel=""', () => {
  it('skips parts that have a URL but no rel attribute', () => {
    // Has angle brackets (url matches) but no rel="..." → relMatch is null → continue
    const result = parseLinkHeader('<http://example.com/alt>; type="alternate"');
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('skips no-rel parts and keeps valid rel parts in the same header', () => {
    const result = parseLinkHeader(
      '<http://example.com/alt>; type="text/html", <http://example.com/next>; rel="next"',
    );
    expect(result['next']).toBe('http://example.com/next');
    expect(Object.keys(result)).toHaveLength(1);
  });
});

// =========================================================================
// features/pagination.ts — paginate without dataExtractor  (line 134)
// =========================================================================
describe('createPaginator — offset style without dataExtractor', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('uses response.data directly as page array when dataExtractor is absent', async () => {
    let call = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      call++;
      // Second call returns empty array → pagination stops
      const data = call === 1 ? [{ id: 1 }, { id: 2 }] : [];
      return Promise.resolve(
        new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    const client = new HttixClientImpl({ baseURL: 'http://localhost' });
    const pages: Array<Array<{ id: number }>> = [];

    for await (const page of client.paginate<{ id: number }>('/items', {
      pagination: {
        style: 'offset',
        pageSize: 2,
        // No dataExtractor — exercises the else branch (line 134)
      },
    })) {
      pages.push(page);
    }

    expect(pages).toHaveLength(1);
    expect(pages[0]).toEqual([{ id: 1 }, { id: 2 }]);
  });
});

// =========================================================================
// features/pagination.ts — link pagination, no 'next' rel in header (line 184)
// =========================================================================
describe('createPaginator — link style, link header has no next rel', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('stops when Link header exists but contains no next rel', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: 1 }]), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          // Link header present but only has "prev" — no "next"
          Link: '<http://localhost/items?page=0>; rel="prev"',
        },
      }),
    );

    const client = new HttixClientImpl({ baseURL: 'http://localhost' });
    const pages: Array<Array<{ id: number }>> = [];

    for await (const page of client.paginate<{ id: number }>('/items', {
      pagination: {
        style: 'link',
        // No linkExtractor → uses parseLinkHeader (exercises line 184)
      },
    })) {
      pages.push(page);
    }

    // Only one page fetched — no next URL found
    expect(pages).toHaveLength(1);
    expect(pages[0]).toEqual([{ id: 1 }]);
  });
});

// =========================================================================
// plugins/cache.ts — all four || fallback branches
//   line 129  config.baseURL || 'http://localhost'
//   line 138  config.method  || 'GET'
//   line 180  reqConfig.method || 'GET'   (request interceptor)
//   line 229  response.config.method || 'GET'   (response interceptor)
// Strategy: a pre-cache request interceptor strips method + baseURL so that
// the cache interceptors see undefined for both, forcing all four || paths.
// =========================================================================
describe('cachePlugin — || fallback branches for method and baseURL', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('covers method||GET and baseURL||localhost branches in defaultKeyGenerator', async () => {
    const plugin = cachePlugin({ maxSize: 10, ttl: 60_000 });
    const client = new HttixClientImpl({ baseURL: 'http://localhost' });

    // This interceptor runs BEFORE the cache interceptor (added first).
    // It strips method and baseURL so the cache plugin sees undefined for both.
    client.interceptors.request.use((config) => {
      const c = { ...config } as HttixRequestConfig;
      delete (c as Record<string, unknown>)['method'];
      delete (c as Record<string, unknown>)['baseURL'];
      return c;
    });

    // Install cache AFTER — its interceptor is appended and runs second
    plugin.install(client);

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    // First call — cache miss, fetch is executed
    const res1 = await client.get('http://localhost/branch-test');
    expect(res1.status).toBe(200);

    // Second call — cache tags _cacheHit; the response interceptor swaps in cached data.
    // The underlying fetch is still invoked (cache plugin swaps response, not prevents fetch).
    const res2 = await client.get('http://localhost/branch-test');
    expect(res2.status).toBe(200);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
  });

  it('covers baseURL||localhost when client has no explicit baseURL (empty string)', async () => {
    // HttixClientImpl({}) → defaults.baseURL = '' (falsy) → triggers || 'http://localhost'
    const plugin = cachePlugin({ maxSize: 5, ttl: 60_000 });
    const client = new HttixClientImpl({});

    plugin.install(client);

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const res = await client.get('http://localhost/no-base');
    expect(res.status).toBe(200);
  });
});

// =========================================================================
// plugins/logger.ts — plain-object headers branch  (line 72)
// =========================================================================
describe('loggerPlugin — plain object headers', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('logs plain-object headers without calling .entries()', async () => {
    const infoSpy = vi.fn();
    const plugin = loggerPlugin({
      level: 'info',
      logRequestHeaders: true,
      logger: {
        debug: vi.fn(),
        info: infoSpy,
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const client = new HttixClientImpl({ baseURL: 'http://localhost' });

    // Add BEFORE installing logger so this runs first.
    // It replaces the Headers instance with a plain object so the logger
    // sees a plain object and hits the else branch (line 72).
    client.interceptors.request.use((config) => ({
      ...config,
      headers: { 'X-Plain': 'yes', 'Content-Type': 'application/json' },
    }));

    // Install logger AFTER — its request interceptor runs second and
    // therefore sees the plain-object headers set above.
    plugin.install(client);

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await client.get('/logger-plain-headers');

    // Logger should have been called at least once for the request
    expect(infoSpy).toHaveBeenCalled();
    // The logged object should have the plain-object headers
    const loggedObj = infoSpy.mock.calls.find(
      (call) => String(call[0]).includes('Request'),
    )?.[1] as Record<string, unknown>;
    // Verify headers were logged as the plain object (not converted via .entries())
    expect(loggedObj?.['headers']).toMatchObject({ 'X-Plain': 'yes' });
  });
});

// =========================================================================
// plugins/mock.ts — URL instance input to mockFetch  (line 80)
// =========================================================================
describe('MockAdapter — URL instance as fetch input', () => {
  let adapter: MockAdapter;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    adapter = new MockAdapter();
    adapter.activate();
  });

  afterEach(() => {
    adapter.deactivate();
    globalThis.fetch = originalFetch;
  });

  it('resolves the URL via .href when input is a URL instance', async () => {
    adapter.onGet(/\/url-instance/).reply(200, { matched: true });

    // Pass a URL object — exercises the `input instanceof URL ? input.href` branch
    const response = await globalThis.fetch(
      new URL('http://localhost/url-instance'),
      { method: 'GET' },
    );
    expect(response.status).toBe(200);

    const history = adapter.getHistory();
    expect(history.get.length).toBeGreaterThanOrEqual(1);
    expect(history.get[0]?.url).toBe('http://localhost/url-instance');
  });
});

// =========================================================================
// plugins/mock.ts — plain-object headers in RequestInit  (line 100)
// =========================================================================
describe('MockAdapter — plain-object headers in RequestInit', () => {
  let adapter: MockAdapter;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    adapter = new MockAdapter();
    adapter.activate();
  });

  afterEach(() => {
    adapter.deactivate();
    globalThis.fetch = originalFetch;
  });

  it('stores plain-object headers as-is in history entry', async () => {
    adapter.onGet(/\/plain-headers/).reply(200, {});

    // init.headers is a plain Record — exercises the plain-object branch (line 100)
    await globalThis.fetch('http://localhost/plain-headers', {
      method: 'GET',
      headers: { 'X-Custom': 'value', Authorization: 'Bearer tok' },
    });

    const history = adapter.getHistory();
    expect(history.get.length).toBeGreaterThanOrEqual(1);
    const recorded = history.get[0]?.headers as Record<string, string> | undefined;
    expect(recorded?.['X-Custom']).toBe('value');
  });
});

// =========================================================================
// utils/merge.ts — deepMergePlainObjects skips undefined source values
// (lines 113-115 in the private deepMergePlainObjects function)
// =========================================================================
describe('deepMergeConfig — undefined sub-key in nested plain object', () => {
  it('preserves target sub-key when source sub-key is undefined (deepMergePlainObjects)', () => {
    // Both target and source have 'retry' as a plain object → deepMergePlainObjects is called.
    // Inside, 'attempts' on source is explicitly undefined → lines 113-115 hit.
    const target: Partial<HttixRequestConfig> = {
      baseURL: 'http://localhost',
      // Cast to inject a nested plain object that deepMergeConfig will recurse into
      retry: { attempts: 5, baseDelay: 200 } as HttixRequestConfig['retry'],
    };
    const source = {
      retry: { attempts: undefined, maxDelay: 5000 },
    } as unknown as Partial<HttixRequestConfig>;

    const merged = deepMergeConfig(target, source) as Record<string, unknown>;
    const retry = merged['retry'] as Record<string, unknown>;

    // 'attempts' was undefined in source → skipped → retains target value
    expect(retry['attempts']).toBe(5);
    // 'maxDelay' was 5000 in source → overwrites target (target had none)
    expect(retry['maxDelay']).toBe(5000);
    // 'baseDelay' was not in source → retains target value
    expect(retry['baseDelay']).toBe(200);
  });
});
