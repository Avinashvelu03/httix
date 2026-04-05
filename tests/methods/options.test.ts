import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOptionsMethod } from '../../src/methods/options';
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

describe('createOptionsMethod', () => {
  it('should create an OPTIONS function bound to the client', () => {
    const client = createHttix({ baseURL: BASE });
    const options = createOptionsMethod(client);
    expect(typeof options).toBe('function');
  });

  it('should use OPTIONS method', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, {
        status: 200,
        statusText: 'OK',
        headers: { Allow: 'GET, POST, PUT, DELETE' },
      }),
    );

    const client = createHttix({ baseURL: BASE });
    const options = createOptionsMethod(client);
    await options('/users/1');

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.method).toBe('OPTIONS');
  });

  it('should use correct URL', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 200, statusText: 'OK' }),
    );

    const client = createHttix({ baseURL: BASE });
    const options = createOptionsMethod(client);
    await options('/users/42');

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.url).toContain('api.example.com/users/42');
  });

  it('should return headers in response', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, {
        status: 200,
        statusText: 'OK',
        headers: { Allow: 'GET, POST, PUT, DELETE' },
      }),
    );

    const client = createHttix({ baseURL: BASE });
    const options = createOptionsMethod(client);
    const response = await options('/users/1');

    expect(response.status).toBe(200);
    expect(response.headers.get('allow')).toBe('GET, POST, PUT, DELETE');
  });

  it('should not send body', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 200, statusText: 'OK' }),
    );

    const client = createHttix({ baseURL: BASE });
    const options = createOptionsMethod(client);
    await options('/users/1');

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.body).toBeNull();
  });

  it('should return void data type', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 200, statusText: 'OK' }),
    );

    const client = createHttix({ baseURL: BASE });
    const options = createOptionsMethod(client);
    const response = await options('/users/1');

    expect(response.status).toBe(200);
    expect(response.data).toBeUndefined();
  });

  it('should pass config options', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    const client = createHttix({ baseURL: BASE });
    const options = createOptionsMethod(client);
    await options('/users/1', { headers: { Origin: 'https://example.com' } });

    const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.headers.get('origin')).toBe('https://example.com');
  });

  it('should handle 4xx error responses', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, {
        status: 405,
        statusText: 'Method Not Allowed',
      }),
    );

    const client = createHttix({ baseURL: BASE });
    const options = createOptionsMethod(client);

    await expect(options('/unsupported')).rejects.toThrow();
  });

  it('should handle 5xx error responses', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    );

    const client = createHttix({ baseURL: BASE });
    const options = createOptionsMethod(client);

    await expect(options('/error')).rejects.toThrow();
  });

  it('should handle network errors', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Failed to fetch'),
    );

    const client = createHttix({ baseURL: BASE });
    const options = createOptionsMethod(client);

    await expect(options('/fail')).rejects.toThrow();
  });
});
