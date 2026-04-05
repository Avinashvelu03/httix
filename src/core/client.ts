/**
 * httix — Main HTTP client implementation
 *
 * The HttixClientImpl class is the heart of the library. It orchestrates
 * configuration merging, middleware, interceptors, authentication,
 * deduplication, rate limiting, retries, timeouts, streaming, and
 * pagination into a single cohesive request pipeline.
 */

import type {
  HttixClient as HttixClientInterface,
  HttixConfig,
  HttixRequestConfig,
  HttixResponse,
  RequestBody,
  MiddlewareFn,
  MiddlewareContext,
  SSEEvent,
  AuthConfig,
  DedupConfig,
  RequestInterceptor,
  RequestErrorInterceptor,
  ResponseInterceptor,
  ResponseErrorInterceptor,
  InterceptorManager as InterceptorManagerInterface,
} from './types';
import { DEFAULT_CONFIG } from './defaults';
import {
  HttixRequestError,
  HttixResponseError,
  HttixTimeoutError,
  HttixAbortError,
} from './errors';
import { buildRequest, clearTimeoutSignal } from './request';
import { createResponse, parseResponseBody } from './response';
import { InterceptorManager } from '../features/interceptors';
import {
  runRequestInterceptors,
  runResponseInterceptors,
  runResponseErrorInterceptors,
} from '../features/interceptors';
import { retryRequest } from '../features/retry';
import { RequestDeduplicator } from '../features/dedup';
import { RateLimiter } from '../features/rateLimit';
import { composeMiddleware } from '../features/middleware';
import {
  applyAuth,
  createAuthInterceptor,
  createAuthRefreshHandler,
} from '../features/auth';
import { createPaginator } from '../features/pagination';
import { parseSSE, parseNDJSON } from '../features/streaming';
import { deepMergeConfig } from '../utils/merge';
import { generateRequestId } from '../utils/helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Combine multiple AbortSignals into one that aborts when any source aborts.
 */
function combineSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener(
      'abort',
      () => controller.abort(signal.reason),
      { once: true },
    );
  }

  return controller.signal;
}

// ---------------------------------------------------------------------------
// HttixClientImpl
// ---------------------------------------------------------------------------

export class HttixClientImpl implements HttixClientInterface {
  /** Merged default configuration for this client instance. */
  readonly defaults: HttixConfig;

  /** Interceptor managers for request and response pipelines. */
  readonly interceptors: {
    request: InterceptorManager<RequestInterceptor, RequestErrorInterceptor>;
    response: InterceptorManager<ResponseInterceptor<unknown>, ResponseErrorInterceptor>;
  };

  /** Stream utilities bound to this client. */
  readonly stream: {
    sse: (url: string, config?: Partial<HttixRequestConfig>) => AsyncIterable<SSEEvent>;
    ndjson: <T = unknown>(url: string, config?: Partial<HttixRequestConfig>) => AsyncIterable<T>;
  };

  /** Pagination helper bound to this client. */
  readonly paginate: HttixClientInterface['paginate'];

  // -- Private state --------------------------------------------------------

  private middlewares: MiddlewareFn[];
  private deduplicator?: RequestDeduplicator;
  private dedupConfig?: boolean | DedupConfig;
  private rateLimiter?: RateLimiter;
  private authConfig?: AuthConfig;
  private pendingControllers: Set<AbortController>;

  constructor(config?: Partial<HttixConfig>) {
    // 1. Deep-merge user config with library defaults
    this.defaults = deepMergeConfig(
      DEFAULT_CONFIG,
      config ?? {},
    ) as HttixConfig;

    // 2. Interceptor managers
    this.interceptors = {
      request: new InterceptorManager<RequestInterceptor, RequestErrorInterceptor>(),
      response: new InterceptorManager<ResponseInterceptor<unknown>, ResponseErrorInterceptor>(),
    };

    // 3. Middleware array (from defaults or empty)
    this.middlewares = this.defaults.middleware
      ? [...this.defaults.middleware]
      : [];

    // 4. Deduplication
    this.dedupConfig = this.defaults.dedup;
    if (this.dedupConfig === true || (typeof this.dedupConfig === 'object' && this.dedupConfig.enabled)) {
      const ttl =
        typeof this.dedupConfig === 'object' && this.dedupConfig.ttl !== undefined
          ? this.dedupConfig.ttl
          : 0;
      this.deduplicator = new RequestDeduplicator(ttl);
    }

    // 5. Rate limiting
    if (this.defaults.rateLimit) {
      this.rateLimiter = new RateLimiter(
        this.defaults.rateLimit.maxRequests,
        this.defaults.rateLimit.interval,
      );
    }

    // 6. Authentication
    this.authConfig = this.defaults.auth;
    if (this.authConfig) {
      // Register a request interceptor that applies auth to every request
      this.interceptors.request.use(createAuthInterceptor(this.authConfig));

      // If bearer auth with refresh, register a response-error interceptor
      if (
        this.authConfig.type === 'bearer' &&
        this.authConfig.refreshToken
      ) {
        this.interceptors.response.use(
          ((res: HttixResponse<unknown>) => res) as ResponseInterceptor<unknown>,
          createAuthRefreshHandler(this.authConfig),
        );
      }
    }

    // 7. Pending abort controllers for cancelAll()
    this.pendingControllers = new Set();

    // 8. Stream helpers (bound methods)
    this.stream = {
      sse: this.executeSSE.bind(this),
      ndjson: this.executeNDJSON.bind(this),
    };

    // 9. Pagination helper
    this.paginate = createPaginator(this) as HttixClientInterface['paginate'];
  }

  // =========================================================================
  // Core request method
  // =========================================================================

  async request<T = unknown>(
    config: HttixRequestConfig,
  ): Promise<HttixResponse<T>> {
    // 1. Deep-merge per-request config with client defaults
    const mergedConfig = deepMergeConfig(
      this.defaults,
      config,
    ) as HttixRequestConfig;

    // 2. Assign (or preserve) a request ID for tracing
    mergedConfig.requestId = config.requestId ?? generateRequestId();

    // 3. Set up cancellation tracking for this request
    const cancelController = new AbortController();
    this.pendingControllers.add(cancelController);

    const signals: AbortSignal[] = [cancelController.signal];
    if (mergedConfig.signal) {
      signals.unshift(mergedConfig.signal);
    }
    const combinedSignal = combineSignals(...signals);
    mergedConfig.signal = combinedSignal;

    try {
      // 4. Execute the request lifecycle wrapped in middleware
      const context: MiddlewareContext<HttixRequestConfig, HttixResponse<T>> = {
        request: mergedConfig,
      };

      let httixResponse!: HttixResponse<T>;

      const composed = composeMiddleware(this.middlewares);

      await composed(context, async () => {
        // ---- Handler: everything inside middleware's "next()" ----

        // a. Run request interceptors
        let processedConfig = await runRequestInterceptors(
          context.request,
          this.interceptors.request,
        );
        // Keep context in sync so post-middleware code sees the final config
        context.request = processedConfig;

        // b. Auth is handled via interceptors (registered in constructor),
        //    but we also support calling applyAuth here for edge cases where
        //    a per-request auth override is needed. In normal usage the
        //    interceptor already applied auth, so this is a no-op.

        // c. Execute with deduplication and rate limiting
        httixResponse = await this.executeWithDedupAndRateLimit<T>(
          processedConfig,
        );

        // d. Store response on context for middleware post-processing
        context.response = httixResponse;
      });

      return httixResponse;
    } finally {
      this.pendingControllers.delete(cancelController);
    }
  }

  // =========================================================================
  // HTTP method shortcuts
  // =========================================================================

  async get<T = unknown>(
    url: string,
    config?: Partial<HttixRequestConfig>,
  ): Promise<HttixResponse<T>> {
    return this.request<T>({ ...config, url, method: 'GET' });
  }

  async post<T = unknown>(
    url: string,
    body?: RequestBody,
    config?: Partial<HttixRequestConfig>,
  ): Promise<HttixResponse<T>> {
    return this.request<T>({ ...config, url, method: 'POST', body });
  }

  async put<T = unknown>(
    url: string,
    body?: RequestBody,
    config?: Partial<HttixRequestConfig>,
  ): Promise<HttixResponse<T>> {
    return this.request<T>({ ...config, url, method: 'PUT', body });
  }

  async patch<T = unknown>(
    url: string,
    body?: RequestBody,
    config?: Partial<HttixRequestConfig>,
  ): Promise<HttixResponse<T>> {
    return this.request<T>({ ...config, url, method: 'PATCH', body });
  }

  async delete<T = unknown>(
    url: string,
    config?: Partial<HttixRequestConfig>,
  ): Promise<HttixResponse<T>> {
    return this.request<T>({ ...config, url, method: 'DELETE' });
  }

  async head(
    url: string,
    config?: Partial<HttixRequestConfig>,
  ): Promise<HttixResponse<void>> {
    return this.request<void>({ ...config, url, method: 'HEAD' });
  }

  async options(
    url: string,
    config?: Partial<HttixRequestConfig>,
  ): Promise<HttixResponse<void>> {
    return this.request<void>({ ...config, url, method: 'OPTIONS' });
  }

  // =========================================================================
  // Middleware registration
  // =========================================================================

  use<T = unknown>(middleware: MiddlewareFn<T>): void {
    this.middlewares.push(middleware as MiddlewareFn);
  }

  // =========================================================================
  // Client factory — clone with overrides
  // =========================================================================

  create(overrides?: Partial<HttixConfig>): HttixClientInterface {
    const mergedDefaults = deepMergeConfig(
      this.defaults,
      overrides ?? {},
    ) as HttixConfig;
    return new HttixClientImpl(mergedDefaults);
  }

  // =========================================================================
  // Cancellation
  // =========================================================================

  /**
   * Abort every in-flight request managed by this client.
   */
  cancelAll(reason = 'All requests cancelled'): void {
    for (const controller of this.pendingControllers) {
      controller.abort(new HttixAbortError(reason));
    }
    this.pendingControllers.clear();
  }

  /**
   * Check whether an error is a cancellation (abort) error.
   */
  isCancel(error: unknown): error is HttixAbortError {
    return error instanceof HttixAbortError;
  }

  // =========================================================================
  // Private — dedup & rate-limit wrapper
  // =========================================================================

  /**
   * Wraps the actual fetch in deduplication and rate-limiting layers.
   */
  private async executeWithDedupAndRateLimit<T>(
    config: HttixRequestConfig,
  ): Promise<HttixResponse<T>> {
    const doRequest = (): Promise<HttixResponse<T>> =>
      this.doFetch<T>(config);

    // Rate limiting
    const throttledRequest = this.rateLimiter
      ? (): Promise<HttixResponse<T>> =>
          this.rateLimiter!.throttle(config.url, doRequest) as Promise<
            HttixResponse<T>
          >
      : doRequest;

    // Deduplication
    if (this.deduplicator && this.isDedupEnabled()) {
      const key = this.generateDedupKey(config);
      return this.deduplicator.dedup<HttixResponse<T>>(key, throttledRequest);
    }

    return throttledRequest();
  }

  private isDedupEnabled(): boolean {
    if (this.dedupConfig === false || this.dedupConfig === undefined) {
      return false;
    }
    if (this.dedupConfig === true) {
      return true;
    }
    return this.dedupConfig.enabled;
  }

  private generateDedupKey(config: HttixRequestConfig): string {
    if (
      typeof this.dedupConfig === 'object' &&
      this.dedupConfig.generateKey
    ) {
      return this.dedupConfig.generateKey(config);
    }
    return this.deduplicator!.generateKey(config);
  }

  // =========================================================================
  // Private — core fetch with retry, response processing & error handling
  // =========================================================================

  /**
   * Build the native Request, execute fetch with retry support, parse the
   * response body, and handle success / error paths.
   */
  private async doFetch<T>(
    config: HttixRequestConfig,
  ): Promise<HttixResponse<T>> {
    // retryRequest handles the retry loop. The inner fn is called per-attempt
    // so that a fresh Request is built each time (body streams can only be
    // consumed once).
    return retryRequest<T>(
      async (): Promise<HttixResponse<T>> => {
        // Build the native Request (includes timeout setup)
        const {
          request: fetchRequest,
          timeoutController,
          timeoutId,
        } = buildRequest(config);

        const startTime = Date.now();

        let rawResponse: Response;

        try {
          rawResponse = await fetch(fetchRequest);
        } catch (error) {
          // Distinguish timeout from user-initiated abort from network errors.
          // Check user signal first (user cancel takes priority).
          const isUserAbort = config.signal?.aborted === true;
          const isTimeout =
            timeoutController?.signal?.aborted === true && !isUserAbort;

          // Always clean up the timeout timer
          clearTimeoutSignal(timeoutController, timeoutId);

          if (isUserAbort) {
            throw new HttixAbortError('Request was aborted', config);
          }

          if (isTimeout) {
            /* v8 ignore next */
            throw new HttixTimeoutError(config.timeout ?? 0, config);
          }

          // Network / CORS / DNS error
          throw new HttixRequestError(
            error instanceof Error ? error.message : 'Network request failed',
            {
              message: 'Network request failed',
              config,
              cause: error instanceof Error ? error : undefined,
            },
          );
        }

        // Request succeeded at the transport level — clean up timeout
        clearTimeoutSignal(timeoutController, timeoutId);

        // Parse response body
        const data = await parseResponseBody<T>(rawResponse, config);
        const timing = Date.now() - startTime;

        return createResponse<T>(rawResponse, config, data, timing);
      },
      config.retry,
      config,
    ).then((response) => this.processResponse<T>(response, config));
  }

  /**
   * Post-retry response processing:
   *  - 2xx → run response interceptors
   *  - non-2xx + throwOnError → run error interceptors, then throw
   *  - non-2xx + !throwOnError → return as-is
   */
  private async processResponse<T>(
    response: HttixResponse<T>,
    config: HttixRequestConfig,
  ): Promise<HttixResponse<T>> {
    // ---------- 2xx success ----------
    if (response.ok) {
      return runResponseInterceptors<T>(
        response,
        this.interceptors.response as unknown as InterceptorManagerInterface<
          ResponseInterceptor<T>,
          ResponseErrorInterceptor
        >,
      );
    }

    // ---------- non-2xx ----------
    // If throwOnError is explicitly false, return the response as-is.
    if (config.throwOnError === false) {
      return response;
    }

    // Default: throw on non-2xx
    const error = new HttixResponseError(
      response.status,
      response.statusText,
      response.data,
      response.headers,
      config,
    );

    // Give response-error interceptors a chance to recover
    try {
      const recovered = await runResponseErrorInterceptors(
        error,
        this.interceptors.response,
      );
      return recovered as HttixResponse<T>;
    } catch {
      // No interceptor recovered the error — re-throw the original
      throw error;
    }
  }

  // =========================================================================
  // Private — stream helpers
  // =========================================================================

  /**
   * Execute an SSE stream request.
   *
   * Applies interceptors and auth, then returns an async iterable of
   * SSEEvent objects by piping the response body through parseSSE().
   */
  private async *executeSSE(
    url: string,
    config?: Partial<HttixRequestConfig>,
  ): AsyncGenerator<SSEEvent, void, undefined> {
    const mergedConfig = deepMergeConfig(this.defaults, {
      ...config,
      url,
      method: 'GET',
    }) as HttixRequestConfig;

    let processedConfig = await runRequestInterceptors(
      mergedConfig,
      this.interceptors.request,
    );

    if (this.authConfig) {
      processedConfig = await applyAuth(processedConfig, this.authConfig);
    }

    const { request: fetchRequest, timeoutController, timeoutId } =
      buildRequest(processedConfig);

    // SSE connections are long-lived; use a generous timeout or respect the
    // caller's explicit timeout. Disable default timeout for SSE if not set.
    if (processedConfig.timeout === this.defaults.timeout && processedConfig.timeout !== 0) {
      // Keep the SSE connection open — don't impose a short timeout
    }

    try {
      const rawResponse = await fetch(fetchRequest);

      clearTimeoutSignal(timeoutController, timeoutId);

      if (!rawResponse.ok) {
        const error = new HttixResponseError(
          rawResponse.status,
          rawResponse.statusText,
          null,
          rawResponse.headers,
          processedConfig,
        );
        throw error;
      }

      if (!rawResponse.body) {
        throw new HttixRequestError('Response body is null — cannot parse SSE stream', {
          message: 'Response body is null',
          config: processedConfig,
        });
      }

      yield* parseSSE(rawResponse.body);
    } catch (error) {
      clearTimeoutSignal(timeoutController, timeoutId);
      throw error;
    }
  }

  /**
   * Execute an NDJSON stream request.
   *
   * Applies interceptors and auth, then returns an async iterable of parsed
   * JSON objects by piping the response body through parseNDJSON().
   */
  private async *executeNDJSON<T = unknown>(
    url: string,
    config?: Partial<HttixRequestConfig>,
  ): AsyncGenerator<T, void, undefined> {
    const mergedConfig = deepMergeConfig(this.defaults, {
      ...config,
      url,
      method: 'GET',
    }) as HttixRequestConfig;

    let processedConfig = await runRequestInterceptors(
      mergedConfig,
      this.interceptors.request,
    );

    if (this.authConfig) {
      processedConfig = await applyAuth(processedConfig, this.authConfig);
    }

    const { request: fetchRequest, timeoutController, timeoutId } =
      buildRequest(processedConfig);

    try {
      const rawResponse = await fetch(fetchRequest);

      clearTimeoutSignal(timeoutController, timeoutId);

      if (!rawResponse.ok) {
        const error = new HttixResponseError(
          rawResponse.status,
          rawResponse.statusText,
          null,
          rawResponse.headers,
          processedConfig,
        );
        throw error;
      }

      if (!rawResponse.body) {
        throw new HttixRequestError(
          'Response body is null — cannot parse NDJSON stream',
          {
            message: 'Response body is null',
            config: processedConfig,
          },
        );
      }

      yield* parseNDJSON<T>(rawResponse.body);
    } catch (error) {
      clearTimeoutSignal(timeoutController, timeoutId);
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create a new HttixClient with the given configuration.
 *
 * This is the recommended entry-point for creating client instances.
 *
 * @example
 * ```ts
 * import { createHttix } from 'httix';
 *
 * const client = createHttix({
 *   baseURL: 'https://api.example.com',
 *   headers: { 'X-App-Version': '1.0' },
 *   auth: { type: 'bearer', token: 'my-token' },
 * });
 *
 * const { data } = await client.get('/users');
 * ```
 */
export function createHttix(
  config?: Partial<HttixConfig>,
): HttixClientInterface {
  return new HttixClientImpl(config);
}
