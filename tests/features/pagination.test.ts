import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPaginator, parseLinkHeader } from '../../src/features/pagination';
import { createHttix } from '../../src/core/client';
import type { HttixResponse, PaginationConfig } from '../../src/core/types';

const BASE = 'https://api.example.com';

describe('parseLinkHeader', () => {
  it('should parse next and last links', () => {
    const header = '<https://api.example.com/users?page=2>; rel="next", <https://api.example.com/users?page=5>; rel="last"';
    const result = parseLinkHeader(header);
    expect(result['next']).toBe('https://api.example.com/users?page=2');
    expect(result['last']).toBe('https://api.example.com/users?page=5');
  });

  it('should return empty object for empty string', () => {
    expect(parseLinkHeader('')).toEqual({});
  });

  it('should return empty object for null/undefined', () => {
    expect(parseLinkHeader(null as any)).toEqual({});
  });

  it('should handle single link', () => {
    const header = '<https://api.example.com/next>; rel="next"';
    const result = parseLinkHeader(header);
    expect(result['next']).toBe('https://api.example.com/next');
  });

  it('should skip malformed entries', () => {
    const header = 'malformed, <https://api.example.com/next>; rel="next"';
    const result = parseLinkHeader(header);
    expect(result['next']).toBe('https://api.example.com/next');
  });
});

describe('createPaginator', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should yield nothing when no pagination config', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify([1, 2, 3]), { headers: { 'Content-Type': 'application/json' } }),
    );

    const client = createHttix({ baseURL: BASE });
    const pages: unknown[][] = [];

    for await (const page of client.paginate('/items')) {
      pages.push(page);
    }

    expect(pages).toHaveLength(0);
  });

  describe('offset pagination', () => {
    it('should paginate through pages', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          new Response(JSON.stringify([{ id: 1 }, { id: 2 }]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify([{ id: 3 }]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      const client = createHttix({ baseURL: BASE });
      const pages: unknown[][] = [];

      for await (const page of client.paginate('/items', {
        pagination: { style: 'offset', pageSize: 2 },
      })) {
        pages.push(page);
      }

      expect(pages).toHaveLength(2);
      expect(pages[0]).toEqual([{ id: 1 }, { id: 2 }]);
      expect(pages[1]).toEqual([{ id: 3 }]);

      const firstCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as Request;
      expect(firstCall.url).toContain('offset=0');
      expect(firstCall.url).toContain('limit=2');

      const secondCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1][0] as Request;
      expect(secondCall.url).toContain('offset=2');
    });

    it('should stop when page has fewer items than pageSize', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify([{ id: 1 }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const pages: unknown[][] = [];

      for await (const page of client.paginate('/items', {
        pagination: { style: 'offset', pageSize: 5 },
      })) {
        pages.push(page);
      }

      expect(pages).toHaveLength(1);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('should respect maxPages', async () => {
      // Use mockImplementation to create a new Response each time (body can only be consumed once)
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
        () =>
          new Response(JSON.stringify([{ id: 1 }, { id: 2 }]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      );

      const client = createHttix({ baseURL: BASE });
      const pages: unknown[][] = [];

      for await (const page of client.paginate('/items', {
        pagination: { style: 'offset', pageSize: 2, maxPages: 2 },
      })) {
        pages.push(page);
      }

      expect(pages).toHaveLength(2);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('cursor pagination', () => {
    it('should paginate using cursors', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ items: [{ id: 1 }], nextCursor: 'abc' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ items: [{ id: 2 }], nextCursor: null }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );

      const client = createHttix({ baseURL: BASE });
      const pages: unknown[][] = [];

      for await (const page of client.paginate('/items', {
        pagination: {
          style: 'cursor',
          cursorParam: 'cursor',
          cursorExtractor: (data: any) => data.nextCursor,
          dataExtractor: (data: any) => data.items,
        },
      })) {
        pages.push(page);
      }

      expect(pages).toHaveLength(2);
    });

    it('should stop when cursor is null', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(
          JSON.stringify({ items: [{ id: 1 }], nextCursor: null }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const client = createHttix({ baseURL: BASE });
      const pages: unknown[][] = [];

      for await (const page of client.paginate('/items', {
        pagination: {
          style: 'cursor',
          cursorParam: 'cursor',
          cursorExtractor: (data: any) => data.nextCursor,
          dataExtractor: (data: any) => data.items,
        },
      })) {
        pages.push(page);
      }

      expect(pages).toHaveLength(1);
    });

    it('should stop cursor pagination when no cursorExtractor (cursor=null)', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify([{ id: 1 }]), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const pages: unknown[][] = [];

      for await (const page of client.paginate('/items', {
        pagination: { style: 'cursor', cursorParam: 'cursor' },
      })) {
        pages.push(page);
      }

      // No cursorExtractor → default sets cursor=null → stops after first page
      expect(pages).toHaveLength(1);
    });
  });

  describe('link pagination', () => {
    it('should paginate using Link header', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          new Response(JSON.stringify([{ id: 1 }]), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Link': '<https://api.example.com/items?page=2>; rel="next"',
            },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify([{ id: 2 }]), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }),
        );

      const client = createHttix({ baseURL: BASE });
      const pages: unknown[][] = [];

      for await (const page of client.paginate('/items', {
        pagination: { style: 'link' },
      })) {
        pages.push(page);
      }

      expect(pages).toHaveLength(2);
    });

    it('should stop when no Link header with rel="next"', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify([{ id: 1 }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const pages: unknown[][] = [];

      for await (const page of client.paginate('/items', {
        pagination: { style: 'link' },
      })) {
        pages.push(page);
      }

      expect(pages).toHaveLength(1);
    });

    it('should use custom linkExtractor', async () => {
      let call = 0;
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
        call++;
        return new Response(
          JSON.stringify({ items: [{ id: call }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const client = createHttix({ baseURL: BASE });
      const pages: unknown[][] = [];

      for await (const page of client.paginate('/items', {
        pagination: {
          style: 'link',
          dataExtractor: (data: any) => data.items,
          linkExtractor: () => (call < 2 ? `${BASE}/items?page=2` : null),
        },
      })) {
        pages.push(page);
      }

      expect(pages).toHaveLength(2);
    });
  });

  describe('stop condition', () => {
    it('should stop when stopCondition returns true', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(
          JSON.stringify({ items: [{ id: 1 }, { id: 2 }], hasMore: false }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const client = createHttix({ baseURL: BASE });
      const pages: unknown[][] = [];

      for await (const page of client.paginate('/items', {
        pagination: {
          style: 'offset',
          pageSize: 10,
          dataExtractor: (data: any) => data.items,
          stopCondition: (data: any) => !data.hasMore,
        },
      })) {
        pages.push(page);
      }

      expect(pages).toHaveLength(1);
    });
  });

  describe('empty response', () => {
    it('should stop when empty data is returned', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE });
      const pages: unknown[][] = [];

      for await (const page of client.paginate('/items', {
        pagination: { style: 'offset', pageSize: 2 },
      })) {
        pages.push(page);
      }

      expect(pages).toHaveLength(0);
    });
  });
});
