/**
 * response.ts coverage gap tests
 */
import { describe, it, expect } from 'vitest';
import { parseResponseBody } from '../../src/core/response';

describe('parseResponseBody — arrayBuffer', () => {
  it('should parse as arrayBuffer', async () => {
    const buf = new Uint8Array([1, 2, 3, 4]).buffer;
    const resp = new Response(buf, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
    const data = await parseResponseBody(resp, { url: '/t', responseType: 'arrayBuffer' });
    expect(data).toBeInstanceOf(ArrayBuffer);
    expect((data as ArrayBuffer).byteLength).toBe(4);
  });

  it('should return undefined when arrayBuffer body consumed', async () => {
    const resp = new Response('test');
    await resp.text();
    expect(await parseResponseBody(resp, { url: '/t', responseType: 'arrayBuffer' })).toBeUndefined();
  });

  it('should return undefined when text body consumed', async () => {
    const resp = new Response('test');
    await resp.text();
    expect(await parseResponseBody(resp, { url: '/t', responseType: 'text' })).toBeUndefined();
  });

  it('should return undefined when blob body consumed', async () => {
    const resp = new Response('test');
    await resp.text();
    expect(await parseResponseBody(resp, { url: '/t', responseType: 'blob' })).toBeUndefined();
  });

  it('should return undefined when json body consumed', async () => {
    const resp = new Response('test');
    await resp.text();
    expect(await parseResponseBody(resp, { url: '/t', responseType: 'json' })).toBeUndefined();
  });
});

describe('parseResponseBody — text/* auto-parse', () => {
  it('should parse text/html', async () => {
    const resp = new Response('<h1>hi</h1>', { status: 200, headers: { 'Content-Type': 'text/html' } });
    expect(await parseResponseBody(resp, { url: '/t' })).toBe('<h1>hi</h1>');
  });

  it('should return undefined when text/* body consumed', async () => {
    const resp = new Response('hi', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    await resp.text();
    expect(await parseResponseBody(resp, { url: '/t' })).toBeUndefined();
  });

  it('should return undefined when json auto-parse body consumed', async () => {
    const resp = new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    await resp.text();
    expect(await parseResponseBody(resp, { url: '/t' })).toBeUndefined();
  });
});

describe('parseResponseBody — autoParse edge cases', () => {
  it('should return undefined for 204', async () => {
    expect(await parseResponseBody(new Response(null, { status: 204 }), { url: '/t' })).toBeUndefined();
  });

  it('should use custom parseResponse', async () => {
    const resp = new Response('raw', { status: 200 });
    const data = await parseResponseBody(resp, { url: '/t', parseResponse: async (r) => `c:${await r.text()}` });
    expect(data).toBe('c:raw');
  });

  it('should return undefined for null body unknown content-type', async () => {
    const resp = new Response(null, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
    expect(await parseResponseBody(resp, { url: '/t' })).toBeUndefined();
  });

  it('should return undefined for empty body unknown content-type', async () => {
    const resp = new Response('', { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
    expect(await parseResponseBody(resp, { url: '/t' })).toBeUndefined();
  });

  it('should parse JSON from unknown content-type', async () => {
    const resp = new Response('{"k":"v"}', { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
    expect(await parseResponseBody(resp, { url: '/t' })).toEqual({ k: 'v' });
  });

  it('should return raw text for non-JSON unknown content-type', async () => {
    const resp = new Response('plain text', { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
    expect(await parseResponseBody(resp, { url: '/t' })).toBe('plain text');
  });
});
