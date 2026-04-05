import { describe, it, expect } from 'vitest';
import { serializeBody, isBodySerializable } from '../../src/utils/body';

// ---------------------------------------------------------------------------
// serializeBody
// ---------------------------------------------------------------------------
describe('serializeBody', () => {
  // -- null / undefined -----------------------------------------------------
  it('returns null body for undefined', () => {
    const result = serializeBody(undefined);
    expect(result.body).toBeNull();
    expect(result.contentType).toBeNull();
  });

  it('returns null body for null', () => {
    const result = serializeBody(null);
    expect(result.body).toBeNull();
    expect(result.contentType).toBeNull();
  });

  // -- string ---------------------------------------------------------------
  it('passes string body through as-is', () => {
    const result = serializeBody('hello world');
    expect(result.body).toBe('hello world');
    expect(result.contentType).toBeNull();
  });

  it('passes empty string through', () => {
    const result = serializeBody('');
    expect(result.body).toBe('');
    expect(result.contentType).toBeNull();
  });

  // -- FormData -------------------------------------------------------------
  it('passes FormData through as-is', () => {
    const fd = new FormData();
    fd.append('key', 'value');
    const result = serializeBody(fd);
    expect(result.body).toBe(fd);
    expect(result.contentType).toBeNull();
  });

  // -- URLSearchParams ------------------------------------------------------
  it('passes URLSearchParams through with correct content-type', () => {
    const sp = new URLSearchParams('a=1&b=2');
    const result = serializeBody(sp);
    expect(result.body).toBe(sp);
    expect(result.contentType).toBe('application/x-www-form-urlencoded');
  });

  // -- Blob -----------------------------------------------------------------
  it('passes Blob through with its MIME type', () => {
    const blob = new Blob(['data'], { type: 'image/png' });
    const result = serializeBody(blob);
    expect(result.body).toBe(blob);
    expect(result.contentType).toBe('image/png');
  });

  it('returns null content-type for Blob without type', () => {
    const blob = new Blob(['data']);
    const result = serializeBody(blob);
    expect(result.body).toBe(blob);
    expect(result.contentType).toBeNull();
  });

  // -- ArrayBuffer ----------------------------------------------------------
  it('serializes ArrayBuffer with application/octet-stream', () => {
    const buffer = new ArrayBuffer(8);
    const result = serializeBody(buffer);
    expect(result.body).toBe(buffer);
    expect(result.contentType).toBe('application/octet-stream');
  });

  // -- ReadableStream -------------------------------------------------------
  it('passes ReadableStream through without content-type', () => {
    const stream = new ReadableStream();
    const result = serializeBody(stream);
    expect(result.body).toBe(stream);
    expect(result.contentType).toBeNull();
  });

  // -- object (JSON) --------------------------------------------------------
  it('serializes plain objects to JSON', () => {
    const result = serializeBody({ name: 'test', count: 5 });
    expect(result.body).toBe(JSON.stringify({ name: 'test', count: 5 }));
    expect(result.contentType).toBe('application/json');
  });

  it('serializes nested objects to JSON', () => {
    const data = { user: { name: 'alice', tags: ['admin'] } };
    const result = serializeBody(data);
    expect(result.body).toBe(JSON.stringify(data));
    expect(result.contentType).toBe('application/json');
  });

  // -- array (JSON) ---------------------------------------------------------
  it('serializes arrays to JSON', () => {
    const data = [1, 2, 3];
    const result = serializeBody(data);
    expect(result.body).toBe(JSON.stringify(data));
    expect(result.contentType).toBe('application/json');
  });

  // -- number ---------------------------------------------------------------
  it('serializes number as JSON string', () => {
    const result = serializeBody(42);
    expect(result.body).toBe('42');
    expect(result.contentType).toBe('application/json');
  });

  // -- boolean --------------------------------------------------------------
  it('serializes boolean as JSON string', () => {
    const result = serializeBody(true);
    expect(result.body).toBe('true');
    expect(result.contentType).toBe('application/json');
  });

  it('serializes false as JSON string', () => {
    const result = serializeBody(false);
    expect(result.body).toBe('false');
    expect(result.contentType).toBe('application/json');
  });
});

// ---------------------------------------------------------------------------
// isBodySerializable
// ---------------------------------------------------------------------------
describe('isBodySerializable', () => {
  it('returns true for string', () => {
    expect(isBodySerializable('hello')).toBe(true);
  });

  it('returns true for number', () => {
    expect(isBodySerializable(42)).toBe(true);
  });

  it('returns true for object', () => {
    expect(isBodySerializable({ key: 'value' })).toBe(true);
  });

  it('returns true for array', () => {
    expect(isBodySerializable([1, 2])).toBe(true);
  });

  it('returns true for FormData', () => {
    expect(isBodySerializable(new FormData())).toBe(true);
  });

  it('returns true for URLSearchParams', () => {
    expect(isBodySerializable(new URLSearchParams())).toBe(true);
  });

  it('returns true for Blob', () => {
    expect(isBodySerializable(new Blob())).toBe(true);
  });

  it('returns true for ArrayBuffer', () => {
    expect(isBodySerializable(new ArrayBuffer(0))).toBe(true);
  });

  it('returns false for ReadableStream', () => {
    expect(isBodySerializable(new ReadableStream())).toBe(false);
  });

  it('returns true for null', () => {
    expect(isBodySerializable(null)).toBe(true);
  });

  it('returns true for undefined', () => {
    expect(isBodySerializable(undefined)).toBe(true);
  });
});
