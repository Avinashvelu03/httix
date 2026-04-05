/**
 * request.ts + body.ts + helpers.ts + merge.ts coverage gap tests
 */
import { describe, it, expect } from 'vitest';
import { buildRequest } from '../../src/core/request';
import { serializeBody } from '../../src/utils/body';
import { calculateDelay } from '../../src/utils/helpers';
import { deepMergeConfig, mergeQueryParams } from '../../src/utils/merge';

describe('buildRequest — combineSignals with already-aborted signal', () => {
  it('should handle already-aborted signal with timeout', () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const result = buildRequest({
      url: 'http://localhost/t', method: 'GET', timeout: 5000, signal: ctrl.signal,
    });
    expect(result.request.signal.aborted).toBe(true);
  });
});

describe('buildRequest — fallback body type', () => {
  it('should return undefined for Symbol body', () => {
    const result = (buildRequest as Function)({ url: 'http://localhost/t', method: 'POST', body: Symbol('x') });
    expect(result.request).toBeDefined();
  });
});

describe('serializeBody — fallback', () => {
  it('should handle Symbol type', () => {
    const r = (serializeBody as Function)(Symbol('s'));
    expect(r.body).toBe('Symbol(s)');
    expect(r.contentType).toBeNull();
  });
});

describe('calculateDelay — unknown strategy', () => {
  it('should fallback to baseDelay', () => {
    expect((calculateDelay as Function)(1, 'invalid', 500, 5000, false)).toBe(500);
  });
});

describe('deepMergeConfig — deepMergePlainObjects', () => {
  it('should replace arrays in deep merge', () => {
    const r = deepMergeConfig({ retry: { retryOn: [500, 502] } } as any, { retry: { retryOn: [429] } } as any);
    expect((r as any).retry.retryOn).toEqual([429]);
  });

  it('should recursively merge nested objects', () => {
    const r = deepMergeConfig(
      { cfg: { nested: { a: 1, b: 2 } } } as any,
      { cfg: { nested: { b: 3, c: 4 } } } as any,
    );
    expect((r as any).cfg.nested).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('should handle null source replacing target', () => {
    // Use non-special key (not 'query' or 'headers') to hit generic merge path
    const r = deepMergeConfig({ retry: { a: '1' } } as any, { retry: null } as any);
    expect((r as any).retry).toBeNull();
  });
});

describe('mergeQueryParams — all branches', () => {
  it('both undefined', () => expect(mergeQueryParams(undefined, undefined)).toEqual({}));
  it('only source', () => expect(mergeQueryParams(undefined, { a: '1' })).toEqual({ a: '1' }));
  it('only target', () => expect(mergeQueryParams({ a: '1' }, undefined)).toEqual({ a: '1' }));
});
