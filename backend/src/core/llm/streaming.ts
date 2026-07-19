/**
 * SSE (Server-Sent Events) stream parsing utilities.
 * Used by LLM adapters to parse streaming responses from OpenAI-compatible,
 * Anthropic, and Google Gemini APIs.
 */

const textDecoder = new TextDecoder();

/**
 * Parse an SSE stream from a ReadableStream reader.
 * Yields each "data" chunk as a string.
 * Automatically handles multi-byte UTF-8 characters across chunk boundaries
 * by buffering incomplete sequences.
 */
export async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<string> {
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = textDecoder.decode(value, { stream: true });
      buffer += chunk;

      const lines = buffer.split('\n');
      // Keep the last potentially incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data === '[DONE]') return;
          yield data;
        } else if (trimmed.startsWith('data:')) {
          const data = trimmed.slice(5);
          if (data === '[DONE]') return;
          yield data;
        }
      }
    }

    // Flush remaining buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data: ')) {
        const data = trimmed.slice(6);
        if (data !== '[DONE]') yield data;
      } else if (trimmed.startsWith('data:')) {
        const data = trimmed.slice(5);
        if (data !== '[DONE]') yield data;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Create standard SSE request headers for streaming LLM API calls.
 */
export function createSSEHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  };
}