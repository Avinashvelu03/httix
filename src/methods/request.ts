/**
 * httix — Generic request method factory
 *
 * Creates a standalone request function bound to a client instance.
 * This is the lowest-level factory — the caller provides the full
 * HttixRequestConfig including method, url, headers, body, etc.
 */

import type {
  HttixClient,
  HttixResponse,
  HttixRequestConfig,
} from '../core/types';

/**
 * Create a generic request method bound to the given client.
 *
 * @example
 * ```ts
 * const request = createRequestMethod(client);
 * const { data } = await request<User>({ url: '/users/1', method: 'GET' });
 * ```
 */
export function createRequestMethod(
  client: HttixClient,
): HttixClient['request'] {
  return async function request<T = unknown>(
    config: HttixRequestConfig,
  ): Promise<HttixResponse<T>> {
    return client.request<T>(config);
  };
}
