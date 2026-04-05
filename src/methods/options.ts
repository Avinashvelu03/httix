/**
 * httix — OPTIONS method factory
 *
 * Creates a standalone OPTIONS function bound to a client instance.
 * OPTIONS requests are typically used for CORS preflight or discovering
 * allowed methods on a resource.
 */

import type {
  HttixClient,
  HttixResponse,
  HttixRequestConfig,
} from '../core/types';

/**
 * Create an OPTIONS method bound to the given client.
 *
 * The response type is `void` because OPTIONS responses typically have no body.
 *
 * @example
 * ```ts
 * const options = createOptionsMethod(client);
 * const { headers } = await options('/users/1');
 * const allow = headers.get('allow'); // e.g. "GET, PUT, DELETE"
 * ```
 */
export function createOptionsMethod(
  client: HttixClient,
): HttixClient['options'] {
  return async function options(
    url: string,
    config?: Partial<HttixRequestConfig>,
  ): Promise<HttixResponse<void>> {
    return client.request<void>({
      ...config,
      url,
      method: 'OPTIONS',
    });
  };
}
