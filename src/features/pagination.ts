/**
 * httix — Pagination utilities
 */

import type {
  HttixClient,
  HttixRequestConfig,
  HttixResponse,
  PaginationConfig,
} from '../core/types';

/**
 * Parse an HTTP Link header into a record of rel → URL mappings.
 *
 * Input format: `<url>; rel="next", <url>; rel="last"`
 *
 * Returns an object like `{ next: 'https://...', last: 'https://...' }`.
 */
export function parseLinkHeader(linkHeader: string): Record<string, string> {
  const result: Record<string, string> = {};

  if (!linkHeader) return result;

  // Split by comma, but be careful with commas inside angle brackets (unlikely but safe)
  const parts = linkHeader.split(',');

  for (const part of parts) {
    const trimmed = part.trim();

    // Extract URL from angle brackets
    const urlMatch = trimmed.slice(0, 8192).match(/^<([^>]{1,2048})>/);
    if (!urlMatch) continue;

    const url = urlMatch[1];
    /* v8 ignore next */ if (url === undefined) continue;

    // Extract rel value
    const relMatch = trimmed.match(/rel\s*=\s*"([^"]+)"/);
    if (!relMatch) continue;

    const rel = relMatch[1]!;
    result[rel] = url;
  }

  return result;
}

/**
 * Create a paginator function that returns an async iterable of pages.
 *
 * Supports three pagination styles:
 * - **offset**: Tracks offset and incrementing by pageSize each iteration.
 * - **cursor**: Extracts a cursor from the response data and passes it
 *   as a query parameter for the next request.
 * - **link**: Extracts the next URL from the Link response header.
 *
 * The iterable respects `maxPages`, `stopCondition`, and `dataExtractor`
 * from the PaginationConfig.
 */
export function createPaginator<T>(
  client: HttixClient,
): (
  url: string,
  config?: Partial<HttixRequestConfig> & { pagination?: PaginationConfig<T> },
) => AsyncIterable<T[]> {
  return async function* paginate(
    url: string,
    config?: Partial<HttixRequestConfig> & { pagination?: PaginationConfig<T> },
  ) {
    const pagination = config?.pagination;
    if (!pagination) {
      return;
    }

    const {
      style,
      pageSize = 20,
      maxPages = Infinity,
      offsetParam = 'offset',
      limitParam = 'limit',
      cursorParam = 'cursor',
      cursorExtractor,
      linkExtractor,
      dataExtractor,
      stopCondition,
    } = pagination;

    let currentUrl: string | null = url;
    let offset = 0;
    let cursor: string | null | undefined;
    let pageCount = 0;

    while (currentUrl && pageCount < maxPages) {
      // Build request config for this page
      const requestConfig: Partial<HttixRequestConfig> = { ...config };

      if (style === 'offset') {
        requestConfig.query = {
          ...requestConfig.query,
          [offsetParam]: offset,
          [limitParam]: pageSize,
        } as Record<string, string | number | boolean | null | undefined>;
      } else if (style === 'cursor') {
        requestConfig.query = {
          ...requestConfig.query,
          [cursorParam]: cursor,
        } as Record<string, string | number | boolean | null | undefined>;
      }

      let response: HttixResponse<T>;

      if (style === 'link' && pageCount > 0) {
        // For link style after the first page, use the URL from the Link header
        response = await client.request<T>({
          url: currentUrl,
          ...requestConfig,
        } as HttixRequestConfig);
      } else {
        response = await client.request<T>({
          url: currentUrl,
          ...requestConfig,
        } as HttixRequestConfig);
      }

      pageCount++;

      // Extract the page data
      let pageData: T[];

      if (dataExtractor) {
        pageData = dataExtractor(response.data);
      } else {
        // Default: assume response.data is the array
        pageData = (response.data ?? []) as T[];
      }

      // Check stop condition (on raw data, not extracted array)
      if (stopCondition && stopCondition(response.data)) {
        if (pageData.length > 0) {
          yield pageData;
        }
        return;
      }

      // If no data, stop paginating
      if (pageData.length === 0) {
        return;
      }

      yield pageData;

      // Determine the next page
      switch (style) {
        case 'offset': {
          // If we got fewer items than pageSize, there are no more pages
          if (pageData.length < pageSize) {
            return;
          }
          offset += pageSize;
          break;
        }

        case 'cursor': {
          if (cursorExtractor) {
            cursor = cursorExtractor(response.data);
          } else {
            // Default: try to extract from data if it looks like it has a cursor
            cursor = null;
          }
          if (!cursor) {
            return;
          }
          break;
        }

        case 'link': {
          if (linkExtractor) {
            currentUrl = linkExtractor(response.headers) ?? null;
          } else {
            // Default: parse the Link header
            const linkHeader = response.headers.get('link');
            if (linkHeader) {
              const links = parseLinkHeader(linkHeader);
              currentUrl = links['next'] ?? null;
            } else {
              currentUrl = null;
            }
          }
          break;
        }
      }
    }
  };
}
