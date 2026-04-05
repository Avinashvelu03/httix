import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseSSE, parseNDJSON, createProgressReader } from '../../src/features/streaming';
import type { SSEEvent, DownloadProgress } from '../../src/core/types';

function createStreamFromText(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let chunkIndex = 0;
  const chunks: string[] = [text];

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (chunkIndex < chunks.length) {
        controller.enqueue(encoder.encode(chunks[chunkIndex]));
        chunkIndex++;
      } else {
        controller.close();
      }
    },
  });
}

function createMultiChunkStream(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < parts.length) {
        controller.enqueue(encoder.encode(parts[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

describe('parseSSE', () => {
  it('should parse a simple SSE event', async () => {
    const sseData = 'data: hello world\n\n';
    const stream = createStreamFromText(sseData);
    const events: SSEEvent[] = [];

    for await (const event of parseSSE(stream)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('hello world');
    expect(events[0].type).toBe('message');
  });

  it('should parse event type', async () => {
    const sseData = 'event: custom\ndata: payload\n\n';
    const stream = createStreamFromText(sseData);
    const events: SSEEvent[] = [];

    for await (const event of parseSSE(stream)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('custom');
    expect(events[0].data).toBe('payload');
  });

  it('should parse event id', async () => {
    const sseData = 'id: 123\ndata: test\n\n';
    const stream = createStreamFromText(sseData);
    const events: SSEEvent[] = [];

    for await (const event of parseSSE(stream)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('123');
  });

  it('should parse retry field', async () => {
    const sseData = 'retry: 5000\ndata: test\n\n';
    const stream = createStreamFromText(sseData);
    const events: SSEEvent[] = [];

    for await (const event of parseSSE(stream)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0].retry).toBe(5000);
  });

  it('should parse multi-line data', async () => {
    const sseData = 'data: line1\ndata: line2\ndata: line3\n\n';
    const stream = createStreamFromText(sseData);
    const events: SSEEvent[] = [];

    for await (const event of parseSSE(stream)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('line1\nline2\nline3');
  });

  it('should parse multiple events', async () => {
    const sseData = 'data: first\n\ndata: second\n\n';
    const stream = createStreamFromText(sseData);
    const events: SSEEvent[] = [];

    for await (const event of parseSSE(stream)) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0].data).toBe('first');
    expect(events[1].data).toBe('second');
  });

  it('should skip comments (lines starting with :)', async () => {
    const sseData = ': this is a comment\ndata: test\n\n';
    const stream = createStreamFromText(sseData);
    const events: SSEEvent[] = [];

    for await (const event of parseSSE(stream)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('test');
  });

  it('should skip events with no data field', async () => {
    const sseData = 'event: custom\nid: 123\n\n';
    const stream = createStreamFromText(sseData);
    const events: SSEEvent[] = [];

    for await (const event of parseSSE(stream)) {
      events.push(event);
    }

    expect(events).toHaveLength(0);
  });

  it('should remove leading space from value per SSE spec', async () => {
    const sseData = 'data:  spaced value\n\n';
    const stream = createStreamFromText(sseData);
    const events: SSEEvent[] = [];

    for await (const event of parseSSE(stream)) {
      events.push(event);
    }

    expect(events[0].data).toBe(' spaced value');
  });

  it('should handle events split across chunks', async () => {
    const stream = createMultiChunkStream(['data: hel', 'lo wor', 'ld\n\n']);
    const events: SSEEvent[] = [];

    for await (const event of parseSSE(stream)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('hello world');
  });
});

describe('parseNDJSON', () => {
  it('should parse a single JSON line', async () => {
    const stream = createStreamFromText('{"key":"value"}\n');
    const results: unknown[] = [];

    for await (const item of parseNDJSON(stream)) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ key: 'value' });
  });

  it('should parse multiple JSON lines', async () => {
    const stream = createStreamFromText('{"a":1}\n{"b":2}\n{"c":3}\n');
    const results: unknown[] = [];

    for await (const item of parseNDJSON(stream)) {
      results.push(item);
    }

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ a: 1 });
    expect(results[1]).toEqual({ b: 2 });
    expect(results[2]).toEqual({ c: 3 });
  });

  it('should skip empty lines', async () => {
    const stream = createStreamFromText('{"a":1}\n\n{"b":2}\n');
    const results: unknown[] = [];

    for await (const item of parseNDJSON(stream)) {
      results.push(item);
    }

    expect(results).toHaveLength(2);
  });

  it('should handle partial lines across chunks', async () => {
    const stream = createMultiChunkStream(['{"ke', 'y":"va', 'lue"}\n']);
    const results: unknown[] = [];

    for await (const item of parseNDJSON(stream)) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ key: 'value' });
  });

  it('should parse final line without trailing newline', async () => {
    const stream = createStreamFromText('{"final":true}');
    const results: unknown[] = [];

    for await (const item of parseNDJSON(stream)) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ final: true });
  });

  it('should handle empty stream', async () => {
    const stream = createStreamFromText('');
    const results: unknown[] = [];

    for await (const item of parseNDJSON(stream)) {
      results.push(item);
    }

    expect(results).toHaveLength(0);
  });

  it('should handle array values', async () => {
    const stream = createStreamFromText('[1,2,3]\n[4,5,6]\n');
    const results: unknown[] = [];

    for await (const item of parseNDJSON(stream)) {
      results.push(item);
    }

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual([1, 2, 3]);
    expect(results[1]).toEqual([4, 5, 6]);
  });
});

describe('createProgressReader', () => {
  it('should call onProgress for each chunk', async () => {
    const encoder = new TextEncoder();
    const chunks = [encoder.encode('hello'), encoder.encode(' world')];
    let index = 0;

    const sourceStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(chunks[index]);
          index++;
        } else {
          controller.close();
        }
      },
    });

    const progressEvents: DownloadProgress[] = [];
    const progressStream = createProgressReader(sourceStream, (progress) => {
      progressEvents.push(progress);
    }, 11);

    const reader = progressStream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    expect(progressEvents).toHaveLength(2);
    expect(progressEvents[0].loaded).toBe(5);
    expect(progressEvents[0].total).toBe(11);
    expect(progressEvents[0].percent).toBe(45);

    expect(progressEvents[1].loaded).toBe(11);
    expect(progressEvents[1].total).toBe(11);
    expect(progressEvents[1].percent).toBe(100);
  });

  it('should report 0 percent when total is not provided', async () => {
    const encoder = new TextEncoder();
    const chunks = [encoder.encode('data')];
    let index = 0;

    const sourceStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(chunks[index]);
          index++;
        } else {
          controller.close();
        }
      },
    });

    const progressEvents: DownloadProgress[] = [];
    const progressStream = createProgressReader(sourceStream, (progress) => {
      progressEvents.push(progress);
    });

    const reader = progressStream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    expect(progressEvents).toHaveLength(1);
    expect(progressEvents[0].loaded).toBe(4);
    expect(progressEvents[0].total).toBeUndefined();
    expect(progressEvents[0].percent).toBe(0);
  });

  it('should pass through data correctly', async () => {
    const encoder = new TextEncoder();
    const originalData = 'test data';
    const chunks = [encoder.encode(originalData)];
    let index = 0;

    const sourceStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(chunks[index]);
          index++;
        } else {
          controller.close();
        }
      },
    });

    const progressStream = createProgressReader(sourceStream, () => {});
    const reader = progressStream.getReader();
    const received: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received.push(value);
    }

    expect(received).toHaveLength(1);
    const decoder = new TextDecoder();
    expect(decoder.decode(received[0])).toBe(originalData);
  });

  it('should handle stream errors', async () => {
    const sourceStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('Stream failed'));
      },
    });

    const progressStream = createProgressReader(sourceStream, () => {});
    const reader = progressStream.getReader();

    await expect(reader.read()).rejects.toThrow('Stream failed');
  });
});
