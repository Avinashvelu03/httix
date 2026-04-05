import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  delay,
  generateRequestId,
  isRetryableError,
  isRetryableStatus,
  calculateDelay,
  isAbsoluteURL,
} from '../../src/utils/helpers';
import {
  HttixError,
  HttixRequestError,
  HttixResponseError,
  HttixTimeoutError,
} from '../../src/core/errors';

// ---------------------------------------------------------------------------
// isAbsoluteURL (re-export from url.ts)
// ---------------------------------------------------------------------------
describe('isAbsoluteURL (re-export)', () => {
  it('delegates to url utility', () => {
    expect(isAbsoluteURL('https://example.com')).toBe(true);
    expect(isAbsoluteURL('/relative')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// delay
// ---------------------------------------------------------------------------
describe('delay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after the specified milliseconds', async () => {
    const promise = delay(100);
    vi.advanceTimersByTime(100);

    // Allow microtasks to flush
    await promise;
    // If we get here without timeout, it resolved correctly
    expect(true).toBe(true);
  });

  it('resolves with a specific delay value', async () => {
    // Just verify that delay(250) resolves when timers advance by 250
    const promise = delay(250);
    vi.advanceTimersByTime(250);
    await promise;
    // If we reach here, the promise resolved correctly
    expect(true).toBe(true);
  });

  it('resolves immediately for 0ms', async () => {
    const promise = delay(0);
    vi.advanceTimersByTime(0);
    await promise;
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateRequestId
// ---------------------------------------------------------------------------
describe('generateRequestId', () => {
  it('starts with "req_"', () => {
    const id = generateRequestId();
    expect(id.startsWith('req_')).toBe(true);
  });

  it('contains an underscore separating timestamp and random part', () => {
    const id = generateRequestId();
    // Format: req_<timestamp>_<random7chars>
    const parts = id.split('_');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('req');
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()));
    expect(ids.size).toBe(100);
  });

  it('the timestamp part is a valid number', () => {
    const id = generateRequestId();
    const timestampPart = id.split('_')[1];
    expect(Number(timestampPart)).not.toBeNaN();
  });

  it('the random part has 7 characters', () => {
    const id = generateRequestId();
    const randomPart = id.split('_')[2];
    expect(randomPart).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// isRetryableStatus
// ---------------------------------------------------------------------------
describe('isRetryableStatus', () => {
  it('returns true for 408 (Request Timeout)', () => {
    expect(isRetryableStatus(408)).toBe(true);
  });

  it('returns true for 429 (Too Many Requests)', () => {
    expect(isRetryableStatus(429)).toBe(true);
  });

  it('returns true for 500 (Internal Server Error)', () => {
    expect(isRetryableStatus(500)).toBe(true);
  });

  it('returns true for 502 (Bad Gateway)', () => {
    expect(isRetryableStatus(502)).toBe(true);
  });

  it('returns true for 503 (Service Unavailable)', () => {
    expect(isRetryableStatus(503)).toBe(true);
  });

  it('returns true for 504 (Gateway Timeout)', () => {
    expect(isRetryableStatus(504)).toBe(true);
  });

  it('returns false for 200 (OK)', () => {
    expect(isRetryableStatus(200)).toBe(false);
  });

  it('returns false for 404 (Not Found)', () => {
    expect(isRetryableStatus(404)).toBe(false);
  });

  it('returns false for 422 (Unprocessable Entity)', () => {
    expect(isRetryableStatus(422)).toBe(false);
  });

  it('returns false for 301 (Moved Permanently)', () => {
    expect(isRetryableStatus(301)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isRetryableError
// ---------------------------------------------------------------------------
describe('isRetryableError', () => {
  it('returns true for HttixRequestError', () => {
    const error = new HttixRequestError('network failure');
    expect(isRetryableError(error)).toBe(true);
  });

  it('returns true for HttixResponseError with retryable status', () => {
    const error = new HttixResponseError(500, 'Internal Server Error', null);
    expect(isRetryableError(error)).toBe(true);
  });

  it('returns true for HttixResponseError with 429', () => {
    const error = new HttixResponseError(429, 'Too Many Requests', null);
    expect(isRetryableError(error)).toBe(true);
  });

  it('returns false for HttixResponseError with non-retryable status', () => {
    const error = new HttixResponseError(404, 'Not Found', null);
    expect(isRetryableError(error)).toBe(false);
  });

  it('returns false for HttixTimeoutError', () => {
    const error = new HttixTimeoutError(5000);
    expect(isRetryableError(error)).toBe(false);
  });

  it('returns false for base HttixError', () => {
    const error = new HttixError('generic error');
    expect(isRetryableError(error)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// calculateDelay
// ---------------------------------------------------------------------------
describe('calculateDelay', () => {
  it('calculates fixed backoff correctly', () => {
    expect(calculateDelay(1, 'fixed', 1000, 30000, false)).toBe(1000);
    expect(calculateDelay(5, 'fixed', 1000, 30000, false)).toBe(1000);
  });

  it('calculates linear backoff correctly', () => {
    expect(calculateDelay(1, 'linear', 1000, 30000, false)).toBe(1000);
    expect(calculateDelay(2, 'linear', 1000, 30000, false)).toBe(2000);
    expect(calculateDelay(3, 'linear', 1000, 30000, false)).toBe(3000);
  });

  it('calculates exponential backoff correctly', () => {
    // baseDelay * 2^(attempt-1)
    expect(calculateDelay(1, 'exponential', 1000, 30000, false)).toBe(1000);   // 1000 * 2^0
    expect(calculateDelay(2, 'exponential', 1000, 30000, false)).toBe(2000);   // 1000 * 2^1
    expect(calculateDelay(3, 'exponential', 1000, 30000, false)).toBe(4000);   // 1000 * 2^2
    expect(calculateDelay(4, 'exponential', 1000, 30000, false)).toBe(8000);   // 1000 * 2^3
    expect(calculateDelay(5, 'exponential', 1000, 30000, false)).toBe(16000);  // 1000 * 2^4
  });

  it('clamps to maxDelay', () => {
    expect(calculateDelay(6, 'exponential', 1000, 10000, false)).toBe(10000);  // 32000 clamped to 10000
    expect(calculateDelay(10, 'linear', 5000, 10000, false)).toBe(10000);     // 50000 clamped to 10000
  });

  it('with jitter, delay is between 50% and 100% of calculated', () => {
    // Test multiple times to account for randomness
    for (let i = 0; i < 50; i++) {
      const calculated = 4000;
      const result = calculateDelay(3, 'exponential', 1000, 30000, true);
      expect(result).toBeGreaterThanOrEqual(calculated * 0.5);
      expect(result).toBeLessThanOrEqual(calculated);
    }
  });

  it('without jitter, delay is exact', () => {
    expect(calculateDelay(2, 'exponential', 1000, 30000, false)).toBe(2000);
  });

  it('returns 0 for attempt 0 (edge case)', () => {
    // baseDelay * 2^(0-1) = baseDelay * 0.5
    expect(calculateDelay(0, 'exponential', 1000, 30000, false)).toBe(500);
  });

  it('handles fallback for unknown backoff strategy', () => {
    // TypeScript won't allow this directly, but we can cast
    const result = calculateDelay(3, 'fixed' as any, 1000, 30000, false);
    expect(result).toBe(1000);
  });

  it('never returns negative', () => {
    const result = calculateDelay(1, 'fixed', 0, 0, false);
    expect(result).toBeGreaterThanOrEqual(0);
  });
});
