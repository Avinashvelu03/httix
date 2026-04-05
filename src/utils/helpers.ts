/**
 * httix — General-purpose helper utilities
 */

import type { BackoffStrategy } from '../core/types';
import { HttixRequestError, HttixResponseError, type HttixError } from '../core/errors';
import { isAbsoluteURL } from './url';

// Re-export isAbsoluteURL from url.ts so consumers can import from helpers
export { isAbsoluteURL };

/**
 * Return a promise that resolves after the given number of milliseconds.
 */
export function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a unique request ID useful for tracing.
 * Format: `req_<timestamp>_<random7chars>`
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Determine whether an error is eligible for automatic retry.
 *
 * - HttixRequestError (network-level failures) → retryable
 * - HttixResponseError with retryable status codes → retryable
 * - Everything else → not retryable
 */
export function isRetryableError(error: HttixError): boolean {
  if (error instanceof HttixRequestError) {
    return true;
  }

  if (error instanceof HttixResponseError) {
    return isRetryableStatus(error.status);
  }

  return false;
}

/**
 * Check whether an HTTP status code is considered retryable.
 */
export function isRetryableStatus(status: number): boolean {
  return [408, 429, 500, 502, 503, 504].includes(status);
}

/**
 * Calculate the delay in milliseconds before the next retry attempt.
 *
 * @param attempt  - The current attempt number (1-based)
 * @param backoff  - The backoff strategy to use
 * @param baseDelay - The base delay in milliseconds
 * @param maxDelay  - The maximum allowed delay in milliseconds
 * @param jitter   - Whether to apply random jitter (50%–100% of calculated delay)
 */
export function calculateDelay(
  attempt: number,
  backoff: BackoffStrategy,
  baseDelay: number,
  maxDelay: number,
  jitter: boolean,
): number {
  let calculated: number;

  switch (backoff) {
    case 'fixed':
      calculated = baseDelay;
      break;
    case 'linear':
      calculated = baseDelay * attempt;
      break;
    case 'exponential':
      calculated = baseDelay * Math.pow(2, attempt - 1);
      break;
    default:
      // Fallback for unknown strategies — should never happen with valid BackoffStrategy
      calculated = baseDelay;
      break;
  }

  // Clamp to maxDelay
  calculated = Math.min(calculated, maxDelay);

  // Apply jitter: random value between 50% and 100% of the calculated delay
  if (jitter) {
    calculated = calculated * (0.5 + Math.random() * 0.5);
  }

  // Ensure the delay is never negative
  return Math.max(0, calculated);
}
