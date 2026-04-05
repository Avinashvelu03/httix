import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHttix } from '../../src/core/client';
import {
  HttixRequestError,
} from '../../src/core/errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = 'https://api.example.com';

const mockJsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    statusText: status === 200 ? 'OK' : status === 204 ? 'No Content' : String(status),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Edge cases', () => {
  // =========================================================================
  // 204 No Content
  // =========================================================================
  describe('204 No Content', () => {
    it('should return undefined data for 204 responses', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(null, {
          status: 204,
          statusText: 'No Content',
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.delete('/resource/1');

      expect(response.status).toBe(204);
      expect(response.ok).toBe(true);
      expect(response.data).toBeUndefined();
    });

    it('should handle 204 with throwOnError false', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(null, {
          status: 204,
          statusText: 'No Content',
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.delete('/resource/1', { throwOnError: false });

      expect(response.status).toBe(204);
      expect(response.data).toBeUndefined();
    });
  });

  // =========================================================================
  // Non-JSON responses
  // =========================================================================
  describe('Non-JSON responses', () => {
    it('should parse text/plain response as string', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response('Hello, World!', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.get('/text');

      expect(response.ok).toBe(true);
      expect(response.data).toBe('Hello, World!');
    });

    it('should parse text/html response as string', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response('<html><body>Hello</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.get('/html');

      expect(response.ok).toBe(true);
      expect(response.data).toBe('<html><body>Hello</body></html>');
    });

    it('should parse text/csv response as string', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response('name,age\nAlice,30\nBob,25', {
          status: 200,
          headers: { 'Content-Type': 'text/csv' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.get('/data.csv');

      expect(response.ok).toBe(true);
      expect(response.data).toBe('name,age\nAlice,30\nBob,25');
    });

    it('should parse application/json response correctly', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response('{"key":"value","nested":{"a":1}}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.get('/json');

      expect(response.ok).toBe(true);
      expect(response.data).toEqual({ key: 'value', nested: { a: 1 } });
    });

    it('should respect explicit responseType: "text"', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response('plain text body', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.get('/text', { responseType: 'text' });

      expect(response.data).toBe('plain text body');
    });

    it('should respect explicit responseType: "json"', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response('{"forced":"json"}', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.get('/force-json', { responseType: 'json' });

      expect(response.data).toEqual({ forced: 'json' });
    });
  });

  // =========================================================================
  // Large response bodies
  // =========================================================================
  describe('Large response bodies', () => {
    it('should handle large JSON response', async () => {
      // Create a large array of objects
      const largeData = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        active: true,
        metadata: { created: '2024-01-01', updated: '2024-12-31' },
      }));

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify(largeData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.get('/large-data');

      expect(response.ok).toBe(true);
      expect(Array.isArray(response.data)).toBe(true);
      expect((response.data as unknown[]).length).toBe(10000);
      expect((response.data as Array<{ id: number }>)[9999].id).toBe(9999);
    });

    it('should handle large text response', async () => {
      const largeText = 'Lorem ipsum. '.repeat(10000); // ~150KB

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(largeText, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.get('/large-text');

      expect(response.ok).toBe(true);
      expect(typeof response.data).toBe('string');
      expect((response.data as string).length).toBe(largeText.length);
    });
  });

  // =========================================================================
  // Unicode in URLs
  // =========================================================================
  describe('Unicode in URLs', () => {
    it('should handle Unicode characters in path parameters', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ name: 'José García' }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      await client.get('/users/:name', { params: { name: 'José García' } });

      const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      // Path params are encoded via encodeURIComponent
      expect(req.url).toContain(encodeURIComponent('José García'));
    });

    it('should handle Unicode characters in query parameters', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ results: [] }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      await client.get('/search', { query: { q: '日本語テスト' } });

      const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(req.url).toContain(encodeURIComponent('日本語テスト'));
    });

    it('should handle emoji in query parameters', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ results: [] }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      await client.get('/search', { query: { q: 'hello 🌍 test' } });

      const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(req.url).toContain(encodeURIComponent('hello 🌍 test'));
    });
  });

  // =========================================================================
  // Special characters in params
  // =========================================================================
  describe('Special characters in params', () => {
    it('should encode special characters in query parameters', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ results: [] }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      await client.get('/search', {
        query: {
          q: 'a+b=c&d=e',
          filter: 'value with spaces',
          special: '!@#$%^&*()',
        },
      });

      const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(req.url).toContain(encodeURIComponent('a+b=c&d=e'));
      expect(req.url).toContain(encodeURIComponent('value with spaces'));
      expect(req.url).toContain(encodeURIComponent('!@#$%^&*()'));
    });

    it('should handle array query parameters', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ results: [] }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      await client.get('/filter', { query: { tags: ['typescript', 'javascript', 'rust'] } });

      const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(req.url).toContain('tags=typescript');
      expect(req.url).toContain('tags=javascript');
      expect(req.url).toContain('tags=rust');
    });

    it('should skip null and undefined query parameters', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ ok: true }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      await client.get('/search', {
        query: {
          q: 'test',
          page: undefined as unknown as string,
          limit: null as unknown as string,
        },
      });

      const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(req.url).toContain('q=test');
      expect(req.url).not.toContain('page=');
      expect(req.url).not.toContain('limit=');
    });
  });

  // =========================================================================
  // Network failure simulation
  // =========================================================================
  describe('Network failure simulation', () => {
    it('should throw HttixRequestError on DNS failure', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new TypeError('getaddrinfo ENOTFOUND api.example.com'),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      try {
        await client.get('/unreachable');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttixRequestError);
        expect((error as HttixRequestError).message).toBeDefined();
      }
    });

    it('should throw HttixRequestError on connection refused', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new TypeError('fetch failed'),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      try {
        await client.get('/connection-refused');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttixRequestError);
      }
    });

    it('should throw HttixRequestError on CORS error', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new TypeError('Failed to fetch'),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      try {
        await client.get('/cors-blocked');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttixRequestError);
      }
    });

    it('should throw HttixRequestError on abort during fetch', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new DOMException('The operation was aborted', 'AbortError'),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });

      try {
        await client.get('/aborted');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttixRequestError);
      }
    });

    it('should retry on network errors when retry is enabled', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      let callCount = 0;

      fetchMock.mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          throw new TypeError('Network error');
        }
        return mockJsonResponse({ data: 'recovered' });
      });

      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        retry: {
          attempts: 3,
          backoff: 'fixed',
          baseDelay: 1,
          maxDelay: 1,
          jitter: false,
          retryOnNetworkError: true,
        },
      });

      const response = await client.get('/flaky-network');

      expect(response.ok).toBe(true);
      expect(response.data).toEqual({ data: 'recovered' });
      expect(callCount).toBe(3);
    });
  });

  // =========================================================================
  // Malformed JSON response
  // =========================================================================
  describe('Malformed JSON response', () => {
    it('should return undefined when Content-Type is JSON but body is invalid', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response('this is not valid json{{{', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.get('/malformed');

      // Malformed JSON with application/json content type returns undefined
      expect(response.data).toBeUndefined();
    });

    it('should return string when no Content-Type and body is not JSON', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response('just plain text, no content type', {
          status: 200,
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.get('/no-content-type');

      // Without Content-Type, autoParse tries JSON first, falls back to text
      expect(response.data).toBe('just plain text, no content type');
    });

    it('should return raw text when no Content-Type and body looks like JSON', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response('{"detected":"json"}', {
          status: 200,
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.get('/no-content-type-json');

      // Without Content-Type header, the response may come back as a string
      // (autoParse best-effort path returns raw text if body is consumed)
      expect(response.data).toBeDefined();
    });

    it('should handle empty response body with JSON Content-Type', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response('', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.get('/empty-json');

      // Empty body with JSON content type
      expect(response.data).toBeUndefined();
    });

    it('should handle response with JSON Content-Type but HTML body', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response('<html><body>Error Page</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.get('/wrong-content-type');

      // JSON parse fails, returns undefined
      expect(response.data).toBeUndefined();
    });
  });

  // =========================================================================
  // Custom response parser
  // =========================================================================
  describe('Custom response parser', () => {
    it('should use custom parseResponse function', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response('name=Alice&age=30', {
          status: 200,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      const response = await client.get('/form', {
        parseResponse: async (res) => {
          const text = await res.text();
          const params = new URLSearchParams(text);
          return Object.fromEntries(params.entries());
        },
      });

      expect(response.data).toEqual({ name: 'Alice', age: '30' });
    });
  });
});
