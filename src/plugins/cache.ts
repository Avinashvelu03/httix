/**
 * httix — Cache plugin
 *
 * LRU response cache with configurable TTL, size, stale-while-revalidate,
 * and per-method caching control.
 */

import type {
  HttixClient,
  HttixPlugin,
  HttixResponse,
  HttixRequestConfig,
} from '../core/types';

export interface CachePluginConfig {
  /** Maximum cache entries (default: 100) */
  maxSize?: number;
  /** TTL in ms (default: 300000 = 5 minutes) */
  ttl?: number;
  /** Whether to enable stale-while-revalidate (default: false) */
  staleWhileRevalidate?: boolean;
  /** SWR window in ms (default: 60000 = 1 minute) */
  swrWindow?: number;
  /** Custom cache key function */
  generateKey?: (config: HttixRequestConfig) => string;
  /** Which methods to cache (default: ['GET']) */
  methods?: string[];
  /** Whether to respect Cache-Control headers (default: true) */
  respectCacheControl?: boolean;
}

interface CacheEntry<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
  timing: number;
  timestamp: number;
  config: HttixRequestConfig;
  raw: Response;
}

// ---------------------------------------------------------------------------
// LRUCache
// ---------------------------------------------------------------------------

export class LRUCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private ttl: number;

  constructor(maxSize = 100, ttl = 300_000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  get(key: string): CacheEntry<T> | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry;
  }

  /**
   * Retrieve an entry even if it has expired (TTL exceeded).
   * Returns undefined only when the key does not exist at all.
   */
  getAllowingStale(key: string): CacheEntry<T> | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry;
  }

  set(key: string, entry: CacheEntry<T>): void {
    // Delete if exists (to update position)
    this.cache.delete(key);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, entry);
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }
}

// ---------------------------------------------------------------------------
// Default key generator
// ---------------------------------------------------------------------------

function defaultKeyGenerator(config: HttixRequestConfig): string {
  const url = new URL(config.url, config.baseURL || 'http://localhost');
  const query = config.query
    ? '?' +
      new URLSearchParams(
        Object.entries(config.query)
          .filter(([, v]) => v != null)
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : '';
  return `${config.method || 'GET'} ${url.origin}${url.pathname}${query}`;
}

// ---------------------------------------------------------------------------
// Cache key attachment — type augmentation
// ---------------------------------------------------------------------------

interface CacheRequestConfig extends HttixRequestConfig {
  _cacheEntry?: CacheEntry;
  _cacheKey?: string;
  _cacheHit?: boolean;
}

// ---------------------------------------------------------------------------
// cachePlugin
// ---------------------------------------------------------------------------

export function cachePlugin(
  config?: CachePluginConfig,
): HttixPlugin & {
  cache: LRUCache;
  invalidate: (key?: string) => void;
  invalidatePattern: (pattern: RegExp) => void;
  clear: () => void;
  getStats: () => { size: number; maxSize: number; ttl: number };
} {
  const maxSize = config?.maxSize ?? 100;
  const ttl = config?.ttl ?? 300_000;
  const staleWhileRevalidate = config?.staleWhileRevalidate ?? false;
  const swrWindow = config?.swrWindow ?? 60_000;
  const methods = config?.methods ?? ['GET'];
  const keyGen = config?.generateKey ?? defaultKeyGenerator;

  const cache = new LRUCache(maxSize, ttl);

  return {
    name: 'cache',

    install(client: HttixClient) {
      // -- Request interceptor: check for cache hit --------------------------
      client.interceptors.request.use((reqConfig: HttixRequestConfig) => {
        // Only cache configured methods
        if (!methods.includes(reqConfig.method || 'GET')) {
          return reqConfig;
        }

        const key = keyGen(reqConfig);

        // When SWR is enabled, use getAllowingStale first so that expired
        // entries are not prematurely evicted before the SWR check runs.
        const rawEntry = staleWhileRevalidate
          ? cache.getAllowingStale(key)
          : cache.get(key);

        if (rawEntry) {
          const isFresh = Date.now() - rawEntry.timestamp <= ttl;
          const isStaleRevalidate = staleWhileRevalidate && Date.now() - rawEntry.timestamp <= ttl + swrWindow;
          if (isFresh || isStaleRevalidate) {
            // Fresh cache hit OR stale entry within SWR window
            const tagged = reqConfig as CacheRequestConfig;
            tagged._cacheEntry = rawEntry;
            tagged._cacheKey = key;
            tagged._cacheHit = true;
          }
        }

        return reqConfig;
      });

      // -- Response interceptor: serve from cache or store --------------------
      client.interceptors.response.use(
        (response: HttixResponse<unknown>): HttixResponse<unknown> => {
          const taggedConfig = response.config as CacheRequestConfig;

          if (taggedConfig._cacheHit && taggedConfig._cacheEntry) {
            // Return cached response, reusing the real raw Response for
            // compatibility with HttixResponse consumers.
            const entry = taggedConfig._cacheEntry;
            return {
              data: entry.data,
              status: entry.status,
              statusText: entry.statusText,
              headers: entry.headers,
              ok: entry.status >= 200 && entry.status < 300,
              raw: response.raw,
              timing: response.timing,
              config: response.config,
            } as HttixResponse<unknown>;
          }

          // Store fresh response in cache
          const method = response.config.method || 'GET';
          if (methods.includes(method) && response.ok) {
            const key = keyGen(response.config);
            cache.set(key, {
              data: response.data,
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
              timing: response.timing,
              timestamp: Date.now(),
              config: response.config,
              raw: response.raw,
            });
          }

          return response;
        },
        // Error handler — don't cache error responses, let error propagate.
        () => {
          return;
        },
      );
    },

    cache,

    invalidate(key?: string) {
      if (key) {
        cache.delete(key);
      }
    },

    invalidatePattern(pattern: RegExp) {
      for (const k of cache.keys()) {
        if (pattern.test(k)) {
          cache.delete(k);
        }
      }
    },

    clear() {
      cache.clear();
    },

    getStats() {
      return { size: cache.size, maxSize, ttl };
    },
  };
}
