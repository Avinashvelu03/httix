/**
 * httix — PUT method factory
 *
 * Creates a standalone PUT function bound to a client instance.
 */

import type {
  HttixClient,
  HttixResponse,
  HttixRequestConfig,
  RequestBody,
} from '../core/types';

/**
 * Create a PUT method bound to the given client.
 *
 * @example
 * ```ts
 * const put = createPutMethod(client);
 * const { data } = await put<User>('/users/1', { name: 'Bob' });
 * ```
 */
export function createPutMethod(
  client: HttixClient,
): HttixClient['put'] {
  return async function put<T = unknown>(
    url: string,
    body?: RequestBody,
    config?: Partial<HttixRequestConfig>,
  ): Promise<HttixResponse<T>> {
    return client.request<T>({
      ...config,
      url,
      method: 'PUT',
      body,
    });
  };
}
