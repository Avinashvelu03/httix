import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPostMethod } from '../../src/methods/post';
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

describe('createPostMethod', () => {
  it('should create a POST function bound to the client', () => {
    const client = createHttix({ baseURL: BASE });
    const post = createPostMethod(client);
    expect(typeof post).toBe('function');
  });

  it('should use POST method', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }, 201),
    );

    const client = createHttix({ baseURL: BASE });
    const post = createPostMethod(client);
    await post('/users', { name: 'Alice' });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('POST');
  });

  it('should use correct URL', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ id: 1 }, 201),
    );

    const client = createHttix({ baseURL: BASE });
    const post = createPostMethod(client);
    await post('/users', { name: 'Alice' });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.url).toContain('api.example.com/users');
  });

  it('should send JSON body', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ id: 1, name: 'Alice' }, 201),
    );

    const client = createHttix({ baseURL: BASE });
    const post = createPostMethod(client);
    const response = await post('/users', { name: 'Alice' });

    expect(response.status).toBe(201);
    expect(response.data).toEqual({ id: 1, name: 'Alice' });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('POST');
    expect(req.headers.get('content-type')).toBe('application/json');

    // Verify body content
    const bodyText = await req.text();
    expect(JSON.parse(bodyText)).toEqual({ name: 'Alice' });
  });

  it('should set Content-Type for object body', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const post = createPostMethod(client);
    await post('/data', { key: 'value' });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.headers.get('content-type')).toBe('application/json');
  });

  it('should support FormData body', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const post = createPostMethod(client);
    const fd = new FormData();
    fd.append('file', 'data');
    await post('/upload', fd);

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('POST');
    expect(req.body).not.toBeNull();
    const ct = req.headers.get('content-type');
    expect(ct).toContain('multipart/form-data');
  });

  it('should support string body', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const post = createPostMethod(client);
    await post('/text', 'plain text body');

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('POST');
    expect(req.headers.get('content-type')).not.toBe('application/json');
  });

  it('should work without body', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const post = createPostMethod(client);
    const response = await post('/action');

    expect(response.ok).toBe(true);

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('POST');
    expect(req.body).toBeNull();
  });

  it('should pass config options', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const post = createPostMethod(client);
    await post('/data', { key: 'value' }, {
      headers: { 'X-Custom': 'header' },
    });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.headers.get('x-custom')).toBe('header');
  });

  it('should pass query params', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ ok: true }),
    );

    const client = createHttix({ baseURL: BASE });
    const post = createPostMethod(client);
    await post('/data', { key: 'value' }, { query: { debug: '1' } });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.url).toContain('debug=1');
  });

  it('should support type parameter', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonOk({ id: 1, name: 'Created' }, 201),
    );

    const client = createHttix({ baseURL: BASE });
    const post = createPostMethod(client);
    const response = await post<{ id: number; name: string }>(
      '/users',
      { name: 'Created' },
    );

    expect(response.data.id).toBe(1);
    expect(response.data.name).toBe('Created');
  });

  it('should handle 4xx error responses', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Bad Request' }), {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = createHttix({ baseURL: BASE });
    const post = createPostMethod(client);

    await expect(post('/users', { invalid: true })).rejects.toThrow();
  });

  it('should handle network errors', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Failed to fetch'),
    );

    const client = createHttix({ baseURL: BASE });
    const post = createPostMethod(client);

    await expect(post('/fail')).rejects.toThrow();
  });
});
