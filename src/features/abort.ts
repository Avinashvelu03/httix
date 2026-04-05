/**
 * httix — Cancellation / abort utilities
 */

import type { HttixRequestConfig } from '../core/types';
import { HttixAbortError } from '../core/errors';

/**
 * A cancellation token wraps an AbortController, exposing its signal and
 * a promise that rejects when the token is cancelled.
 */
export interface CancelToken {
  signal: AbortSignal;
  promise: Promise<never>;
}

/**
 * Create a new cancel token and its associated cancel function.
 *
 * The returned `cancel` function triggers the underlying AbortController,
 * causing the `signal` to abort and the `promise` to reject.
 */
export function createCancelToken(): { token: CancelToken; cancel: (reason?: string) => void } {
  const controller = new AbortController();

  let rejectFn: (reason: unknown) => void;
  const promise = new Promise<never>((_, reject) => {
    rejectFn = reject;
  });

  const token: CancelToken = {
    signal: controller.signal,
    promise,
  };

  const cancel = (reason?: string): void => {
    const error = new HttixAbortError(reason);
    controller.abort(error);
    rejectFn!(error);
  };

  return { token, cancel };
}

/**
 * Check whether an error is a cancellation (abort) error.
 */
export function isCancel(error: unknown): boolean {
  return error instanceof HttixAbortError;
}

/**
 * Create a new HttixAbortError, typically used when a request is
 * cancelled programmatically.
 */
export function createCancelError(reason?: string, config?: HttixRequestConfig): HttixAbortError {
  return new HttixAbortError(reason, config);
}
