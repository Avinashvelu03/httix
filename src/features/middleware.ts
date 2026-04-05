/**
 * httix — Koa-style middleware composition
 */

import type { HttixRequestConfig, HttixResponse, MiddlewareContext, MiddlewareFn } from '../core/types';

/**
 * Compose an array of middleware functions into a single function.
 *
 * The composition follows the Koa "onion" model: each middleware is called
 * with a context and a `next` function that invokes the next middleware in
 * the chain. Code before `await next()` runs on the way in; code after
 * `await next()` runs on the way out (in reverse order).
 *
 * If no middlewares are provided, the composed function simply calls `next`.
 *
 * @throws {Error} If `next()` is called more than once in a single middleware.
 */
export function composeMiddleware<T>(
  middlewares: MiddlewareFn<T>[],
): (ctx: MiddlewareContext, next: () => Promise<void>) => Promise<void> {
  return function composed(ctx, next) {
    let index = -1;

    async function dispatch(i: number): Promise<void> {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;

      const fn = middlewares[i];
      if (!fn) {
        return next();
      }

      await fn(ctx as MiddlewareContext<HttixRequestConfig, HttixResponse<T>>, () => dispatch(i + 1));
    }

    return dispatch(0);
  };
}
