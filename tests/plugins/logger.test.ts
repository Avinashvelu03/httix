import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loggerPlugin } from '../../src/plugins/logger';
import { createHttix } from '../../src/core/client';

const BASE = 'https://api.example.com';

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('loggerPlugin', () => {
  // =========================================================================
  // Plugin structure
  // =========================================================================
  describe('plugin structure', () => {
    it('should return a plugin with correct name', () => {
      const plugin = loggerPlugin();
      expect(plugin.name).toBe('logger');
      expect(typeof plugin.install).toBe('function');
      expect(typeof plugin.cleanup).toBe('function');
    });

    it('should install without errors', () => {
      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin();
      expect(() => plugin.install(client)).not.toThrow();
    });

    it('should cleanup without errors', () => {
      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin();
      plugin.install(client);
      expect(() => plugin.cleanup && plugin.cleanup()).not.toThrow();
    });
  });

  // =========================================================================
  // Request logging
  // =========================================================================
  describe('request logging', () => {
    it('should log outgoing requests at info level', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin({ logger: mockLogger });
      plugin.install(client);

      await client.get('/users');

      expect(mockLogger.info).toHaveBeenCalledTimes(2); // request + response
      expect(mockLogger.info).toHaveBeenNthCalledWith(
        1,
        '[httix] Request:',
        expect.objectContaining({
          method: 'GET',
          url: '/users',
        }),
      );
    });

    it('should log request method and url', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin({ logger: mockLogger });
      plugin.install(client);

      await client.post('/items', { name: 'Test' });

      const requestLog = mockLogger.info.mock.calls[0][1];
      expect(requestLog.method).toBe('POST');
      expect(requestLog.url).toBe('/items');
    });

    it('should log request id', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin({ logger: mockLogger });
      plugin.install(client);

      await client.get('/data');

      const requestLog = mockLogger.info.mock.calls[0][1];
      expect(requestLog.requestId).toBeDefined();
      expect(typeof requestLog.requestId).toBe('string');
    });
  });

  // =========================================================================
  // Response logging
  // =========================================================================
  describe('response logging', () => {
    it('should log incoming responses at info level', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ data: 'test' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin({ logger: mockLogger });
      plugin.install(client);

      await client.get('/data');

      expect(mockLogger.info).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenNthCalledWith(
        2,
        '[httix] Response:',
        expect.objectContaining({
          status: 200,
        }),
      );
    });

    it('should log response status and timing', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 201,
          statusText: 'Created',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin({ logger: mockLogger });
      plugin.install(client);

      await client.post('/users', { name: 'X' });

      const responseLog = mockLogger.info.mock.calls[1][1];
      expect(responseLog.status).toBe(201);
      expect(responseLog.statusText).toBe('Created');
      expect(typeof responseLog.timing).toBe('number');
    });

    it('should log response request id', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin({ logger: mockLogger });
      plugin.install(client);

      await client.get('/data');

      const responseLog = mockLogger.info.mock.calls[1][1];
      expect(responseLog.requestId).toBeDefined();
    });
  });

  // =========================================================================
  // Error logging
  // =========================================================================
  describe('error logging', () => {
    it('should log errors at error level', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ error: 'Not Found' }), {
          status: 404,
          statusText: 'Not Found',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin({ logger: mockLogger });
      plugin.install(client);

      try {
        await client.get('/notfound');
      } catch {
        // Expected
      }

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[httix] Error:',
        expect.objectContaining({
          message: expect.stringContaining('404'),
        }),
      );
    });

    it('should log error name', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ error: 'Server Error' }), {
          status: 500,
          statusText: 'Internal Server Error',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE, retry: false });
      const plugin = loggerPlugin({ logger: mockLogger });
      plugin.install(client);

      try {
        await client.get('/error');
      } catch {
        // Expected
      }

      expect(mockLogger.error).toHaveBeenCalled();
      const errorLog = mockLogger.error.mock.calls[0][1];
      expect(errorLog.name).toBe('HttixResponseError');
    });

    it('should log request id in error', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ error: 'Not Found' }), {
          status: 404,
          statusText: 'Not Found',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin({ logger: mockLogger });
      plugin.install(client);

      try {
        await client.get('/notfound');
      } catch {
        // Expected
      }

      const errorLog = mockLogger.error.mock.calls[0][1];
      expect(errorLog.requestId).toBeDefined();
    });
  });

  // =========================================================================
  // Log levels
  // =========================================================================
  describe('log levels', () => {
    it('should not log at info level when level is warn', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin({ level: 'warn', logger: mockLogger });
      plugin.install(client);

      await client.get('/data');

      // info should not be called (level is warn), but errors should still log
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should not log when level is none', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ error: 'err' }), {
          status: 500,
          statusText: 'Internal Server Error',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin({ level: 'none', logger: mockLogger });
      plugin.install(client);

      try {
        await client.get('/error');
      } catch {
        // Expected
      }

      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should log at debug level when level is debug', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin({ level: 'debug', logger: mockLogger });
      plugin.install(client);

      await client.get('/data');

      // info is >= debug, so it should log
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should still log errors at error level when level is warn', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ error: 'err' }), {
          status: 500,
          statusText: 'Internal Server Error',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE, retry: false });
      const plugin = loggerPlugin({ level: 'warn', logger: mockLogger });
      plugin.install(client);

      try {
        await client.get('/error');
      } catch {
        // Expected
      }

      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });

    it('should default to info level', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin({ logger: mockLogger });
      plugin.install(client);

      await client.get('/data');

      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Custom logger
  // =========================================================================
  describe('custom logger', () => {
    it('should use the provided custom logger', async () => {
      const customLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin({ logger: customLogger });
      plugin.install(client);

      await client.get('/data');

      expect(customLogger.info).toHaveBeenCalled();
    });

    it('should use console by default', async () => {
      const consoleSpy = {
        debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
        info: vi.spyOn(console, 'info').mockImplementation(() => {}),
        warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
        error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin();
      plugin.install(client);

      await client.get('/data');

      expect(consoleSpy.info).toHaveBeenCalled();

      consoleSpy.debug.mockRestore();
      consoleSpy.info.mockRestore();
      consoleSpy.warn.mockRestore();
      consoleSpy.error.mockRestore();
    });
  });

  // =========================================================================
  // Body & header logging
  // =========================================================================
  describe('body and header logging', () => {
    it('should log request body when logRequestBody is true', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin({
        logger: mockLogger,
        logRequestBody: true,
      });
      plugin.install(client);

      await client.post('/users', { name: 'Alice' });

      const requestLog = mockLogger.info.mock.calls[0][1];
      expect(requestLog.body).toEqual({ name: 'Alice' });
    });

    it('should not log request body by default', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin({ logger: mockLogger });
      plugin.install(client);

      await client.post('/users', { name: 'Alice' });

      const requestLog = mockLogger.info.mock.calls[0][1];
      expect(requestLog.body).toBeUndefined();
    });

    it('should log response body when logResponseBody is true', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ result: 'data' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin({
        logger: mockLogger,
        logResponseBody: true,
      });
      plugin.install(client);

      await client.get('/data');

      const responseLog = mockLogger.info.mock.calls[1][1];
      expect(responseLog.data).toEqual({ result: 'data' });
    });

    it('should not log response body by default', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ result: 'data' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin({ logger: mockLogger });
      plugin.install(client);

      await client.get('/data');

      const responseLog = mockLogger.info.mock.calls[1][1];
      expect(responseLog.data).toBeUndefined();
    });

    it('should log request headers when logRequestHeaders is true', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin({
        logger: mockLogger,
        logRequestHeaders: true,
      });
      plugin.install(client);

      await client.get('/data', { headers: { 'X-Custom': 'val' } });

      const requestLog = mockLogger.info.mock.calls[0][1];
      expect(requestLog.headers).toBeDefined();
    });

    it('should log response headers when logResponseHeaders is true', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Response-Header': 'val',
          },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin({
        logger: mockLogger,
        logResponseHeaders: true,
      });
      plugin.install(client);

      await client.get('/data');

      const responseLog = mockLogger.info.mock.calls[1][1];
      expect(responseLog.headers).toBeDefined();
    });

    it('should not log request headers by default', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const plugin = loggerPlugin({ logger: mockLogger });
      plugin.install(client);

      await client.get('/data');

      const requestLog = mockLogger.info.mock.calls[0][1];
      expect(requestLog.headers).toBeUndefined();
    });
  });
});
