/**
 * Tests for the pure SSE stream parsing helpers (lib/sseStreamParser.ts).
 *
 * Phase 2 Task 1 of pdf-perf-ux_20260703. These are pure functions operating
 * on strings — no fetch/ReadableStream mocking needed.
 */

import { describe, it, expect } from 'vitest';
import {
  parseSSEBuffer,
  extractDeltaContent,
  extractCompletedPieces,
} from '../sseStreamParser';

describe('parseSSEBuffer', () => {
  it('parses a single complete SSE data event', () => {
    const buffer = 'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n';
    const { events, remainder } = parseSSEBuffer(buffer);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'data', json: '{"choices":[{"delta":{"content":"Hi"}}]}' });
    expect(remainder).toBe('');
  });

  it('parses multiple events separated by double newlines', () => {
    const buffer =
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n';
    const { events } = parseSSEBuffer(buffer);
    expect(events).toHaveLength(2);
    expect(extractDeltaContent(events[0].type === 'data' ? events[0].json : '')).toBe('Hello');
    expect(extractDeltaContent(events[1].type === 'data' ? events[1].json : '')).toBe(' world');
  });

  it('detects the [DONE] sentinel', () => {
    const buffer = 'data: [DONE]\n\n';
    const { events } = parseSSEBuffer(buffer);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'done' });
  });

  it('returns partial trailing data as remainder (no trailing \\n\\n)', () => {
    const buffer = 'data: {"choices":[{"delta":{"content":"A"}}]}\n\ndata: {"choi';
    const { events, remainder } = parseSSEBuffer(buffer);
    expect(events).toHaveLength(1);
    expect(remainder).toBe('data: {"choi');
  });

  it('handles multi-line data fields and ignores comment/event/id lines', () => {
    const multiline = 'data: line1\ndata: line2\n\n';
    const { events: mlEvents } = parseSSEBuffer(multiline);
    expect(mlEvents[0]).toEqual({ type: 'data', json: 'line1\nline2' });

    const withNoise = ': comment\nevent: test\ndata: {"x":1}\n\n';
    const { events: noiseEvents } = parseSSEBuffer(withNoise);
    expect(noiseEvents).toHaveLength(1);
    expect(noiseEvents[0]).toEqual({ type: 'data', json: '{"x":1}' });
  });

  it('returns empty events for empty buffer', () => {
    const { events, remainder } = parseSSEBuffer('');
    expect(events).toHaveLength(0);
    expect(remainder).toBe('');
  });

  it('handles empty data payload gracefully', () => {
    const buffer = 'data: \n\n';
    const { events } = parseSSEBuffer(buffer);
    // Empty data payload is not [DONE], so it's treated as data with empty json.
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'data', json: '' });
  });
});

describe('extractDeltaContent', () => {
  it('extracts the content delta from a standard OpenAI chunk', () => {
    const json = '{"choices":[{"delta":{"content":"Hello"}}]}';
    expect(extractDeltaContent(json)).toBe('Hello');
  });

  it('returns empty string for role-only deltas (no content field)', () => {
    const json = '{"choices":[{"delta":{"role":"assistant"}}]}';
    expect(extractDeltaContent(json)).toBe('');
  });

  it('returns empty string for usage/stats chunks', () => {
    const json = '{"choices":[],"usage":{"prompt_tokens":10}}';
    expect(extractDeltaContent(json)).toBe('');
  });

  it('tolerates malformed JSON without throwing', () => {
    expect(extractDeltaContent('not json')).toBe('');
    expect(extractDeltaContent('{broken')).toBe('');
  });

  it('handles content with special characters and unicode', () => {
    // JSON string must escape inner quotes with \\" (literal backslash-quote in JSON).
    const json = '{"choices":[{"delta":{"content":"héllo \\"wörld\\" 日本語"}}]}';
    expect(extractDeltaContent(json)).toBe('héllo "wörld" 日本語');
  });
});

describe('extractCompletedPieces', () => {
  it('extracts a completed key-value pair from a full JSON object', () => {
    const buffer = '{"p1":"Hello","p2":"World"}';
    const pieces = extractCompletedPieces(buffer, ['p1', 'p2']);
    expect(pieces.get('p1')).toBe('Hello');
    expect(pieces.get('p2')).toBe('World');
  });

  it('extracts only fully-formed pairs from a partial buffer', () => {
    // p1 is complete (has closing quote + comma); p2 is incomplete (no closing quote yet).
    const buffer = '{"p1":"Hello","p2":"Wor';
    const pieces = extractCompletedPieces(buffer, ['p1', 'p2']);
    expect(pieces.get('p1')).toBe('Hello');
    expect(pieces.has('p2')).toBe(false);
  });

  it('extracts a pair followed by a closing brace (last entry)', () => {
    const buffer = '{"p1":"Done"}';
    const pieces = extractCompletedPieces(buffer, ['p1']);
    expect(pieces.get('p1')).toBe('Done');
  });

  it('handles whitespace after the colon (pretty-printed JSON)', () => {
    const buffer = '{\n  "p1": "Value"\n}';
    const pieces = extractCompletedPieces(buffer, ['p1']);
    expect(pieces.get('p1')).toBe('Value');
  });

  it('correctly unescapes embedded quotes and backslashes in values', () => {
    const quotes = '{"p1":"He said \\"hi\\""}';
    expect(extractCompletedPieces(quotes, ['p1']).get('p1')).toBe('He said "hi"');

    const backslashes = '{"p1":"path\\\\to\\\\file"}';
    expect(extractCompletedPieces(backslashes, ['p1']).get('p1')).toBe('path\\to\\file');
  });

  it('handles values containing braces and commas (inside JSON strings)', () => {
    const buffer = '{"p1":"val}ue,with{symbols","p2":"ok"}';
    const pieces = extractCompletedPieces(buffer, ['p1', 'p2']);
    expect(pieces.get('p1')).toBe('val}ue,with{symbols');
    expect(pieces.get('p2')).toBe('ok');
  });

  it('returns empty map when no pairs are complete', () => {
    const buffer = '{"p1":"par';
    const pieces = extractCompletedPieces(buffer, ['p1']);
    expect(pieces.size).toBe(0);
  });

  it('returns empty map when buffer is empty', () => {
    const pieces = extractCompletedPieces('', ['p1']);
    expect(pieces.size).toBe(0);
  });

  it('only extracts IDs in the knownIds list (ignores unknown keys)', () => {
    const buffer = '{"p1":"A","unknown":"B","p2":"C"}';
    const pieces = extractCompletedPieces(buffer, ['p1', 'p2']);
    expect(pieces.size).toBe(2);
    expect(pieces.has('unknown')).toBe(false);
  });

  it('handles IDs with regex-special characters', () => {
    const buffer = '{"a.b[c]":"Val"}';
    const pieces = extractCompletedPieces(buffer, ['a.b[c]']);
    expect(pieces.get('a.b[c]')).toBe('Val');
  });

  it('does not re-extract a pair whose value changed in a longer buffer', () => {
    // Once complete, the pair stays the same value even as more text arrives.
    const buffer1 = '{"p1":"Done","p2":"';
    const pieces1 = extractCompletedPieces(buffer1, ['p1', 'p2']);
    expect(pieces1.get('p1')).toBe('Done');

    const buffer2 = '{"p1":"Done","p2":"Also"}';
    const pieces2 = extractCompletedPieces(buffer2, ['p1', 'p2']);
    expect(pieces2.get('p1')).toBe('Done');
    expect(pieces2.get('p2')).toBe('Also');
  });
});
