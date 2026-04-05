/**
 * httix — Error class hierarchy
 */

import type { HttixErrorOptions, HttixRequestConfig } from './types';

/**
 * Base error class for all httix errors.
 */
export class HttixError extends Error {
  public readonly name: string = 'HttixError';
  public readonly config?: HttixRequestConfig;
  public override readonly cause?: Error;

  constructor(message: string, options?: HttixErrorOptions) {
    super(message);
    this.name = 'HttixError';
    this.config = options?.config;
    this.cause = options?.cause;

    // Restore proper prototype chain (required for extending built-ins in TS)
    Object.setPrototypeOf(this, new.target.prototype);

    // Maintain proper stack trace in V8 environments
    const ErrorConstructor = Error as unknown as {
      captureStackTrace?: (target: object, constructor: Function) => void;
    };
    if (ErrorConstructor.captureStackTrace) {
      ErrorConstructor.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when a network-level request failure occurs
 * (e.g., DNS failure, connection refused, CORS error).
 */
export class HttixRequestError extends HttixError {
  public readonly name: string = 'HttixRequestError';

  constructor(message: string, options?: HttixErrorOptions) {
    super(message, options);
    this.name = 'HttixRequestError';
  }
}

/**
 * Error thrown when the server responds with a 4xx or 5xx status code.
 */
export class HttixResponseError extends HttixError {
  public readonly name: string = 'HttixResponseError';
  public readonly status: number;
  public readonly statusText: string;
  public readonly data: unknown;
  public readonly headers?: Headers;
  public override readonly config?: HttixRequestConfig;

  constructor(
    status: number,
    statusText: string,
    data: unknown,
    headers?: Headers,
    config?: HttixRequestConfig,
  ) {
    const message = `Request failed with status ${status}: ${statusText}`;
    super(message, { message, config });
    this.name = 'HttixResponseError';
    this.status = status;
    this.statusText = statusText;
    this.data = data;
    this.headers = headers;
    this.config = config;
  }
}

/**
 * Error thrown when a request exceeds its configured timeout.
 */
export class HttixTimeoutError extends HttixError {
  public readonly name: string = 'HttixTimeoutError';
  public readonly timeout: number;

  constructor(timeout: number, config?: HttixRequestConfig) {
    const message = `Request timed out after ${timeout}ms`;
    super(message, { message, config });
    this.name = 'HttixTimeoutError';
    this.timeout = timeout;
  }
}

/**
 * Error thrown when a request is cancelled via AbortController.
 */
export class HttixAbortError extends HttixError {
  public readonly name: string = 'HttixAbortError';
  public readonly reason: string;

  constructor(reason?: string, config?: HttixRequestConfig) {
    const message = reason ?? 'Request was aborted';
    super(message, { message, config });
    this.name = 'HttixAbortError';
    this.reason = message;
  }
}

/**
 * Error thrown when all retry attempts have been exhausted.
 */
export class HttixRetryError extends HttixError {
  public readonly name: string = 'HttixRetryError';
  public readonly attempts: number;
  public readonly lastError: HttixError;

  constructor(attempts: number, lastError: HttixError, config?: HttixRequestConfig) {
    const message = `Request failed after ${attempts} attempt${attempts === 1 ? '' : 's'}`;
    super(message, { message, config, cause: lastError });
    this.name = 'HttixRetryError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}
