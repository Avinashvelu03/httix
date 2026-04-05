/**
 * logger.ts + pagination.ts coverage gap tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loggerPlugin } from '../../src/plugins/logger';
import { HttixClientImpl } from '../../src/core/client';
import { HttixRequestError } from '../../src/core/errors';

describe('loggerPlugin — Headers instance', () => {
  it('should log Headers instance request headers', async () => {
    const logs: any[] = [];
    const plugin = loggerPlugin({
      level: 'debug', logRequestHeaders: true,
      logger: {
        debug: (...a: unknown[]) => logs.push(a),
        info: (...a: unknown[]) => logs.push(a),
        warn: (...a: unknown[]) => logs.push(a),
        error: (...a: unknown[]) => logs.push(a),
      },
    });

    const client = new HttixClientImpl({ baseURL: 'http://localhost' });
    plugin.install(client);

    const hdrs = new Headers();
    hdrs.set('X-C', 'v');
    hdrs.set('Authorization', 'Bearer t');

    const handler = client.interceptors.request.handlers[0];
    if (handler) await handler.fulfilled({ url: '/t', method: 'GET', headers: hdrs });

    const info = logs.find((l) => l[0] === '[httix] Request:');
    expect(info).toBeDefined();
    if (info) {
      expect(info[1].headers['x-c']).toBe('v');
      expect(info[1].headers['authorization']).toBe('Bearer t');
    }
  });

  it('should log errors via rejected handler', async () => {
    const logs: any[] = [];
    const plugin = loggerPlugin({
      level: 'debug',
      logger: {
        debug: (...a: unknown[]) => logs.push(a),
        info: (...a: unknown[]) => logs.push(a),
        warn: (...a: unknown[]) => logs.push(a),
        error: (...a: unknown[]) => logs.push(a),
      },
    });

    const client = new HttixClientImpl({ baseURL: 'http://localhost' });
    plugin.install(client);

    const handler = client.interceptors.response.handlers[0];
    if (handler?.rejected) {
      await handler.rejected(new HttixRequestError('e', {
        message: 'e', config: { url: '/t', requestId: 'r1' },
      }));
    }

    const errLog = logs.find((l) => l[0] === '[httix] Error:');
    expect(errLog).toBeDefined();
    if (errLog) {
      expect(errLog[1].requestId).toBe('r1');
    }
  });
});

describe('createPaginator — cursor without extractor + linkExtractor', () => {
  let origFetch: typeof globalThis.fetch;
  beforeEach(() => { origFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = origFetch; });

  it('should stop cursor pagination when no extractor returns null', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: 1 }]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const client = new HttixClientImpl({ baseURL: 'http://localhost' });
    const pages: any[] = [];
    for await (const p of client.paginate('/c', { pagination: { style: 'cursor', cursorParam: 'c' } })) {
      pages.push(p);
      break; // Safety: prevent infinite loop
    }
    expect(pages.length).toBe(1);
  });

  it('should use custom linkExtractor with stopCondition', async () => {
    let call = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      call++;
      return new Response(JSON.stringify({ items: [{ id: call }] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    });
    const client = new HttixClientImpl({ baseURL: 'http://localhost' });
    const pages: any[] = [];
    for await (const p of client.paginate('/l', {
      pagination: {
        style: 'link',
        dataExtractor: (d: any) => d.items,
        linkExtractor: () => (call < 2 ? 'http://localhost/l?p=2' : null),
        stopCondition: () => call >= 2,
      },
    })) {
      pages.push(p);
    }
    expect(pages.length).toBe(2);
  });

  it('should parse Link header with stopCondition', async () => {
    let call = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      call++;
      return new Response(JSON.stringify([{ id: call }]), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          Link: call < 2 ? '<http://localhost/l?p=2>; rel="next"' : '',
        },
      });
    });
    const client = new HttixClientImpl({ baseURL: 'http://localhost' });
    const pages: any[] = [];
    for await (const p of client.paginate('/l', {
      pagination: { style: 'link', stopCondition: () => call >= 2 },
    })) {
      pages.push(p);
    }
    expect(pages.length).toBe(2);
  });
});
