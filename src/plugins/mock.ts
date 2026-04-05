/**
 * httix — Mock plugin
 *
 * Replaces the global fetch with an in-memory mock adapter so tests can
 * define request handlers and verify request history without hitting real
 * endpoints.
 */

import type {
  HttixClient,
  HttixPlugin,
  HttixRequestConfig,
} from '../core/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MockHandler {
  method: string;
  urlPattern: string | RegExp;
  handler: (
    config: HttixRequestConfig,
  ) => { status: number; data: unknown; headers?: Record<string, string> };
}

export interface MockHistoryEntry {
  method: string;
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
  config: HttixRequestConfig;
}

// ---------------------------------------------------------------------------
// MockAdapter
// ---------------------------------------------------------------------------

export class MockAdapter {
  private handlers: MockHandler[] = [];
  private history: Record<string, MockHistoryEntry[]> = {
    get: [],
    post: [],
    put: [],
    patch: [],
    delete: [],
    head: [],
    options: [],
  };
  private originalFetch: typeof globalThis.fetch | null = null;
  private isActive = false;

  /** Activate the mock — replace global fetch. */
  activate(_client: HttixClient): void {
    if (this.isActive) return;
    this.isActive = true;
    this.originalFetch = globalThis.fetch;
    globalThis.fetch = this.mockFetch.bind(this) as typeof globalThis.fetch;
  }

  /** Deactivate — restore the original fetch. */
  deactivate(): void {
    if (!this.isActive) return;
    this.isActive = false;
    if (this.originalFetch) {
      globalThis.fetch = this.originalFetch;
      this.originalFetch = null;
    }
  }

  /** Internal mock fetch implementation. */
  private mockFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    const isRequestObject = input instanceof Request;
    const method = (
      init?.method
        ?? (isRequestObject ? (input as Request).method : 'GET')
    ).toUpperCase();

    // Record in history
    const historyEntry: MockHistoryEntry = {
      method,
      url,
      body: init?.body
        ? JSON.parse(String(init.body))
        : isRequestObject
          ? undefined
          : undefined,
      headers: init?.headers
        ? init.headers instanceof Headers
          ? Object.fromEntries(init.headers.entries())
          : (init.headers as Record<string, string>)
        : isRequestObject
          ? Object.fromEntries((input as Request).headers.entries())
          : undefined,
      config: { url, method: method as HttixRequestConfig['method'] },
    };
    const methodLower = method.toLowerCase();
    const historyEntries = this.history[methodLower];
    if (historyEntries) {
      historyEntries.push(historyEntry);
    }

    // Find matching handler
    for (const handler of this.handlers) {
      if (handler.method !== method) continue;

      const matched =
        typeof handler.urlPattern === 'string'
          ? url === handler.urlPattern || url.endsWith(handler.urlPattern)
          : handler.urlPattern.test(url);

      if (matched) {
        const result = handler.handler(historyEntry.config);
        return Promise.resolve(
          new Response(JSON.stringify(result.data), {
            status: result.status,
            headers: { 'Content-Type': 'application/json', ...result.headers },
          }),
        );
      }
    }

    // No match found — return 404
    return Promise.resolve(
      new Response(JSON.stringify({ error: 'No mock handler found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  // -- Fluent API for registering handlers ----------------------------------

  onGet(
    url: string | RegExp,
  ): { reply: (status: number, data: unknown, headers?: Record<string, string>) => MockAdapter } {
    return this.on('GET', url);
  }

  onPost(
    url: string | RegExp,
  ): { reply: (status: number, data: unknown, headers?: Record<string, string>) => MockAdapter } {
    return this.on('POST', url);
  }

  onPut(
    url: string | RegExp,
  ): { reply: (status: number, data: unknown, headers?: Record<string, string>) => MockAdapter } {
    return this.on('PUT', url);
  }

  onPatch(
    url: string | RegExp,
  ): { reply: (status: number, data: unknown, headers?: Record<string, string>) => MockAdapter } {
    return this.on('PATCH', url);
  }

  onDelete(
    url: string | RegExp,
  ): { reply: (status: number, data: unknown, headers?: Record<string, string>) => MockAdapter } {
    return this.on('DELETE', url);
  }

  private on(
    method: string,
    url: string | RegExp,
  ): { reply: (status: number, data: unknown, headers?: Record<string, string>) => MockAdapter } {
    return {
      reply: (
        status: number,
        data: unknown,
        headers?: Record<string, string>,
      ) => {
        this.handlers.push({
          method,
          urlPattern: url,
          handler: () => ({ status, data, headers }),
        });
        return this;
      },
    };
  }

  /** Access recorded request history. */
  getHistory(): Record<string, MockHistoryEntry[]> {
    return this.history;
  }

  /** Clear all handlers and history (adapter stays active). */
  reset(): void {
    this.handlers = [];
    this.history = {
      get: [],
      post: [],
      put: [],
      patch: [],
      delete: [],
      head: [],
      options: [],
    };
  }

  /** Fully deactivate and reset. */
  restore(): void {
    this.deactivate();
    this.reset();
  }
}

// ---------------------------------------------------------------------------
// mockPlugin factory
// ---------------------------------------------------------------------------

export function mockPlugin(): HttixPlugin & {
  adapter: MockAdapter;
  onGet: MockAdapter['onGet'];
  onPost: MockAdapter['onPost'];
  onPut: MockAdapter['onPut'];
  onPatch: MockAdapter['onPatch'];
  onDelete: MockAdapter['onDelete'];
  getHistory: () => Record<string, MockHistoryEntry[]>;
  restore: () => void;
} {
  const adapter = new MockAdapter();

  return {
    name: 'mock',

    install(client: HttixClient) {
      adapter.activate(client);
    },

    cleanup() {
      adapter.restore();
    },

    adapter,

    onGet: adapter.onGet.bind(adapter),
    onPost: adapter.onPost.bind(adapter),
    onPut: adapter.onPut.bind(adapter),
    onPatch: adapter.onPatch.bind(adapter),
    onDelete: adapter.onDelete.bind(adapter),

    getHistory() {
      return adapter.getHistory();
    },

    restore() {
      adapter.restore();
    },
  };
}
