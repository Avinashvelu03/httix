/**
 * httix — POST method factory
 *
 * Creates a standalone POST function bound to a client instance.
 */

import type {
  HttixClient,
  HttixResponse,
  HttixRequestConfig,
  RequestBody,
} from '../core/types';

/**
 * Create a POST method bound to the given client.
 *
 * @example
 * ```ts
 * const post = createPostMethod(client);
 * const { data } = await post<User>('/users', { name: 'Alice' });
 * ```
 */
export function createPostMethod(
  client: HttixClient,
): HttixClient['post'] {
  return async function post<T = unknown>(
    url: string,
    body?: RequestBody,
    config?: Partial<HttixRequestConfig>,
  ): Promise<HttixResponse<T>> {
    return client.request<T>({
      ...config,
      url,
      method: 'POST',
      body,
    });
  };
}
