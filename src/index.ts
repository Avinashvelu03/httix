/**
 * httix — Main entry point
 *
 * Re-exports every public API surface from the library and creates a
 * pre-configured default client instance for convenience.
 *
 * @example
 * ```ts
 * // 1. Use the default instance directly
 * import httix from 'httix';
 * const { data } = await httix.get('/users');
 *
 * // 2. Create a custom instance
 * import { createHttix } from 'httix';
 * const api = createHttix({ baseURL: 'https://api.example.com' });
 * const { data } = await api.get('/users');
 * ```
 */

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

export { HttixClientImpl, createHttix } from './core/client';
export type { HttixClient as HttixClientInterface } from './core/types';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export {
  HttixError,
  HttixRequestError,
  HttixResponseError,
  HttixTimeoutError,
  HttixAbortError,
  HttixRetryError,
} from './core/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
  HttpMethod,
  RequestBody,
  QueryParamValue,
  QueryParams,
  PathParams,
  HttixHeaders,
  BackoffStrategy,
  RetryConfig,
  RateLimitConfig,
  DedupConfig,
  AuthConfig,
  BearerAuthConfig,
  BasicAuthConfig,
  ApiKeyAuthConfig,
  PaginationStyle,
  PaginationConfig,
  DownloadProgress,
  SSEEvent,
  StreamConfig,
  MiddlewareContext,
  MiddlewareFn,
  RequestInterceptor,
  RequestErrorInterceptor,
  ResponseInterceptor,
  ResponseErrorInterceptor,
  InterceptorHandler,
  InterceptorManager as InterceptorManagerInterface,
  HttixConfig,
  HttixRequestConfig,
  HttixResponse,
  HttixPlugin,
} from './core/types';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export {
  DEFAULT_CONFIG,
  DEFAULT_RETRY,
  DEFAULT_TIMEOUT,
  DEFAULT_HEADERS,
  DEFAULT_REQUEST_CONFIG,
} from './core/defaults';

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

export { InterceptorManager } from './features/interceptors';
export { createCancelToken, isCancel, createCancelError } from './features/abort';
export { RequestDeduplicator } from './features/dedup';
export { RateLimiter } from './features/rateLimit';
export { composeMiddleware } from './features/middleware';
export { parseSSE, parseNDJSON, createProgressReader } from './features/streaming';
export { retryRequest, parseRetryAfter } from './features/retry';
export { createTimeoutController, clearTimeoutController } from './features/timeout';
export { applyAuth, createAuthInterceptor, createAuthRefreshHandler } from './features/auth';
export { createPaginator, parseLinkHeader } from './features/pagination';

// ---------------------------------------------------------------------------
// Method factories
// ---------------------------------------------------------------------------

export { createGetMethod } from './methods/get';
export { createPostMethod } from './methods/post';
export { createPutMethod } from './methods/put';
export { createPatchMethod } from './methods/patch';
export { createDeleteMethod } from './methods/delete';
export { createHeadMethod } from './methods/head';
export { createOptionsMethod } from './methods/options';
export { createRequestMethod } from './methods/request';

// ---------------------------------------------------------------------------
// Default instance
// ---------------------------------------------------------------------------

import { HttixClientImpl } from './core/client';
import { isCancel } from './features/abort';

/**
 * Pre-configured default client instance.
 *
 * All HTTP methods are pre-bound so they can be destructured or passed
 * around without losing the `this` context.
 *
 * @example
 * ```ts
 * import httix from 'httix';
 *
 * // Direct usage
 * const { data } = await httix.get('/users');
 *
 * // Destructure for ergonomic usage
 * const { get, post, put, patch, delete: remove } = httix;
 *
 * // Create a derived client with different defaults
 * const adminApi = httix.create({
 *   baseURL: 'https://admin.api.example.com',
 *   auth: { type: 'bearer', token: adminToken },
 * });
 * ```
 */
const defaultClient = new HttixClientImpl();

const httix = {
  /** Core request method */
  request: defaultClient.request.bind(defaultClient),

  /** HTTP method shortcuts */
  get: defaultClient.get.bind(defaultClient),
  post: defaultClient.post.bind(defaultClient),
  put: defaultClient.put.bind(defaultClient),
  patch: defaultClient.patch.bind(defaultClient),
  delete: defaultClient.delete.bind(defaultClient),
  head: defaultClient.head.bind(defaultClient),
  options: defaultClient.options.bind(defaultClient),

  /** Interceptor managers */
  interceptors: defaultClient.interceptors,

  /** Stream utilities */
  stream: defaultClient.stream,

  /** Pagination helper */
  paginate: defaultClient.paginate,

  /** Client defaults */
  defaults: defaultClient.defaults,

  /** Register middleware */
  use: defaultClient.use.bind(defaultClient),

  /** Create a new client with merged configuration */
  create: (config?: Partial<import('./core/types').HttixConfig>) =>
    new HttixClientImpl(config),

  /** Cancel all in-flight requests */
  cancelAll: defaultClient.cancelAll.bind(defaultClient),

  /** Check whether an error is a cancellation error */
  isCancel,

  /**
   * Alias for {@link createHttix} — create a new client instance.
   */
  createHttix: (config?: Partial<import('./core/types').HttixConfig>) =>
    new HttixClientImpl(config),
};

export default httix;
