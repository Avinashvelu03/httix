/**
 * httix — Request deduplication
 */

import type { HttixRequestConfig } from '../core/types';

/**
 * Deduplicates in-flight requests and optionally caches responses
 * for a configurable TTL.
 *
 * - When `ttl` is 0 (default), only coalesces concurrent requests with
 *   the same key — once the request resolves, subsequent calls execute
 *   a new request.
 * - When `ttl` > 0, resolved responses are cached for the specified
 *   duration and returned for matching keys without re-executing.
 */
export class RequestDeduplicator {
  private inflight = new Map<string, Promise<unknown>>();
  private cache = new Map<string, { data: unknown; timestamp: number }>();
  private ttl: number;

  constructor(ttl = 0) {
    this.ttl = ttl;
  }

  /**
   * Deduplicate a request by key.
   *
   * If a cached response is available (and not expired), return it.
   * If a request is already in-flight, return the same promise.
   * Otherwise, execute `requestFn`, cache the result (if TTL > 0),
   * and return it.
   */
  async dedup<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    // Check cache first (if TTL > 0)
    if (this.ttl > 0) {
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.timestamp < this.ttl) {
        return cached.data as T;
      }
    }

    // Check in-flight requests
    const inflight = this.inflight.get(key);
    if (inflight) {
      return inflight as Promise<T>;
    }

    // Execute the request
    const promise = requestFn().then((result) => {
      // Cache result if TTL > 0
      if (this.ttl > 0) {
        this.cache.set(key, { data: result, timestamp: Date.now() });
      }
      this.inflight.delete(key);
      return result;
    }).catch((error) => {
      this.inflight.delete(key);
      throw error;
    });

    this.inflight.set(key, promise);
    return promise;
  }

  /**
   * Generate a deduplication key from a request config.
   *
   * The key is composed of the HTTP method, origin, pathname, and
   * sorted query parameters.
   */
  generateKey(config: HttixRequestConfig): string {
    const url = new URL(config.url, config.baseURL);
    const sortedQuery = config.query
      ? Object.keys(config.query)
          .sort()
          .map((k) => `${k}=${String((config.query as Record<string, unknown>)[k])}`)
          .join('&')
      : '';
    return `${config.method || 'GET'}:${url.origin}${url.pathname}${sortedQuery ? '?' + sortedQuery : ''}`;
  }

  /**
   * Clear all in-flight requests and cached responses.
   */
  clear(): void {
    this.inflight.clear();
    this.cache.clear();
  }
}
