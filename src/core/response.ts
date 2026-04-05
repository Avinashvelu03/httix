/**
 * httix — Response wrapper and body parsing utilities
 */

import type { HttixRequestConfig, HttixResponse } from './types';

/**
 * Creates a fully-populated HttixResponse from a raw Fetch Response.
 */
export function createResponse<T>(
  raw: Response,
  config: HttixRequestConfig,
  data: T,
  timing: number,
): HttixResponse<T> {
  return {
    data,
    status: raw.status,
    statusText: raw.statusText,
    headers: raw.headers,
    ok: raw.ok,
    raw,
    timing,
    config,
  };
}

/**
 * Parses the body of a Fetch Response according to the request configuration.
 *
 * Resolution order:
 *  1. Custom `parseResponse` function on config
 *  2. Explicit `responseType` ('json' | 'text' | 'blob' | 'arrayBuffer')
 *  3. Auto-detection based on Content-Type header and status code
 */
export async function parseResponseBody<T>(
  response: Response,
  config: HttixRequestConfig,
): Promise<T> {
  // 1. Custom parser takes absolute precedence
  if (typeof config.parseResponse === 'function') {
    return (await config.parseResponse(response)) as T;
  }

  // 204 No Content — nothing to parse
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('Content-Type') ?? '';

  // 2. Explicit responseType override
  if (config.responseType) {
    return parseWithType<T>(response, config.responseType);
  }

  // 3. Auto-detection
  return autoParse<T>(response, contentType);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function parseWithType<T>(
  response: Response,
  responseType: NonNullable<HttixRequestConfig['responseType']>,
): Promise<T> {
  switch (responseType) {
    case 'json': {
      try {
        return (await response.json()) as T;
      } catch {
        return undefined as T;
      }
    }
    case 'text': {
      try {
        return (await response.text()) as T;
      } catch {
        return undefined as T;
      }
    }
    case 'blob': {
      try {
        return (await response.blob()) as T;
      } catch {
        return undefined as T;
      }
    }
    case 'arrayBuffer': {
      try {
        return (await response.arrayBuffer()) as T;
      } catch {
        return undefined as T;
      }
    }
  }
}

async function autoParse<T>(response: Response, contentType: string): Promise<T> {
  const lowerCt = contentType.toLowerCase();

  // application/json
  if (lowerCt.includes('application/json')) {
    try {
      return (await response.json()) as T;
    } catch {
      return undefined as T;
    }
  }

  // text/*
  if (lowerCt.includes('text/')) {
    try {
      return (await response.text()) as T;
    } catch {
      return undefined as T;
    }
  }

  // Null body (e.g. 204 already handled, but defensive check for zero-length)
  if (!response.body) {
    return undefined as T;
  }

  // Best-effort: read as text first, then try JSON.parse.
  // We cannot call response.json() then response.text() because the body
  // stream is consumed after the first read.  Reading as text first lets us
  // attempt JSON parsing on the resulting string without double-consuming.
  try {
    const text = await response.text();
    if (!text) {
      return undefined as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      // Not valid JSON — return the raw text as a best-effort fallback
      return text as T;
    }
  /* v8 ignore next 4 */
  } catch {
    // Body stream error — defensive fallback
    return undefined as T;
  }
}
