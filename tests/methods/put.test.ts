import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPutMethod } from '../../src/methods/put';
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

describe('createPutMethod', () => {
  it('should create a PUT function bound to the client', () => {
    const client = createHttix({ baseURL: BASE });
    const put = createPutMethod(client);
    expect(typeof put).toBe('function');
  });

  it('should use PUT method', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const put = createPutMethod(client);
    await put('/users/1', { name: 'Updated' });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('PUT');
  });

  it('should use correct URL', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const put = createPutMethod(client);
    await put('/users/42', { name: 'X' });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.url).toContain('api.example.com/users/42');
  });

  it('should send JSON body', async () => {
    const data = { id: 1, name: 'Updated' };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk(data),
    );

    const client = createHttix({ baseURL: BASE });
    const put = createPutMethod(client);
    const response = await put('/users/1', { name: 'Updated' });

    expect(response.status).toBe(200);
    expect(response.data).toEqual(data);

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('PUT');
    expect(req.headers.get('content-type')).toBe('application/json');

    const bodyText = await req.text();
    expect(JSON.parse(bodyText)).toEqual({ name: 'Updated' });
  });

  it('should set Content-Type for object body', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const put = createPutMethod(client);
    await put('/users/1', { name: 'X' });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.headers.get('content-type')).toBe('application/json');
  });

  it('should support type parameter', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ id: 1, name: 'Updated' }),
    );

    const client = createHttix({ baseURL: BASE });
    const put = createPutMethod(client);
    const response = await put<{ id: number; name: string }>(
      '/users/1',
      { name: 'Updated' },
    );

    expect(response.data.id).toBe(1);
    expect(response.data.name).toBe('Updated');
  });

  it('should pass config options', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const put = createPutMethod(client);
    await put('/users/1', { name: 'X' }, { throwOnError: false });

    expect(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    ).toBeDefined();
  });

  it('should pass query params', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const put = createPutMethod(client);
    await put('/users/1', { name: 'X' }, { query: { force: 'true' } });

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
    const put = createPutMethod(client);

    await expect(put('/users/999', { name: 'X' })).rejects.toThrow();
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
    const put = createPutMethod(client);

    await expect(put('/users/1', { name: 'X' })).rejects.toThrow();
  });

  it('should handle network errors', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Failed to fetch'),
    );

    const client = createHttix({ baseURL: BASE });
    const put = createPutMethod(client);

    await expect(put('/fail')).rejects.toThrow();
  });

  it('should work without body', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const put = createPutMethod(client);
    const response = await put('/action');

    expect(response.ok).toBe(true);

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('PUT');
  });
});
