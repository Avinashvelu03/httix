/**
 * auth.ts + interceptors.ts coverage gap tests
 */
import { describe, it, expect, vi } from 'vitest';
import { applyAuth, createAuthRefreshHandler } from '../../src/features/auth';
import { InterceptorManager, runResponseInterceptors } from '../../src/features/interceptors';
import type { HttixResponse } from '../../src/core/types';
import { HttixResponseError } from '../../src/core/errors';

describe('applyAuth — Headers instance', () => {
  it('should handle Headers instance as request headers', async () => {
    const hdrs = new Headers();
    hdrs.set('X-Custom', 'val');
    const result = await applyAuth({ url: '/t', method: 'GET', headers: hdrs }, { type: 'bearer', token: 'tok' });
    const h = result.headers as Record<string, string>;
    // Headers keys are lowercased when converted to plain object
    expect(h['x-custom']).toBe('val');
    expect(h['Authorization']).toBe('Bearer tok');
  });
});

describe('createAuthRefreshHandler — Headers in config', () => {
  it('should process request with Headers instance during refresh', async () => {
    const authConfig = { type: 'bearer' as const, token: 'old', refreshToken: vi.fn().mockResolvedValue('new') };
    const handler = createAuthRefreshHandler(authConfig);

    const reqHdrs = new Headers();
    reqHdrs.set('X-Req', 'v');
    const error = new HttixResponseError(401, 'Unauthorized', null, new Headers(), {
      url: '/t', method: 'GET', headers: reqHdrs,
    });

    try { await (handler as Function)(error); } catch { /* ok */ }
    expect(authConfig.refreshToken).toHaveBeenCalled();
  });
});

describe('runResponseInterceptors — rejected throws', () => {
  it('should propagate original error when rejected handler also throws', async () => {
    const mgr = new InterceptorManager<any, any>();
    const origErr = new Error('orig');
    mgr.use(() => { throw origErr; }, () => { throw new Error('rej'); });

    const resp: HttixResponse<any> = {
      data: {}, status: 200, statusText: 'OK', headers: new Headers(),
      ok: true, raw: {} as Response, timing: 100, config: { url: '/t' },
    };

    await expect(runResponseInterceptors(resp, mgr)).rejects.toThrow('orig');
  });
});
