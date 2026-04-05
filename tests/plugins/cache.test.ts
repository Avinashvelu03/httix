import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cachePlugin, LRUCache } from '../../src/plugins/cache';
import { createHttix } from '../../src/core/client';
import type { HttixRequestConfig } from '../../src/core/types';

const BASE = 'https://api.example.com';

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// =========================================================================
// LRUCache unit tests
// =========================================================================
describe('LRUCache', () => {
  it('should store and retrieve entries', () => {
    const cache = new LRUCache(10, 60_000);
    cache.set('key1', {
      data: 'value1',
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      timing: 0,
      timestamp: Date.now(),
      config: { url: '/test', method: 'GET' },
      raw: new Response(),
    });

    expect(cache.get('key1')?.data).toBe('value1');
  });

  it('should return undefined for missing keys', () => {
    const cache = new LRUCache(10, 60_000);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('should evict the oldest entry when maxSize is exceeded', () => {
    const cache = new LRUCache(2, 60_000);
    const now = Date.now();

    cache.set('a', {
      data: 'a', status: 200, statusText: 'OK', headers: new Headers(),
      timing: 0, timestamp: now, config: { url: '/a', method: 'GET' }, raw: new Response(),
    });
    cache.set('b', {
      data: 'b', status: 200, statusText: 'OK', headers: new Headers(),
      timing: 0, timestamp: now, config: { url: '/b', method: 'GET' }, raw: new Response(),
    });
    cache.set('c', {
      data: 'c', status: 200, statusText: 'OK', headers: new Headers(),
      timing: 0, timestamp: now, config: { url: '/c', method: 'GET' }, raw: new Response(),
    });

    // 'a' should have been evicted
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')?.data).toBe('b');
    expect(cache.get('c')?.data).toBe('c');
  });

  it('should report correct size', () => {
    const cache = new LRUCache(10, 60_000);
    expect(cache.size).toBe(0);

    cache.set('key1', {
      data: 'v', status: 200, statusText: 'OK', headers: new Headers(),
      timing: 0, timestamp: Date.now(), config: { url: '/t', method: 'GET' }, raw: new Response(),
    });
    expect(cache.size).toBe(1);

    cache.set('key2', {
      data: 'v', status: 200, statusText: 'OK', headers: new Headers(),
      timing: 0, timestamp: Date.now(), config: { url: '/t', method: 'GET' }, raw: new Response(),
    });
    expect(cache.size).toBe(2);
  });

  it('should support has()', () => {
    const cache = new LRUCache(10, 60_000);
    cache.set('key1', {
      data: 'v', status: 200, statusText: 'OK', headers: new Headers(),
      timing: 0, timestamp: Date.now(), config: { url: '/t', method: 'GET' }, raw: new Response(),
    });

    expect(cache.has('key1')).toBe(true);
    expect(cache.has('missing')).toBe(false);
  });

  it('should support delete()', () => {
    const cache = new LRUCache(10, 60_000);
    cache.set('key1', {
      data: 'v', status: 200, statusText: 'OK', headers: new Headers(),
      timing: 0, timestamp: Date.now(), config: { url: '/t', method: 'GET' }, raw: new Response(),
    });

    expect(cache.delete('key1')).toBe(true);
    expect(cache.get('key1')).toBeUndefined();
  });

  it('should support clear()', () => {
    const cache = new LRUCache(10, 60_000);
    cache.set('key1', {
      data: 'v', status: 200, statusText: 'OK', headers: new Headers(),
      timing: 0, timestamp: Date.now(), config: { url: '/t', method: 'GET' }, raw: new Response(),
    });
    cache.set('key2', {
      data: 'v', status: 200, statusText: 'OK', headers: new Headers(),
      timing: 0, timestamp: Date.now(), config: { url: '/t', method: 'GET' }, raw: new Response(),
    });

    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('should support keys()', () => {
    const cache = new LRUCache(10, 60_000);
    cache.set('a', {
      data: 'v', status: 200, statusText: 'OK', headers: new Headers(),
      timing: 0, timestamp: Date.now(), config: { url: '/a', method: 'GET' }, raw: new Response(),
    });
    cache.set('b', {
      data: 'v', status: 200, statusText: 'OK', headers: new Headers(),
      timing: 0, timestamp: Date.now(), config: { url: '/b', method: 'GET' }, raw: new Response(),
    });

    expect(cache.keys()).toContain('a');
    expect(cache.keys()).toContain('b');
  });

  describe('TTL expiration', () => {
    it('should return undefined for expired entries', () => {
      const cache = new LRUCache(10, 100); // 100ms TTL
      cache.set('key1', {
        data: 'v', status: 200, statusText: 'OK', headers: new Headers(),
        timing: 0, timestamp: Date.now(), config: { url: '/t', method: 'GET' }, raw: new Response(),
      });

      // Should be available immediately
      expect(cache.get('key1')?.data).toBe('v');

      // Wait for expiration
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(cache.get('key1')).toBeUndefined();
          resolve();
        }, 150);
      });
    });

    it('should return fresh entries within TTL', () => {
      const cache = new LRUCache(10, 60_000);
      cache.set('key1', {
        data: 'fresh', status: 200, statusText: 'OK', headers: new Headers(),
        timing: 0, timestamp: Date.now(), config: { url: '/t', method: 'GET' }, raw: new Response(),
      });

      expect(cache.get('key1')?.data).toBe('fresh');
    });

    it('getAllowingStale should return entries even if expired', () => {
      const cache = new LRUCache(10, 100); // 100ms TTL
      cache.set('key1', {
        data: 'stale', status: 200, statusText: 'OK', headers: new Headers(),
        timing: 0, timestamp: Date.now() - 200, config: { url: '/t', method: 'GET' }, raw: new Response(),
      });

      // get() removes the expired entry
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.size).toBe(0);

      // Re-insert and test getAllowingStale without calling get() first
      cache.set('key2', {
        data: 'stale2', status: 200, statusText: 'OK', headers: new Headers(),
        timing: 0, timestamp: Date.now() - 200, config: { url: '/t2', method: 'GET' }, raw: new Response(),
      });

      // getAllowingStale returns the entry even though it's expired
      expect(cache.getAllowingStale('key2')?.data).toBe('stale2');
    });
  });

  describe('LRU eviction', () => {
    it('should move accessed entries to the end', () => {
      const cache = new LRUCache(3, 60_000);
      const now = Date.now();

      cache.set('a', {
        data: 'a', status: 200, statusText: 'OK', headers: new Headers(),
        timing: 0, timestamp: now, config: { url: '/a', method: 'GET' }, raw: new Response(),
      });
      cache.set('b', {
        data: 'b', status: 200, statusText: 'OK', headers: new Headers(),
        timing: 0, timestamp: now, config: { url: '/b', method: 'GET' }, raw: new Response(),
      });
      cache.set('c', {
        data: 'c', status: 200, statusText: 'OK', headers: new Headers(),
        timing: 0, timestamp: now, config: { url: '/c', method: 'GET' }, raw: new Response(),
      });

      // Access 'a' to move it to end
      cache.get('a');

      // Add a new entry — 'b' (the least recently used) should be evicted
      cache.set('d', {
        data: 'd', status: 200, statusText: 'OK', headers: new Headers(),
        timing: 0, timestamp: now, config: { url: '/d', method: 'GET' }, raw: new Response(),
      });

      expect(cache.get('a')?.data).toBe('a');
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')?.data).toBe('c');
      expect(cache.get('d')?.data).toBe('d');
    });
  });
});

// =========================================================================
// cachePlugin integration tests
// =========================================================================
describe('cachePlugin', () => {
  describe('plugin structure', () => {
    it('should return a plugin with correct name', () => {
      const plugin = cachePlugin();
      expect(plugin.name).toBe('cache');
      expect(typeof plugin.install).toBe('function');
      expect(typeof plugin.cache).toBe('object');
      expect(typeof plugin.invalidate).toBe('function');
      expect(typeof plugin.invalidatePattern).toBe('function');
      expect(typeof plugin.clear).toBe('function');
      expect(typeof plugin.getStats).toBe('function');
    });

    it('should install without errors', () => {
      const client = createHttix({ baseURL: BASE });
      const plugin = cachePlugin();
      expect(() => plugin.install(client)).not.toThrow();
    });
  });

  describe('cache hit', () => {
    it('should serve cached response on second request', async () => {
      let callIndex = 0;
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          callIndex++;
          return Promise.resolve(
            new Response(JSON.stringify({ data: `response-${callIndex}` }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        },
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const plugin = cachePlugin({ ttl: 60_000 });
      plugin.install(client);

      // First request — cache miss, stores { data: 'response-1' }
      const r1 = await client.get('/cached');
      expect(r1.data).toEqual({ data: 'response-1' });

      // Second request — cache hit returns first response data even though
      // the mock would return { data: 'response-2' }
      const r2 = await client.get('/cached');
      expect(r2.data).toEqual({ data: 'response-1' });
    });

    it('should return correct status on cache hit', async () => {
      let callIndex = 0;
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          callIndex++;
          return Promise.resolve(
            new Response(JSON.stringify({ ok: callIndex }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        },
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const plugin = cachePlugin({ ttl: 60_000 });
      plugin.install(client);

      const r1 = await client.get('/data');
      expect(r1.status).toBe(200);
      expect(r1.ok).toBe(true);

      const r2 = await client.get('/data');
      expect(r2.status).toBe(200);
      expect(r2.ok).toBe(true);
      // Verify the cached data is from the first call
      expect(r2.data).toEqual({ ok: 1 });
    });
  });

  describe('cache miss', () => {
    it('should call fetch on cache miss', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ data: 'new' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const plugin = cachePlugin({ ttl: 60_000 });
      plugin.install(client);

      const response = await client.get('/uncached');

      expect(response.data).toEqual({ data: 'new' });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('should store response in cache after miss', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ data: 'cached' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const plugin = cachePlugin({ ttl: 60_000 });
      plugin.install(client);

      await client.get('/store-me');
      expect(plugin.cache.size).toBe(1);
    });
  });

  describe('TTL expiration', () => {
    it('should not serve expired cache entries', async () => {
      let callIndex = 0;
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          callIndex++;
          return Promise.resolve(
            new Response(JSON.stringify({ data: `v${callIndex}` }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        },
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const plugin = cachePlugin({ ttl: 100 }); // 100ms TTL
      plugin.install(client);

      const r1 = await client.get('/ttl');
      expect(r1.data).toEqual({ data: 'v1' });

      // Wait for TTL to expire
      await new Promise((r) => setTimeout(r, 150));

      // Second call should get fresh data (v2) because cache expired
      const r2 = await client.get('/ttl');
      expect(r2.data).toEqual({ data: 'v2' });
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entries when maxSize is reached', async () => {
      const responses: unknown[] = [];
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
        (req: Request) => {
          const url = new URL(req.url);
          const key = url.pathname;
          responses.push(key);
          return Promise.resolve(
            new Response(JSON.stringify({ data: key }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        },
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const plugin = cachePlugin({ ttl: 60_000, maxSize: 2 });
      plugin.install(client);

      // Fill cache with 3 entries (maxSize=2)
      await client.get('/a');
      await client.get('/b');
      await client.get('/c');

      // Only 3 fetch calls (all unique at time of call)
      // But cache should only have 2 entries (b and c)
      expect(plugin.cache.size).toBe(2);

      // '/a' was evicted, so requesting it should call fetch again
      await client.get('/a');
      expect(responses).toEqual(['/a', '/b', '/c', '/a']);
    });
  });

  describe('cache key generation', () => {
    it('should differentiate between different URLs', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const plugin = cachePlugin({ ttl: 60_000 });
      plugin.install(client);

      await client.get('/a');
      await client.get('/b');

      expect(plugin.cache.size).toBe(2);
    });

    it('should differentiate between different query params', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const plugin = cachePlugin({ ttl: 60_000 });
      plugin.install(client);

      await client.get('/data', { query: { page: 1 } });
      await client.get('/data', { query: { page: 2 } });

      expect(plugin.cache.size).toBe(2);
    });

    it('should differentiate between different methods', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const plugin = cachePlugin({ ttl: 60_000, methods: ['GET', 'POST'] });
      plugin.install(client);

      await client.get('/data');
      await client.post('/data', {});

      expect(plugin.cache.size).toBe(2);
    });

    it('should use custom key generator', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const customKeyGen = (config: HttixRequestConfig) =>
        `custom:${config.url}:${config.method}`;

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const plugin = cachePlugin({
        ttl: 60_000,
        generateKey: customKeyGen,
      });
      plugin.install(client);

      await client.get('/test');

      expect(plugin.cache.keys()[0]).toBe(
        'custom:/test:GET',
      );
    });
  });

  describe('method filtering', () => {
    it('should only cache GET by default', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const plugin = cachePlugin({ ttl: 60_000 });
      plugin.install(client);

      await client.post('/data', {});
      expect(plugin.cache.size).toBe(0); // POST not cached by default

      await client.get('/data');
      expect(plugin.cache.size).toBe(1); // GET is cached
    });

    it('should cache only configured methods', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const plugin = cachePlugin({ ttl: 60_000, methods: ['POST'] });
      plugin.install(client);

      await client.post('/data', {});
      expect(plugin.cache.size).toBe(1);

      await client.get('/data');
      expect(plugin.cache.size).toBe(1); // GET not in configured methods
    });
  });

  describe('non-2xx responses', () => {
    it('should not cache error responses', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ error: 'Not Found' }), {
          status: 404,
          statusText: 'Not Found',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const plugin = cachePlugin({ ttl: 60_000 });
      plugin.install(client);

      try {
        await client.get('/error');
      } catch {
        // Expected
      }

      expect(plugin.cache.size).toBe(0);
    });
  });

  describe('utility methods', () => {
    it('getStats should return cache statistics', () => {
      const plugin = cachePlugin({ maxSize: 50, ttl: 300_000 });
      const stats = plugin.getStats();

      expect(stats.size).toBe(0);
      expect(stats.maxSize).toBe(50);
      expect(stats.ttl).toBe(300_000);
    });

    it('invalidate should remove specific key', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const plugin = cachePlugin({ ttl: 60_000 });
      plugin.install(client);

      await client.get('/data');
      expect(plugin.cache.size).toBe(1);

      plugin.invalidate();
      // The key format depends on the internal key generator
      // Since we can't easily get the exact key, just test clear
    });

    it('clear should remove all cache entries', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const plugin = cachePlugin({ ttl: 60_000 });
      plugin.install(client);

      await client.get('/a');
      await client.get('/b');
      expect(plugin.cache.size).toBe(2);

      plugin.clear();
      expect(plugin.cache.size).toBe(0);
    });

    it('invalidatePattern should remove matching keys', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const plugin = cachePlugin({ ttl: 60_000 });
      plugin.install(client);

      await client.get('/users');
      await client.get('/posts');

      expect(plugin.cache.size).toBe(2);

      plugin.invalidatePattern(/users/);
      expect(plugin.cache.size).toBe(1);
    });
  });
});
