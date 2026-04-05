import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyAuth, createAuthInterceptor, createAuthRefreshHandler } from '../../src/features/auth';
import { HttixResponseError } from '../../src/core/errors';
import type { HttixRequestConfig, BearerAuthConfig } from '../../src/core/types';

describe('applyAuth', () => {
  const baseConfig: HttixRequestConfig = { url: '/test', method: 'GET' };

  it('should add Bearer token to Authorization header', async () => {
    const config = await applyAuth(baseConfig, {
      type: 'bearer',
      token: 'my-secret-token',
    });

    expect((config.headers as Record<string, string>)['Authorization']).toBe('Bearer my-secret-token');
  });

  it('should resolve dynamic bearer token', async () => {
    const config = await applyAuth(baseConfig, {
      type: 'bearer',
      token: () => Promise.resolve('dynamic-token'),
    });

    expect((config.headers as Record<string, string>)['Authorization']).toBe('Bearer dynamic-token');
  });

  it('should add Basic auth header', async () => {
    const config = await applyAuth(baseConfig, {
      type: 'basic',
      username: 'admin',
      password: 'secret',
    });

    const expected = btoa('admin:secret');
    expect((config.headers as Record<string, string>)['Authorization']).toBe(`Basic ${expected}`);
  });

  it('should add API key as header', async () => {
    const config = await applyAuth(baseConfig, {
      type: 'apiKey',
      key: 'X-API-Key',
      value: 'my-key',
      in: 'header',
    });

    expect((config.headers as Record<string, string>)['X-API-Key']).toBe('my-key');
  });

  it('should add API key as query parameter', async () => {
    const config = await applyAuth(baseConfig, {
      type: 'apiKey',
      key: 'api_key',
      value: 'my-key',
      in: 'query',
    });

    expect((config.query as Record<string, string>)['api_key']).toBe('my-key');
  });

  it('should resolve dynamic API key value', async () => {
    const config = await applyAuth(baseConfig, {
      type: 'apiKey',
      key: 'X-API-Key',
      value: () => Promise.resolve('dynamic-key'),
      in: 'header',
    });

    expect((config.headers as Record<string, string>)['X-API-Key']).toBe('dynamic-key');
  });

  it('should not mutate original config', async () => {
    const original = { ...baseConfig, headers: { 'X-Existing': 'value' } };
    const config = await applyAuth(original, {
      type: 'bearer',
      token: 'token',
    });

    expect((original.headers as Record<string, string>)['Authorization']).toBeUndefined();
    expect((config.headers as Record<string, string>)['Authorization']).toBe('Bearer token');
    // Original headers preserved
    expect((config.headers as Record<string, string>)['X-Existing']).toBe('value');
  });

  it('should preserve existing query params when adding API key to query', async () => {
    const config = await applyAuth(
      { ...baseConfig, query: { page: '1' } },
      { type: 'apiKey', key: 'api_key', value: 'my-key', in: 'query' },
    );

    expect((config.query as Record<string, string>)['page']).toBe('1');
    expect((config.query as Record<string, string>)['api_key']).toBe('my-key');
  });
});

describe('createAuthInterceptor', () => {
  it('should return a function that applies auth', async () => {
    const interceptor = createAuthInterceptor({
      type: 'bearer',
      token: 'test-token',
    });

    const config = await interceptor({ url: '/test' });
    expect((config.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token');
  });
});

describe('createAuthRefreshHandler', () => {
  it('should return a no-op handler when no refreshToken is provided', () => {
    const handler = createAuthRefreshHandler({
      type: 'bearer',
      token: 'static-token',
    });

    expect(handler).toBeDefined();
    expect(handler(new Error('any'))).toBeUndefined();
  });

  it('should not handle non-401 errors', async () => {
    const handler = createAuthRefreshHandler({
      type: 'bearer',
      token: 'static-token',
      refreshToken: async () => 'new-token',
    });

    const error = new HttixResponseError(500, 'Server Error', null);
    const result = await handler(error);
    expect(result).toBeUndefined();
  });

  it('should not handle errors without config', async () => {
    const handler = createAuthRefreshHandler({
      type: 'bearer',
      token: 'static-token',
      refreshToken: async () => 'new-token',
    });

    const error = new HttixResponseError(401, 'Unauthorized', null);
    expect(error.config).toBeUndefined();
    const result = await handler(error);
    expect(result).toBeUndefined();
  });

  it('should call refreshToken on 401', async () => {
    const refreshToken = vi.fn().mockResolvedValue('refreshed-token');
    const onTokenRefresh = vi.fn();

    const handler = createAuthRefreshHandler({
      type: 'bearer',
      token: 'old-token',
      refreshToken,
      onTokenRefresh,
    });

    const error = new HttixResponseError(401, 'Unauthorized', null, undefined, { url: '/test' });
    const result = await handler(error);

    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(onTokenRefresh).toHaveBeenCalledWith('refreshed-token');
    expect(result).toBeUndefined();
  });

  it('should re-throw original error when refresh fails', async () => {
    const refreshToken = vi.fn().mockRejectedValue(new Error('Refresh failed'));

    const handler = createAuthRefreshHandler({
      type: 'bearer',
      token: 'old-token',
      refreshToken,
    });

    const error = new HttixResponseError(401, 'Unauthorized', null, undefined, { url: '/test' });

    await expect(handler(error)).rejects.toThrow(error);
  });

  it('should dedup concurrent 401 refreshes', async () => {
    let refreshCount = 0;
    const refreshToken = async () => {
      refreshCount++;
      await new Promise((r) => setTimeout(r, 50));
      return 'new-token';
    };

    const handler = createAuthRefreshHandler({
      type: 'bearer',
      token: 'old-token',
      refreshToken,
    });

    const error = new HttixResponseError(401, 'Unauthorized', null, undefined, { url: '/test' });

    // Multiple concurrent calls should only trigger one refresh
    const [r1, r2] = await Promise.all([handler(error), handler(error)]);

    expect(refreshCount).toBe(1);
    expect(r1).toBeUndefined();
    expect(r2).toBeUndefined();
  });

  it('should update static token after refresh', async () => {
    const authConfig: BearerAuthConfig = {
      type: 'bearer',
      token: 'old-token',
      refreshToken: async () => 'new-token',
    };

    const handler = createAuthRefreshHandler(authConfig);

    const error = new HttixResponseError(401, 'Unauthorized', null, undefined, { url: '/test' });
    await handler(error);

    expect(authConfig.token).toBe('new-token');
  });
});
