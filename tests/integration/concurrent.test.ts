import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHttix } from '../../src/core/client';

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

describe('Concurrent request scenarios', () => {
  // =========================================================================
  // Concurrent requests
  // =========================================================================
  describe('Concurrent requests', () => {
    it('should handle multiple concurrent requests correctly', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;

      fetchMock.mockImplementation(async (req: Request) => {
        const url = new URL(req.url);
        const id = url.pathname.split('/').pop();
        return mockJsonResponse({ id, status: 'ok' });
      });

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      const [r1, r2, r3] = await Promise.all([
        client.get('/users/1'),
        client.get('/users/2'),
        client.get('/users/3'),
      ]);

      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      expect(r3.ok).toBe(true);
      expect((r1.data as { id: string }).id).toBe('1');
      expect((r2.data as { id: string }).id).toBe('2');
      expect((r3.data as { id: string }).id).toBe('3');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed success and failure in concurrent requests', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      let callCount = 0;

      fetchMock.mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          return mockJsonResponse({ error: 'Not Found' }, 404);
        }
        return mockJsonResponse({ data: 'ok' });
      });

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      const results = await Promise.allSettled([
        client.get('/ok'),
        client.get('/missing'),
        client.get('/also-ok'),
      ]);

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('should handle many concurrent requests', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      const count = 50;
      const promises = Array.from({ length: count }, (_, i) =>
        client.get(`/item/${i}`),
      );

      const responses = await Promise.all(promises);
      expect(responses).toHaveLength(count);
      for (const res of responses) {
        expect(res.ok).toBe(true);
      }
      expect(fetchMock).toHaveBeenCalledTimes(count);
    });
  });

  // =========================================================================
  // Dedup + concurrent requests
  // =========================================================================
  describe('Dedup + concurrent requests', () => {
    it('should deduplicate concurrent identical requests', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      let fetchCallCount = 0;

      fetchMock.mockImplementation(async () => {
        fetchCallCount++;
        // Simulate a slight delay to ensure requests overlap
        await new Promise((r) => setTimeout(r, 10));
        return mockJsonResponse({ data: 'deduped' });
      });

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false, dedup: true });

      // Fire 5 concurrent identical requests
      const promises = Array.from({ length: 5 }, () =>
        client.get('/same-endpoint'),
      );

      const responses = await Promise.all(promises);

      // All should succeed
      for (const res of responses) {
        expect(res.ok).toBe(true);
        expect(res.data).toEqual({ data: 'deduped' });
      }

      // But only ONE fetch should have been made (deduplication)
      expect(fetchCallCount).toBe(1);
    });

    it('should NOT deduplicate requests to different URLs', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      let fetchCallCount = 0;

      fetchMock.mockImplementation(async () => {
        fetchCallCount++;
        await new Promise((r) => setTimeout(r, 10));
        return mockJsonResponse({ data: 'ok' });
      });

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false, dedup: true });

      const [r1, r2] = await Promise.all([
        client.get('/endpoint-a'),
        client.get('/endpoint-b'),
      ]);

      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      expect(fetchCallCount).toBe(2); // No dedup for different URLs
    });

    it('should cache deduped responses when TTL is set', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      let fetchCallCount = 0;

      fetchMock.mockImplementation(async () => {
        fetchCallCount++;
        return mockJsonResponse({ data: 'cached', timestamp: Date.now() });
      });

      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        retry: false,
        dedup: { enabled: true, ttl: 5000 },
      });

      // First request
      const r1 = await client.get('/cached-endpoint');
      expect(r1.ok).toBe(true);
      expect(fetchCallCount).toBe(1);

      // Second request (within TTL) should return cached result
      const r2 = await client.get('/cached-endpoint');
      expect(r2.ok).toBe(true);
      expect(r2.data).toEqual(r1.data); // Same cached data
      expect(fetchCallCount).toBe(1); // Still only 1 fetch
    });

    it('should make separate requests when dedup is disabled', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      let fetchCallCount = 0;

      fetchMock.mockImplementation(async () => {
        fetchCallCount++;
        await new Promise((r) => setTimeout(r, 10));
        return mockJsonResponse({ data: 'not-deduped' });
      });

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false, dedup: false });

      const promises = Array.from({ length: 3 }, () =>
        client.get('/same-endpoint'),
      );

      await Promise.all(promises);
      expect(fetchCallCount).toBe(3); // No dedup
    });
  });

  // =========================================================================
  // Rate limiting + concurrent requests
  // =========================================================================
  describe('Rate limiting + concurrent requests', () => {
    it('should allow up to maxRequests immediately', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        retry: false,
        rateLimit: { maxRequests: 2, interval: 1000 },
      });

      const [r1, r2] = await Promise.all([
        client.get('/limited/1'),
        client.get('/limited/2'),
      ]);

      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should allow up to maxRequests per window and queue excess', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        retry: false,
        rateLimit: { maxRequests: 2, interval: 1000 },
      });

      // All 4 requests should eventually complete (the rate limiter queues
      // excess requests and drains them when the interval elapses)
      const promises = [
        client.get('/rate/1'),
        client.get('/rate/2'),
        client.get('/rate/3'),
        client.get('/rate/4'),
      ];

      const results = await Promise.all(promises);

      for (const res of results) {
        expect(res.ok).toBe(true);
      }

      // All 4 requests should have been made
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('should rate limit per-URL key', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValue(mockJsonResponse({ ok: true }));

      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        retry: false,
        rateLimit: { maxRequests: 1, interval: 200 },
      });

      // Only one request per interval window per URL key
      const r1 = await client.get('/per-key/1');
      expect(r1.ok).toBe(true);

      // Second request to the same URL should be queued
      const p2 = client.get('/per-key/2');

      // Advance time to allow the queued request to execute
      await new Promise((r) => setTimeout(r, 250));

      const r2 = await p2;
      expect(r2.ok).toBe(true);
    });
  });
});
