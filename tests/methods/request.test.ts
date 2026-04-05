import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequestMethod } from '../../src/methods/request';
import { createHttix } from '../../src/core/client';
import type { HttixRequestConfig } from '../../src/core/types';

const BASE = 'https://api.example.com';

const mockJsonOk = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
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

describe('createRequestMethod', () => {
  it('should create a request function bound to the client', () => {
    const client = createHttix({ baseURL: BASE });
    const request = createRequestMethod(client);
    expect(typeof request).toBe('function');
  });

  it('should make a GET request', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ result: 'ok' }),
    );

    const client = createHttix({ baseURL: BASE });
    const request = createRequestMethod(client);

    const response = await request({ url: '/data', method: 'GET' });

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ result: 'ok' });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('GET');
    expect(req.url).toContain('api.example.com/data');
  });

  it('should make a POST request', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ created: true }, 201),
    );

    const client = createHttix({ baseURL: BASE });
    const request = createRequestMethod(client);

    const response = await request({
      url: '/items',
      method: 'POST',
      body: { name: 'Test' },
    });

    expect(response.status).toBe(201);
    expect(response.data).toEqual({ created: true });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('POST');
  });

  it('should make a PUT request', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ updated: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const request = createRequestMethod(client);

    await request({ url: '/items/1', method: 'PUT', body: { name: 'X' } });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('PUT');
  });

  it('should make a PATCH request', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ patched: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const request = createRequestMethod(client);

    await request({ url: '/items/1', method: 'PATCH', body: { name: 'X' } });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('PATCH');
  });

  it('should make a DELETE request', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 204, statusText: 'No Content' }),
    );

    const client = createHttix({ baseURL: BASE });
    const request = createRequestMethod(client);

    const response = await request({ url: '/items/1', method: 'DELETE' });

    expect(response.status).toBe(204);

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('DELETE');
  });

  it('should make a HEAD request', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 200, statusText: 'OK' }),
    );

    const client = createHttix({ baseURL: BASE });
    const request = createRequestMethod(client);

    const response = await request({ url: '/items/1', method: 'HEAD' });

    expect(response.status).toBe(200);

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('HEAD');
  });

  it('should make an OPTIONS request', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 200, statusText: 'OK' }),
    );

    const client = createHttix({ baseURL: BASE });
    const request = createRequestMethod(client);

    const response = await request({ url: '/items/1', method: 'OPTIONS' });

    expect(response.status).toBe(200);

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('OPTIONS');
  });

  it('should use correct URL with query params', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const request = createRequestMethod(client);

    const config: HttixRequestConfig = {
      url: '/data',
      method: 'GET',
      headers: { 'X-Custom': 'header' },
      query: { page: 1, limit: 10 },
    };

    await request(config);

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.url).toContain('api.example.com/data');
    expect(req.url).toContain('page=1');
    expect(req.url).toContain('limit=10');
    expect(req.headers.get('x-custom')).toBe('header');
  });

  it('should support type parameter', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ id: 1, name: 'Test' }),
    );

    const client = createHttix({ baseURL: BASE });
    const request = createRequestMethod(client);

    const response = await request<{ id: number; name: string }>({
      url: '/data',
      method: 'GET',
    });

    expect(response.data.id).toBe(1);
    expect(response.data.name).toBe('Test');
  });

  it('should handle error responses', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Server Error' }), {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = createHttix({ baseURL: BASE });
    const request = createRequestMethod(client);

    await expect(
      request({ url: '/fail', method: 'GET' }),
    ).rejects.toThrow();
  });

  it('should handle network errors', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Failed to fetch'),
    );

    const client = createHttix({ baseURL: BASE });
    const request = createRequestMethod(client);

    await expect(
      request({ url: '/fail', method: 'GET' }),
    ).rejects.toThrow();
  });

  it('should pass timeout config', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const request = createRequestMethod(client);

    await request({ url: '/fast', method: 'GET', timeout: 5000 });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('should handle all HTTP methods', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const request = createRequestMethod(client);

    const methods = [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'HEAD',
      'OPTIONS',
    ] as const;

    for (const method of methods) {
      const response = await request({ url: '/test', method });
      expect(response.status).toBe(200);
    }

    expect(globalThis.fetch).toHaveBeenCalledTimes(methods.length);
  });
});
