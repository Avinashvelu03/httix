/**
 * retry.ts + rateLimit.ts coverage gap tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryRequest } from '../../src/features/retry';
import { RateLimiter } from '../../src/features/rateLimit';
import { HttixResponseError, HttixRequestError } from '../../src/core/errors';

describe('retryRequest — edge cases', () => {
  it('should parse Retry-After from HttixResponseError in catch block', async () => {
    let attempts = 0;
    const fn = vi.fn().mockImplementation(() => {
      attempts++;
      throw new HttixResponseError(503, 'Busy', null, new Headers({ 'Retry-After': '2' }), {
        url: '/t', method: 'GET',
      });
    });

    await expect(retryRequest(fn, {
      attempts: 2, backoff: 'fixed', baseDelay: 10, maxDelay: 100, jitter: false, retryOn: [503],
    }, { url: '/t', method: 'GET' })).rejects.toThrow(HttixResponseError);

    expect(attempts).toBe(2);
  });

  it('should exhaust all attempts and throw lastError', async () => {
    let attempts = 0;
    const lastErr = new HttixResponseError(500, 'err', null, undefined, { url: '/t', method: 'GET' });
    const fn = vi.fn().mockImplementation(() => { attempts++; throw lastErr; });

    await expect(retryRequest(fn, {
      attempts: 3, backoff: 'fixed', baseDelay: 1, maxDelay: 10, jitter: false, retryOn: [500],
    }, { url: '/t', method: 'GET' })).rejects.toBe(lastErr);

    expect(attempts).toBe(3);
  });

  it('should not retry when retryCondition returns false', async () => {
    let attempts = 0;
    const fn = vi.fn().mockImplementation(() => {
      attempts++;
      throw new HttixRequestError('fail', { message: 'fail', config: { url: '/t', method: 'GET' } });
    });

    await expect(retryRequest(fn, {
      attempts: 3, backoff: 'fixed', baseDelay: 10, maxDelay: 100, jitter: false,
      retryCondition: () => false,
    }, { url: '/t', method: 'GET' })).rejects.toThrow(HttixRequestError);

    expect(attempts).toBe(1);
  });
});

describe('RateLimiter — multi-window drain', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('should drain through multiple timer windows', async () => {
    const limiter = new RateLimiter(1, 100);
    const fns = [vi.fn().mockResolvedValue('a'), vi.fn().mockResolvedValue('b'), vi.fn().mockResolvedValue('c')];

    const p1 = limiter.throttle('k', fns[0]);
    const p2 = limiter.throttle('k', fns[1]);
    const p3 = limiter.throttle('k', fns[2]);

    expect(limiter.getQueueSize('k')).toBe(2);
    await p1;

    await vi.advanceTimersByTimeAsync(101);
    expect(fns[1]).toHaveBeenCalled();
    expect(fns[2]).not.toHaveBeenCalled();
    await p2;

    await vi.advanceTimersByTimeAsync(101);
    expect(fns[2]).toHaveBeenCalled();
    await p3;
    limiter.clear();
  });
});
