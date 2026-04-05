import { describe, it, expect } from 'vitest';
import {
  mergeHeaders,
  normalizeHeaderName,
  getContentType,
  isJSONContentType,
  isTextContentType,
  parseHeaders,
} from '../../src/utils/headers';

// ---------------------------------------------------------------------------
// mergeHeaders
// ---------------------------------------------------------------------------
describe('mergeHeaders', () => {
  it('returns empty Headers when both arguments are undefined', () => {
    const result = mergeHeaders(undefined, undefined);
    expect(result).toBeInstanceOf(Headers);
    expect([...result.keys()]).toHaveLength(0);
  });

  it('applies only defaults when custom is undefined', () => {
    const defaults = { Accept: 'application/json' };
    const result = mergeHeaders(defaults, undefined);
    expect(result.get('Accept')).toBe('application/json');
  });

  it('applies only custom when defaults is undefined', () => {
    const custom = { 'X-Custom': 'value' };
    const result = mergeHeaders(undefined, custom);
    expect(result.get('X-Custom')).toBe('value');
  });

  it('merges defaults and custom (custom wins on conflict)', () => {
    const defaults = { Accept: 'text/html', 'X-Default': 'yes' };
    const custom = { Accept: 'application/json', 'X-Custom': 'no' };
    const result = mergeHeaders(defaults, custom);

    expect(result.get('Accept')).toBe('application/json');
    expect(result.get('X-Default')).toBe('yes');
    expect(result.get('X-Custom')).toBe('no');
  });

  it('works with Headers instances as defaults', () => {
    const defaults = new Headers({ Accept: 'text/html' });
    const custom = { 'X-Custom': 'value' };
    const result = mergeHeaders(defaults, custom);

    expect(result.get('Accept')).toBe('text/html');
    expect(result.get('X-Custom')).toBe('value');
  });

  it('works with Headers instances as custom', () => {
    const defaults = { Accept: 'text/html' };
    const custom = new Headers({ Accept: 'application/json' });
    const result = mergeHeaders(defaults, custom);

    expect(result.get('Accept')).toBe('application/json');
  });

  it('works with both as Headers instances', () => {
    const defaults = new Headers({ Accept: 'text/html', 'X-A': 'a' });
    const custom = new Headers({ Accept: 'application/json' });
    const result = mergeHeaders(defaults, custom);

    expect(result.get('Accept')).toBe('application/json');
    expect(result.get('X-A')).toBe('a');
  });

  it('does not mutate the input objects', () => {
    const defaults = { Accept: 'text/html' };
    const custom = { 'X-Custom': 'value' };
    mergeHeaders(defaults, custom);

    // Object references should remain unchanged
    expect(Object.keys(defaults)).toHaveLength(1);
    expect(Object.keys(custom)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// normalizeHeaderName
// ---------------------------------------------------------------------------
describe('normalizeHeaderName', () => {
  it('capitalizes content-type to Content-Type', () => {
    expect(normalizeHeaderName('content-type')).toBe('Content-Type');
  });

  it('capitalizes accept-encoding to Accept-Encoding', () => {
    expect(normalizeHeaderName('accept-encoding')).toBe('Accept-Encoding');
  });

  it('handles already capitalized header names', () => {
    expect(normalizeHeaderName('Content-Type')).toBe('Content-Type');
  });

  it('handles single-word headers', () => {
    expect(normalizeHeaderName('host')).toBe('Host');
  });

  it('handles empty string', () => {
    expect(normalizeHeaderName('')).toBe('');
  });

  it('lowercases subsequent characters after the first', () => {
    expect(normalizeHeaderName('CONTENT-TYPE')).toBe('Content-Type');
  });

  it('handles multi-segment headers', () => {
    expect(normalizeHeaderName('x-forwarded-for')).toBe('X-Forwarded-For');
  });
});

// ---------------------------------------------------------------------------
// getContentType
// ---------------------------------------------------------------------------
describe('getContentType', () => {
  it('returns the content-type value in lowercase', () => {
    const headers = new Headers({ 'Content-Type': 'Application/JSON' });
    expect(getContentType(headers)).toBe('application/json');
  });

  it('returns null when content-type is not present', () => {
    const headers = new Headers({});
    expect(getContentType(headers)).toBeNull();
  });

  it('handles content-type with parameters', () => {
    const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8' });
    expect(getContentType(headers)).toBe('text/html; charset=utf-8');
  });
});

// ---------------------------------------------------------------------------
// isJSONContentType
// ---------------------------------------------------------------------------
describe('isJSONContentType', () => {
  it('returns true for application/json', () => {
    expect(isJSONContentType('application/json')).toBe(true);
  });

  it('returns true for application/json with charset', () => {
    expect(isJSONContentType('application/json; charset=utf-8')).toBe(true);
  });

  it('returns false for text/plain', () => {
    expect(isJSONContentType('text/plain')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isJSONContentType(null)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isJSONContentType('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isTextContentType
// ---------------------------------------------------------------------------
describe('isTextContentType', () => {
  it('returns true for text/plain', () => {
    expect(isTextContentType('text/plain')).toBe(true);
  });

  it('returns true for text/html', () => {
    expect(isTextContentType('text/html')).toBe(true);
  });

  it('returns true for application/xml', () => {
    expect(isTextContentType('application/xml')).toBe(true);
  });

  it('returns false for application/json', () => {
    expect(isTextContentType('application/json')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isTextContentType(null)).toBe(false);
  });

  it('returns false for application/octet-stream', () => {
    expect(isTextContentType('application/octet-stream')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseHeaders
// ---------------------------------------------------------------------------
describe('parseHeaders', () => {
  it('creates Headers from a plain object', () => {
    const result = parseHeaders({ Accept: 'application/json', 'X-Custom': 'value' });
    expect(result).toBeInstanceOf(Headers);
    expect(result.get('Accept')).toBe('application/json');
    expect(result.get('X-Custom')).toBe('value');
  });

  it('creates Headers from a Headers instance (copy)', () => {
    const original = new Headers({ Accept: 'text/html' });
    const result = parseHeaders(original);
    expect(result).toBeInstanceOf(Headers);
    expect(result.get('Accept')).toBe('text/html');
    // Should be a new instance
    expect(result).not.toBe(original);
  });

  it('creates empty Headers from empty object', () => {
    const result = parseHeaders({});
    expect(result).toBeInstanceOf(Headers);
    expect([...result.keys()]).toHaveLength(0);
  });
});
