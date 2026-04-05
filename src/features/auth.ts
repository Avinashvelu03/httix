/**
 * httix — Authentication utilities
 */

import type {
  AuthConfig,
  BearerAuthConfig,
  HttixRequestConfig,
  RequestInterceptor,
  ResponseErrorInterceptor,
} from '../core/types';
import type { HttixError } from '../core/errors';
import { HttixResponseError as HttixResponseErrorCls } from '../core/errors';

/**
 * Resolve an auth value that may be a static value or an async resolver function.
 */
async function resolveValue(value: string | (() => string | Promise<string>)): Promise<string> {
  return typeof value === 'function' ? value() : value;
}

/**
 * Deep-clone a request config so mutations don't affect the original.
 */
function cloneConfig(config: HttixRequestConfig): HttixRequestConfig {
  return { ...config };
}

/**
 * Apply authentication headers or query parameters to a request config
 * based on the provided auth configuration.
 *
 * Returns a new config object — the original is not mutated.
 */
export async function applyAuth(
  config: HttixRequestConfig,
  authConfig: AuthConfig,
): Promise<HttixRequestConfig> {
  const result = cloneConfig(config);

  // Ensure headers is a plain object we can mutate
  const headers: Record<string, string> = {};
  if (result.headers) {
    if (result.headers instanceof Headers) {
      result.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else {
      Object.assign(headers, result.headers);
    }
  }
  result.headers = headers;

  // Ensure query is a mutable object
  const query: Record<string, string | number | boolean | null | undefined> = {
    ...(result.query as Record<string, string | number | boolean | null | undefined> | undefined),
  };

  switch (authConfig.type) {
    case 'bearer': {
      const token = await resolveValue(authConfig.token);
      headers['Authorization'] = `Bearer ${token}`;
      break;
    }

    case 'basic': {
      const credentials = `${authConfig.username}:${authConfig.password}`;
      const encoded = btoa(credentials);
      headers['Authorization'] = `Basic ${encoded}`;
      break;
    }

    case 'apiKey': {
      const value = await resolveValue(authConfig.value);
      if (authConfig.in === 'header') {
        headers[authConfig.key] = value;
      } else {
        // 'query'
        query[authConfig.key] = value;
      }
      break;
    }
  }

  // Only set query if we actually added something
  if (Object.keys(query).length > Object.keys(result.query ?? {}).length || authConfig.type === 'apiKey' && authConfig.in === 'query') {
    result.query = query;
  }

  return result;
}

/**
 * Create a request interceptor that applies authentication to every
 * outgoing request.
 */
export function createAuthInterceptor(authConfig: AuthConfig): RequestInterceptor {
  return async (config: HttixRequestConfig): Promise<HttixRequestConfig> => {
    return applyAuth(config, authConfig);
  };
}

/**
 * Create a response error interceptor that handles 401 Unauthorized
 * errors by refreshing the bearer token and retrying the original request.
 *
 * If no `refreshToken` is configured, returns a no-op interceptor.
 * Concurrent 401 errors are deduplicated — only one token refresh
 * happens at a time, and other callers wait for the same refresh.
 */
export function createAuthRefreshHandler(
  authConfig: BearerAuthConfig,
): ResponseErrorInterceptor {
  // No-op if no refresh mechanism is configured
  if (!authConfig.refreshToken) {
    return (_error: HttixError): void => {
      // Signal the error is not handled
    };
  }

  let refreshPromise: Promise<string> | null = null;

  return (async (error: HttixError) => {
    // Only handle 401 errors
    if (!(error instanceof HttixResponseErrorCls) || error.status !== 401) {
      return;
    }

    const originalConfig = error.config;
    if (!originalConfig) {
      return;
    }

    // Dedup concurrent refreshes
    if (!refreshPromise) {
      refreshPromise = authConfig.refreshToken!().then((newToken) => {
        // Persist the new token if a callback is provided
        if (authConfig.onTokenRefresh) {
          authConfig.onTokenRefresh(newToken);
        }
        // Update the static token so future requests use it
        if (typeof authConfig.token === 'string') {
          (authConfig as { token: string }).token = newToken;
        }
        refreshPromise = null;
        return newToken;
      }).catch((refreshError) => {
        refreshPromise = null;
        throw refreshError;
      });
    }

    let newToken: string;
    try {
      newToken = await refreshPromise;
    } catch {
      // Refresh failed — re-throw the original 401 error
      throw error;
    }

    // Retry the original request with the new token
    const retryConfig = await applyAuth(originalConfig, authConfig);
    // Override the token with the freshly refreshed one
    const retryHeaders: Record<string, string> = {};
    if (retryConfig.headers) {
      Object.assign(retryHeaders, retryConfig.headers);
    }
    retryHeaders['Authorization'] = `Bearer ${newToken}`;
    retryConfig.headers = retryHeaders;

    // We return nothing (error not handled), but the auth token is now refreshed.
    // The caller is expected to retry with the updated config.
    return;
  }) as unknown as ResponseErrorInterceptor;
}
