/**
 * cache.ts coverage gap tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cachePlugin } from '../../src/plugins/cache';
import { HttixClientImpl } from '../../src/core/client';

describe('cachePlugin — SWR', () => {
  let origFetch: typeof globalThis.fetch;
  beforeEach(() => { origFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = origFetch; });

  it('should serve stale entry within SWR window', async () => {
    const plugin = cachePlugin({ maxSize: 100, ttl: 50, staleWhileRevalidate: true, swrWindow: 5000 });
    const client = new HttixClientImpl({ baseURL: 'http://localhost' });
    plugin.install(client);

    let calls = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      calls++;
      return new Response(JSON.stringify({ n: calls }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    });

    const r1 = await client.get('/swr');
    expect(r1.data).toEqual({ n: 1 });
    expect(calls).toBe(1);

    await new Promise((r) => setTimeout(r, 100));

    const r2 = await client.get('/swr');
    // SWR serves stale data (n:1) but also revalidates in background
    expect(r2.data).toEqual({ n: 1 });
    expect(calls).toBe(2); // revalidation fetch happens
  }, 10000);

  it('should invalidate by specific key', async () => {
    const plugin = cachePlugin({ maxSize: 10, ttl: 60000 });
    const client = new HttixClientImpl({ baseURL: 'http://localhost' });
    plugin.install(client);

    let calls = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      calls++;
      return new Response(JSON.stringify({ n: calls }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    });

    await client.get('/inv');
    expect(calls).toBe(1);
    plugin.invalidate('GET http://localhost/inv');
    expect(plugin.getStats().size).toBe(0);
    await client.get('/inv');
    expect(calls).toBe(2);
  });

  it('should clear all', async () => {
    const plugin = cachePlugin({ maxSize: 10, ttl: 60000 });
    const client = new HttixClientImpl({ baseURL: 'http://localhost' });
    plugin.install(client);

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    await client.get('/clr');
    expect(plugin.getStats().size).toBe(1);
    plugin.clear();
    expect(plugin.getStats().size).toBe(0);
  });
});
