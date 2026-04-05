import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHeadMethod } from '../../src/methods/head';
import { createHttix } from '../../src/core/client';

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

describe('createHeadMethod', () => {
  it('should create a HEAD function bound to the client', () => {
    const client = createHttix({ baseURL: BASE });
    const head = createHeadMethod(client);
    expect(typeof head).toBe('function');
  });

  it('should use HEAD method', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Length': '42', 'Content-Type': 'application/json' },
      }),
    );

    const client = createHttix({ baseURL: BASE });
    const head = createHeadMethod(client);
    await head('/users/1');

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('HEAD');
  });

  it('should use correct URL', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 200, statusText: 'OK' }),
    );

    const client = createHttix({ baseURL: BASE });
    const head = createHeadMethod(client);
    await head('/users/42');

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.url).toContain('api.example.com/users/42');
  });

  it('should return headers in response', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Length': '42',
          'Content-Type': 'application/json',
          'ETag': '"abc123"',
        },
      }),
    );

    const client = createHttix({ baseURL: BASE });
    const head = createHeadMethod(client);
    const response = await head('/users/1');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe('42');
    expect(response.headers.get('etag')).toBe('"abc123"');
  });

  it('should not send body', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 200, statusText: 'OK' }),
    );

    const client = createHttix({ baseURL: BASE });
    const head = createHeadMethod(client);
    await head('/users/1');

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.body).toBeNull();
  });

  it('should return void data type', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 200, statusText: 'OK' }),
    );

    const client = createHttix({ baseURL: BASE });
    const head = createHeadMethod(client);
    const response = await head('/users/1');

    expect(response.status).toBe(200);
    expect(response.data).toBeUndefined();
  });

  it('should pass config options', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    const client = createHttix({ baseURL: BASE });
    const head = createHeadMethod(client);
    await head('/users/1', { headers: { 'X-If-None-Match': 'abc' } });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.headers.get('x-if-none-match')).toBe('abc');
  });

  it('should pass query params', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    const client = createHttix({ baseURL: BASE });
    const head = createHeadMethod(client);
    await head('/users/1', { query: { fields: 'id,name' } });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.url).toContain('fields=id%2Cname');
  });

  it('should handle 4xx error responses', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, {
        status: 404,
        statusText: 'Not Found',
      }),
    );

    const client = createHttix({ baseURL: BASE });
    const head = createHeadMethod(client);

    await expect(head('/missing')).rejects.toThrow();
  });

  it('should handle 5xx error responses', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    );

    const client = createHttix({ baseURL: BASE });
    const head = createHeadMethod(client);

    await expect(head('/error')).rejects.toThrow();
  });

  it('should handle network errors', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Failed to fetch'),
    );

    const client = createHttix({ baseURL: BASE });
    const head = createHeadMethod(client);

    await expect(head('/fail')).rejects.toThrow();
  });
});
