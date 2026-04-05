/**
 * httix — Timeout management via AbortController
 */

import type { HttixRequestConfig } from '../core/types';
import { HttixTimeoutError } from '../core/errors';

/**
 * WeakMap that associates an AbortController with its timeout timer ID,
 * allowing the timer to be cleared later without leaking memory.
 */
export const timeoutTimers = new WeakMap<AbortController, ReturnType<typeof setTimeout>>();

/**
 * Create an AbortController that will automatically abort after the
 * specified timeout. The abort reason is set to a HttixTimeoutError.
 *
 * If timeout is 0 or negative, the controller will never abort.
 */
export function createTimeoutController(
  timeout: number,
  config: HttixRequestConfig,
): AbortController {
  const controller = new AbortController();

  if (timeout <= 0) {
    // No timeout — controller will never abort
    return controller;
  }

  const timerId = setTimeout(() => {
    const error = new HttixTimeoutError(timeout, config);
    controller.abort(error);
  }, timeout);

  timeoutTimers.set(controller, timerId);

  return controller;
}

/**
 * Clear a pending timeout timer on an AbortController, preventing it from
 * firing if the request completes before the timeout.
 */
export function clearTimeoutController(controller: AbortController): void {
  const timerId = timeoutTimers.get(controller);
  if (timerId !== undefined) {
    clearTimeout(timerId);
    timeoutTimers.delete(controller);
  }
}
