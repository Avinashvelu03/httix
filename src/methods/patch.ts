/**
 * httix — PATCH method factory
 *
 * Creates a standalone PATCH function bound to a client instance.
 */

import type {
  HttixClient,
  HttixResponse,
  HttixRequestConfig,
  RequestBody,
} from '../core/types';

/**
 * Create a PATCH method bound to the given client.
 *
 * @example
 * ```ts
 * const patch = createPatchMethod(client);
 * const { data } = await patch<User>('/users/1', { name: 'Charlie' });
 * ```
 */
export function createPatchMethod(
  client: HttixClient,
): HttixClient['patch'] {
  return async function patch<T = unknown>(
    url: string,
    body?: RequestBody,
    config?: Partial<HttixRequestConfig>,
  ): Promise<HttixResponse<T>> {
    return client.request<T>({
      ...config,
      url,
      method: 'PATCH',
      body,
    });
  };
}
