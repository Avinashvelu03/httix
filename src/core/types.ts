/**
 * httix — Core TypeScript types and interfaces
 */

import type { HttixAbortError, HttixError } from './errors';

/** Supported HTTP methods */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/** Body types that can be sent in a request */
export type RequestBody =
  | string
  | number
  | boolean
  | null
  | Record<string, unknown>
  | unknown[]
  | FormData
  | URLSearchParams
  | Blob
  | ArrayBuffer
  | ReadableStream<Uint8Array>
  | undefined;

/** Query parameter value types */
export type QueryParamValue = string | number | boolean | null | undefined;

/** Query parameters object */
export type QueryParams = Record<string, QueryParamValue | QueryParamValue[]>;

/** Path parameters for URL interpolation */
export type PathParams = Record<string, string | number>;

/** Headers representation */
export type HttixHeaders = Record<string, string> | Headers;

/** Backoff strategy for retry */
export type BackoffStrategy = 'fixed' | 'linear' | 'exponential';

/** Rate limit configuration */
export interface RateLimitConfig {
  /** Maximum number of requests per interval */
  maxRequests: number;
  /** Interval in milliseconds */
  interval: number;
}

/** Dedup configuration */
export interface DedupConfig {
  /** Enable request deduplication */
  enabled: boolean;
  /** Custom key generation function */
  generateKey?: (config: HttixRequestConfig) => string;
  /** TTL for dedup cache in ms (default: 0 = only dedup in-flight) */
  ttl?: number;
}

/** Retry configuration */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  attempts?: number;
  /** Backoff strategy (default: 'exponential') */
  backoff?: BackoffStrategy;
  /** Base delay in ms (default: 1000) */
  baseDelay?: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelay?: number;
  /** Add jitter to delay (default: true) */
  jitter?: boolean;
  /** HTTP status codes to retry on (default: [408, 429, 500, 502, 503, 504]) */
  retryOn?: number[];
  /** Whether to retry on network errors (default: true) */
  retryOnNetworkError?: boolean;
  /** Custom retry condition function */
  retryCondition?: (error: HttixError) => boolean;
  /** Whether to retry on POST/PUT/PATCH (default: false) */
  retryOnSafeMethodsOnly?: boolean;
  /** Callback called before each retry */
  onRetry?: (attempt: number, error: HttixError, delay: number) => void;
}

/** Authentication configuration */
export type AuthConfig =
  | BearerAuthConfig
  | BasicAuthConfig
  | ApiKeyAuthConfig;

export interface BearerAuthConfig {
  type: 'bearer';
  /** Static token or a function that returns a token */
  token: string | (() => string | Promise<string>);
  /** Function to refresh the token when a 401 is received */
  refreshToken?: () => Promise<string>;
  /** Callback to store a refreshed token */
  onTokenRefresh?: (token: string) => void;
}

export interface BasicAuthConfig {
  type: 'basic';
  username: string;
  password: string;
}

export interface ApiKeyAuthConfig {
  type: 'apiKey';
  /** Header name (e.g., "X-API-Key") */
  key: string;
  /** API key value */
  value: string | (() => string | Promise<string>);
  /** Where to place the API key */
  in: 'header' | 'query';
}

/** Pagination style */
export type PaginationStyle = 'offset' | 'cursor' | 'link';

/** Pagination configuration */
export interface PaginationConfig<T = unknown> {
  /** Pagination style */
  style: PaginationStyle;
  /** Number of items per page */
  pageSize?: number;
  /** Maximum number of pages to fetch (default: Infinity) */
  maxPages?: number;
  /** For offset style: query param names for offset and limit */
  offsetParam?: string;
  /** For offset style: query param name for limit */
  limitParam?: string;
  /** For cursor style: query param name for cursor */
  cursorParam?: string;
  /** For cursor style: extractor for next cursor from response */
  cursorExtractor?: (data: T) => string | null | undefined;
  /** For link style: extractor for next URL from Link header */
  linkExtractor?: (headers: Headers) => string | null | undefined;
  /** Response wrapper — extract the array from the response data */
  dataExtractor?: (data: T) => T[];
  /** Stop condition */
  stopCondition?: (data: T) => boolean;
}

/** Download progress info */
export interface DownloadProgress {
  loaded: number;
  total?: number;
  percent: number;
}

/** SSE event */
export interface SSEEvent {
  type: string;
  data: string;
  id?: string;
  retry?: number;
}

/** Stream configuration */
export interface StreamConfig {
  /** SSE parser */
  sse?: boolean;
  /** NDJSON parser */
  ndjson?: boolean;
  /** Called for each chunk received */
  onChunk?: (chunk: Uint8Array, index: number) => void;
}

/** Middleware context */
export interface MiddlewareContext<Req = HttixRequestConfig, Res = HttixResponse<unknown>> {
  request: Req;
  response?: Res;
}

/** Middleware function */
export type MiddlewareFn<
  T = unknown,
  Req = HttixRequestConfig,
  Res = HttixResponse<T>,
> = (ctx: MiddlewareContext<Req, Res>, next: () => Promise<void>) => Promise<void>;

/** Interceptor functions */
export type RequestInterceptor = (
  config: HttixRequestConfig,
) => HttixRequestConfig | Promise<HttixRequestConfig>;

export type RequestErrorInterceptor = (
  error: HttixError,
) => HttixRequestConfig | Promise<HttixRequestConfig> | void;

export type ResponseInterceptor<T = unknown> = (
  response: HttixResponse<T>,
) => HttixResponse<T> | Promise<HttixResponse<T>>;

export type ResponseErrorInterceptor = (
  error: HttixError,
) => HttixResponse<unknown> | Promise<HttixResponse<unknown>> | void;

/** Interceptor handler with id */
export interface InterceptorHandler<F, E> {
  fulfilled: F;
  rejected?: E;
}

/** Interceptor manager */
export interface InterceptorManager<F, E> {
  handlers: InterceptorHandler<F, E>[];
  use(fulfilled: F, rejected?: E): number;
  eject(id: number): void;
  clear(): void;
}

/** Full client configuration */
export interface HttixConfig extends HttixRequestConfig {
  /** Enable request deduplication (default: false) */
  dedup?: boolean | DedupConfig;
  /** Rate limiting configuration */
  rateLimit?: RateLimitConfig;
  /** Authentication configuration */
  auth?: AuthConfig;
  /** Middleware functions */
  middleware?: MiddlewareFn[];
}

/** Per-request configuration */
export interface HttixRequestConfig {
  /** Request URL (relative or absolute) */
  url: string;
  /** HTTP method (default: 'GET') */
  method?: HttpMethod;
  /** Base URL for this request */
  baseURL?: string;
  /** Request headers */
  headers?: HttixHeaders;
  /** Request body */
  body?: RequestBody;
  /** Query parameters */
  query?: QueryParams;
  /** Path parameters for URL interpolation */
  params?: PathParams;
  /** Request timeout in ms (0 = no timeout) */
  timeout?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Retry configuration for this request */
  retry?: RetryConfig | false;
  /** Response type override */
  responseType?: 'json' | 'text' | 'blob' | 'arrayBuffer';
  /** Custom response type parser */
  parseResponse?: (response: Response) => Promise<unknown>;
  /** Download progress callback */
  onDownloadProgress?: (progress: DownloadProgress) => void;
  /** Stream configuration */
  stream?: StreamConfig;
  /** Custom request credentials mode */
  credentials?: RequestCredentials;
  /** Custom request mode */
  mode?: RequestMode;
  /** Custom cache mode */
  cache?: RequestCache;
  /** Custom redirect mode */
  redirect?: RequestRedirect;
  /** Custom referrer policy */
  referrerPolicy?: ReferrerPolicy;
  /** Request ID for tracing */
  requestId?: string;
  /** Whether to throw on non-2xx status (default: true) */
  throwOnError?: boolean;
}

/** Httix response wrapper */
export interface HttixResponse<T = unknown> {
  /** Parsed response body */
  data: T;
  /** HTTP status code */
  status: number;
  /** HTTP status text */
  statusText: string;
  /** Response headers */
  headers: Headers;
  /** Whether the status is 2xx */
  ok: boolean;
  /** Original Fetch Response object */
  raw: Response;
  /** Request duration in ms */
  timing: number;
  /** The request config that produced this response */
  config: HttixRequestConfig;
}

/** Base error class for all httix errors */
export interface HttixErrorOptions {
  message: string;
  config?: HttixRequestConfig;
  cause?: Error;
}

/** Plugin interface */
export interface HttixPlugin {
  /** Plugin name */
  name: string;
  /** Install hook — called when plugin is registered */
  install: (client: HttixClient) => void;
  /** Cleanup hook — called when plugin is removed */
  cleanup?: () => void;
}

/** HttixClient interface */
export interface HttixClient {
  /** Default configuration */
  defaults: HttixConfig;
  /** Request interceptors */
  interceptors: {
    request: InterceptorManager<RequestInterceptor, RequestErrorInterceptor>;
    response: InterceptorManager<ResponseInterceptor<unknown>, ResponseErrorInterceptor>;
  };
  /** HTTP methods */
  get<T = unknown>(url: string, config?: Partial<HttixRequestConfig>): Promise<HttixResponse<T>>;
  post<T = unknown>(
    url: string,
    body?: RequestBody,
    config?: Partial<HttixRequestConfig>,
  ): Promise<HttixResponse<T>>;
  put<T = unknown>(
    url: string,
    body?: RequestBody,
    config?: Partial<HttixRequestConfig>,
  ): Promise<HttixResponse<T>>;
  patch<T = unknown>(
    url: string,
    body?: RequestBody,
    config?: Partial<HttixRequestConfig>,
  ): Promise<HttixResponse<T>>;
  delete<T = unknown>(url: string, config?: Partial<HttixRequestConfig>): Promise<HttixResponse<T>>;
  head(url: string, config?: Partial<HttixRequestConfig>): Promise<HttixResponse<void>>;
  options(url: string, config?: Partial<HttixRequestConfig>): Promise<HttixResponse<void>>;
  request<T = unknown>(config: HttixRequestConfig): Promise<HttixResponse<T>>;
  /** Stream support */
  stream: {
    sse(url: string, config?: Partial<HttixRequestConfig>): AsyncIterable<SSEEvent>;
    ndjson<T = unknown>(url: string, config?: Partial<HttixRequestConfig>): AsyncIterable<T>;
  };
  /** Pagination */
  paginate<T = unknown>(
    url: string,
    config?: Partial<HttixRequestConfig> & { pagination?: PaginationConfig<T> },
  ): AsyncIterable<T[]>;
  /** Middleware registration */
  use<T = unknown>(middleware: MiddlewareFn<T>): void;
  /** Clone client with overrides */
  create(overrides?: Partial<HttixConfig>): HttixClient;
  /** Cancel all pending requests */
  cancelAll(reason?: string): void;
  /** Check if error is a cancellation error */
  isCancel(error: unknown): error is HttixAbortError;
}
