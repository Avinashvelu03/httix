import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryRequest, parseRetryAfter } from '../../src/features/retry';
import { HttixRequestError, HttixResponseError, HttixRetryError } from '../../src/core/errors';
import type { HttixRequestConfig, HttixResponse, RetryConfig } from '../../src/core/types';

function makeResponse(data: unknown, status: number, statusText = '', headers?: Record<string, string>): HttixResponse<unknown> {
  return {
    data,
    status,
    statusText,
    headers: new Headers(headers),
    ok: status >= 200 && status < 300,
    raw: new Response(),
    timing: 10,
    config: { url: 'https://api.example.com/test' },
  };
}

describe('parseRetryAfter', () => {
  it('should parse numeric seconds', () => {
    expect(parseRetryAfter('5')).toBe(5000);
  });

  it('should parse fractional seconds', () => {
    expect(parseRetryAfter('1.5')).toBe(1500);
  });

  it('should parse ISO date string', () => {
    const futureDate = new Date(Date.now() + 5000);
    const result = parseRetryAfter(futureDate.toISOString());
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(4000);
    expect(result!).toBeLessThanOrEqual(6000);
  });

  it('should return null for null input', () => {
    expect(parseRetryAfter(null)).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(parseRetryAfter('')).toBeNull();
  });

  it('should return null for invalid string', () => {
    expect(parseRetryAfter('not-a-date')).toBeNull();
  });

  it('should return 0 for past date', () => {
    const pastDate = new Date(Date.now() - 5000);
    const result = parseRetryAfter(pastDate.toISOString());
    expect(result).toBe(0);
  });

  // Date.parse('0') returns a timestamp for year 2000 in V8, not NaN
  it('should return 0 for zero string (Date.parse interprets as year)', () => {
    const result = parseRetryAfter('0');
    // Date.parse('0') returns a number, so diff = date - Date.now() which is negative → 0
    expect(result).toBe(0);
  });

  // Date.parse('-1') returns a timestamp in V8
  it('should return 0 for negative string (Date.parse interprets as year)', () => {
    const result = parseRetryAfter('-1');
    expect(result).toBe(0);
  });
});

describe('retryRequest', () => {
  it('should not retry when retry config is false', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw new HttixRequestError('Network error');
    };
    await expect(retryRequest(fn, false, { url: 'https://api.example.com/test' })).rejects.toThrow(HttixRequestError);
    expect(attempts).toBe(1);
  });

  it('should not retry when retry config is undefined', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw new HttixRequestError('Network error');
    };
    await expect(retryRequest(fn, undefined, { url: 'https://api.example.com/test' })).rejects.toThrow(HttixRequestError);
    expect(attempts).toBe(1);
  });

  it('should return successful response immediately', async () => {
    const response = makeResponse({ ok: true }, 200, 'OK');
    const fn = vi.fn().mockResolvedValue(response);
    const result = await retryRequest(fn, { attempts: 3 }, { url: 'https://api.example.com/test' });
    expect(result).toBe(response);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on network error', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 3) {
        throw new HttixRequestError('Network error');
      }
      return makeResponse({ ok: true }, 200, 'OK');
    };

    const onRetry = vi.fn();
    const result = await retryRequest(
      fn,
      { attempts: 3, baseDelay: 1, maxDelay: 1, jitter: false, onRetry },
      { url: 'https://api.example.com/test' },
    );
    expect(result.status).toBe(200);
    expect(attempts).toBe(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('should retry on 500 status', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        return makeResponse({ error: 'server' }, 500, 'Internal Server Error');
      }
      return makeResponse({ ok: true }, 200, 'OK');
    };

    const onRetry = vi.fn();
    const result = await retryRequest(
      fn,
      { attempts: 3, baseDelay: 1, maxDelay: 1, jitter: false, onRetry },
      { url: 'https://api.example.com/test', method: 'GET' },
    );
    expect(result.status).toBe(200);
    expect(attempts).toBe(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('should retry on 429 with Retry-After header', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        return makeResponse({ error: 'too many' }, 429, 'Too Many Requests', { 'Retry-After': '1' });
      }
      return makeResponse({ ok: true }, 200, 'OK');
    };

    const start = Date.now();
    const result = await retryRequest(
      fn,
      { attempts: 3, baseDelay: 1, maxDelay: 60000, jitter: false },
      { url: 'https://api.example.com/test', method: 'GET' },
    );
    expect(result.status).toBe(200);
    expect(attempts).toBe(2);
    // Should have waited at least ~1s due to Retry-After
    expect(Date.now() - start).toBeGreaterThanOrEqual(900);
  });

  it('should respect max retries', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw new HttixRequestError('Always fails');
    };
    // With the current implementation, on the last attempt the raw error is thrown
    // (shouldRetry returns false when attempt+1 >= maxAttempts)
    await expect(
      retryRequest(
        fn,
        { attempts: 2, baseDelay: 1, maxDelay: 1, jitter: false },
        { url: 'https://api.example.com/test' },
      ),
    ).rejects.toThrow(HttixRequestError);
    expect(attempts).toBe(2);
  });

  it('should use exponential backoff', async () => {
    let attempts = 0;
    const delays: number[] = [];
    const fn = async () => {
      attempts++;
      if (attempts < 3) {
        throw new HttixRequestError('fail');
      }
      return makeResponse({ ok: true }, 200);
    };
    const onRetry = vi.fn((_attempt, _error, delay) => {
      delays.push(delay);
    });
    await retryRequest(
      fn,
      { attempts: 3, baseDelay: 100, maxDelay: 30000, jitter: false, onRetry },
      { url: 'https://api.example.com/test' },
    );
    expect(delays).toHaveLength(2);
    expect(delays[0]).toBe(100);
    expect(delays[1]).toBe(200);
  });

  it('should not retry on 4xx (except 408, 429)', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      return makeResponse({ error: 'bad request' }, 400, 'Bad Request');
    };
    const result = await retryRequest(fn, { attempts: 3 }, { url: 'https://api.example.com/test', method: 'GET' });
    expect(result.status).toBe(400);
    expect(attempts).toBe(1);
  });

  it('should call onRetry callback', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        throw new HttixRequestError('fail');
      }
      return makeResponse({ ok: true }, 200);
    };
    const onRetry = vi.fn();
    await retryRequest(
      fn,
      { attempts: 3, baseDelay: 1, maxDelay: 1, jitter: false, onRetry },
      { url: 'https://api.example.com/test' },
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(HttixRequestError), expect.any(Number));
  });

  it('should respect custom retry condition', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 3) {
        return makeResponse({ error: 'server' }, 500, 'Server Error');
      }
      return makeResponse({ ok: true }, 200, 'OK');
    };
    // Custom condition that never allows retry → 500 is thrown as error immediately
    const customCondition = vi.fn(() => false);
    await expect(
      retryRequest(
        fn,
        { attempts: 3, baseDelay: 1, maxDelay: 1, jitter: false, retryCondition: customCondition },
        { url: 'https://api.example.com/test', method: 'GET' },
      ),
    ).rejects.toThrow(HttixResponseError);
    expect(attempts).toBe(1);
    expect(customCondition).toHaveBeenCalled();
  });

  it('should track lastError when all attempts exhausted', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw new HttixRequestError('always fails');
    };
    try {
      await retryRequest(
        fn,
        { attempts: 3, baseDelay: 1, maxDelay: 1, jitter: false },
        { url: 'https://api.example.com/test' },
      );
      expect.fail('Should have thrown');
    } catch (error) {
      // The current implementation throws the raw last error (HttixRequestError)
      // when shouldRetry returns false on the final attempt
      expect(error).toBeInstanceOf(HttixRequestError);
      expect(attempts).toBe(3);
    }
  });

  it('should not retry POST when retryOnSafeMethodsOnly is true', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw new HttixRequestError('Network error');
    };
    await expect(
      retryRequest(
        fn,
        { attempts: 3, retryOnSafeMethodsOnly: true, baseDelay: 1, maxDelay: 1, jitter: false },
        { url: 'https://api.example.com/test', method: 'POST' },
      ),
    ).rejects.toThrow(HttixRequestError);
    expect(attempts).toBe(1);
  });

  it('should retry GET when retryOnSafeMethodsOnly is true', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        throw new HttixRequestError('Network error');
      }
      return makeResponse({ ok: true }, 200);
    };
    const result = await retryRequest(
      fn,
      { attempts: 3, retryOnSafeMethodsOnly: true, baseDelay: 1, maxDelay: 1, jitter: false },
      { url: 'https://api.example.com/test', method: 'GET' },
    );
    expect(result.status).toBe(200);
    expect(attempts).toBe(2);
  });

  it('should not retry when retryOnNetworkError is false', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw new HttixRequestError('Network error');
    };
    await expect(
      retryRequest(
        fn,
        { attempts: 3, retryOnNetworkError: false },
        { url: 'https://api.example.com/test' },
      ),
    ).rejects.toThrow(HttixRequestError);
    expect(attempts).toBe(1);
  });
});
