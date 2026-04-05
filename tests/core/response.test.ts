import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createResponse, parseResponseBody } from '../../src/core/response';
import type { HttixRequestConfig } from '../../src/core/types';

// ---------------------------------------------------------------------------
// createResponse
// ---------------------------------------------------------------------------
describe('createResponse', () => {
  const mockConfig: HttixRequestConfig = { url: 'https://example.com/api', method: 'GET' };

  it('returns an object with all required fields', () => {
    const raw = new Response('{"hello":"world"}', {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = { hello: 'world' };

    const result = createResponse(raw, mockConfig, data, 123);

    expect(result.data).toEqual({ hello: 'world' });
    expect(result.status).toBe(200);
    expect(result.statusText).toBe('OK');
    expect(result.ok).toBe(true);
    expect(result.timing).toBe(123);
    expect(result.config).toBe(mockConfig);
    expect(result.raw).toBe(raw);
    expect(result.headers).toBe(raw.headers);
  });

  it('correctly maps non-2xx responses', () => {
    const raw = new Response('Not Found', { status: 404, statusText: 'Not Found' });
    const result = createResponse(raw, mockConfig, 'Not Found', 50);

    expect(result.status).toBe(404);
    expect(result.statusText).toBe('Not Found');
    expect(result.ok).toBe(false);
  });

  it('passes through the data as-is', () => {
    const raw = new Response('text', { status: 200 });
    const data = [1, 2, 3];
    const result = createResponse(raw, mockConfig, data, 0);

    expect(result.data).toBe(data);
  });

  it('works with null data and 204 status', () => {
    const raw = new Response(null as unknown as string, { status: 204, statusText: 'No Content' });
    const result = createResponse(raw, mockConfig, null, 10);

    expect(result.data).toBeNull();
    expect(result.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// parseResponseBody
// ---------------------------------------------------------------------------
describe('parseResponseBody', () => {
  let mockConfig: HttixRequestConfig;

  beforeEach(() => {
    mockConfig = { url: 'https://example.com/api', method: 'GET' };
  });

  // -- Custom parser takes precedence ---------------------------------------
  describe('custom parseResponse', () => {
    it('uses custom parseResponse when provided', async () => {
      const customData = { parsed: true };
      mockConfig.parseResponse = vi.fn(async () => customData);

      const response = new Response('{"hello":"world"}', {
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await parseResponseBody(response, mockConfig);
      expect(result).toEqual(customData);
      expect(mockConfig.parseResponse).toHaveBeenCalledWith(response);
    });

    it('custom parser takes precedence over 204 handling', async () => {
      const customData = 'custom 204';
      mockConfig.parseResponse = vi.fn(async () => customData);

      const response = new Response(null as unknown as string, { status: 204 });

      const result = await parseResponseBody(response, mockConfig);
      expect(result).toBe('custom 204');
    });
  });

  // -- 204 No Content -------------------------------------------------------
  describe('204 No Content', () => {
    it('returns undefined for 204 status', async () => {
      const response = new Response(null as unknown as string, { status: 204, statusText: 'No Content' });

      const result = await parseResponseBody(response, mockConfig);
      expect(result).toBeUndefined();
    });
  });

  // -- Explicit responseType -----------------------------------------------
  describe('explicit responseType', () => {
    it('parses as json when responseType is "json"', async () => {
      mockConfig.responseType = 'json';
      const response = new Response('{"key":"value"}', {
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await parseResponseBody<{ key: string }>(response, mockConfig);
      expect(result).toEqual({ key: 'value' });
    });

    it('parses as text when responseType is "text"', async () => {
      mockConfig.responseType = 'text';
      const response = new Response('hello world', {
        headers: { 'Content-Type': 'text/plain' },
      });

      const result = await parseResponseBody<string>(response, mockConfig);
      expect(result).toBe('hello world');
    });

    it('parses as blob when responseType is "blob"', async () => {
      mockConfig.responseType = 'blob';
      const response = new Response('binary data', {
        headers: { 'Content-Type': 'application/octet-stream' },
      });

      const result = await parseResponseBody<Blob>(response, mockConfig);
      expect(result).toBeInstanceOf(Blob);
    });

    it('parses as arrayBuffer when responseType is "arrayBuffer"', async () => {
      mockConfig.responseType = 'arrayBuffer';
      const response = new Response('buffer data', {
        headers: { 'Content-Type': 'application/octet-stream' },
      });

      const result = await parseResponseBody<ArrayBuffer>(response, mockConfig);
      expect(result).toBeInstanceOf(ArrayBuffer);
    });

    it('returns undefined when json parse fails with explicit responseType', async () => {
      mockConfig.responseType = 'json';
      const response = new Response('not json', {
        headers: { 'Content-Type': 'text/plain' },
      });

      const result = await parseResponseBody(response, mockConfig);
      expect(result).toBeUndefined();
    });
  });

  // -- Auto-detection -------------------------------------------------------
  describe('auto-detection', () => {
    it('auto-parses application/json as JSON', async () => {
      const response = new Response('{"auto":true}', {
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await parseResponseBody<{ auto: boolean }>(response, mockConfig);
      expect(result).toEqual({ auto: true });
    });

    it('auto-parses application/json; charset=utf-8 as JSON', async () => {
      const response = new Response('{"charset":"utf-8"}', {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });

      const result = await parseResponseBody(response, mockConfig);
      expect(result).toEqual({ charset: 'utf-8' });
    });

    it('auto-parses text/* as text', async () => {
      const response = new Response('plain text content', {
        headers: { 'Content-Type': 'text/plain' },
      });

      const result = await parseResponseBody<string>(response, mockConfig);
      expect(result).toBe('plain text content');
    });

    it('auto-parses text/html as text', async () => {
      const response = new Response('<h1>Hi</h1>', {
        headers: { 'Content-Type': 'text/html' },
      });

      const result = await parseResponseBody<string>(response, mockConfig);
      expect(result).toBe('<h1>Hi</h1>');
    });

    it('auto-parses application/xml as text (includes application/xml)', async () => {
      const response = new Response('<xml/>', {
        headers: { 'Content-Type': 'application/xml' },
      });

      const result = await parseResponseBody<string>(response, mockConfig);
      expect(result).toBe('<xml/>');
    });

    it('best-effort: unknown content-type with valid JSON body returns parsed object', async () => {
      const response = new Response('{"best":"effort"}', {
        headers: { 'Content-Type': 'application/octet-stream' },
      });

      const result = await parseResponseBody(response, mockConfig);
      expect(result).toEqual({ best: 'effort' });
    });

    it('best-effort: unknown content-type with non-JSON body returns raw text', async () => {
      const response = new Response('just some random text', {
        headers: { 'Content-Type': 'application/octet-stream' },
      });

      const result = await parseResponseBody<string>(response, mockConfig);
      expect(result).toBe('just some random text');
    });

    it('best-effort: empty body returns undefined', async () => {
      const response = new Response('', {
        headers: { 'Content-Type': 'application/octet-stream' },
      });

      const result = await parseResponseBody(response, mockConfig);
      expect(result).toBeUndefined();
    });

    it('returns undefined when no Content-Type and no body', async () => {
      const response = new Response(null as unknown as string, { status: 200 });
      // response.body is null for null body
      const result = await parseResponseBody(response, mockConfig);
      expect(result).toBeUndefined();
    });
  });
});
