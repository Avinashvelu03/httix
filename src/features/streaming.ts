/**
 * httix — Streaming utilities (SSE, NDJSON, progress tracking)
 */

import type { DownloadProgress, SSEEvent } from '../core/types';

/**
 * Parse a ReadableStream of bytes as Server-Sent Events (SSE).
 *
 * Returns an async iterable that yields SSEEvent objects. Handles
 * partial chunks, multi-line data fields, and the standard SSE fields
 * (event, data, id, retry).
 *
 * The stream reader is released when the iterator is broken or returns.
 */
export async function* parseSSE(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<SSEEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by double newlines
      const parts = buffer.split('\n\n');
      // Keep the last (potentially incomplete) part in the buffer
      buffer = parts.pop()!;

      for (const part of parts) {
        const event = parseSSEEvent(part);
        if (event !== null) {
          yield event;
        }
      }
    }

    // Process any remaining data in the buffer
    if (buffer.trim().length > 0) {
      const event = parseSSEEvent(buffer);
      if (event !== null) {
        yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a single SSE event block into an SSEEvent object.
 * Returns null for empty blocks or comments.
 */
function parseSSEEvent(block: string): SSEEvent | null {
  const lines = block.split('\n');
  const fields: Partial<SSEEvent> = {};

  const dataLines: string[] = [];

  for (const line of lines) {
    // Skip empty lines and comments (lines starting with ':')
    if (line === '' || line.startsWith(':')) continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      // Field with no value
      const field = line.trim();
      if (field === 'data') {
        dataLines.push('');
      }
      continue;
    }

    const field = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1);

    // Remove leading space from value per SSE spec
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }

    switch (field) {
      case 'event':
        fields.type = value;
        break;
      case 'data':
        dataLines.push(value);
        break;
      case 'id':
        fields.id = value;
        break;
      case 'retry':
        fields.retry = parseInt(value, 10);
        break;
      // Ignore unknown fields
    }
  }

  // If there are no data lines, this is not a valid event
  if (dataLines.length === 0) return null;

  return {
    type: fields.type ?? 'message',
    data: dataLines.join('\n'),
    id: fields.id,
    retry: fields.retry,
  };
}

/**
 * Parse a ReadableStream of bytes as Newline-Delimited JSON (NDJSON).
 *
 * Returns an async iterable that yields parsed JSON objects of type T.
 * Empty lines are skipped. Partial lines are buffered until a newline
 * arrives.
 *
 * The stream reader is released when the iterator is broken or returns.
 */
export async function* parseNDJSON<T>(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<T> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop()!;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        yield JSON.parse(trimmed) as T;
      }
    }

    // Process any remaining data in the buffer
    const remaining = buffer.trim();
    if (remaining.length > 0) {
      yield JSON.parse(remaining) as T;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Create a progress-tracking wrapper around a ReadableStream.
 *
 * Returns a new ReadableStream that transparently passes through all
 * chunks while invoking `onProgress` for each chunk received, reporting
 * the number of bytes loaded so far.
 *
 * If `total` is provided (e.g., from Content-Length), `percent` will
 * reflect completion percentage; otherwise it defaults to 0.
 */
export function createProgressReader(
  body: ReadableStream<Uint8Array>,
  onProgress: (progress: DownloadProgress) => void,
  total?: number,
): ReadableStream<Uint8Array> {
  let loaded = 0;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }

          loaded += value.byteLength;

          const percent = total !== undefined && total > 0
            ? Math.round((loaded / total) * 100)
            : 0;

          onProgress({
            loaded,
            total: total !== undefined ? total : undefined,
            percent,
          });

          controller.enqueue(value);
        }
      } catch (err) {
        controller.error(err);
      } finally {
        reader.releaseLock();
      }
    },
  });
}
