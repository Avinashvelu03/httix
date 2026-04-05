/**
 * httix — DELETE method factory
 *
 * Creates a standalone DELETE function bound to a client instance.
 * Supports an optional body (some APIs accept request bodies with DELETE).
 */

import type {
  HttixClient,
  HttixResponse,
  HttixRequestConfig,
  RequestBody,
} from '../core/types';

/**
 * Create a DELETE method bound to the given client.
 *
 * @example
 * ```ts
 * const remove = createDeleteMethod(client);
 * const { data } = await remove<void>('/users/1');
 *
 * // With body (API-specific)
 * const { data } = await remove<void>('/batch', { ids: [1, 2, 3] });
 * ```
 */
export function createDeleteMethod(
  client: HttixClient,
): (
  url: string,
  body?: RequestBody,
  config?: Partial<HttixRequestConfig>,
) => Promise<HttixResponse<unknown>> {
  return async function remove<T = unknown>(
    url: string,
    body?: RequestBody,
    config?: Partial<HttixRequestConfig>,
  ): Promise<HttixResponse<T>> {
    return client.request<T>({
      ...config,
      url,
      method: 'DELETE',
      ...(body !== undefined ? { body } : {}),
    });
  };
}
