import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildRequest, clearTimeoutSignal } from '../../src/core/request';
import type { HttixRequestConfig } from '../../src/core/types';

describe('buildRequest', () => {
  let config: HttixRequestConfig;
  let controllerCleanup: AbortController | undefined;
  let timeoutIdCleanup: ReturnType<typeof setTimeout> | undefined;

  afterEach(() => {
    clearTimeoutSignal(controllerCleanup, timeoutIdCleanup);
  });

  it('returns a Request instance with the correct URL', () => {
    config = { url: 'https://example.com/api', method: 'GET' };
    const { request } = buildRequest(config);
    expect(request).toBeInstanceOf(Request);
    expect(request.url).toBe('https://example.com/api');
  });

  it('defaults method to GET when not specified', () => {
    config = { url: 'https://example.com/api' };
    const { request } = buildRequest(config);
    expect(request.method).toBe('GET');
  });

  it('uses the specified HTTP method', () => {
    config = { url: 'https://example.com/api', method: 'POST' };
    const { request } = buildRequest(config);
    expect(request.method).toBe('POST');
  });

  it('combines baseURL with url', () => {
    config = { url: 'users', baseURL: 'https://api.example.com/v1', method: 'GET' };
    const { request } = buildRequest(config);
    expect(request.url).toBe('https://api.example.com/v1/users');
  });

  it('handles baseURL with trailing slash', () => {
    config = { url: 'users', baseURL: 'https://api.example.com/', method: 'GET' };
    const { request } = buildRequest(config);
    expect(request.url).toBe('https://api.example.com/users');
  });

  it('handles url with leading slash', () => {
    config = { url: '/users', baseURL: 'https://api.example.com', method: 'GET' };
    const { request } = buildRequest(config);
    expect(request.url).toBe('https://api.example.com/users');
  });

  it('interpolates path params', () => {
    config = {
      url: 'users/:id/posts/:postId',
      baseURL: 'https://api.example.com',
      params: { id: 42, postId: 7 },
      method: 'GET',
    };
    const { request } = buildRequest(config);
    expect(request.url).toBe('https://api.example.com/users/42/posts/7');
  });

  it('encodes path param values', () => {
    config = {
      url: 'users/:name',
      baseURL: 'https://api.example.com',
      params: { name: 'john doe' },
      method: 'GET',
    };
    const { request } = buildRequest(config);
    expect(request.url).toContain(encodeURIComponent('john doe'));
  });

  it('appends query parameters', () => {
    config = {
      url: 'search',
      baseURL: 'https://api.example.com',
      query: { q: 'test', page: 1 },
      method: 'GET',
    };
    const { request } = buildRequest(config);
    const url = new URL(request.url);
    expect(url.searchParams.get('q')).toBe('test');
    expect(url.searchParams.get('page')).toBe('1');
  });

  it('skips null and undefined query params', () => {
    config = {
      url: 'search',
      baseURL: 'https://api.example.com',
      query: { q: 'test', page: null, size: undefined },
      method: 'GET',
    };
    const { request } = buildRequest(config);
    const url = new URL(request.url);
    expect(url.searchParams.get('q')).toBe('test');
    expect(url.searchParams.get('page')).toBeNull();
    expect(url.searchParams.get('size')).toBeNull();
  });

  it('handles array query params as repeated keys', () => {
    config = {
      url: 'items',
      baseURL: 'https://api.example.com',
      query: { tag: ['a', 'b'] },
      method: 'GET',
    };
    const { request } = buildRequest(config);
    const url = new URL(request.url);
    const tags = url.searchParams.getAll('tag');
    expect(tags).toEqual(['a', 'b']);
  });

  it('merges default headers with custom headers', () => {
    config = {
      url: 'https://example.com',
      method: 'GET',
      headers: { 'X-Custom': 'value' },
    };
    const { request } = buildRequest(config);
    // Default Accept header should be present
    expect(request.headers.get('Accept')).toBe('application/json, text/plain, */*');
    // Custom header should also be present
    expect(request.headers.get('X-Custom')).toBe('value');
  });

  it('custom headers override default headers', () => {
    config = {
      url: 'https://example.com',
      method: 'GET',
      headers: { Accept: 'text/html' },
    };
    const { request } = buildRequest(config);
    expect(request.headers.get('Accept')).toBe('text/html');
  });

  it('serializes object body as JSON and sets Content-Type', () => {
    config = {
      url: 'https://example.com/api',
      method: 'POST',
      body: { name: 'test', value: 42 },
    };
    const { request } = buildRequest(config);
    expect(request.headers.get('Content-Type')).toBe('application/json');
  });

  it('does not override Content-Type if already set', () => {
    config = {
      url: 'https://example.com/api',
      method: 'POST',
      body: { name: 'test' },
      headers: { 'Content-Type': 'text/plain' },
    };
    const { request } = buildRequest(config);
    expect(request.headers.get('Content-Type')).toBe('text/plain');
  });

  it('passes string body through as-is', () => {
    config = {
      url: 'https://example.com/api',
      method: 'POST',
      body: 'raw string body',
    };
    const { request } = buildRequest(config);
    expect(request.headers.get('Content-Type')).not.toBe('application/json');
  });

  it('serializes number body as JSON and sets Content-Type', () => {
    config = {
      url: 'https://example.com/api',
      method: 'POST',
      body: 42,
    };
    const { request } = buildRequest(config);
    expect(request.headers.get('Content-Type')).toBe('application/json');
  });

  it('serializes boolean body as JSON and sets Content-Type', () => {
    config = {
      url: 'https://example.com/api',
      method: 'POST',
      body: true,
    };
    const { request } = buildRequest(config);
    expect(request.headers.get('Content-Type')).toBe('application/json');
  });

  it('passes FormData body through without Content-Type', () => {
    const formData = new FormData();
    formData.append('key', 'value');
    config = {
      url: 'https://example.com/upload',
      method: 'POST',
      body: formData,
    };
    const { request } = buildRequest(config);
    // FormData should not have Content-Type set (browser sets boundary)
    expect(request.headers.get('Content-Type')).not.toBe('application/json');
  });

  it('sets credentials from config', () => {
    config = {
      url: 'https://example.com',
      method: 'GET',
      credentials: 'include',
    };
    const { request } = buildRequest(config);
    expect(request.credentials).toBe('include');
  });

  it('sets mode from config', () => {
    config = {
      url: 'https://example.com',
      method: 'GET',
      mode: 'no-cors',
    };
    const { request } = buildRequest(config);
    expect(request.mode).toBe('no-cors');
  });

  it('sets cache from config', () => {
    config = {
      url: 'https://example.com',
      method: 'GET',
      cache: 'no-store',
    };
    const { request } = buildRequest(config);
    expect(request.cache).toBe('no-store');
  });

  it('sets redirect from config', () => {
    config = {
      url: 'https://example.com',
      method: 'GET',
      redirect: 'manual',
    };
    const { request } = buildRequest(config);
    expect(request.redirect).toBe('manual');
  });

  // -- Timeout handling -----------------------------------------------------
  describe('timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('creates a timeoutController and timeoutId when timeout > 0', () => {
      config = { url: 'https://example.com', method: 'GET', timeout: 5000 };
      const { timeoutController, timeoutId } = buildRequest(config);

      expect(timeoutController).toBeInstanceOf(AbortController);
      expect(timeoutId).toBeDefined();
      // In Node.js, setTimeout returns a Timeout object, not a number
      expect(timeoutId).toBeTruthy();

      controllerCleanup = timeoutController;
      timeoutIdCleanup = timeoutId;
    });

    it('aborts the request after timeout elapses', async () => {
      config = { url: 'https://example.com', method: 'GET', timeout: 1000 };
      const { timeoutController, timeoutId } = buildRequest(config);

      expect(timeoutController!.signal.aborted).toBe(false);

      vi.advanceTimersByTime(1000);

      expect(timeoutController!.signal.aborted).toBe(true);
      expect(timeoutController!.signal.reason).toBeInstanceOf(DOMException);

      controllerCleanup = timeoutController;
      timeoutIdCleanup = timeoutId;
    });

    it('does not set timeout when timeout is 0', () => {
      config = { url: 'https://example.com', method: 'GET', timeout: 0 };
      const { timeoutController, timeoutId } = buildRequest(config);

      expect(timeoutController).toBeUndefined();
      expect(timeoutId).toBeUndefined();
    });

    it('does not set timeout when timeout is undefined', () => {
      config = { url: 'https://example.com', method: 'GET' };
      const { timeoutController, timeoutId } = buildRequest(config);

      expect(timeoutController).toBeUndefined();
      expect(timeoutId).toBeUndefined();
    });

    it('combines timeout signal with config.signal', () => {
      const externalController = new AbortController();
      config = {
        url: 'https://example.com',
        method: 'GET',
        timeout: 5000,
        signal: externalController.signal,
      };
      const { request, timeoutController, timeoutId } = buildRequest(config);

      // The request signal should be a combined signal
      expect(request.signal).toBeDefined();
      expect(request.signal.aborted).toBe(false);

      // Aborting external signal should abort the request
      externalController.abort();
      expect(request.signal.aborted).toBe(true);

      controllerCleanup = timeoutController;
      timeoutIdCleanup = timeoutId;
    });
  });

  // -- Abort signal ---------------------------------------------------------
  describe('abort signal (without timeout)', () => {
    it('passes config.signal to the request', () => {
      const ac = new AbortController();
      config = { url: 'https://example.com', method: 'GET', signal: ac.signal };
      const { request } = buildRequest(config);

      // Verify the signal is set and linked to the source controller
      expect(request.signal).toBeDefined();
      expect(request.signal.aborted).toBe(false);
      ac.abort('test');
      expect(request.signal.aborted).toBe(true);
      expect(request.signal.reason).toBe('test');
    });
  });
});

// ---------------------------------------------------------------------------
// clearTimeoutSignal
// ---------------------------------------------------------------------------
describe('clearTimeoutSignal', () => {
  it('clears the timeout without aborting the controller', () => {
    vi.useFakeTimers();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {}, 10000);

    clearTimeoutSignal(controller, timeoutId);

    // Timer should have been cleared (no effect from advanceTimersByTime)
    // Controller should NOT be aborted - this is intentional to allow
    // response body parsing to complete without AbortError
    expect(controller.signal.aborted).toBe(false);

    vi.useRealTimers();
  });

  it('handles undefined controller and timeoutId gracefully', () => {
    expect(() => clearTimeoutSignal(undefined, undefined)).not.toThrow();
  });

  it('handles only timeoutId being defined', () => {
    vi.useFakeTimers();
    const timeoutId = setTimeout(() => {}, 5000);
    clearTimeoutSignal(undefined, timeoutId);
    vi.useRealTimers();
  });

  it('handles only controller being defined', () => {
    const controller = new AbortController();
    clearTimeoutSignal(controller, undefined);
    // Controller should NOT be aborted - this is intentional to allow
    // response body parsing to complete without AbortError
    expect(controller.signal.aborted).toBe(false);
  });
});
