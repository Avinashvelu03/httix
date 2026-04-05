import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHttix } from '../../src/core/client';
import { HttixResponseError, HttixRequestError } from '../../src/core/errors';
import type { SSEEvent } from '../../src/core/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = 'https://api.example.com';

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

/**
 * Create a ReadableStream that delivers SSE-formatted text chunks.
 */
function createSSEStream(events: Array<{ type?: string; data: string; id?: string }>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const parts: string[] = [];

  for (const event of events) {
    let chunk = '';
    if (event.type) chunk += `event: ${event.type}\n`;
    chunk += `data: ${event.data}\n`;
    if (event.id) chunk += `id: ${event.id}\n`;
    chunk += '\n';
    parts.push(chunk);
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(encoder.encode(part));
      }
      controller.close();
    },
  });
}

/**
 * Create a ReadableStream that delivers some data then errors.
 */
function createErrorSSEStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let delivered = false;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!delivered) {
        delivered = true;
        // First pull: deliver one valid SSE event
        controller.enqueue(encoder.encode('data: before-error\n\n'));
      } else {
        // Second pull: error
        controller.error(new Error('Stream interrupted'));
      }
    },
  });
}

/**
 * Create a ReadableStream that delivers an empty body.
 */
function createEmptyStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SSE streaming scenarios', () => {
  // =========================================================================
  // Full SSE streaming scenario
  // =========================================================================
  describe('Full SSE streaming with mock ReadableStream', () => {
    it('should receive multiple SSE events from a stream', async () => {
      const events = [
        { type: 'message', data: 'hello world' },
        { type: 'message', data: 'second message' },
        { type: 'message', data: 'third message' },
      ];

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(createSSEStream(events), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const received: SSEEvent[] = [];

      for await (const event of client.stream.sse('/events')) {
        received.push(event);
      }

      expect(received).toHaveLength(3);
      expect(received[0].data).toBe('hello world');
      expect(received[1].data).toBe('second message');
      expect(received[2].data).toBe('third message');
    });

    it('should parse different event types', async () => {
      const events = [
        { type: 'user-joined', data: '{"name":"Alice"}' },
        { type: 'chat-message', data: 'Hello everyone!' },
        { type: 'user-left', data: '{"name":"Bob"}' },
      ];

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(createSSEStream(events), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const received: SSEEvent[] = [];

      for await (const event of client.stream.sse('/events')) {
        received.push(event);
      }

      expect(received).toHaveLength(3);
      expect(received[0].type).toBe('user-joined');
      expect(received[0].data).toBe('{"name":"Alice"}');
      expect(received[1].type).toBe('chat-message');
      expect(received[1].data).toBe('Hello everyone!');
      expect(received[2].type).toBe('user-left');
      expect(received[2].data).toBe('{"name":"Bob"}');
    });

    it('should parse event IDs', async () => {
      const events = [
        { data: 'first', id: 'evt-001' },
        { data: 'second', id: 'evt-002' },
        { data: 'third', id: 'evt-003' },
      ];

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(createSSEStream(events), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const received: SSEEvent[] = [];

      for await (const event of client.stream.sse('/events')) {
        received.push(event);
      }

      expect(received[0].id).toBe('evt-001');
      expect(received[1].id).toBe('evt-002');
      expect(received[2].id).toBe('evt-003');
    });

    it('should default event type to "message" when not specified', async () => {
      const events = [
        { data: 'no-type-specified' },
      ];

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(createSSEStream(events), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const received: SSEEvent[] = [];

      for await (const event of client.stream.sse('/events')) {
        received.push(event);
      }

      expect(received).toHaveLength(1);
      expect(received[0].type).toBe('message');
      expect(received[0].data).toBe('no-type-specified');
    });

    it('should handle multi-line data fields', async () => {
      // Multi-line SSE data is sent as multiple `data:` lines per spec
      const encoder = new TextEncoder();
      const sseText = 'data: line1\ndata: line2\ndata: line3\n\n';

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(encoder.encode(sseText), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const received: SSEEvent[] = [];

      for await (const event of client.stream.sse('/events')) {
        received.push(event);
      }

      expect(received).toHaveLength(1);
      expect(received[0].data).toBe('line1\nline2\nline3');
    });
  });

  // =========================================================================
  // Error during streaming
  // =========================================================================
  describe('Error during streaming', () => {
    it('should throw when the stream errors mid-way', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(createErrorSSEStream(), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const received: SSEEvent[] = [];

      await expect(async () => {
        for await (const event of client.stream.sse('/events')) {
          received.push(event);
        }
      }).rejects.toThrow();

      // Should have received the event before the error
      expect(received).toHaveLength(1);
      expect(received[0].data).toBe('before-error');
    });

    it('should throw on non-OK SSE response', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response('{"error":"Unauthorized"}', {
          status: 401,
          statusText: 'Unauthorized',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });

      await expect(async () => {
        for await (const _ of client.stream.sse('/events')) {
          void _;
          // should not reach here
        }
      }).rejects.toThrow(HttixResponseError);
    });

    it('should throw when response body is null', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });

      await expect(async () => {
        for await (const _ of client.stream.sse('/events')) {
          void _;
          // should not reach here
        }
      }).rejects.toThrow(HttixRequestError);
    });
  });

  // =========================================================================
  // Empty stream
  // =========================================================================
  describe('Empty stream', () => {
    it('should handle an empty SSE stream (no events)', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(createEmptyStream(), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const client = createHttix({ baseURL: BASE, timeout: 0 });
      const received: SSEEvent[] = [];

      for await (const event of client.stream.sse('/events')) {
        received.push(event);
      }

      expect(received).toHaveLength(0);
    });
  });

  // =========================================================================
  // Auth with SSE
  // =========================================================================
  describe('Auth with SSE', () => {
    it('should include auth header when making SSE requests', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response(createSSEStream([{ data: 'authenticated-event' }]), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const client = createHttix({
        baseURL: BASE,
        timeout: 0,
        auth: { type: 'bearer', token: 'sse-token' },
      });

      const received: SSEEvent[] = [];
      for await (const event of client.stream.sse('/stream')) {
        received.push(event);
      }

      expect(received).toHaveLength(1);
      expect(received[0].data).toBe('authenticated-event');

      const [req] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(req.headers.get('authorization')).toBe('Bearer sse-token');
    });
  });
});
