import { describe, it, expect } from 'vitest';
import { serializeValue, serializeParams } from '../../src/utils/params';

// ---------------------------------------------------------------------------
// serializeValue
// ---------------------------------------------------------------------------
describe('serializeValue', () => {
  it('serializes string values', () => {
    expect(serializeValue('hello')).toBe('hello');
  });

  it('serializes number values', () => {
    expect(serializeValue(42)).toBe('42');
  });

  it('serializes boolean true', () => {
    expect(serializeValue(true)).toBe('true');
  });

  it('serializes boolean false', () => {
    expect(serializeValue(false)).toBe('false');
  });

  it('returns empty string for undefined', () => {
    expect(serializeValue(undefined)).toBe('');
  });

  it('returns empty string for null', () => {
    expect(serializeValue(null)).toBe('');
  });

  it('serializes zero', () => {
    expect(serializeValue(0)).toBe('0');
  });

  it('serializes empty string', () => {
    expect(serializeValue('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// serializeParams
// ---------------------------------------------------------------------------
describe('serializeParams', () => {
  it('serializes simple key-value pairs', () => {
    expect(serializeParams({ q: 'test', page: '1' })).toBe('q=test&page=1');
  });

  it('encodes keys and values', () => {
    const result = serializeParams({ 'search query': 'hello world' });
    expect(result).toBe(
      `${encodeURIComponent('search query')}=${encodeURIComponent('hello world')}`,
    );
  });

  it('skips null values', () => {
    expect(serializeParams({ a: 'yes', b: null })).toBe('a=yes');
  });

  it('skips undefined values', () => {
    expect(serializeParams({ a: 'yes', b: undefined })).toBe('a=yes');
  });

  it('returns empty string for empty object', () => {
    expect(serializeParams({})).toBe('');
  });

  it('serializes number values', () => {
    expect(serializeParams({ count: 5 })).toBe('count=5');
  });

  it('serializes boolean values', () => {
    expect(serializeParams({ active: true })).toBe('active=true');
  });

  it('serializes array values with bracket notation', () => {
    const result = serializeParams({ tag: ['a', 'b', 'c'] });
    expect(result).toBe('tag[]=a&tag[]=b&tag[]=c');
  });

  it('skips null/undefined items in arrays', () => {
    const result = serializeParams({ tag: ['a', null, 'b', undefined, 'c'] });
    expect(result).toBe('tag[]=a&tag[]=b&tag[]=c');
  });

  it('encodes array values', () => {
    const result = serializeParams({ tag: ['hello world', 'foo bar'] });
    expect(result).toBe(
      `tag[]=${encodeURIComponent('hello world')}&tag[]=${encodeURIComponent('foo bar')}`,
    );
  });

  it('serializes nested object values with dot notation', () => {
    const result = serializeParams({ filter: { status: 'active', type: 'user' } });
    expect(result).toBe('filter[status]=active&filter[type]=user');
  });

  it('encodes nested object keys and values', () => {
    const result = serializeParams({ filter: { 'user name': 'john doe' } });
    expect(result).toBe(
      `filter[${encodeURIComponent('user name')}]=${encodeURIComponent('john doe')}`,
    );
  });

  it('skips null/undefined values in nested objects', () => {
    const result = serializeParams({ filter: { a: 'yes', b: null, c: undefined } });
    expect(result).toBe('filter[a]=yes');
  });

  it('handles complex mixed params', () => {
    const result = serializeParams({
      q: 'search',
      page: '2',
      tags: ['js', 'ts'],
      filter: { status: 'active' },
      empty: null,
    });
    // Order of keys from Object.entries may vary, but we can check parts
    expect(result).toContain('q=search');
    expect(result).toContain('page=2');
    expect(result).toContain('tags[]=js');
    expect(result).toContain('tags[]=ts');
    expect(result).toContain('filter[status]=active');
    expect(result).not.toContain('empty');
  });
});
