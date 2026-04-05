import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTimeoutController, clearTimeoutController, timeoutTimers } from '../../src/features/timeout';
import { HttixTimeoutError } from '../../src/core/errors';

describe('createTimeoutController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create an AbortController', () => {
    const controller = createTimeoutController(5000, { url: '/test' });
    expect(controller).toBeInstanceOf(AbortController);
  });

  it('should abort after the specified timeout', async () => {
    const controller = createTimeoutController(1000, { url: '/test' });
    expect(controller.signal.aborted).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toBeInstanceOf(HttixTimeoutError);
  });

  it('should not abort before timeout', () => {
    const controller = createTimeoutController(5000, { url: '/test' });
    vi.advanceTimersByTime(4999);
    expect(controller.signal.aborted).toBe(false);
  });

  it('should not abort when timeout is 0', () => {
    const controller = createTimeoutController(0, { url: '/test' });
    vi.advanceTimersByTime(100000);
    expect(controller.signal.aborted).toBe(false);
  });

  it('should not abort when timeout is negative', () => {
    const controller = createTimeoutController(-1, { url: '/test' });
    vi.advanceTimersByTime(100000);
    expect(controller.signal.aborted).toBe(false);
  });

  it('should set abort reason to HttixTimeoutError with correct timeout value', async () => {
    const controller = createTimeoutController(3000, { url: '/slow' });
    vi.advanceTimersByTime(3000);

    const error = controller.signal.reason;
    expect(error).toBeInstanceOf(HttixTimeoutError);
    expect((error as HttixTimeoutError).timeout).toBe(3000);
    expect((error as HttixTimeoutError).message).toBe('Request timed out after 3000ms');
  });

  it('should store timer in timeoutTimers WeakMap', () => {
    const controller = createTimeoutController(5000, { url: '/test' });
    expect(timeoutTimers.has(controller)).toBe(true);
  });

  it('should not store timer in WeakMap when timeout is 0', () => {
    const controller = createTimeoutController(0, { url: '/test' });
    expect(timeoutTimers.has(controller)).toBe(false);
  });
});

describe('clearTimeoutController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should clear the timer and prevent abort', () => {
    const controller = createTimeoutController(1000, { url: '/test' });
    clearTimeoutController(controller);

    vi.advanceTimersByTime(5000);
    expect(controller.signal.aborted).toBe(false);
  });

  it('should remove timer from WeakMap', () => {
    const controller = createTimeoutController(1000, { url: '/test' });
    expect(timeoutTimers.has(controller)).toBe(true);
    clearTimeoutController(controller);
    expect(timeoutTimers.has(controller)).toBe(false);
  });

  it('should handle controller without timer gracefully', () => {
    const controller = new AbortController();
    expect(() => clearTimeoutController(controller)).not.toThrow();
  });
});
