import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHttix } from '../../src/core/client';
import { HttixResponseError } from '../../src/core/errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = 'https://api.example.com';

const mockJsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    statusText: status === 200 ? 'OK' : status === 401 ? 'Unauthorized' : String(status),
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

describe('Retry + Auth refresh combined scenarios', () => {
  // =========================================================================
  // 401 → refresh token → retry original request
  // =========================================================================
  describe('401 triggers token refresh', () => {
    it('should call refreshToken on 401 and update the stored token', async () => {
      const refreshToken = vi.fn().mockResolvedValue('new-access-token');
      const authConfig = {
        type: 'bearer' as const,
        token: 'old-token',
        refreshToken,
        onTokenRefresh: vi.fn(),
      };

      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        retry: false,
        auth: authConfig,
      });

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ error: 'Unauthorized' }, 401),
      );

      // 401 triggers refresh but still throws
      await expect(client.get('/protected')).rejects.toThrow(HttixResponseError);

      // refreshToken should have been called
      expect(refreshToken).toHaveBeenCalledTimes(1);
      expect(authConfig.onTokenRefresh).toHaveBeenCalledWith('new-access-token');
      // Token should be updated for future requests
      expect(authConfig.token).toBe('new-access-token');
    });

    it('should use the refreshed token for subsequent requests', async () => {
      const refreshToken = vi.fn().mockResolvedValue('refreshed-token');
      const authConfig = {
        type: 'bearer' as const,
        token: 'initial-token',
        refreshToken,
      };

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        retry: false,
        auth: authConfig,
      });

      // First request: 401 → refresh → throw
      fetchMock.mockResolvedValue(mockJsonResponse({ error: 'Unauthorized' }, 401));
      await expect(client.get('/protected')).rejects.toThrow(HttixResponseError);
      expect(refreshToken).toHaveBeenCalledTimes(1);

      // Second request: should use new token
      fetchMock.mockResolvedValue(mockJsonResponse({ data: 'success' }));
      const response = await client.get('/protected');

      expect(response.ok).toBe(true);
      expect(response.data).toEqual({ data: 'success' });

      // Verify the Authorization header uses the refreshed token
      const [req] = fetchMock.mock.calls[1];
      expect(req.headers.get('authorization')).toBe('Bearer refreshed-token');
    });

    it('should call onTokenRefresh callback when token is refreshed', async () => {
      const onTokenRefresh = vi.fn();
      const refreshToken = vi.fn().mockResolvedValue('new-token');

      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        retry: false,
        auth: { type: 'bearer', token: 'old', refreshToken, onTokenRefresh },
      });

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ error: 'Unauthorized' }, 401),
      );

      await expect(client.get('/protected')).rejects.toThrow();
      expect(onTokenRefresh).toHaveBeenCalledWith('new-token');
    });
  });

  // =========================================================================
  // Refresh failure handling
  // =========================================================================
  describe('Refresh failure handling', () => {
    it('should re-throw original 401 when refresh fails', async () => {
      const refreshToken = vi.fn().mockRejectedValue(new Error('Refresh token expired'));

      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        retry: false,
        auth: { type: 'bearer', token: 'old-token', refreshToken },
      });

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ error: 'Unauthorized' }, 401),
      );

      // When refresh fails, the original 401 error should be thrown
      await expect(client.get('/protected')).rejects.toThrow(HttixResponseError);
      expect(refreshToken).toHaveBeenCalledTimes(1);
    });

    it('should not update token when refresh fails', async () => {
      const refreshToken = vi.fn().mockRejectedValue(new Error('Server error'));
      const authConfig = {
        type: 'bearer' as const,
        token: 'old-token',
        refreshToken,
      };

      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        retry: false,
        auth: authConfig,
      });

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockJsonResponse({ error: 'Unauthorized' }, 401),
      );

      await expect(client.get('/protected')).rejects.toThrow();
      expect(authConfig.token).toBe('old-token'); // Token should NOT be updated
    });
  });

  // =========================================================================
  // Concurrent 401 → single refresh
  // =========================================================================
  describe('Concurrent 401s trigger only one refresh', () => {
    it('should deduplicate token refresh for concurrent 401 responses', async () => {
      let refreshCount = 0;
      const refreshToken = vi.fn().mockImplementation(async () => {
        refreshCount++;
        await new Promise((r) => setTimeout(r, 30));
        return 'concurrent-new-token';
      });

      const authConfig = {
        type: 'bearer' as const,
        token: 'initial-token',
        refreshToken,
      };

      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        retry: false,
        auth: authConfig,
      });

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;

      // All requests return 401
      fetchMock.mockResolvedValue(mockJsonResponse({ error: 'Unauthorized' }, 401));

      // Fire 3 concurrent requests
      const [r1, r2, r3] = await Promise.allSettled([
        client.get('/resource/1'),
        client.get('/resource/2'),
        client.get('/resource/3'),
      ]);

      // All should have failed
      expect(r1.status).toBe('rejected');
      expect(r2.status).toBe('rejected');
      expect(r3.status).toBe('rejected');

      // But refreshToken should only be called ONCE
      expect(refreshToken).toHaveBeenCalledTimes(1);
      expect(refreshCount).toBe(1);

      // Token should be updated
      expect(authConfig.token).toBe('concurrent-new-token');
    });

    it('should allow subsequent requests to use the token refreshed by a concurrent call', async () => {
      let refreshCount = 0;
      const refreshToken = vi.fn().mockImplementation(async () => {
        refreshCount++;
        await new Promise((r) => setTimeout(r, 20));
        return 'shared-refreshed-token';
      });

      const authConfig = {
        type: 'bearer' as const,
        token: 'initial-token',
        refreshToken,
      };

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        retry: false,
        auth: authConfig,
      });

      // First batch: all 401
      fetchMock.mockResolvedValue(mockJsonResponse({ error: 'Unauthorized' }, 401));

      await Promise.allSettled([
        client.get('/concurrent/1'),
        client.get('/concurrent/2'),
      ]);

      // Both failed, but only one refresh
      expect(refreshCount).toBe(1);

      // Now make a new request that should succeed with the refreshed token
      fetchMock.mockResolvedValue(mockJsonResponse({ data: 'recovered' }));
      const response = await client.get('/concurrent/3');

      expect(response.ok).toBe(true);
      const [req] = fetchMock.mock.calls[2];
      expect(req.headers.get('authorization')).toBe('Bearer shared-refreshed-token');
    });

    it('should handle many concurrent 401s with a single refresh', async () => {
      const refreshToken = vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 20));
        return 'mass-refresh-token';
      });

      const authConfig = {
        type: 'bearer' as const,
        token: 'old',
        refreshToken,
      };

      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        retry: false,
        auth: authConfig,
      });

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValue(mockJsonResponse({ error: 'Unauthorized' }, 401));

      // Fire 10 concurrent requests
      const promises = Array.from({ length: 10 }, (_, i) =>
        client.get(`/resource/${i}`),
      );
      const results = await Promise.allSettled(promises);

      // All should fail
      for (const r of results) {
        expect(r.status).toBe('rejected');
      }

      // But only ONE refresh
      expect(refreshToken).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Retry + auth combined
  // =========================================================================
  describe('Retry + auth combined', () => {
    it('should apply auth interceptor on each retry attempt', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      let callCount = 0;

      fetchMock.mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          return mockJsonResponse({ error: 'Server Error' }, 500);
        }
        return mockJsonResponse({ data: 'eventually-ok' });
      });

      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        auth: { type: 'bearer', token: 'retry-auth-token' },
        retry: {
          attempts: 3,
          backoff: 'fixed',
          baseDelay: 1,
          maxDelay: 1,
          jitter: false,
        },
      });

      const response = await client.get('/flaky-auth');

      expect(response.ok).toBe(true);
      expect(response.data).toEqual({ data: 'eventually-ok' });
      expect(callCount).toBe(3);

      // Auth header should be present on every attempt
      for (const call of fetchMock.mock.calls) {
        const req = call[0] as Request;
        expect(req.headers.get('authorization')).toBe('Bearer retry-auth-token');
      }
    });

    it('should refresh auth token and then succeed on manual retry after 401', async () => {
      const refreshToken = vi.fn().mockResolvedValue('manual-refresh-token');
      const authConfig = {
        type: 'bearer' as const,
        token: 'expired-token',
        refreshToken,
      };

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        retry: false,
        auth: authConfig,
      });

      // First call: 401
      fetchMock.mockResolvedValue(mockJsonResponse({ error: 'Unauthorized' }, 401));

      try {
        await client.get('/protected');
        expect.fail('Should have thrown');
      } catch {
        // Expected 401
      }

      expect(refreshToken).toHaveBeenCalledTimes(1);
      expect(authConfig.token).toBe('manual-refresh-token');

      // Manual retry should now use the new token
      fetchMock.mockResolvedValue(mockJsonResponse({ data: 'finally' }));
      const response = await client.get('/protected');

      expect(response.ok).toBe(true);
      expect(response.data).toEqual({ data: 'finally' });

      const [req] = fetchMock.mock.calls[1];
      expect(req.headers.get('authorization')).toBe('Bearer manual-refresh-token');
    });
  });
});
