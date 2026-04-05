import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { composeMiddleware } from '../../src/features/middleware';
import type { MiddlewareContext, MiddlewareFn } from '../../src/core/types';
import type { HttixRequestConfig, HttixResponse } from '../../src/core/types';

describe('composeMiddleware', () => {
  it('should call next and return when no middleware', async () => {
    const composed = composeMiddleware([]);
    const nextFn = vi.fn();
    const ctx: MiddlewareContext = { request: { url: '/test' } };

    await composed(ctx, nextFn);
    expect(nextFn).toHaveBeenCalledTimes(1);
  });

  it('should execute single middleware', async () => {
    const middleware = vi.fn(async (ctx, next) => {
      (ctx.request as any).modified = true;
      await next();
    });
    const composed = composeMiddleware([middleware]);
    const nextFn = vi.fn();
    const ctx: MiddlewareContext = { request: { url: '/test' } };

    await composed(ctx, nextFn);

    expect(middleware).toHaveBeenCalledTimes(1);
    expect(nextFn).toHaveBeenCalledTimes(1);
    expect((ctx.request as any).modified).toBe(true);
  });

  it('should execute middleware in order (onion model)', async () => {
    const order: string[] = [];

    const mw1: MiddlewareFn = async (_ctx, next) => {
      order.push('mw1 before');
      await next();
      order.push('mw1 after');
    };

    const mw2: MiddlewareFn = async (_ctx, next) => {
      order.push('mw2 before');
      await next();
      order.push('mw2 after');
    };

    const composed = composeMiddleware([mw1, mw2]);
    const ctx: MiddlewareContext = { request: { url: '/test' } };

    await composed(ctx, () => {
      order.push('handler');
      return Promise.resolve();
    });

    expect(order).toEqual([
      'mw1 before',
      'mw2 before',
      'handler',
      'mw2 after',
      'mw1 after',
    ]);
  });

  it('should allow context modification before next', async () => {
    const mw: MiddlewareFn = async (ctx, next) => {
      ctx.request.url = '/modified';
      await next();
    };
    const composed = composeMiddleware([mw]);
    const ctx: MiddlewareContext = { request: { url: '/original' } };

    await composed(ctx, async () => {
      expect(ctx.request.url).toBe('/modified');
    });

    expect(ctx.request.url).toBe('/modified');
  });

  it('should allow context modification after next (response)', async () => {
    const mw: MiddlewareFn = async (ctx, next) => {
      await next();
      if (ctx.response) {
        (ctx.response as any).modified = true;
      }
    };
    const composed = composeMiddleware([mw]);
    const response: HttixResponse<any> = {
      data: { ok: true },
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      ok: true,
      raw: new Response(),
      timing: 10,
      config: { url: '/test' },
    };
    const ctx: MiddlewareContext<HttixRequestConfig, HttixResponse<any>> = {
      request: { url: '/test' },
    };

    await composed(ctx, async () => {
      ctx.response = response;
    });

    expect((ctx.response as any).modified).toBe(true);
  });

  it('should handle async middleware', async () => {
    const mw: MiddlewareFn = async (_ctx, next) => {
      await new Promise((r) => setTimeout(r, 10));
      await next();
    };
    const composed = composeMiddleware([mw]);
    const nextFn = vi.fn();
    const ctx: MiddlewareContext = { request: { url: '/test' } };

    await composed(ctx, nextFn);
    expect(nextFn).toHaveBeenCalledTimes(1);
  });

  it('should propagate error from middleware', async () => {
    const mw: MiddlewareFn = async () => {
      throw new Error('Middleware error');
    };
    const composed = composeMiddleware([mw]);
    const ctx: MiddlewareContext = { request: { url: '/test' } };

    await expect(composed(ctx, vi.fn())).rejects.toThrow('Middleware error');
  });

  it('should propagate error from handler through middleware', async () => {
    const order: string[] = [];
    const mw: MiddlewareFn = async (_ctx, next) => {
      order.push('before');
      try {
        await next();
      } catch (e) {
        order.push('caught');
        throw e;
      }
    };
    const composed = composeMiddleware([mw]);
    const ctx: MiddlewareContext = { request: { url: '/test' } };

    await expect(
      composed(ctx, async () => {
        throw new Error('Handler error');
      }),
    ).rejects.toThrow('Handler error');

    expect(order).toEqual(['before', 'caught']);
  });

  it('should throw error if next() is called multiple times', async () => {
    const mw: MiddlewareFn = async (_ctx, next) => {
      await next();
      await next();
    };
    const composed = composeMiddleware([mw]);
    const ctx: MiddlewareContext = { request: { url: '/test' } };

    await expect(composed(ctx, vi.fn())).rejects.toThrow('next() called multiple times');
  });
});
