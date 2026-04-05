/**
 * httix — Request builder
 *
 * Transforms an HttixRequestConfig into a native `Request` instance ready
 * for `fetch()`, handling URL interpolation, header merging, body
 * serialisation, timeout scheduling, and abort-signal composition.
 */

import type {
  HttixHeaders,
  HttixRequestConfig,
  PathParams,
  QueryParams,
  RequestBody,
} from './types';
import { DEFAULT_HEADERS } from './defaults';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BuildRequestResult {
  request: globalThis.Request;
  timeoutController?: AbortController;
  timeoutId?: ReturnType<typeof setTimeout>;
}

/**
 * Builds a native `Request` from an `HttixRequestConfig`.
 *
 * The returned `timeoutController` / `timeoutId` must be cleared by the
 * caller via `clearTimeoutSignal` once the request settles, otherwise the
 * timer will leak and keep the event-loop alive.
 */
export function buildRequest(config: HttixRequestConfig): BuildRequestResult {
  // 1. Build the full URL (baseURL + url interpolation + query string)
  const url = buildUrl(config.baseURL, config.url, config.params, config.query);

  // 2. Merge default headers with per-request headers (request wins)
  const headers = mergeHeaders(DEFAULT_HEADERS, config.headers);

  // 3. Serialise the request body (may mutate `headers` to set Content-Type)
  const body = serializeBody(config.body, headers);

  // 4. Create the native Request object
  const method = config.method ?? 'GET';
  const requestInit: globalThis.RequestInit = {
    method,
    headers,
    body,
    credentials: config.credentials,
    mode: config.mode,
    cache: config.cache,
    redirect: config.redirect,
    referrerPolicy: config.referrerPolicy,
  };

  // 5. Compose abort signals (config.signal + optional timeout)
  const timeout = config.timeout ?? 0;
  let timeoutController: AbortController | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  if (timeout > 0) {
    timeoutController = new AbortController();
    timeoutId = setTimeout(() => {
      timeoutController!.abort(new DOMException(`Request timed out after ${timeout}ms`, 'TimeoutError'));
    }, timeout);

    if (config.signal) {
      // Both signals exist — combine so that *either* aborting cancels the request
      requestInit.signal = combineSignals(config.signal, timeoutController.signal);
    } else {
      requestInit.signal = timeoutController.signal;
    }
  } else if (config.signal) {
    requestInit.signal = config.signal;
  }

  const request = new globalThis.Request(url, requestInit);

  return { request, timeoutController, timeoutId };
}

/**
 * Cleans up the timeout timer and abort controller created by `buildRequest`.
 * Should be called in a `finally` block after the fetch settles.
 */
export function clearTimeoutSignal(
  _controller: AbortController | undefined,
  timeoutId: ReturnType<typeof setTimeout> | undefined,
): void {
  if (timeoutId !== undefined) {
    clearTimeout(timeoutId);
  }
  // Note: We do NOT abort the controller here - the timeout signal is
  // combined with the user signal, and aborting it would cause the
  // response body parsing (response.json(), response.text(), etc.) to fail
  // with an AbortError. The controller will be garbage collected naturally.
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Combines multiple `AbortSignal`s into a single signal that aborts when
 * *any* of the source signals abort.
 */
function combineSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener(
      'abort',
      () => controller.abort(signal.reason),
      { once: true },
    );
  }

  return controller.signal;
}

/**
 * Builds the full request URL by:
 *  1. Joining `baseURL` + `url` (handling slashes)
 *  2. Replacing `:paramName` path parameters
 *  3. Appending query-string parameters
 */
function buildUrl(
  baseURL: string | undefined,
  url: string,
  params: PathParams | undefined,
  query: QueryParams | undefined,
): string {
  let full = url;

  // Combine baseURL + url
  if (baseURL) {
    const base = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
    const path = full.startsWith('/') ? full : `/${full}`;
    full = `${base}${path}`;
  }

  // Interpolate path parameters (:paramName → value)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      full = full.replace(`:${key}`, encodeURIComponent(String(value)));
    }
  }

  // Append query parameters
  if (query && Object.keys(query).length > 0) {
    const separator = full.includes('?') ? '&' : '?';
    full += `${separator}${encodeQueryParams(query)}`;
  }

  return full;
}

/**
 * Encodes a `QueryParams` object into a URL query string.
 * Handles arrays as repeated keys: `?key=a&key=b`
 */
function encodeQueryParams(query: QueryParams): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      // Skip nullish values entirely
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
        }
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }

  return parts.join('&');
}

/**
 * Merges default headers with per-request headers.
 * Request headers always take precedence over defaults.
 */
function mergeHeaders(
  defaults: HttixHeaders,
  custom?: HttixHeaders,
): Headers {
  const merged = new Headers();

  // Apply defaults first
  applyHeaders(merged, defaults);

  // Custom headers override defaults
  if (custom) {
    applyHeaders(merged, custom);
  }

  return merged;
}

/**
 * Applies a `HttixHeaders` value to a `Headers` instance.
 */
function applyHeaders(target: Headers, source: HttixHeaders): void {
  if (source instanceof Headers) {
    source.forEach((value, key) => {
      target.set(key, value);
    });
  } else {
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined) {
        target.set(key, value);
      }
    }
  }
}

/**
 * Serialises an `RequestBody` into a value suitable for the Fetch API
 * `body` parameter. Mutates `headers` to set `Content-Type` when JSON
 * serialisation is performed and no explicit Content-Type is present.
 *
 * Returns `undefined` when there is no body to send (which is correct for
 * GET/HEAD requests in the Fetch API).
 */
function serializeBody(
  body: RequestBody | undefined,
  headers: Headers,
): globalThis.BodyInit | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }

  // Pass through natively-supported body types directly
  if (
    typeof body === 'string' ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof ReadableStream
  ) {
    return body;
  }

  // Objects and arrays → JSON
  if (typeof body === 'object') {
    // Set Content-Type to application/json if not already set
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return JSON.stringify(body);
  }

  // Primitives (number, boolean)
  // number / boolean — serialise as JSON string for consistency
  if (typeof body === 'number' || typeof body === 'boolean') {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return JSON.stringify(body);
  }

  return undefined;
}
