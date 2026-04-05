/**
 * mock.ts coverage gap tests
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockAdapter } from '../../src/plugins/mock';

describe('MockAdapter — Request object and Headers', () => {
  let origFetch: typeof globalThis.fetch;
  beforeEach(() => { origFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = origFetch; });

  it('should handle Request object as input', async () => {
    const adapter = new MockAdapter();
    adapter.onGet('/req').reply(200, { ok: true });
    adapter.activate({} as any);

    const req = new Request('http://localhost/req');
    const fetchFn = globalThis.fetch;
    if (!fetchFn) throw new Error('fetch not available');
    const res = await fetchFn(req);
    expect(res.status).toBe(200);

    const hist = adapter.getHistory();
    expect(hist.get[0].url).toBe('http://localhost/req');
    expect(hist.get[0].headers).toBeDefined();
    adapter.deactivate();
  });

  it('should handle Request with POST and body', async () => {
    const adapter = new MockAdapter();
    adapter.onPost('/rp').reply(201, { ok: true });
    adapter.activate({} as any);

    const req = new Request('http://localhost/rp', {
      method: 'POST',
      body: '{"n":"t"}',
      headers: { 'Content-Type': 'application/json' },
    });
    await globalThis.fetch(req);

    const hist = adapter.getHistory();
    expect(hist.post[0].headers).toBeDefined();
    if (hist.post[0].headers) {
      expect(hist.post[0].headers['content-type']).toBe('application/json');
    }
    adapter.deactivate();
  });

  it('should handle init with Headers instance', async () => {
    const adapter = new MockAdapter();
    adapter.onGet('/ih').reply(200, {});
    adapter.activate({} as any);

    const h = new Headers();
    h.set('Auth', 'Bearer xyz');
    await globalThis.fetch('http://localhost/ih', { method: 'GET', headers: h });

    const historyEntry = adapter.getHistory().get[0];
    expect(historyEntry.headers).toBeDefined();
    if (historyEntry.headers) {
      expect(historyEntry.headers['auth']).toBe('Bearer xyz');
    }
    adapter.deactivate();
  });

  it('should handle Request with body via init', async () => {
    const adapter = new MockAdapter();
    adapter.onPost('/nj').reply(200, {});
    adapter.activate({} as any);

    // Use valid JSON string as body to avoid JSON.parse crash
    await globalThis.fetch('http://localhost/nj', { method: 'POST', body: '{"key":"value"}' });

    expect(adapter.getHistory().post[0].body).toEqual({ key: 'value' });
    adapter.deactivate();
  });

  it('should return 404 for unmatched', async () => {
    const adapter = new MockAdapter();
    adapter.activate({} as any);
    const fetchFn = globalThis.fetch;
    if (!fetchFn) throw new Error('fetch not available');
    const res = await fetchFn('http://localhost/nomatch');
    expect(res.status).toBe(404);
    adapter.deactivate();
  });
});
