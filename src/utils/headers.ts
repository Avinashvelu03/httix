/**
 * httix — Header manipulation utilities
 */

import type { HttixHeaders } from '../core/types';

/**
 * Merge default headers with custom headers.
 * Custom headers take precedence over defaults.
 */
export function mergeHeaders(
  defaults: HttixHeaders | undefined,
  custom: HttixHeaders | undefined,
): Headers {
  const merged = new Headers();

  if (defaults) {
    addHeadersToInstance(merged, defaults);
  }

  if (custom) {
    addHeadersToInstance(merged, custom);
  }

  return merged;
}

/**
 * Capitalize the first letter of each word in a header name.
 * e.g. 'content-type' → 'Content-Type'
 */
export function normalizeHeaderName(name: string): string {
  return name
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join('-');
}

/**
 * Get the Content-Type header from a Headers object (case-insensitive).
 * Returns the value in lowercase, or null if not present.
 */
export function getContentType(headers: Headers): string | null {
  const value = headers.get('content-type');
  return value !== null ? value.toLowerCase() : null;
}

/**
 * Check if the given content type indicates JSON.
 */
export function isJSONContentType(contentType: string | null): boolean {
  if (contentType === null) {
    return false;
  }
  return contentType.includes('application/json');
}

/**
 * Check if the given content type indicates text or XML.
 */
export function isTextContentType(contentType: string | null): boolean {
  if (contentType === null) {
    return false;
  }
  return contentType.includes('text/') || contentType.includes('application/xml');
}

/**
 * Convert HttixHeaders (Record<string, string> or Headers) to a new Headers instance.
 */
export function parseHeaders(headersInit: HttixHeaders): Headers {
  const headers = new Headers();
  addHeadersToInstance(headers, headersInit);
  return headers;
}

/**
 * Internal helper: add entries from an HttixHeaders source into a Headers instance.
 */
function addHeadersToInstance(target: Headers, source: HttixHeaders): void {
  if (source instanceof Headers) {
    source.forEach((value, key) => {
      target.set(key, value);
    });
  } else {
    for (const [key, value] of Object.entries(source)) {
      target.set(key, value);
    }
  }
}
