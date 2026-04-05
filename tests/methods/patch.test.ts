import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPatchMethod } from '../../src/methods/patch';
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

describe('createPatchMethod', () => {
  it('should create a PATCH function bound to the client', () => {
    const client = createHttix({ baseURL: BASE });
    const patch = createPatchMethod(client);
    expect(typeof patch).toBe('function');
  });

  it('should use PATCH method', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const patch = createPatchMethod(client);
    await patch('/users/1', { name: 'Patched' });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('PATCH');
  });

  it('should use correct URL', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const patch = createPatchMethod(client);
    await patch('/users/42', { name: 'Patched' });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.url).toContain('api.example.com/users/42');
  });

  it('should send JSON body', async () => {
    const data = { id: 1, name: 'Patched' };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk(data),
    );

    const client = createHttix({ baseURL: BASE });
    const patch = createPatchMethod(client);
    const response = await patch('/users/1', { name: 'Patched' });

    expect(response.status).toBe(200);
    expect(response.data).toEqual(data);

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('PATCH');
    expect(req.headers.get('content-type')).toBe('application/json');

    const bodyText = await req.text();
    expect(JSON.parse(bodyText)).toEqual({ name: 'Patched' });
  });

  it('should set Content-Type for object body', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const patch = createPatchMethod(client);
    await patch('/users/1', { name: 'X' });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.headers.get('content-type')).toBe('application/json');
  });

  it('should support type parameter', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ id: 1, name: 'Patched' }),
    );

    const client = createHttix({ baseURL: BASE });
    const patch = createPatchMethod(client);
    const response = await patch<{ id: number; name: string }>(
      '/users/1',
      { name: 'Patched' },
    );

    expect(response.data.id).toBe(1);
    expect(response.data.name).toBe('Patched');
  });

  it('should pass config options', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const patch = createPatchMethod(client);
    await patch('/users/1', { name: 'X' }, {
      headers: { 'X-If-Match': '123' },
    });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.headers.get('x-if-match')).toBe('123');
  });

  it('should pass query params', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const patch = createPatchMethod(client);
    await patch('/users/1', { name: 'X' }, { query: { dry: '1' } });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.url).toContain('dry=1');
  });

  it('should handle 4xx error responses', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Conflict' }), {
        status: 409,
        statusText: 'Conflict',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = createHttix({ baseURL: BASE });
    const patch = createPatchMethod(client);

    await expect(patch('/users/1', { name: 'X' })).rejects.toThrow();
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
    const patch = createPatchMethod(client);

    await expect(patch('/users/1', { name: 'X' })).rejects.toThrow();
  });

  it('should handle network errors', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Failed to fetch'),
    );

    const client = createHttix({ baseURL: BASE });
    const patch = createPatchMethod(client);

    await expect(patch('/fail')).rejects.toThrow();
  });

  it('should work without body', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const patch = createPatchMethod(client);
    const response = await patch('/action');

    expect(response.ok).toBe(true);

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('PATCH');
  });
});
