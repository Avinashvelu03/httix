/**
 * coverage-final3.test.ts — Branch-only surgical tests for last gaps.
 *
 * Remaining uncovered branches:
 *   core/client.ts  line 439    config.timeout ?? 0           (timeout undefined)
 *   core/client.ts  lines 444,448  error instanceof Error — false branch (non-Error thrown)
 *   features/retry.ts line 58   config.attempts ?? default    (attempts omitted in config)
 *   features/retry.ts line 141  for-loop exit branch          (0 attempts)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttixClientImpl } from '../src/core/client';
import { retryRequest } from '../src/features/retry';
import { HttixRequestError } from '../src/core/errors';
import type { HttixResponse } from '../src/core/types';

// =========================================================================
// features/retry.ts line 58 — ?? right-hand side branches
// Call retryRequest with an empty RetryConfig so every ?? fires its default.
// =========================================================================
describe('retryRequest — empty RetryConfig uses all defaults', () => {
  it('uses DEFAULT_RETRY values for every omitted field', async () => {
    vi.useFakeTimers();

    let calls = 0;
    const fn = vi.fn().mockImplementation(async (): Promise<HttixResponse<string>> => {
      calls++;
      return {
        data: 'ok',
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        ok: true,
        raw: new Response(),
        timing: 0,
        config: { url: '/test' },
      };
    });

    // Pass an empty object — every ?? operator fires its right-hand default
    const result = await retryRequest<string>(fn, {}, { url: '/test', method: 'GET' });

    expect(result.status).toBe(200);
    expect(calls).toBe(1);

    vi.useRealTimers();
  });

  it('uses DEFAULT_RETRY.attempts when attempts is undefined', async () => {
    vi.useFakeTimers();

    const fn = vi.fn().mockResolvedValue({
      data: 'ok',
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      ok: true,
      raw: new Response(),
      timing: 0,
      config: { url: '/test' },
    } as HttixResponse<string>);

    // Only provide backoff, not attempts — forces attempts ?? DEFAULT to fire
    const result = await retryRequest<string>(
      fn,
      { backoff: 'fixed' },
      { url: '/test', method: 'GET' },
    );

    expect(result.status).toBe(200);
    vi.useRealTimers();
  });
});

// =========================================================================
// features/retry.ts line 141 — for-loop exits without entering body (attempts=0)
// =========================================================================
describe('retryRequest — zero attempts', () => {
  it('skips the loop entirely and falls through to the defensive block', async () => {
    vi.useFakeTimers();

    const fn = vi.fn().mockResolvedValue({
      data: 'ok',
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      ok: true,
      raw: new Response(),
      timing: 0,
      config: { url: '/test' },
    } as HttixResponse<string>);

    // With attempts: 0 the for-loop body never runs, exercising the
    // loop-condition-false branch at the closing brace (line 141).
    // The defensive fallback (covered by ignore block) then throws.
    await expect(
      retryRequest<string>(fn, { attempts: 0 }, { url: '/test', method: 'GET' }),
    ).rejects.toThrow();

    expect(fn).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

// =========================================================================
// core/client.ts lines 444, 448 — error instanceof Error — false branches
// When fetch throws a non-Error value (e.g. a plain string), both ternaries
// must take their false branch: "Network request failed" / undefined
// =========================================================================
describe('HttixClientImpl — non-Error thrown from fetch', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('uses fallback message and undefined cause when fetch throws a string', async () => {
    // Throw a plain string — NOT an Error instance → exercises the false
    // branches of both `error instanceof Error` ternaries (lines 444, 448).
    globalThis.fetch = vi.fn().mockRejectedValue('plain string error');

    const client = new HttixClientImpl({
      baseURL: 'http://localhost',
      retry: false,
    });

    let caught: unknown;
    try {
      await client.get('/non-error');
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(HttixRequestError);
    const reqErr = caught as HttixRequestError;
    // Line 444: false branch → 'Network request failed'
    expect(reqErr.message).toBe('Network request failed');
    // Line 448: false branch → cause is undefined
    expect(reqErr.cause).toBeUndefined();
  });

  it('uses fallback message and undefined cause when fetch throws a number', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(42);

    const client = new HttixClientImpl({
      baseURL: 'http://localhost',
      retry: false,
    });

    await expect(client.get('/non-error-num')).rejects.toMatchObject({
      message: 'Network request failed',
    });
  });
});
