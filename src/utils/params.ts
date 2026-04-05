/**
 * httix — Query parameter serialization utilities
 */

import type { QueryParamValue, QueryParams } from '../core/types';

/**
 * Convert a single value to its string representation for use in a query string.
 * undefined and null yield an empty string.
 */
export function serializeValue(value: QueryParamValue): string {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
}

/**
 * Serialize a params object into a URL query string (without the leading `?`).
 *
 * - null/undefined values are skipped entirely.
 * - Array values use bracket notation: `key[]=value1&key[]=value2`
 * - Object values (one level deep) use dot notation: `key[subkey]=value`
 * - Primitives are serialized as `key=value`
 * - All keys and values are URI-encoded.
 */
export function serializeParams(params: QueryParams): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      // Skip null / undefined values entirely
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) {
          continue;
        }
        parts.push(
          `${encodeURIComponent(key)}[]=${encodeURIComponent(serializeValue(item))}`,
        );
      }
    } else if (typeof value === 'object') {
      // One-level-deep object serialization
      for (const [subKey, subValue] of Object.entries(value as Record<string, QueryParamValue>)) {
        if (subValue === undefined || subValue === null) {
          continue;
        }
        parts.push(
          `${encodeURIComponent(key)}[${encodeURIComponent(subKey)}]=${encodeURIComponent(serializeValue(subValue))}`,
        );
      }
    } else {
      parts.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(serializeValue(value))}`,
      );
    }
  }

  return parts.join('&');
}
