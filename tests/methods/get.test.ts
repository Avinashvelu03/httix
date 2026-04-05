import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGetMethod } from '../../src/methods/get';
import { createHttix } from '../../src/core/client';

const BASE = 'https://api.example.com';

const mockJsonOk = (data: unknown) =>
  new Response(JSON.stringify(data), {
    status: 200,
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

describe('createGetMethod', () => {
  it('should create a GET function bound to the client', () => {
    const client = createHttix({ baseURL: BASE });
    const get = createGetMethod(client);
    expect(typeof get).toBe('function');
  });

  it('should use GET method', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const get = createGetMethod(client);
    await get('/test');

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('GET');
  });

  it('should use correct URL', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const get = createGetMethod(client);
    await get('/users/42');

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.url).toContain('api.example.com/users/42');
  });

  it('should parse JSON response', async () => {
    const data = { users: [{ id: 1, name: 'Alice' }] };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk(data),
    );

    const client = createHttix({ baseURL: BASE });
    const get = createGetMethod(client);
    const response = await get('/users');

    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
    expect(response.data).toEqual(data);
  });

  it('should support type parameter', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ id: 1, name: 'Bob' }),
    );

    const client = createHttix({ baseURL: BASE });
    const get = createGetMethod(client);
    const response = await get<{ id: number; name: string }>('/user');

    expect(response.data.id).toBe(1);
    expect(response.data.name).toBe('Bob');
  });

  it('should pass config options', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const get = createGetMethod(client);
    await get('/data', { headers: { 'X-Custom': 'value' } });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.headers.get('x-custom')).toBe('value');
  });

  it('should pass query params', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const get = createGetMethod(client);
    await get('/search', { query: { q: 'test', page: 1 } });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.url).toContain('q=test');
    expect(req.url).toContain('page=1');
  });

  it('should pass path params', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ id: 42 }),
    );

    const client = createHttix({ baseURL: BASE });
    const get = createGetMethod(client);
    await get('/users/:id', { params: { id: 42 } });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.url).toContain('/users/42');
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
    const get = createGetMethod(client);

    await expect(get('/missing')).rejects.toThrow();
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
    const get = createGetMethod(client);

    await expect(get('/error')).rejects.toThrow();
  });

  it('should handle network errors', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Failed to fetch'),
    );

    const client = createHttix({ baseURL: BASE });
    const get = createGetMethod(client);

    await expect(get('/fail')).rejects.toThrow();
  });

  it('should not send body', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const get = createGetMethod(client);
    await get('/data');

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.body).toBeNull();
  });
});
