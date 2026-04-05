/**
 * httix — Retry logic
 */

import type { HttixRequestConfig, HttixResponse, RetryConfig } from '../core/types';
import { DEFAULT_RETRY } from '../core/defaults';
import { HttixRequestError, HttixResponseError } from '../core/errors';
import { calculateDelay, delay } from '../utils/helpers';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Parse a Retry-After header value.
 *
 * - If the value is a plain number, it represents seconds to wait.
 * - If the value is an ISO date string, calculate the number of seconds
 *   from now until that date.
 * - Returns null if the value cannot be parsed.
 */
export function parseRetryAfter(value: string | null): number | null {
  if (value === null) return null;

  // Try parsing as a number of seconds
  const seconds = Number(value);
  if (!Number.isNaN(seconds) && seconds > 0 && String(seconds) === value.trim()) {
    return seconds * 1000;
  }

  // Try parsing as an ISO date string
  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    const diff = date - Date.now();
    return diff > 0 ? diff : 0;
  }

  return null;
}

/**
 * Execute a request function with retry support.
 *
 * Merges the provided retry configuration with defaults, evaluates retry
 * conditions on each failure, applies backoff delay, and throws
 * HttixRetryError if all attempts are exhausted.
 */
export async function retryRequest<T>(
  fn: () => Promise<HttixResponse<T>>,
  config: RetryConfig | false | undefined,
  requestConfig: HttixRequestConfig,
): Promise<HttixResponse<T>> {
  // If retry is explicitly disabled, just execute once
  if (config === false || config === undefined) {
    return fn();
  }

  // Merge user config over defaults
  const retryCfg: Required<RetryConfig> = {
    attempts: config.attempts ?? DEFAULT_RETRY.attempts,
    backoff: config.backoff ?? DEFAULT_RETRY.backoff,
    baseDelay: config.baseDelay ?? DEFAULT_RETRY.baseDelay,
    maxDelay: config.maxDelay ?? DEFAULT_RETRY.maxDelay,
    jitter: config.jitter ?? DEFAULT_RETRY.jitter,
    retryOn: config.retryOn ?? DEFAULT_RETRY.retryOn,
    retryOnNetworkError: config.retryOnNetworkError ?? DEFAULT_RETRY.retryOnNetworkError,
    retryOnSafeMethodsOnly: config.retryOnSafeMethodsOnly ?? DEFAULT_RETRY.retryOnSafeMethodsOnly,
    retryCondition: config.retryCondition ?? DEFAULT_RETRY.retryCondition,
    onRetry: config.onRetry ?? DEFAULT_RETRY.onRetry,
  };

  const maxAttempts = retryCfg.attempts;
  const method = (requestConfig.method ?? 'GET').toUpperCase();
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fn();

      // Successful 2xx — return immediately
      if (response.status >= 200 && response.status < 300) {
        return response;
      }

      // Non-2xx response: check if retryable
      if (!retryCfg.retryOn.includes(response.status)) {
        return response;
      }

      // Create an HttixResponseError for consistency
      const responseError = new HttixResponseError(
        response.status,
        response.statusText,
        response.data,
        response.headers,
        requestConfig,
      );
      lastError = responseError;

      if (!shouldRetry(responseError, attempt, maxAttempts, retryCfg, method)) {
        throw responseError;
      }

      // Calculate and apply delay
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
      const backoffMs = calculateDelay(
        attempt + 1,
        retryCfg.backoff,
        retryCfg.baseDelay,
        retryCfg.maxDelay,
        retryCfg.jitter,
      );
      const finalDelay = retryAfterMs !== null ? retryAfterMs : backoffMs;

      retryCfg.onRetry(attempt + 1, responseError, finalDelay);
      await delay(finalDelay);
    } catch (err) {
      lastError = err;

      if (!shouldRetry(err as Error, attempt, maxAttempts, retryCfg, method)) {
        throw err;
      }

      const httixErr = err as HttixRequestError | HttixResponseError;

      // Calculate and apply delay
      const retryAfterMs =
        httixErr instanceof HttixResponseError
          ? parseRetryAfter(httixErr.headers?.get('retry-after') ?? null)
          : null;
      const backoffMs = calculateDelay(
        attempt + 1,
        retryCfg.backoff,
        retryCfg.baseDelay,
        retryCfg.maxDelay,
        retryCfg.jitter,
      );
      const finalDelay = retryAfterMs !== null ? retryAfterMs : backoffMs;

      retryCfg.onRetry(attempt + 1, httixErr, finalDelay);
      await delay(finalDelay);
    }
  }

  // All attempts exhausted — defensive fallback
  /* v8 ignore start */
  if (!lastError) throw new Error('All retry attempts exhausted');
  throw lastError;
}
/* v8 ignore stop */

/**
 * Determine whether the request should be retried based on the error
 * type, retry configuration, and current attempt.
 */
function shouldRetry(
  error: Error,
  attempt: number,
  maxAttempts: number,
  config: Required<RetryConfig>,
  method: string,
): boolean {
  // Check if attempts remaining
  if (attempt + 1 >= maxAttempts) {
    return false;
  }

  // Check safe methods restriction
  if (config.retryOnSafeMethodsOnly && !SAFE_METHODS.has(method)) {
    return false;
  }

  // Check custom retry condition
  if (!config.retryCondition(error as HttixResponseError & HttixRequestError)) {
    return false;
  }

  // Network error
  if (error instanceof HttixRequestError) {
    return config.retryOnNetworkError;
  }

  // Response error — check status against retryOn list
  if (error instanceof HttixResponseError) {
    return config.retryOn.includes(error.status);
  }

  return false;
}
