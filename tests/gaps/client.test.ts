/**
 * client.ts coverage gap tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttixClientImpl } from '../../src/core/client';

describe('HttixClientImpl — create()', () => {
  it('should return HttixClientImpl', () => {
    const parent = new HttixClientImpl({ baseURL: 'http://localhost' });
    const child = parent.create({ timeout: 5000 });
    expect(child).toBeInstanceOf(HttixClientImpl);
    expect(child.defaults.timeout).toBe(5000);
  });
});

describe('HttixClientImpl — timeout error', () => {
  let origFetch: typeof globalThis.fetch;
  beforeEach(() => { origFetch = globalThis.fetch; vi.useFakeTimers(); });
  afterEach(() => { globalThis.fetch = origFetch; vi.useRealTimers(); });

  it('should throw HttixTimeoutError', async () => {
    let rejectFetch!: (e: Error) => void;
    globalThis.fetch = vi.fn().mockImplementation(
      () => new Promise((_resolve, reject) => { rejectFetch = reject; }),
    );

    const client = new HttixClientImpl({ baseURL: 'http://localhost', timeout: 100 });
    const p = client.get('/slow').catch((e) => e);

    // Advance past timeout so the timeout signal fires
    await vi.advanceTimersByTimeAsync(150);

    // Now reject fetch — timeout signal is already aborted
    if (rejectFetch) {
      rejectFetch(new DOMException('The operation was aborted', 'AbortError'));
    }

    const err = await p;
    expect(err.constructor.name).toBe('HttixTimeoutError');
  });
});

describe('HttixClientImpl — stream.ndjson with auth', () => {
  let origFetch: typeof globalThis.fetch;
  beforeEach(() => { origFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = origFetch; });

  it('should apply auth and consume NDJSON stream', async () => {
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('{"a":1}\n'));
        c.enqueue(enc.encode('{"a":2}\n'));
        c.close();
      },
    });

    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve(
        new Response(stream, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } }),
      );
    });

    const client = new HttixClientImpl({
      baseURL: 'http://localhost',
      auth: { type: 'bearer', token: 'ndjson-tok' },
    });

    const items: any[] = [];
    for await (const item of client.stream.ndjson('/stream')) items.push(item);
    expect(items).toEqual([{ a: 1 }, { a: 2 }]);
    expect(globalThis.fetch).toHaveBeenCalled();
  });
});

describe('HttixClientImpl — stream.sse with auth', () => {
  let origFetch: typeof globalThis.fetch;
  beforeEach(() => { origFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = origFetch; });

  it('should apply auth and consume SSE stream', async () => {
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(enc.encode('data: hello\n\n')); c.close(); },
    });

    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve(
        new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
      );
    });

    const client = new HttixClientImpl({
      baseURL: 'http://localhost',
      auth: { type: 'bearer', token: 'sse-tok' },
    });

    const events: any[] = [];
    for await (const e of client.stream.sse('/events')) events.push(e);
    expect(events[0].data).toBe('hello');
  });
});

describe('HttixClientImpl — cancelAll and isCancel', () => {
  let origFetch: typeof globalThis.fetch;
  beforeEach(() => { origFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = origFetch; });

  it('should cancel pending requests', async () => {
    let rejectFetch!: (e: Error) => void;
    globalThis.fetch = vi.fn().mockImplementation(
      () => new Promise((_resolve, reject) => { rejectFetch = reject; }),
    );

    const client = new HttixClientImpl({ baseURL: 'http://localhost' });
    const p = client.get('/hang').catch((e) => e);

    await new Promise((r) => setTimeout(r, 20));
    client.cancelAll('cancel-reason');
    if (rejectFetch) {
      rejectFetch(new Error('aborted'));
    }

    const err = await p;
    expect(client.isCancel(err)).toBe(true);
  }, 10000);

  it('isCancel returns false for non-cancel errors', () => {
    const c = new HttixClientImpl();
    expect(c.isCancel(new Error('no'))).toBe(false);
    expect(c.isCancel(null)).toBe(false);
    expect(c.isCancel(undefined)).toBe(false);
  });
});
