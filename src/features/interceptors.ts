/**
 * httix — Interceptor management and execution
 */

import type {
  HttixRequestConfig,
  HttixResponse,
  InterceptorHandler,
  InterceptorManager as InterceptorManagerInterface,
  RequestInterceptor,
  RequestErrorInterceptor,
  ResponseErrorInterceptor,
  ResponseInterceptor,
} from '../core/types';
import type { HttixError } from '../core/errors';

/**
 * Manages a list of interceptor handlers for requests or responses.
 * Handlers can be added, ejected by id, or cleared entirely.
 */
export class InterceptorManager<F, E> implements InterceptorManagerInterface<F, E> {
  handlers: InterceptorHandler<F, E>[] = [];

  use(fulfilled: F, rejected?: E): number {
    this.handlers.push({ fulfilled, rejected });
    return this.handlers.length - 1;
  }

  eject(id: number): void {
    if (id >= 0 && id < this.handlers.length) {
      this.handlers[id] = null as unknown as InterceptorHandler<F, E>;
    }
  }

  clear(): void {
    this.handlers = [];
  }
}

/**
 * Run request interceptors sequentially, chaining each fulfilled handler's
 * output as the next handler's input. If a handler's fulfilled function
 * throws and it has a rejected handler, the rejected handler is called.
 * If the rejected handler returns a config the chain continues; if it
 * re-throws, the error propagates.
 */
export async function runRequestInterceptors(
  config: HttixRequestConfig,
  interceptors: InterceptorManagerInterface<RequestInterceptor, RequestErrorInterceptor>,
): Promise<HttixRequestConfig> {
  let currentConfig = config;

  for (const handler of interceptors.handlers) {
    if (handler === null) continue;

    try {
      currentConfig = await handler.fulfilled(currentConfig);
    } catch (err) {
      if (handler.rejected) {
        try {
          const result = await handler.rejected(err as HttixError);
          // If rejected returns a config, continue the chain with it
          if (result !== undefined) {
            currentConfig = result;
          }
          // If rejected returns void, continue with the current config
        } catch {
          // Rejected handler threw — propagate the error
          throw err;
        }
      } else {
        // No rejected handler — propagate the error
        throw err;
      }
    }
  }

  return currentConfig;
}

/**
 * Run response interceptors sequentially, chaining each fulfilled handler's
 * output as the next handler's input. Error handling mirrors
 * runRequestInterceptors.
 */
export async function runResponseInterceptors<T>(
  response: HttixResponse<T>,
  interceptors: InterceptorManagerInterface<ResponseInterceptor<T>, ResponseErrorInterceptor>,
): Promise<HttixResponse<T>> {
  let currentResponse = response;

  for (const handler of interceptors.handlers) {
    if (handler === null) continue;

    try {
      currentResponse = await handler.fulfilled(currentResponse);
    } catch (err) {
      if (handler.rejected) {
        try {
          const result = await handler.rejected(err as HttixError);
          if (result !== undefined) {
            currentResponse = result as HttixResponse<T>;
          }
        } catch {
          throw err;
        }
      } else {
        throw err;
      }
    }
  }

  return currentResponse;
}

/**
 * Attempt to handle a response error through response interceptors' rejected
 * handlers. If any rejected handler returns a response, the error is considered
 * "handled" and that response is returned. If no handler resolves the error,
 * the original error is re-thrown.
 */
export async function runResponseErrorInterceptors(
  error: HttixError,
  interceptors: InterceptorManagerInterface<ResponseInterceptor<unknown>, ResponseErrorInterceptor>,
): Promise<HttixResponse<unknown>> {
  for (const handler of interceptors.handlers) {
    if (handler === null) continue;

    if (handler.rejected) {
      try {
        const result = await handler.rejected(error);
        // If the rejected handler returns a response, the error is handled
        if (result !== undefined && result !== null) {
          return result;
        }
        // If rejected returns void, continue to next handler
      } catch {
        // Rejected handler threw — continue to next handler
        continue;
      }
    }
  }

  // No handler resolved the error — re-throw the original
  throw error;
}
