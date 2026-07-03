/**
 * Pure SSE (Server-Sent Events) stream parsing helpers.
 *
 * OpenAI-compatible streaming responses use the SSE wire format:
 *   data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n
 *   data: {"choices":[{"delta":{"content":" world"}}]}\n\n
 *   data: [DONE]\n\n
 *
 * Events are separated by double-newline (`\n\n`). Each event has one or more
 * `data:` lines. The terminal sentinel is `data: [DONE]`.
 *
 * These helpers are pure (operate on strings / async iterables) so they can be
 * unit-tested without mocking `fetch`. The service layer wires them to the
 * real `ReadableStream` from a `fetch` response.
 */

/** A parsed SSE event: either a JSON data payload or the [DONE] sentinel. */
export type SSEEvent =
  | { type: 'data'; json: string }
  | { type: 'done' };

/**
 * Parse a buffer of SSE text into complete events, returning the events and
 * any trailing partial data (the remainder that doesn't end with `\n\n`).
 *
 * Pure: given the same buffer, always returns the same result.
 */
export function parseSSEBuffer(buffer: string): { events: SSEEvent[]; remainder: string } {
  const events: SSEEvent[] = [];
  // Split on double-newline; the last segment may be partial (no trailing \n\n).
  const segments = buffer.split('\n\n');
  const remainder = segments.pop() ?? '';

  for (const segment of segments) {
    const dataLines: string[] = [];
    for (const line of segment.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data:')) {
        dataLines.push(trimmed.slice(5).trimStart());
      }
      // Ignore comments (lines starting with ':') and event/id fields.
    }
    if (dataLines.length === 0) continue;
    const payload = dataLines.join('\n');
    if (payload === '[DONE]') {
      events.push({ type: 'done' });
    } else {
      events.push({ type: 'data', json: payload });
    }
  }

  return { events, remainder };
}

/**
 * Extract the content delta from a single SSE data JSON payload.
 * Returns the `choices[0].delta.content` string, or `''` if absent
 * (e.g. role-only deltas, usage chunks). Pure + tolerant.
 */
export function extractDeltaContent(jsonPayload: string): string {
  try {
    const parsed = JSON.parse(jsonPayload);
    const delta = parsed?.choices?.[0]?.delta;
    if (delta && typeof delta.content === 'string') {
      return delta.content;
    }
    return '';
  } catch {
    // Malformed JSON payload — tolerate and return empty (don't crash the stream).
    return '';
  }
}

/**
 * Extract completed `"id": "value"` pairs from a partial JSON buffer.
 *
 * As streaming content accumulates into a JSON object string, this function
 * scans for key-value pairs whose value is fully formed (the closing quote +
 * following `,` or `}` are present). This enables incremental per-paragraph
 * fill: as soon as a paragraph's translation is complete in the buffer, it
 * can be emitted to the UI.
 *
 * Only IDs present in `knownIds` are extracted (we know the expected keys
 * up-front from the request).
 *
 * Pure: given the same buffer + knownIds, always returns the same result.
 */
export function extractCompletedPieces(
  buffer: string,
  knownIds: string[],
): Map<string, string> {
  const result = new Map<string, string>();
  for (const id of knownIds) {
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match "id":"value" or "id": "value" where the value is complete
    // (followed by optional whitespace + comma or closing brace).
    const regex = new RegExp(
      `"${escapedId}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"(?:\\s*[,}])`,
    );
    const match = buffer.match(regex);
    if (match) {
      // Unescape the captured raw JSON string content.
      try {
        result.set(id, JSON.parse(`"${match[1]}"`));
      } catch {
        // Malformed escape sequence — skip this piece for now; it may complete
        // correctly as more data arrives.
      }
    }
  }
  return result;
}
