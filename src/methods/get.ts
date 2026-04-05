/**
 * httix — GET method factory
 *
 * Creates a standalone GET function bound to a client instance.
 * Useful for composition patterns where methods are passed around
 * independently of the client object.
 */

import type {
  HttixClient,
  HttixResponse,
  HttixRequestConfig,
} from '../core/types';

/**
 * Create a GET method bound to the given client.
 *
 * @example
 * ```ts
 * const get = createGetMethod(client);
 * const { data } = await get<User[]>('/users');
 * ```
 */
export function createGetMethod(
  client: HttixClient,
): HttixClient['get'] {
  return async function get<T = unknown>(
    url: string,
    config?: Partial<HttixRequestConfig>,
  ): Promise<HttixResponse<T>> {
    return client.request<T>({
      ...config,
      url,
      method: 'GET',
    });
  };
}
