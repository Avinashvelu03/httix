/**
 * streaming.ts coverage gap tests
 */
import { describe, it, expect } from 'vitest';
import { parseSSE } from '../../src/features/streaming';

describe('parseSSE — remaining buffer', () => {
  it('should process remaining data in buffer', async () => {
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('data: first\n\ndata: second'));
        c.close();
      },
    });
    const events: any[] = [];
    for await (const e of parseSSE(stream)) events.push(e);
    expect(events.length).toBe(2);
    expect(events[0].data).toBe('first');
    expect(events[1].data).toBe('second');
  });
});

describe('parseSSE — no colon field', () => {
  it('should handle data field with no colon', async () => {
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(enc.encode('data\n\n')); c.close(); },
    });
    const events: any[] = [];
    for await (const e of parseSSE(stream)) events.push(e);
    expect(events.length).toBe(1);
    expect(events[0].data).toBe('');
  });

  it('should handle non-data field with no colon', async () => {
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(enc.encode('event\ndata: hello\n\n')); c.close(); },
    });
    const events: any[] = [];
    for await (const e of parseSSE(stream)) events.push(e);
    expect(events.length).toBe(1);
    expect(events[0].data).toBe('hello');
    expect(events[0].type).toBe('message');
  });
});
