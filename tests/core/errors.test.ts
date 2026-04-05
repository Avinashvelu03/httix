import { describe, it, expect } from 'vitest';
import {
  HttixError,
  HttixRequestError,
  HttixResponseError,
  HttixTimeoutError,
  HttixAbortError,
  HttixRetryError,
} from '../../src/core/errors';
import type { HttixRequestConfig } from '../../src/core/types';

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------
const mockConfig: HttixRequestConfig = { url: 'https://example.com/api', method: 'GET' };

// ---------------------------------------------------------------------------
// HttixError
// ---------------------------------------------------------------------------
describe('HttixError', () => {
  it('is an instance of Error', () => {
    const err = new HttixError('something went wrong');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(HttixError);
  });

  it('has the correct name', () => {
    const err = new HttixError('test');
    expect(err.name).toBe('HttixError');
  });

  it('stores the message', () => {
    const err = new HttixError('my message');
    expect(err.message).toBe('my message');
  });

  it('accepts no options', () => {
    const err = new HttixError('no opts');
    expect(err.config).toBeUndefined();
    expect(err.cause).toBeUndefined();
  });

  it('stores config from options', () => {
    const err = new HttixError('with config', { config: mockConfig });
    expect(err.config).toBe(mockConfig);
  });

  it('stores cause from options', () => {
    const cause = new Error('root cause');
    const err = new HttixError('with cause', { cause });
    expect(err.cause).toBe(cause);
  });

  it('stores both config and cause from options', () => {
    const cause = new TypeError('network');
    const err = new HttixError('both', { config: mockConfig, cause });
    expect(err.config).toBe(mockConfig);
    expect(err.cause).toBe(cause);
  });

  it('maintains correct prototype chain', () => {
    const err = new HttixError('proto');
    // proto chain should be: err -> HttixError.prototype -> Error.prototype
    expect(Object.getPrototypeOf(err)).toBe(HttixError.prototype);
    expect(Object.getPrototypeOf(HttixError.prototype)).toBe(Error.prototype);
  });
});

// ---------------------------------------------------------------------------
// HttixRequestError
// ---------------------------------------------------------------------------
describe('HttixRequestError', () => {
  it('is an instance of HttixError and Error', () => {
    const err = new HttixRequestError('network failure');
    expect(err).toBeInstanceOf(HttixRequestError);
    expect(err).toBeInstanceOf(HttixError);
    expect(err).toBeInstanceOf(Error);
  });

  it('has the correct name', () => {
    const err = new HttixRequestError('dns failed');
    expect(err.name).toBe('HttixRequestError');
  });

  it('accepts options', () => {
    const err = new HttixRequestError('cors', { config: mockConfig });
    expect(err.config).toBe(mockConfig);
  });
});

// ---------------------------------------------------------------------------
// HttixResponseError
// ---------------------------------------------------------------------------
describe('HttixResponseError', () => {
  const mockHeaders = new Headers({ 'Content-Type': 'application/json' });

  it('is an instance of HttixError and Error', () => {
    const err = new HttixResponseError(500, 'Internal Server Error', null, mockHeaders, mockConfig);
    expect(err).toBeInstanceOf(HttixResponseError);
    expect(err).toBeInstanceOf(HttixError);
    expect(err).toBeInstanceOf(Error);
  });

  it('has the correct name', () => {
    const err = new HttixResponseError(404, 'Not Found', null);
    expect(err.name).toBe('HttixResponseError');
  });

  it('stores status and statusText', () => {
    const err = new HttixResponseError(403, 'Forbidden', null);
    expect(err.status).toBe(403);
    expect(err.statusText).toBe('Forbidden');
  });

  it('stores data', () => {
    const data = { error: 'invalid payload' };
    const err = new HttixResponseError(400, 'Bad Request', data);
    expect(err.data).toEqual(data);
  });

  it('stores headers', () => {
    const err = new HttixResponseError(500, 'Server Error', null, mockHeaders);
    expect(err.headers).toBe(mockHeaders);
    expect(err.headers?.get('Content-Type')).toBe('application/json');
  });

  it('works without headers', () => {
    const err = new HttixResponseError(500, 'err', 'data');
    expect(err.headers).toBeUndefined();
  });

  it('works without config', () => {
    const err = new HttixResponseError(502, 'Bad Gateway', null);
    expect(err.config).toBeUndefined();
  });

  it('formats the error message correctly', () => {
    const err = new HttixResponseError(503, 'Service Unavailable', null);
    expect(err.message).toBe('Request failed with status 503: Service Unavailable');
  });

  it('stores config when provided', () => {
    const err = new HttixResponseError(401, 'Unauthorized', null, mockHeaders, mockConfig);
    expect(err.config).toBe(mockConfig);
  });
});

// ---------------------------------------------------------------------------
// HttixTimeoutError
// ---------------------------------------------------------------------------
describe('HttixTimeoutError', () => {
  it('is an instance of HttixError and Error', () => {
    const err = new HttixTimeoutError(5000);
    expect(err).toBeInstanceOf(HttixTimeoutError);
    expect(err).toBeInstanceOf(HttixError);
    expect(err).toBeInstanceOf(Error);
  });

  it('has the correct name', () => {
    const err = new HttixTimeoutError(1000);
    expect(err.name).toBe('HttixTimeoutError');
  });

  it('stores the timeout value', () => {
    const err = new HttixTimeoutError(10000);
    expect(err.timeout).toBe(10000);
  });

  it('formats the message with the timeout value', () => {
    const err = new HttixTimeoutError(30000);
    expect(err.message).toBe('Request timed out after 30000ms');
  });

  it('accepts an optional config', () => {
    const err = new HttixTimeoutError(5000, mockConfig);
    expect(err.config).toBe(mockConfig);
  });

  it('works without a config', () => {
    const err = new HttixTimeoutError(1000);
    expect(err.config).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// HttixAbortError
// ---------------------------------------------------------------------------
describe('HttixAbortError', () => {
  it('is an instance of HttixError and Error', () => {
    const err = new HttixAbortError('user cancelled');
    expect(err).toBeInstanceOf(HttixAbortError);
    expect(err).toBeInstanceOf(HttixError);
    expect(err).toBeInstanceOf(Error);
  });

  it('has the correct name', () => {
    const err = new HttixAbortError();
    expect(err.name).toBe('HttixAbortError');
  });

  it('uses the provided reason as both message and reason', () => {
    const err = new HttixAbortError(' navigation');
    expect(err.message).toBe(' navigation');
    expect(err.reason).toBe(' navigation');
  });

  it('uses a default message when no reason is provided', () => {
    const err = new HttixAbortError();
    expect(err.message).toBe('Request was aborted');
    expect(err.reason).toBe('Request was aborted');
  });

  it('accepts an optional config', () => {
    const err = new HttixAbortError('timeout', mockConfig);
    expect(err.config).toBe(mockConfig);
  });

  it('works without a config', () => {
    const err = new HttixAbortError();
    expect(err.config).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// HttixRetryError
// ---------------------------------------------------------------------------
describe('HttixRetryError', () => {
  it('is an instance of HttixError and Error', () => {
    const lastError = new HttixRequestError('connection refused');
    const err = new HttixRetryError(3, lastError);
    expect(err).toBeInstanceOf(HttixRetryError);
    expect(err).toBeInstanceOf(HttixError);
    expect(err).toBeInstanceOf(Error);
  });

  it('has the correct name', () => {
    const lastError = new HttixRequestError('fail');
    const err = new HttixRetryError(2, lastError);
    expect(err.name).toBe('HttixRetryError');
  });

  it('stores the number of attempts', () => {
    const lastError = new HttixRequestError('fail');
    const err = new HttixRetryError(5, lastError);
    expect(err.attempts).toBe(5);
  });

  it('stores the last error', () => {
    const lastError = new HttixRequestError('dns failed');
    const err = new HttixRetryError(3, lastError);
    expect(err.lastError).toBe(lastError);
  });

  it('sets cause to lastError', () => {
    const lastError = new HttixRequestError('refused');
    const err = new HttixRetryError(3, lastError);
    expect(err.cause).toBe(lastError);
  });

  it('formats message with singular attempt', () => {
    const lastError = new HttixRequestError('fail');
    const err = new HttixRetryError(1, lastError);
    expect(err.message).toBe('Request failed after 1 attempt');
  });

  it('formats message with plural attempts', () => {
    const lastError = new HttixRequestError('fail');
    const err = new HttixRetryError(3, lastError);
    expect(err.message).toBe('Request failed after 3 attempts');
  });

  it('accepts an optional config', () => {
    const lastError = new HttixRequestError('fail');
    const err = new HttixRetryError(4, lastError, mockConfig);
    expect(err.config).toBe(mockConfig);
  });

  it('works without a config', () => {
    const lastError = new HttixRequestError('fail');
    const err = new HttixRetryError(2, lastError);
    expect(err.config).toBeUndefined();
  });
});
