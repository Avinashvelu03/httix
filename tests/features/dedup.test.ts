import { describe, it, expect, vi } from 'vitest';
import { RequestDeduplicator } from '../../src/features/dedup';
import type { HttixRequestConfig } from '../../src/core/types';

describe('RequestDeduplicator', () => {
  it('should return the same promise for identical concurrent requests', async () => {
    const dedup = new RequestDeduplicator(0);
    let callCount = 0;
    const requestFn = async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 50));
      return { data: 'result' };
    };

    const p1 = dedup.dedup('key1', requestFn);
    const p2 = dedup.dedup('key1', requestFn);
    const p3 = dedup.dedup('key1', requestFn);

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
    expect(callCount).toBe(1);
  });

  it('should not dedup different keys', async () => {
    const dedup = new RequestDeduplicator(0);
    let callCount = 0;
    const requestFn = async (key: string) => {
      callCount++;
      return { key };
    };

    const r1 = await dedup.dedup('key1', () => requestFn('key1'));
    const r2 = await dedup.dedup('key2', () => requestFn('key2'));

    expect(r1).toEqual({ key: 'key1' });
    expect(r2).toEqual({ key: 'key2' });
    expect(callCount).toBe(2);
  });

  it('should execute new request after previous one resolves (no TTL cache)', async () => {
    const dedup = new RequestDeduplicator(0);
    let callCount = 0;

    const requestFn = async () => {
      callCount++;
      return { data: callCount };
    };

    const r1 = await dedup.dedup('key1', requestFn);
    expect(r1).toEqual({ data: 1 });

    // After first resolves, a new call should execute a new request
    const r2 = await dedup.dedup('key1', requestFn);
    expect(r2).toEqual({ data: 2 });
    expect(callCount).toBe(2);
  });

  it('should cache results when TTL > 0', async () => {
    const dedup = new RequestDeduplicator(5000);
    let callCount = 0;

    const requestFn = async () => {
      callCount++;
      return { data: callCount };
    };

    const r1 = await dedup.dedup('key1', requestFn);
    expect(r1).toEqual({ data: 1 });
    expect(callCount).toBe(1);

    // Should return cached result
    const r2 = await dedup.dedup('key1', requestFn);
    expect(r2).toEqual({ data: 1 });
    expect(callCount).toBe(1);
  });

  it('should expire cache after TTL', async () => {
    vi.useFakeTimers();
    const dedup = new RequestDeduplicator(100);
    let callCount = 0;

    const requestFn = async () => {
      callCount++;
      return { data: callCount };
    };

    const r1 = await dedup.dedup('key1', requestFn);
    expect(r1).toEqual({ data: 1 });

    // Advance past TTL
    vi.advanceTimersByTime(150);

    const r2 = await vi.advanceTimersByTimeAsync(0).then(async () => {
      return dedup.dedup('key1', requestFn);
    });
    expect(r2).toEqual({ data: 2 });
    expect(callCount).toBe(2);

    vi.useRealTimers();
  });

  it('should propagate errors', async () => {
    const dedup = new RequestDeduplicator(0);
    const requestFn = async () => {
      throw new Error('Request failed');
    };

    await expect(dedup.dedup('key1', requestFn)).rejects.toThrow('Request failed');

    // After error, should allow retry
    let retried = false;
    const retryFn = async () => {
      retried = true;
      return { success: true };
    };

    const result = await dedup.dedup('key1', retryFn);
    expect(result).toEqual({ success: true });
    expect(retried).toBe(true);
  });

  it('should generate a dedup key from config', () => {
    const dedup = new RequestDeduplicator(0);
    const config: HttixRequestConfig = {
      url: 'https://api.example.com/users',
      method: 'GET',
      query: { page: 1, limit: 10 },
    };

    const key = dedup.generateKey(config);
    expect(key).toContain('GET');
    expect(key).toContain('/users');
  });

  it('should generate different keys for different query params', () => {
    const dedup = new RequestDeduplicator(0);
    const config1: HttixRequestConfig = { url: 'https://api.example.com/users', query: { page: 1 } };
    const config2: HttixRequestConfig = { url: 'https://api.example.com/users', query: { page: 2 } };

    expect(dedup.generateKey(config1)).not.toBe(dedup.generateKey(config2));
  });

  it('should clear all inflight and cached entries', async () => {
    const dedup = new RequestDeduplicator(5000);
    const requestFn = async () => ({ data: 'cached' });

    await dedup.dedup('key1', requestFn);
    await dedup.dedup('key2', requestFn);

    dedup.clear();

    let callCount = 0;
    const newFn = async () => {
      callCount++;
      return { fresh: true };
    };

    await dedup.dedup('key1', newFn);
    await dedup.dedup('key2', newFn);

    expect(callCount).toBe(2);
  });
});
