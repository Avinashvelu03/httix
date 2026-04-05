import { describe, it, expect } from 'vitest';
import { deepMergeConfig, mergeQueryParams } from '../../src/utils/merge';
import type { HttixRequestConfig } from '../../src/core/types';

// ---------------------------------------------------------------------------
// deepMergeConfig
// ---------------------------------------------------------------------------
describe('deepMergeConfig', () => {
  it('returns a copy of target when source is empty', () => {
    const target: Partial<HttixRequestConfig> = { url: '/api', method: 'GET' };
    const result = deepMergeConfig(target, {});

    expect(result.url).toBe('/api');
    expect(result.method).toBe('GET');
    // Should not be the same reference
    expect(result).not.toBe(target);
  });

  it('source primitive values override target', () => {
    const target: Partial<HttixRequestConfig> = { method: 'GET', timeout: 5000 };
    const source: Partial<HttixRequestConfig> = { method: 'POST' };
    const result = deepMergeConfig(target, source);

    expect(result.method).toBe('POST');
    expect(result.timeout).toBe(5000);
  });

  it('source array values replace target array entirely', () => {
    const target = { retry: { retryOn: [408, 429] } } as Partial<HttixRequestConfig>;
    const source = { retry: { retryOn: [500, 503] } } as Partial<HttixRequestConfig>;
    const result = deepMergeConfig(target, source);

    expect(result.retry && typeof result.retry === 'object' && result.retry.retryOn).toEqual([500, 503]);
  });

  it('deep merges plain object values', () => {
    const target = { retry: { attempts: 3, baseDelay: 1000 } } as Partial<HttixRequestConfig>;
    const source = { retry: { attempts: 5, jitter: false } } as Partial<HttixRequestConfig>;
    const result = deepMergeConfig(target, source);

    expect(result.retry).toEqual({
      attempts: 5,
      baseDelay: 1000,
      jitter: false,
    });
  });

  it('merges headers using mergeHeaders', () => {
    const target: Partial<HttixRequestConfig> = {
      headers: { Accept: 'text/html' },
    };
    const source: Partial<HttixRequestConfig> = {
      headers: { 'X-Custom': 'value' },
    };
    const result = deepMergeConfig(target, source);

    expect(result.headers).toBeInstanceOf(Headers);
    expect((result.headers as Headers).get('Accept')).toBe('text/html');
    expect((result.headers as Headers).get('X-Custom')).toBe('value');
  });

  it('custom headers override default headers via mergeHeaders', () => {
    const target: Partial<HttixRequestConfig> = {
      headers: { Accept: 'text/html' },
    };
    const source: Partial<HttixRequestConfig> = {
      headers: { Accept: 'application/json' },
    };
    const result = deepMergeConfig(target, source);

    expect(result.headers).toBeInstanceOf(Headers);
    expect((result.headers as Headers).get('Accept')).toBe('application/json');
  });

  it('merges query params', () => {
    const target: Partial<HttixRequestConfig> = {
      query: { page: '1', sort: 'name' },
    };
    const source: Partial<HttixRequestConfig> = {
      query: { page: '2', filter: 'active' },
    };
    const result = deepMergeConfig(target, source);

    expect(result.query).toEqual({
      page: '2',
      sort: 'name',
      filter: 'active',
    });
  });

  it('does not mutate target', () => {
    const target: Partial<HttixRequestConfig> = { method: 'GET' };
    const source: Partial<HttixRequestConfig> = { method: 'POST' };
    deepMergeConfig(target, source);

    expect(target.method).toBe('GET');
  });

  it('does not mutate source', () => {
    const target: Partial<HttixRequestConfig> = {};
    const source: Partial<HttixRequestConfig> = { method: 'POST' };
    deepMergeConfig(target, source);

    expect(source.method).toBe('POST');
  });

  it('skips undefined source values', () => {
    const target: Partial<HttixRequestConfig> = { method: 'GET', timeout: 5000 };
    const source: Partial<HttixRequestConfig> = { timeout: undefined };
    const result = deepMergeConfig(target, source);

    expect(result.timeout).toBe(5000);
  });

  it('source overrides target when both are primitives', () => {
    const target: Partial<HttixRequestConfig> = { timeout: 5000 };
    const source: Partial<HttixRequestConfig> = { timeout: 10000 };
    const result = deepMergeConfig(target, source);

    expect(result.timeout).toBe(10000);
  });

  it('source object replaces target primitive', () => {
    const target: Partial<HttixRequestConfig> = { retry: false };
    const source: Partial<HttixRequestConfig> = { retry: { attempts: 5 } };
    const result = deepMergeConfig(target, source);

    expect(result.retry).toEqual({ attempts: 5 });
  });
});

// ---------------------------------------------------------------------------
// mergeQueryParams
// ---------------------------------------------------------------------------
describe('mergeQueryParams', () => {
  it('returns empty object when both are undefined', () => {
    expect(mergeQueryParams(undefined, undefined)).toEqual({});
  });

  it('returns a copy of target when source is undefined', () => {
    const target = { page: '1', sort: 'name' };
    const result = mergeQueryParams(target, undefined);

    expect(result).toEqual({ page: '1', sort: 'name' });
    expect(result).not.toBe(target);
  });

  it('returns a copy of source when target is undefined', () => {
    const source = { filter: 'active' };
    const result = mergeQueryParams(undefined, source);

    expect(result).toEqual({ filter: 'active' });
    expect(result).not.toBe(source);
  });

  it('merges target and source (source wins on conflict)', () => {
    const target = { page: '1', sort: 'name' };
    const source = { page: '2', filter: 'active' };
    const result = mergeQueryParams(target, source);

    expect(result).toEqual({ page: '2', sort: 'name', filter: 'active' });
  });

  it('does not mutate target or source', () => {
    const target = { a: '1' };
    const source = { b: '2' };
    mergeQueryParams(target, source);

    expect(target).toEqual({ a: '1' });
    expect(source).toEqual({ b: '2' });
  });
});
