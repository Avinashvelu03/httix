/**
 * httix — HEAD method factory
 *
 * Creates a standalone HEAD function bound to a client instance.
 * HEAD requests must not have a body, so only headers and status are returned.
 */

import type {
  HttixClient,
  HttixResponse,
  HttixRequestConfig,
} from '../core/types';

/**
 * Create a HEAD method bound to the given client.
 *
 * The response type is `void` because HEAD responses have no body.
 *
 * @example
 * ```ts
 * const head = createHeadMethod(client);
 * const { status, headers } = await head('/users/1');
 * if (status === 200) {
 *   const contentLength = headers.get('content-length');
 * }
 * ```
 */
export function createHeadMethod(
  client: HttixClient,
): HttixClient['head'] {
  return async function head(
    url: string,
    config?: Partial<HttixRequestConfig>,
  ): Promise<HttixResponse<void>> {
    return client.request<void>({
      ...config,
      url,
      method: 'HEAD',
    });
  };
}
