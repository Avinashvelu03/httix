/**
 * httix — Default configuration values
 */

import type { HttixConfig, HttixRequestConfig, RetryConfig } from './types';

/** Default retry configuration */
export const DEFAULT_RETRY: Required<RetryConfig> = {
  attempts: 3,
  backoff: 'exponential',
  baseDelay: 1000,
  maxDelay: 30000,
  jitter: true,
  retryOn: [408, 429, 500, 502, 503, 504],
  retryOnNetworkError: true,
  retryOnSafeMethodsOnly: false,
  retryCondition: () => true,
  onRetry: () => {},
};

/** Default timeout in milliseconds */
export const DEFAULT_TIMEOUT = 30000;

/** Default headers */
export const DEFAULT_HEADERS: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Encoding': 'gzip, deflate, br',
  'Accept-Language': '*',
};

/** Default request configuration */
export const DEFAULT_REQUEST_CONFIG: Partial<HttixRequestConfig> = {
  method: 'GET',
  timeout: DEFAULT_TIMEOUT,
  throwOnError: true,
  credentials: 'same-origin',
  mode: 'cors',
  redirect: 'follow',
  cache: 'default',
};

/** Default client configuration */
export const DEFAULT_CONFIG: HttixConfig = {
  url: '',
  baseURL: '',
  headers: DEFAULT_HEADERS,
  timeout: DEFAULT_TIMEOUT,
  throwOnError: true,
  credentials: 'same-origin',
  mode: 'cors',
  redirect: 'follow',
  cache: 'default',
  retry: DEFAULT_RETRY,
  dedup: false,
};
