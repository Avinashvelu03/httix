import { describe, it, expect } from 'vitest';
import { isAbsoluteURL, combineURLs, buildUrl } from '../../src/utils/url';
import type { HttixRequestConfig } from '../../src/core/types';

// ---------------------------------------------------------------------------
// isAbsoluteURL
// ---------------------------------------------------------------------------
describe('isAbsoluteURL', () => {
  it('returns true for https:// URL', () => {
    expect(isAbsoluteURL('https://example.com')).toBe(true);
  });

  it('returns true for http:// URL', () => {
    expect(isAbsoluteURL('http://example.com')).toBe(true);
  });

  it('returns true for // protocol-relative URL', () => {
    expect(isAbsoluteURL('//example.com/path')).toBe(true);
  });

  it('returns true for ftp:// URL', () => {
    expect(isAbsoluteURL('ftp://files.example.com')).toBe(true);
  });

  it('returns false for relative path', () => {
    expect(isAbsoluteURL('/api/users')).toBe(false);
  });

  it('returns false for bare path without slash', () => {
    expect(isAbsoluteURL('api/users')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isAbsoluteURL('')).toBe(false);
  });

  it('is case-insensitive for the scheme', () => {
    expect(isAbsoluteURL('HTTPS://example.com')).toBe(true);
    expect(isAbsoluteURL('HTTP://example.com')).toBe(true);
  });

  it('returns true for custom scheme like ws://', () => {
    expect(isAbsoluteURL('ws://example.com')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// combineURLs
// ---------------------------------------------------------------------------
describe('combineURLs', () => {
  it('combines base and relative URL', () => {
    expect(combineURLs('https://api.example.com', 'users')).toBe(
      'https://api.example.com/users',
    );
  });

  it('removes trailing slash from baseURL', () => {
    expect(combineURLs('https://api.example.com/', 'users')).toBe(
      'https://api.example.com/users',
    );
  });

  it('removes leading slash from relativeURL', () => {
    expect(combineURLs('https://api.example.com', '/users')).toBe(
      'https://api.example.com/users',
    );
  });

  it('handles both trailing and leading slashes', () => {
    expect(combineURLs('https://api.example.com/', '/users')).toBe(
      'https://api.example.com/users',
    );
  });

  it('handles multiple trailing slashes on baseURL', () => {
    expect(combineURLs('https://api.example.com///', 'users')).toBe(
      'https://api.example.com/users',
    );
  });

  it('returns ///relativeURL as-is (treated as protocol-relative)', () => {
    // isAbsoluteURL treats // as protocol-relative (absolute), so ///users is absolute
    expect(combineURLs('https://api.example.com', '///users')).toBe('///users');
  });

  it('returns relativeURL as-is when it is already absolute', () => {
    expect(combineURLs('https://base.com', 'https://other.com/path')).toBe(
      'https://other.com/path',
    );
  });

  it('returns relativeURL when baseURL is empty', () => {
    expect(combineURLs('', 'users')).toBe('users');
  });

  it('returns baseURL when relativeURL is empty', () => {
    expect(combineURLs('https://api.example.com', '')).toBe(
      'https://api.example.com',
    );
  });

  it('handles nested paths', () => {
    expect(combineURLs('https://api.example.com/v1', 'users/posts')).toBe(
      'https://api.example.com/v1/users/posts',
    );
  });
});

// ---------------------------------------------------------------------------
// buildUrl
// ---------------------------------------------------------------------------
describe('buildUrl', () => {
  it('returns url as-is when no baseURL, params, or query', () => {
    const config: HttixRequestConfig = { url: 'users' };
    expect(buildUrl(config)).toBe('users');
  });

  it('combines baseURL and url', () => {
    const config: HttixRequestConfig = { url: 'users', baseURL: 'https://api.example.com/v1' };
    expect(buildUrl(config)).toBe('https://api.example.com/v1/users');
  });

  it('interpolates path params', () => {
    const config: HttixRequestConfig = {
      url: 'users/:id',
      params: { id: 42 },
    };
    expect(buildUrl(config)).toBe('users/42');
  });

  it('encodes path param values', () => {
    const config: HttixRequestConfig = {
      url: 'users/:name',
      params: { name: 'john doe' },
    };
    expect(buildUrl(config)).toBe(`users/${encodeURIComponent('john doe')}`);
  });

  it('appends query params with ?', () => {
    const config: HttixRequestConfig = {
      url: 'search',
      query: { q: 'test' },
    };
    expect(buildUrl(config)).toBe('search?q=test');
  });

  it('buildUrl always appends with ? (does not detect existing ?)', () => {
    // The utils/buildUrl always uses ?, unlike the internal request.ts buildUrl
    const config: HttixRequestConfig = {
      url: 'search?existing=true',
      query: { q: 'new' },
    };
    expect(buildUrl(config)).toBe('search?existing=true?q=new');
  });

  it('combines baseURL, params, and query together', () => {
    const config: HttixRequestConfig = {
      url: 'users/:id',
      baseURL: 'https://api.example.com',
      params: { id: 1 },
      query: { expand: 'profile' },
    };
    expect(buildUrl(config)).toBe('https://api.example.com/users/1?expand=profile');
  });

  it('encodes query param keys and values', () => {
    const config: HttixRequestConfig = {
      url: 'search',
      query: { 'q with spaces': 'value here' },
    };
    const result = buildUrl(config);
    expect(result).toContain(encodeURIComponent('q with spaces'));
    expect(result).toContain(encodeURIComponent('value here'));
  });

  it('does not append query string when query is empty object', () => {
    const config: HttixRequestConfig = {
      url: 'search',
      query: {},
    };
    expect(buildUrl(config)).toBe('search');
  });

  it('handles array query values with bracket notation', () => {
    const config: HttixRequestConfig = {
      url: 'items',
      query: { tag: ['a', 'b', 'c'] },
    };
    const result = buildUrl(config);
    expect(result).toContain('tag[]=a');
    expect(result).toContain('tag[]=b');
    expect(result).toContain('tag[]=c');
  });
});
