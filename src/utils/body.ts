/**
 * httix — Request body serialization utilities
 */

import type { RequestBody } from '../core/types';

export interface SerializedBody {
  body: BodyInit | null;
  contentType: string | null;
}

/**
 * Serialize a request body into a format suitable for the Fetch API.
 * Returns the serialized body and an appropriate Content-Type header value.
 */
export function serializeBody(body: RequestBody): SerializedBody {
  // undefined or null — no body
  if (body === undefined || body === null) {
    return { body: null, contentType: null };
  }

  // string — pass through as-is, let the user set their own content-type
  if (typeof body === 'string') {
    return { body, contentType: null };
  }

  // FormData — browser sets multipart boundary automatically
  if (body instanceof FormData) {
    return { body, contentType: null };
  }

  // URLSearchParams — standard form encoding
  if (body instanceof URLSearchParams) {
    return { body, contentType: 'application/x-www-form-urlencoded' };
  }

  // Blob — use the blob's MIME type if available
  if (body instanceof Blob) {
    return { body, contentType: body.type || null };
  }

  // ArrayBuffer — raw binary data
  if (body instanceof ArrayBuffer) {
    return { body, contentType: 'application/octet-stream' };
  }

  // ReadableStream — pass through, user manages content-type
  if (body instanceof ReadableStream) {
    return { body, contentType: null };
  }

  // object (Record<string, unknown>) or array — JSON serialize
  if (typeof body === 'object') {
    return { body: JSON.stringify(body), contentType: 'application/json' };
  }

  // number or boolean — treat as JSON
  if (typeof body === 'number' || typeof body === 'boolean') {
    return { body: String(body), contentType: 'application/json' };
  }

  // Fallback — shouldn't normally reach here
  return { body: String(body), contentType: null };
}

/**
 * Check whether a body value is serializable (i.e. can be read multiple times).
 * ReadableStream instances can only be consumed once, so they are not considered serializable.
 */
export function isBodySerializable(
  body: RequestBody,
): body is Exclude<RequestBody, ReadableStream<Uint8Array>> {
  return !(body instanceof ReadableStream);
}
