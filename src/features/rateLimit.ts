/**
 * httix — Rate limiting
 */

/**
 * Token-bucket-style rate limiter that limits the number of concurrent
 * requests within a sliding time window per key.
 *
 * When the maximum number of requests for a key is reached, additional
 * requests are queued and drained when the next interval starts.
 */
export class RateLimiter {
  private queues = new Map<string, Array<{ execute: () => Promise<void>; resolve: (v: unknown) => void }>>();
  private activeCounts = new Map<string, number>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private maxRequests: number,
    private interval: number,
  ) {}

  /**
   * Throttle a request function by key.
   *
   * If the number of active requests for the given key is below
   * `maxRequests`, the request executes immediately. Otherwise, it is
   * queued and will execute when the next interval starts.
   */
  async throttle(key: string, requestFn: () => Promise<unknown>): Promise<unknown> {
    // If there's no active window, reset count (timer already fired)
    if (!this.timers.has(key)) {
      this.activeCounts.set(key, 0);
    }

    const count = this.activeCounts.get(key) || 0;

    if (count < this.maxRequests) {
      // Execute immediately
      this.activeCounts.set(key, count + 1);
      if (count === 0) {
        // Start the interval timer on first request of a new window
        this.timers.set(key, setTimeout(() => {
          this.activeCounts.set(key, 0);
          this.timers.delete(key);
          // Drain queue
          this.drainQueue(key);
        }, this.interval));
      }
      return requestFn();
    }

    // Queue the request — it will be resolved when drainQueue executes it
    return new Promise((resolve) => {
      if (!this.queues.has(key)) {
        this.queues.set(key, []);
      }
      this.queues.get(key)!.push({
        execute: async () => {
          const result = await requestFn();
          resolve(result);
        },
        /* v8 ignore next */
        resolve: () => {},
      });
    });
  }

  /**
   * Drain queued requests for a given key, processing up to maxRequests
   * and starting a new interval timer.
   */
  private drainQueue(key: string): void {
    const queue = this.queues.get(key);
    if (!queue || queue.length === 0) return;

    const toProcess = queue.splice(0, this.maxRequests);
    this.activeCounts.set(key, toProcess.length);

    // Restart timer for the next window
    this.timers.set(key, setTimeout(() => {
      this.activeCounts.set(key, 0);
      this.timers.delete(key);
      this.drainQueue(key);
    }, this.interval));

    for (const item of toProcess) {
      item.execute();
    }
  }

  /**
   * Clear all queues, timers, and active counts.
   */
  clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.queues.clear();
    this.activeCounts.clear();
    this.timers.clear();
  }

  /**
   * Get the number of queued (waiting) requests for a given key.
   */
  getQueueSize(key: string): number {
    return this.queues.get(key)?.length || 0;
  }
}
