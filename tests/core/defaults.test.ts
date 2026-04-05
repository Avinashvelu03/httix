import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RETRY,
  DEFAULT_TIMEOUT,
  DEFAULT_HEADERS,
  DEFAULT_REQUEST_CONFIG,
  DEFAULT_CONFIG,
} from '../../src/core/defaults';

describe('DEFAULT_RETRY', () => {
  it('has the correct default attempts', () => {
    expect(DEFAULT_RETRY.attempts).toBe(3);
  });

  it('has exponential backoff strategy', () => {
    expect(DEFAULT_RETRY.backoff).toBe('exponential');
  });

  it('has the correct base delay', () => {
    expect(DEFAULT_RETRY.baseDelay).toBe(1000);
  });

  it('has the correct max delay', () => {
    expect(DEFAULT_RETRY.maxDelay).toBe(30000);
  });

  it('has jitter enabled', () => {
    expect(DEFAULT_RETRY.jitter).toBe(true);
  });

  it('has the correct retryOn status codes', () => {
    expect(DEFAULT_RETRY.retryOn).toEqual([408, 429, 500, 502, 503, 504]);
  });

  it('retries on network errors by default', () => {
    expect(DEFAULT_RETRY.retryOnNetworkError).toBe(true);
  });

  it('does not restrict to safe methods only', () => {
    expect(DEFAULT_RETRY.retryOnSafeMethodsOnly).toBe(false);
  });

  it('retryCondition returns true by default', () => {
    expect(DEFAULT_RETRY.retryCondition()).toBe(true);
  });

  it('onRetry is a no-op by default', () => {
    expect(() => DEFAULT_RETRY.onRetry(1, {} as any, 0)).not.toThrow();
  });
});

describe('DEFAULT_TIMEOUT', () => {
  it('is 30 seconds', () => {
    expect(DEFAULT_TIMEOUT).toBe(30000);
  });
});

describe('DEFAULT_HEADERS', () => {
  it('includes Accept header', () => {
    expect(DEFAULT_HEADERS['Accept']).toBe('application/json, text/plain, */*');
  });

  it('includes Accept-Encoding header', () => {
    expect(DEFAULT_HEADERS['Accept-Encoding']).toBe('gzip, deflate, br');
  });

  it('includes Accept-Language header', () => {
    expect(DEFAULT_HEADERS['Accept-Language']).toBe('*');
  });
});

describe('DEFAULT_REQUEST_CONFIG', () => {
  it('sets method to GET', () => {
    expect(DEFAULT_REQUEST_CONFIG.method).toBe('GET');
  });

  it('sets timeout to DEFAULT_TIMEOUT', () => {
    expect(DEFAULT_REQUEST_CONFIG.timeout).toBe(DEFAULT_TIMEOUT);
  });

  it('enables throwOnError', () => {
    expect(DEFAULT_REQUEST_CONFIG.throwOnError).toBe(true);
  });

  it('sets credentials to same-origin', () => {
    expect(DEFAULT_REQUEST_CONFIG.credentials).toBe('same-origin');
  });

  it('sets mode to cors', () => {
    expect(DEFAULT_REQUEST_CONFIG.mode).toBe('cors');
  });

  it('sets redirect to follow', () => {
    expect(DEFAULT_REQUEST_CONFIG.redirect).toBe('follow');
  });

  it('sets cache to default', () => {
    expect(DEFAULT_REQUEST_CONFIG.cache).toBe('default');
  });
});

describe('DEFAULT_CONFIG', () => {
  it('has empty url', () => {
    expect(DEFAULT_CONFIG.url).toBe('');
  });

  it('has empty baseURL', () => {
    expect(DEFAULT_CONFIG.baseURL).toBe('');
  });

  it('has default headers', () => {
    expect(DEFAULT_CONFIG.headers).toBe(DEFAULT_HEADERS);
  });

  it('has default timeout', () => {
    expect(DEFAULT_CONFIG.timeout).toBe(DEFAULT_TIMEOUT);
  });

  it('has throwOnError enabled', () => {
    expect(DEFAULT_CONFIG.throwOnError).toBe(true);
  });

  it('has credentials set to same-origin', () => {
    expect(DEFAULT_CONFIG.credentials).toBe('same-origin');
  });

  it('has mode set to cors', () => {
    expect(DEFAULT_CONFIG.mode).toBe('cors');
  });

  it('has redirect set to follow', () => {
    expect(DEFAULT_CONFIG.redirect).toBe('follow');
  });

  it('has cache set to default', () => {
    expect(DEFAULT_CONFIG.cache).toBe('default');
  });

  it('has retry config', () => {
    expect(DEFAULT_CONFIG.retry).toBe(DEFAULT_RETRY);
  });

  it('has dedup disabled', () => {
    expect(DEFAULT_CONFIG.dedup).toBe(false);
  });
});
