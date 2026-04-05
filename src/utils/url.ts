/**
 * httix — URL building and manipulation utilities
 */

import type { HttixRequestConfig } from '../core/types';
import { serializeParams } from './params';

/**
 * Check if a URL is absolute (starts with a scheme).
 */
export function isAbsoluteURL(url: string): boolean {
  return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);
}

/**
 * Combine a base URL and a relative URL into a single URL.
 * Handles trailing/leading slashes and absolute URL edge cases.
 */
export function combineURLs(baseURL: string, relativeURL: string): string {
  // If relative URL is already absolute, return it as-is
  if (isAbsoluteURL(relativeURL)) {
    return relativeURL;
  }

  // Handle empty strings
  if (!baseURL) {
    return relativeURL;
  }
  if (!relativeURL) {
    return baseURL;
  }

  // Remove trailing slash from baseURL
  const base = baseURL.replace(/\/+$/, '');
  // Remove leading slash from relativeURL
  const relative = relativeURL.replace(/^\/+/, '');

  return `${base}/${relative}`;
}

/**
 * Build a full URL from the request config.
 *
 * Steps:
 *  1. Combine baseURL + url if baseURL is provided
 *  2. Replace `:paramName` path params with values from config.params
 *  3. Append query string from config.query
 */
export function buildUrl(config: HttixRequestConfig): string {
  let fullUrl: string;

  // Step 1: combine base and relative URLs
  if (config.baseURL) {
    fullUrl = combineURLs(config.baseURL, config.url);
  } else {
    fullUrl = config.url;
  }

  // Step 2: apply path params (replace :paramName with values)
  if (config.params) {
    for (const [key, value] of Object.entries(config.params)) {
      fullUrl = fullUrl.replace(
        `:${key}`,
        encodeURIComponent(String(value)),
      );
    }
  }

  // Step 3: append query params
  if (config.query && Object.keys(config.query).length > 0) {
    const queryString = buildQueryString(config.query);
    if (queryString) {
      fullUrl += `?${queryString}`;
    }
  }

  return fullUrl;
}

/**
 * Build a query string from a params object.
 * Returns the string without the leading `?`.
 */
export function buildQueryString(params: Record<string, unknown>): string {
  return serializeParams(params as import('../core/types').QueryParams);
}
