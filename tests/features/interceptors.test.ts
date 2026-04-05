import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  InterceptorManager,
  runRequestInterceptors,
  runResponseInterceptors,
  runResponseErrorInterceptors,
} from '../../src/features/interceptors';
import type { HttixRequestConfig, HttixResponse } from '../../src/core/types';
import { HttixError, HttixResponseError } from '../../src/core/errors';

describe('InterceptorManager', () => {
  it('should register a handler and return an id', () => {
    const manager = new InterceptorManager<(c: any) => any, any>();
    const id = manager.use((c) => c);
    expect(id).toBe(0);
  });

  it('should increment id for each handler', () => {
    const manager = new InterceptorManager<(c: any) => any, any>();
    expect(manager.use((c) => c)).toBe(0);
    expect(manager.use((c) => c)).toBe(1);
    expect(manager.use((c) => c)).toBe(2);
  });

  it('should eject handler by id', () => {
    const manager = new InterceptorManager<(c: any) => any, any>();
    const id = manager.use((c) => c);
    manager.eject(id);
    expect(manager.handlers[id]).toBeNull();
  });

  it('should not throw when ejecting invalid id', () => {
    const manager = new InterceptorManager<(c: any) => any, any>();
    expect(() => manager.eject(-1)).not.toThrow();
    expect(() => manager.eject(999)).not.toThrow();
  });

  it('should clear all handlers', () => {
    const manager = new InterceptorManager<(c: any) => any, any>();
    manager.use((c) => c);
    manager.use((c) => c);
    manager.clear();
    expect(manager.handlers).toEqual([]);
  });

  it('should store rejected handler', () => {
    const rejected = vi.fn();
    const manager = new InterceptorManager<(c: any) => any, any>();
    manager.use((c) => c, rejected);
    expect(manager.handlers[0].rejected).toBe(rejected);
  });
});

describe('runRequestInterceptors', () => {
  const baseConfig: HttixRequestConfig = { url: '/test', method: 'GET' };

  it('should pass config through with no interceptors', async () => {
    const manager = new InterceptorManager<(c: HttixRequestConfig) => any, any>();
    const result = await runRequestInterceptors(baseConfig, manager);
    expect(result.url).toBe('/test');
  });

  it('should modify config in request interceptor', async () => {
    const manager = new InterceptorManager<(c: HttixRequestConfig) => any, any>();
    manager.use((config) => ({ ...config, headers: { 'X-Added': 'true' } }));
    const result = await runRequestInterceptors(baseConfig, manager);
    expect((result.headers as any)['X-Added']).toBe('true');
  });

  it('should chain multiple interceptors in order', async () => {
    const manager = new InterceptorManager<(c: HttixRequestConfig) => any, any>();
    manager.use((config) => ({ ...config, url: '/first' }));
    manager.use((config) => ({ ...config, url: '/second' }));
    const result = await runRequestInterceptors(baseConfig, manager);
    expect(result.url).toBe('/second');
  });

  it('should handle async interceptors', async () => {
    const manager = new InterceptorManager<(c: HttixRequestConfig) => any, any>();
    manager.use(async (config) => {
      await new Promise((r) => setTimeout(r, 10));
      return { ...config, url: '/async' };
    });
    const result = await runRequestInterceptors(baseConfig, manager);
    expect(result.url).toBe('/async');
  });

  it('should skip ejected interceptors', async () => {
    const manager = new InterceptorManager<(c: HttixRequestConfig) => any, any>();
    const id = manager.use((config) => ({ ...config, url: '/ejected' }));
    manager.use((config) => ({ ...config, url: '/kept' }));
    manager.eject(id);
    const result = await runRequestInterceptors(baseConfig, manager);
    expect(result.url).toBe('/kept');
  });

  it('should propagate error when fulfilled throws (no rejected handler)', async () => {
    const manager = new InterceptorManager<(c: HttixRequestConfig) => any, any>();
    manager.use(() => {
      throw new Error('Interceptor failed');
    });
    await expect(runRequestInterceptors(baseConfig, manager)).rejects.toThrow('Interceptor failed');
  });

  it('should call rejected handler when fulfilled throws', async () => {
    const manager = new InterceptorManager<(c: HttixRequestConfig) => any, any>();
    manager.use(
      () => {
        throw new Error('Interceptor failed');
      },
      (error) => {
        // Return a fallback config
        return { ...baseConfig, url: '/fallback' };
      },
    );
    const result = await runRequestInterceptors(baseConfig, manager);
    expect(result.url).toBe('/fallback');
  });

  it('should propagate error when rejected handler throws', async () => {
    const manager = new InterceptorManager<(c: HttixRequestConfig) => any, any>();
    manager.use(
      () => {
        throw new Error('fulfilled error');
      },
      () => {
        throw new Error('rejected error');
      },
    );
    await expect(runRequestInterceptors(baseConfig, manager)).rejects.toThrow('fulfilled error');
  });

  it('should continue with current config when rejected returns void', async () => {
    const manager = new InterceptorManager<(c: HttixRequestConfig) => any, any>();
    manager.use(
      () => {
        throw new Error('fulfilled error');
      },
      () => {
        // Return void (undefined) — should continue with current config
      },
    );
    const result = await runRequestInterceptors(baseConfig, manager);
    expect(result.url).toBe('/test');
  });
});

describe('runResponseInterceptors', () => {
  const baseResponse: HttixResponse<any> = {
    data: { key: 'value' },
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    ok: true,
    raw: new Response(),
    timing: 42,
    config: { url: '/test' },
  };

  it('should pass response through with no interceptors', async () => {
    const manager = new InterceptorManager<(r: any) => any, any>();
    const result = await runResponseInterceptors(baseResponse, manager);
    expect(result.data).toEqual({ key: 'value' });
  });

  it('should modify response', async () => {
    const manager = new InterceptorManager<(r: HttixResponse<any>) => any, any>();
    manager.use((response) => ({ ...response, data: { key: 'modified' } }));
    const result = await runResponseInterceptors(baseResponse, manager);
    expect(result.data).toEqual({ key: 'modified' });
  });

  it('should chain multiple interceptors', async () => {
    const manager = new InterceptorManager<(r: HttixResponse<any>) => any, any>();
    manager.use((response) => ({ ...response, data: 'first' }));
    manager.use((response) => ({ ...response, data: 'second' }));
    const result = await runResponseInterceptors(baseResponse, manager);
    expect(result.data).toBe('second');
  });

  it('should handle async response interceptors', async () => {
    const manager = new InterceptorManager<(r: HttixResponse<any>) => any, any>();
    manager.use(async (response) => {
      await new Promise((r) => setTimeout(r, 10));
      return { ...response, data: 'async-modified' };
    });
    const result = await runResponseInterceptors(baseResponse, manager);
    expect(result.data).toBe('async-modified');
  });

  it('should propagate error when fulfilled throws (no rejected handler)', async () => {
    const manager = new InterceptorManager<(r: any) => any, any>();
    manager.use(() => {
      throw new Error('Response interceptor failed');
    });
    await expect(runResponseInterceptors(baseResponse, manager)).rejects.toThrow('Response interceptor failed');
  });

  it('should use rejected handler on error', async () => {
    const manager = new InterceptorManager<(r: any) => any, any>();
    manager.use(
      () => {
        throw new Error('failed');
      },
      () => baseResponse,
    );
    const result = await runResponseInterceptors(baseResponse, manager);
    expect(result.data).toEqual({ key: 'value' });
  });
});

describe('runResponseErrorInterceptors', () => {
  it('should re-throw error when no handlers can resolve it', async () => {
    const manager = new InterceptorManager<(r: any) => any, any>();
    const error = new HttixResponseError(500, 'Server Error', null);
    await expect(runResponseErrorInterceptors(error, manager)).rejects.toThrow(error);
  });

  it('should return response when rejected handler returns one', async () => {
    const manager = new InterceptorManager<(r: any) => any, any>();
    const recoveryResponse: HttixResponse<any> = {
      data: { fallback: true },
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      ok: true,
      raw: new Response(),
      timing: 10,
      config: { url: '/test' },
    };
    manager.use(
      (r) => r,
      () => recoveryResponse,
    );
    const error = new HttixResponseError(401, 'Unauthorized', null);
    const result = await runResponseErrorInterceptors(error, manager);
    expect(result).toBe(recoveryResponse);
  });

  it('should skip handlers without rejected function', async () => {
    const manager = new InterceptorManager<(r: any) => any, any>();
    manager.use((r) => r);
    const error = new HttixResponseError(500, 'Server Error', null);
    await expect(runResponseErrorInterceptors(error, manager)).rejects.toThrow(error);
  });

  it('should continue to next handler when rejected throws', async () => {
    const manager = new InterceptorManager<(r: any) => any, any>();
    const recoveryResponse: HttixResponse<any> = {
      data: { recovered: true },
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      ok: true,
      raw: new Response(),
      timing: 10,
      config: { url: '/test' },
    };

    manager.use(
      (r) => r,
      () => {
        throw new Error('first rejected failed');
      },
    );
    manager.use(
      (r) => r,
      () => recoveryResponse,
    );

    const error = new HttixResponseError(500, 'Server Error', null);
    const result = await runResponseErrorInterceptors(error, manager);
    expect(result).toBe(recoveryResponse);
  });

  it('should continue to next handler when rejected returns void/null', async () => {
    const manager = new InterceptorManager<(r: any) => any, any>();
    const recoveryResponse: HttixResponse<any> = {
      data: { recovered: true },
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      ok: true,
      raw: new Response(),
      timing: 10,
      config: { url: '/test' },
    };

    manager.use(
      (r) => r,
      () => undefined,
    );
    manager.use(
      (r) => r,
      () => recoveryResponse,
    );

    const error = new HttixResponseError(500, 'Server Error', null);
    const result = await runResponseErrorInterceptors(error, manager);
    expect(result).toBe(recoveryResponse);
  });
});
