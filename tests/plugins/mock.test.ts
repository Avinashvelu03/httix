import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockPlugin, MockAdapter } from '../../src/plugins/mock';
import { createHttix } from '../../src/core/client';

const BASE = 'https://api.example.com';

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  // Always restore the real fetch in case a test didn't clean up
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('mockPlugin', () => {
  // =========================================================================
  // Plugin structure
  // =========================================================================
  describe('plugin structure', () => {
    it('should return a plugin with correct name', () => {
      const plugin = mockPlugin();
      expect(plugin.name).toBe('mock');
      expect(typeof plugin.install).toBe('function');
      expect(typeof plugin.cleanup).toBe('function');
      expect(typeof plugin.onGet).toBe('function');
      expect(typeof plugin.onPost).toBe('function');
      expect(typeof plugin.onPut).toBe('function');
      expect(typeof plugin.onPatch).toBe('function');
      expect(typeof plugin.onDelete).toBe('function');
      expect(typeof plugin.getHistory).toBe('function');
      expect(typeof plugin.restore).toBe('function');
      expect(plugin.adapter).toBeInstanceOf(MockAdapter);
    });

    it('should install without errors', () => {
      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const plugin = mockPlugin();
      expect(() => plugin.install(client)).not.toThrow();
      plugin.restore();
    });

    it('should cleanup without errors', () => {
      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const plugin = mockPlugin();
      plugin.install(client);
      expect(() => plugin.cleanup && plugin.cleanup()).not.toThrow();
    });
  });

  // =========================================================================
  // Mock setup with onGet/onPost
  // =========================================================================
  describe('mock setup', () => {
    it('should handle onGet mock', async () => {
      const plugin = mockPlugin();
      plugin.onGet('/users').reply(200, [{ id: 1, name: 'Alice' }]);

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      const response = await client.get('/users');

      expect(response.status).toBe(200);
      expect(response.data).toEqual([{ id: 1, name: 'Alice' }]);
      plugin.restore();
    });

    it('should handle onPost mock', async () => {
      const plugin = mockPlugin();
      plugin.onPost('/users').reply(201, { id: 1, name: 'Bob' });

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      const response = await client.post('/users', { name: 'Bob' });

      expect(response.status).toBe(201);
      expect(response.data).toEqual({ id: 1, name: 'Bob' });
      plugin.restore();
    });

    it('should handle onPut mock', async () => {
      const plugin = mockPlugin();
      plugin.onPut('/users/1').reply(200, { id: 1, name: 'Updated' });

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      const response = await client.put('/users/1', { name: 'Updated' });

      expect(response.status).toBe(200);
      expect(response.data).toEqual({ id: 1, name: 'Updated' });
      plugin.restore();
    });

    it('should handle onPatch mock', async () => {
      const plugin = mockPlugin();
      plugin.onPatch('/users/1').reply(200, { id: 1, name: 'Patched' });

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      const response = await client.patch('/users/1', { name: 'Patched' });

      expect(response.status).toBe(200);
      expect(response.data).toEqual({ id: 1, name: 'Patched' });
      plugin.restore();
    });

    it('should handle onDelete mock', async () => {
      const plugin = mockPlugin();
      plugin.onDelete('/users/1').reply(200, { deleted: true });

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      const response = await client.delete('/users/1');

      expect(response.status).toBe(200);
      expect(response.data).toEqual({ deleted: true });
      plugin.restore();
    });

    it('should return 404 for unmatched routes', async () => {
      const plugin = mockPlugin();
      // No handlers registered

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      try {
        await client.get('/unknown');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeDefined();
      }
      plugin.restore();
    });

    it('should support chaining reply calls', async () => {
      const plugin = mockPlugin();
      plugin
        .onGet('/users')
        .reply(200, [{ id: 1 }])
        .onPost('/users')
        .reply(201, { id: 2 });

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      const r1 = await client.get('/users');
      expect(r1.status).toBe(200);

      const r2 = await client.post('/users', {});
      expect(r2.status).toBe(201);
      plugin.restore();
    });

    it('should support custom reply headers', async () => {
      const plugin = mockPlugin();
      plugin
        .onGet('/custom-headers')
        .reply(200, { ok: true }, { 'X-Custom': 'value' });

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      const response = await client.get('/custom-headers');
      expect(response.headers.get('x-custom')).toBe('value');
      plugin.restore();
    });

    it('should handle error status codes', async () => {
      const plugin = mockPlugin();
      plugin.onGet('/error').reply(500, { error: 'Server Error' });

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      plugin.install(client);

      try {
        await client.get('/error');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeDefined();
      }
      plugin.restore();
    });

    it('should handle 400 status codes', async () => {
      const plugin = mockPlugin();
      plugin.onGet('/bad').reply(400, { error: 'Bad Request' });

      const client = createHttix({ baseURL: BASE, timeout: 0, retry: false });
      plugin.install(client);

      try {
        await client.get('/bad');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeDefined();
      }
      plugin.restore();
    });
  });

  // =========================================================================
  // Pattern matching (string)
  // =========================================================================
  describe('pattern matching', () => {
    it('should match exact URL strings', async () => {
      const plugin = mockPlugin();
      plugin.onGet('/users').reply(200, { matched: 'exact' });

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      const response = await client.get('/users');
      expect(response.data).toEqual({ matched: 'exact' });
      plugin.restore();
    });

    it('should match URL ending with pattern string', async () => {
      const plugin = mockPlugin();
      plugin.onGet('/users').reply(200, { matched: 'suffix' });

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      // The URL will be full: https://api.example.com/users
      const response = await client.get('/users');
      expect(response.data).toEqual({ matched: 'suffix' });
      plugin.restore();
    });

    it('should match URL with RegExp pattern', async () => {
      const plugin = mockPlugin();
      plugin.onGet(/\/users\/\d+/).reply(200, { matched: 'regex' });

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      const response = await client.get('/users/42');
      expect(response.data).toEqual({ matched: 'regex' });
      plugin.restore();
    });

    it('should not match wrong method', async () => {
      const plugin = mockPlugin();
      plugin.onGet('/resource').reply(200, { from: 'get' });
      plugin.onPost('/resource').reply(201, { from: 'post' });

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      const getResponse = await client.get('/resource');
      expect(getResponse.data).toEqual({ from: 'get' });

      const postResponse = await client.post('/resource', {});
      expect(postResponse.data).toEqual({ from: 'post' });
      plugin.restore();
    });
  });

  // =========================================================================
  // Request history tracking
  // =========================================================================
  describe('request history tracking', () => {
    it('should record GET request history', async () => {
      const plugin = mockPlugin();
      plugin.onGet('/users').reply(200, []);

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      await client.get('/users');

      const history = plugin.getHistory();
      expect(history.get.length).toBe(1);
      expect(history.get[0].method).toBe('GET');
      expect(history.get[0].url).toContain('/users');
      plugin.restore();
    });

    it('should record POST request history', async () => {
      const plugin = mockPlugin();
      plugin.onPost('/users').reply(201, {});

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      await client.post('/users', { name: 'Alice' });

      const history = plugin.getHistory();
      expect(history.post.length).toBe(1);
      expect(history.post[0].method).toBe('POST');
      expect(history.post[0].url).toContain('/users');
      plugin.restore();
    });

    it('should record PUT request history', async () => {
      const plugin = mockPlugin();
      plugin.onPut('/users/1').reply(200, {});

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      await client.put('/users/1', { name: 'Updated' });

      const history = plugin.getHistory();
      expect(history.put.length).toBe(1);
      expect(history.put[0].method).toBe('PUT');
      plugin.restore();
    });

    it('should record PATCH request history', async () => {
      const plugin = mockPlugin();
      plugin.onPatch('/users/1').reply(200, {});

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      await client.patch('/users/1', { name: 'Patched' });

      const history = plugin.getHistory();
      expect(history.patch.length).toBe(1);
      expect(history.patch[0].method).toBe('PATCH');
      plugin.restore();
    });

    it('should record DELETE request history', async () => {
      const plugin = mockPlugin();
      plugin.onDelete('/users/1').reply(200, { deleted: true });

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      await client.delete('/users/1');

      const history = plugin.getHistory();
      expect(history.delete.length).toBe(1);
      expect(history.delete[0].method).toBe('DELETE');
      plugin.restore();
    });

    it('should accumulate history across multiple requests', async () => {
      const plugin = mockPlugin();
      plugin.onGet('/a').reply(200, {});
      plugin.onGet('/b').reply(200, {});

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      await client.get('/a');
      await client.get('/b');
      await client.get('/a');

      const history = plugin.getHistory();
      expect(history.get.length).toBe(3);
      expect(history.get[0].url).toContain('/a');
      expect(history.get[1].url).toContain('/b');
      expect(history.get[2].url).toContain('/a');
      plugin.restore();
    });

    it('should record headers in history', async () => {
      const plugin = mockPlugin();
      plugin.onGet('/headers').reply(200, {});

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      await client.get('/headers', { headers: { 'X-Custom': 'value' } });

      const history = plugin.getHistory();
      expect(history.get[0].headers).toBeDefined();
      expect((history.get[0].headers as Record<string, string>)['x-custom']).toBe('value');
      plugin.restore();
    });

    it('should store config in history entry', async () => {
      const plugin = mockPlugin();
      plugin.onGet('/config').reply(200, {});

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      await client.get('/config');

      const history = plugin.getHistory();
      expect(history.get[0].config).toBeDefined();
      expect(history.get[0].config.method).toBe('GET');
      plugin.restore();
    });
  });

  // =========================================================================
  // Restore behavior
  // =========================================================================
  describe('restore behavior', () => {
    it('should restore original fetch after restore', () => {
      const plugin = mockPlugin();
      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      // After install, globalThis.fetch should be the mock
      expect(globalThis.fetch).not.toBe(originalFetch);

      plugin.restore();

      // After restore, globalThis.fetch should be the original
      expect(globalThis.fetch).toBe(originalFetch);
    });

    it('should clear handlers on restore', async () => {
      const plugin = mockPlugin();
      plugin.onGet('/test').reply(200, {});

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      await client.get('/test');
      expect(plugin.getHistory().get.length).toBe(1);

      plugin.restore();

      // After restore, the plugin's adapter should be reset
      const history = plugin.getHistory();
      expect(history.get.length).toBe(0);
    });

    it('cleanup should also restore fetch', () => {
      const plugin = mockPlugin();
      const client = createHttix({ baseURL: BASE, timeout: 0 });
      plugin.install(client);

      expect(globalThis.fetch).not.toBe(originalFetch);

      if (plugin.cleanup) {
        plugin.cleanup();
      }

      expect(globalThis.fetch).toBe(originalFetch);
    });
  });

  // =========================================================================
  // MockAdapter directly
  // =========================================================================
  describe('MockAdapter', () => {
    it('should support activate/deactivate cycle', () => {
      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const adapter = new MockAdapter();

      adapter.activate(client);
      expect(globalThis.fetch).not.toBe(originalFetch);

      adapter.deactivate();
      expect(globalThis.fetch).toBe(originalFetch);
    });

    it('should support reset', async () => {
      const adapter = new MockAdapter();
      const client = createHttix({ baseURL: BASE, timeout: 0 });

      adapter.activate(client);
      adapter.onGet('/test').reply(200, {});

      await globalThis.fetch(new Request('https://api.example.com/test'));

      expect(adapter.getHistory().get.length).toBe(1);

      adapter.reset();
      expect(adapter.getHistory().get.length).toBe(0);

      adapter.deactivate();
    });

    it('should handle multiple activate calls gracefully', () => {
      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const adapter = new MockAdapter();

      adapter.activate(client);
      const fetchAfterFirst = globalThis.fetch;

      adapter.activate(client);
      const fetchAfterSecond = globalThis.fetch;

      expect(fetchAfterFirst).toBe(fetchAfterSecond);
      adapter.deactivate();
    });

    it('should handle multiple deactivate calls gracefully', () => {
      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const adapter = new MockAdapter();

      adapter.activate(client);
      adapter.deactivate();
      adapter.deactivate(); // Should not throw

      expect(globalThis.fetch).toBe(originalFetch);
    });
  });
});
