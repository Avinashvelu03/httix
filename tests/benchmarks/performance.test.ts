import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHttix } from '../../src/core/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = 'https://api.example.com';

const mockJsonResponse = (data: unknown) =>
  new Response(JSON.stringify(data), {
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'application/json' },
  });

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn().mockResolvedValue(
    mockJsonResponse({ benchmark: true }),
  );
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe('Performance benchmarks', () => {
  it('benchmark: request creation overhead (httix vs raw fetch)', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(mockJsonResponse({ ok: true }));

    const ITERATIONS = 10_000;

    // --- httix ---
    const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

    const httixStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      await client.get('/benchmark');
    }
    const httixEnd = performance.now();
    const httixTime = httixEnd - httixStart;

    // --- raw fetch ---
    fetchMock.mockClear();
    const rawStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      await fetch('https://api.example.com/benchmark');
    }
    const rawEnd = performance.now();
    const rawTime = rawEnd - rawStart;

    const overhead = httixTime - rawTime;
    const overheadPerReq = overhead / ITERATIONS;

    console.log('\n');
    console.log('=== Request Creation Overhead Benchmark ===');
    console.log(`  Iterations:       ${ITERATIONS.toLocaleString()}`);
    console.log(`  httix total:      ${httixTime.toFixed(2)} ms`);
    console.log(`  raw fetch total:  ${rawTime.toFixed(2)} ms`);
    console.log(`  overhead:         ${overhead.toFixed(2)} ms`);
    console.log(`  overhead/req:     ${overheadPerReq.toFixed(4)} ms`);
    console.log(`  httix req/s:      ${(ITERATIONS / (httixTime / 1000)).toLocaleString()}`);
    console.log(`  raw req/s:        ${(ITERATIONS / (rawTime / 1000)).toLocaleString()}`);
    console.log('');

    // Basic sanity check: httix should complete
    expect(httixTime).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(ITERATIONS);
  });

  it('benchmark: response parsing time (JSON)', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;

    // Generate a realistic response payload
    const payload = {
      users: Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        roles: ['admin', 'user'],
        metadata: { created: '2024-01-01', lastLogin: '2024-12-31' },
      })),
      total: 100,
      page: 1,
      pageSize: 100,
    };

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const ITERATIONS = 5_000;
    const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const response = await client.get('/users');
      // Access data to ensure parsing
      const _ = response.data;
    }
    const end = performance.now();
    const totalTime = end - start;
    const perReq = totalTime / ITERATIONS;

    console.log('\n');
    console.log('=== Response Parsing Benchmark (JSON) ===');
    console.log(`  Iterations:       ${ITERATIONS.toLocaleString()}`);
    console.log(`  Total time:       ${totalTime.toFixed(2)} ms`);
    console.log(`  Per request:      ${perReq.toFixed(4)} ms`);
    console.log(`  Requests/sec:     ${(ITERATIONS / (totalTime / 1000)).toLocaleString()}`);
    console.log(`  Payload size:     ~${JSON.stringify(payload).length} bytes`);
    console.log('');

    expect(totalTime).toBeGreaterThan(0);
  });

  it('benchmark: interceptor overhead', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(mockJsonResponse({ ok: true }));

    const ITERATIONS = 5_000;

    // --- no interceptors ---
    const plainClient = createHttix({ baseURL: BASE, timeout: 0, retry: false });

    const plainStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      await plainClient.get('/benchmark');
    }
    const plainEnd = performance.now();
    const plainTime = plainEnd - plainStart;

    // --- with 3 interceptors ---
    fetchMock.mockClear();
    const interceptedClient = createHttix({ baseURL: BASE, timeout: 0, retry: false });

    interceptedClient.interceptors.request.use((config) => {
      config.headers = {
        ...(config.headers instanceof Headers
          ? Object.fromEntries(config.headers.entries())
          : (config.headers ?? {})),
        'X-Req-Id': `req-${Date.now()}`,
      };
      return config;
    });

    interceptedClient.interceptors.request.use((config) => {
      config.headers = {
        ...(config.headers instanceof Headers
          ? Object.fromEntries(config.headers.entries())
          : (config.headers ?? {})),
        'X-Timestamp': String(Date.now()),
      };
      return config;
    });

    interceptedClient.interceptors.response.use((response) => {
      return { ...response, data: { ...(response.data as Record<string, unknown>), _intercepted: true } };
    });

    const intStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      await interceptedClient.get('/benchmark');
    }
    const intEnd = performance.now();
    const intTime = intEnd - intStart;

    const interceptorOverhead = intTime - plainTime;
    const perInterceptor = interceptorOverhead / ITERATIONS / 3;

    console.log('\n');
    console.log('=== Interceptor Overhead Benchmark ===');
    console.log(`  Iterations:           ${ITERATIONS.toLocaleString()}`);
    console.log(`  Plain client:         ${plainTime.toFixed(2)} ms`);
    console.log(`  3 interceptors:       ${intTime.toFixed(2)} ms`);
    console.log(`  Total overhead:       ${interceptorOverhead.toFixed(2)} ms`);
    console.log(`  Per interceptor/req:  ${perInterceptor.toFixed(4)} ms`);
    console.log('');

    expect(intTime).toBeGreaterThan(0);
  });

  it('benchmark: concurrent request throughput', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(mockJsonResponse({ ok: true }));

    const BATCH_SIZE = 100;
    const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

    const start = performance.now();

    const promises = Array.from({ length: BATCH_SIZE }, (_, i) =>
      client.get(`/concurrent/${i}`),
    );

    const results = await Promise.all(promises);
    const end = performance.now();
    const totalTime = end - start;

    console.log('\n');
    console.log('=== Concurrent Request Throughput ===');
    console.log(`  Batch size:       ${BATCH_SIZE}`);
    console.log(`  Total time:       ${totalTime.toFixed(2)} ms`);
    console.log(`  Requests/sec:     ${(BATCH_SIZE / (totalTime / 1000)).toLocaleString()}`);
    console.log('');

    expect(results).toHaveLength(BATCH_SIZE);
    for (const res of results) {
      expect(res.ok).toBe(true);
    }
  });
});
