import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDeleteMethod } from '../../src/methods/delete';
import { createHttix } from '../../src/core/client';

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

describe('createDeleteMethod', () => {
  it('should create a DELETE function bound to the client', () => {
    const client = createHttix({ baseURL: BASE });
    const del = createDeleteMethod(client);
    expect(typeof del).toBe('function');
  });

  it('should use DELETE method', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 204, statusText: 'No Content' }),
    );

    const client = createHttix({ baseURL: BASE });
    const del = createDeleteMethod(client);
    await del('/users/1');

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('DELETE');
  });

  it('should use correct URL', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 204, statusText: 'No Content' }),
    );

    const client = createHttix({ baseURL: BASE });
    const del = createDeleteMethod(client);
    await del('/users/42');

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.url).toContain('api.example.com/users/42');
  });

  it('should work without body', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 204, statusText: 'No Content' }),
    );

    const client = createHttix({ baseURL: BASE });
    const del = createDeleteMethod(client);
    const response = await del('/users/1');

    expect(response.status).toBe(204);

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('DELETE');
    expect(req.body).toBeNull();
  });

  it('should send JSON body when provided', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ deleted: 3 }),
    );

    const client = createHttix({ baseURL: BASE });
    const del = createDeleteMethod(client);
    const response = await del('/batch', { ids: [1, 2, 3] });

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ deleted: 3 });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('DELETE');
    expect(req.headers.get('content-type')).toBe('application/json');

    const bodyText = await req.text();
    expect(JSON.parse(bodyText)).toEqual({ ids: [1, 2, 3] });
  });

  it('should set Content-Type for object body', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const del = createDeleteMethod(client);
    await del('/batch', { ids: [1, 2] });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.headers.get('content-type')).toBe('application/json');
  });

  it('should support type parameter', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ deleted: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const del = createDeleteMethod(client);
    const response = await del<{ deleted: boolean }>('/users/1');

    expect(response.data.deleted).toBe(true);
  });

  it('should pass config options', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    const client = createHttix({ baseURL: BASE });
    const del = createDeleteMethod(client);
    await del('/users/1', undefined, {
      headers: { 'X-Custom': 'value' },
    });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.headers.get('x-custom')).toBe('value');
  });

  it('should pass query params', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    const client = createHttix({ baseURL: BASE });
    const del = createDeleteMethod(client);
    await del('/users/1', undefined, { query: { force: 'true' } });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.url).toContain('force=true');
  });

  it('should handle 4xx error responses', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        statusText: 'Not Found',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = createHttix({ baseURL: BASE });
    const del = createDeleteMethod(client);

    await expect(del('/users/999')).rejects.toThrow();
  });

  it('should handle 5xx error responses', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Server Error' }), {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = createHttix({ baseURL: BASE });
    const del = createDeleteMethod(client);

    await expect(del('/users/1')).rejects.toThrow();
  });

  it('should handle network errors', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Failed to fetch'),
    );

    const client = createHttix({ baseURL: BASE });
    const del = createDeleteMethod(client);

    await expect(del('/fail')).rejects.toThrow();
  });
});
