/**
 * Pure SSE stream parsing helpers.
 */

import { describe, it, expect } from 'vitest';
import { parseSSEBuffer, extractDeltaContent, extractCompletedPieces } from '../sseStreamParser';

describe('sseStreamParser', () => {
  it('parseSSEBuffer and extractDeltaContent cover events, [DONE], remainder, noise, and deltas', () => {
    const multi =
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n';
    const { events } = parseSSEBuffer(multi);
    expect(events).toHaveLength(2);
    expect(extractDeltaContent(events[0].type === 'data' ? events[0].json : '')).toBe('Hello');

    expect(parseSSEBuffer('data: [DONE]\n\n').events[0]).toEqual({ type: 'done' });

    const partial = parseSSEBuffer(
      'data: {"choices":[{"delta":{"content":"A"}}]}\n\ndata: {"choi',
    );
    expect(partial.events).toHaveLength(1);
    expect(partial.remainder).toBe('data: {"choi');

    const withNoise = parseSSEBuffer(': comment\nevent: test\ndata: {"x":1}\n\n');
    expect(withNoise.events[0]).toEqual({ type: 'data', json: '{"x":1}' });
    expect(parseSSEBuffer('').events).toHaveLength(0);

    expect(extractDeltaContent('{"choices":[{"delta":{"content":"Hello"}}]}')).toBe('Hello');
    expect(extractDeltaContent('{"choices":[{"delta":{"role":"assistant"}}]}')).toBe('');
    expect(extractDeltaContent('{"choices":[],"usage":{"prompt_tokens":10}}')).toBe('');
    expect(extractDeltaContent('not json')).toBe('');
    expect(
      extractDeltaContent('{"choices":[{"delta":{"content":"héllo \\"wörld\\" 日本語"}}]}'),
    ).toBe('héllo "wörld" 日本語');
  });

  it('extractCompletedPieces handles full/partial buffers, escaping, knownIds, and empty', () => {
    const full = extractCompletedPieces('{"p1":"Hello","p2":"World"}', ['p1', 'p2']);
    expect(full.get('p1')).toBe('Hello');
    expect(full.get('p2')).toBe('World');

    const partial = extractCompletedPieces('{"p1":"Hello","p2":"Wor', ['p1', 'p2']);
    expect(partial.get('p1')).toBe('Hello');
    expect(partial.has('p2')).toBe(false);

    expect(extractCompletedPieces('{\n  "p1": "Value"\n}', ['p1']).get('p1')).toBe('Value');
    expect(extractCompletedPieces('{"p1":"He said \\"hi\\""}', ['p1']).get('p1')).toBe(
      'He said "hi"',
    );
    expect(
      extractCompletedPieces('{"p1":"val}ue,with{symbols","p2":"ok"}', ['p1', 'p2']).get('p1'),
    ).toBe('val}ue,with{symbols');

    const pieces = extractCompletedPieces('{"p1":"A","unknown":"B","p2":"C"}', ['p1', 'p2']);
    expect(pieces.size).toBe(2);
    expect(pieces.has('unknown')).toBe(false);
    expect(extractCompletedPieces('', ['p1']).size).toBe(0);
    expect(extractCompletedPieces('{"a.b[c]":"Val"}', ['a.b[c]']).get('a.b[c]')).toBe('Val');
  });
});
