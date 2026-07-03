/**
 * Tests for the in-memory PDF page cache helpers.
 *
 * Validates the simple get/set/clear lifecycle. The cache is module-scoped,
 * so the `clearMemoryCache()` call in `beforeEach` is essential.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ExtensionSettings } from '@/types/config';
import { DEFAULT_SETTINGS } from '@/types/config';
import type { PdfStreamPortMessage } from '@/types/messages';
import { PDF_STREAM_PORT } from '@/types/messages';
import {
  getMemoryCachedPage,
  setMemoryCachedPage,
  clearMemoryCache,
  translateParagraphs,
  MAX_CACHED_DOCUMENTS,
} from '../pdfTranslation';
import { loadSettings } from '@/lib/config';
import { cacheTranslation } from '@/services/cacheManager';

vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn(),
}));

vi.mock('@/services/cacheManager', () => ({
  cacheTranslation: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  clearMemoryCache();
  vi.mocked(loadSettings).mockResolvedValue({
    ...DEFAULT_SETTINGS,
    sourceLanguage: 'en',
    targetLanguage: 'vi',
    maxBatchChars: 16,
  } as ExtensionSettings);
  vi.mocked(cacheTranslation).mockResolvedValue(undefined);
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
    const action = (message as { action: string }).action;
    if (action === 'CLASSIFY_PDF_PARAGRAPHS') {
      // Default: classify everything as prose. Individual tests override this.
      const pieces = (message as { paragraphs: Array<{ id: string }> }).paragraphs;
      return {
        success: true,
        labels: Object.fromEntries(pieces.map(({ id }) => [id, 'prose'])),
      };
    }
    // translate
    const pieces = (message as { pieces: Array<{ id: string }> }).pieces;
    return {
      success: true,
      results: pieces.map(({ id }) => ({ id, translatedText: `translated-${id}` })),
    };
  });
});

describe('pdfTranslation memory cache', () => {
  it('returns null when nothing is cached', () => {
    expect(getMemoryCachedPage('https://example.com/a.pdf', 1, 'en', 'vi')).toBeNull();
  });

  it('round-trips a page translation through the cache', () => {
    const map = new Map<string, string>([
      ['1-0', 'Xin chào'],
      ['1-1', 'Thế giới'],
    ]);
    setMemoryCachedPage('https://example.com/a.pdf', 1, map, 'en', 'vi');
    const cached = getMemoryCachedPage('https://example.com/a.pdf', 1, 'en', 'vi');
    expect(cached).not.toBeNull();
    expect(cached?.get('1-0')).toBe('Xin chào');
    expect(cached?.get('1-1')).toBe('Thế giới');
  });

  it('isolates pages from each other', () => {
    const page1 = new Map<string, string>([['1-0', 'Page one']]);
    const page2 = new Map<string, string>([['2-0', 'Page two']]);
    setMemoryCachedPage('https://example.com/a.pdf', 1, page1, 'en', 'vi');
    setMemoryCachedPage('https://example.com/a.pdf', 2, page2, 'en', 'vi');
    expect(getMemoryCachedPage('https://example.com/a.pdf', 1, 'en', 'vi')?.get('1-0')).toBe('Page one');
    expect(getMemoryCachedPage('https://example.com/a.pdf', 2, 'en', 'vi')?.get('2-0')).toBe('Page two');
  });

  it('isolates caches by (url, source, target) tuple', () => {
    const map = new Map<string, string>([['1-0', 'Hola']]);
    setMemoryCachedPage('https://example.com/a.pdf', 1, map, 'en', 'es');
    setMemoryCachedPage('https://example.com/a.pdf', 1, map, 'en', 'vi');
    expect(getMemoryCachedPage('https://example.com/a.pdf', 1, 'en', 'es')?.get('1-0')).toBe('Hola');
    expect(getMemoryCachedPage('https://example.com/a.pdf', 1, 'en', 'vi')?.get('1-0')).toBe('Hola');
    // Different document URLs are independent
    setMemoryCachedPage('https://example.com/b.pdf', 1, map, 'en', 'es');
    expect(getMemoryCachedPage('https://example.com/b.pdf', 1, 'en', 'es')).not.toBeNull();
  });

  it('returns a copy, not the original map reference', () => {
    const map = new Map<string, string>([['1-0', 'Original']]);
    setMemoryCachedPage('https://example.com/a.pdf', 1, map, 'en', 'vi');
    const cached = getMemoryCachedPage('https://example.com/a.pdf', 1, 'en', 'vi');
    // Mutating the cached map should not affect the originally stored map
    cached?.set('1-0', 'Mutated');
    expect(map.get('1-0')).toBe('Original');
  });

  it('clearMemoryCache empties every entry', () => {
    setMemoryCachedPage('https://example.com/a.pdf', 1, new Map([['1-0', 'X']]), 'en', 'vi');
    setMemoryCachedPage('https://example.com/b.pdf', 1, new Map([['1-0', 'Y']]), 'en', 'vi');
    clearMemoryCache();
    expect(getMemoryCachedPage('https://example.com/a.pdf', 1, 'en', 'vi')).toBeNull();
    expect(getMemoryCachedPage('https://example.com/b.pdf', 1, 'en', 'vi')).toBeNull();
  });

  it('splits uncached paragraphs into maxBatchChars-limited runtime messages', async () => {
    const results = await translateParagraphs(
      [
        { pageNumber: 1, paragraph: { id: '1-0', text: 'aaaaaaaa', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
        { pageNumber: 1, paragraph: { id: '1-1', text: 'bbbbbbbb', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
        { pageNumber: 1, paragraph: { id: '1-2', text: 'cccccccc', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
      ],
      'https://example.com/a.pdf',
    );

    // Only the 'translate' calls count toward batching; the coordinator also
    // issues one CLASSIFY_PDF_PARAGRAPHS call before translating.
    const translateMessages = vi.mocked(chrome.runtime.sendMessage).mock.calls
      .map(([message]) => message as unknown as { action: string; pieces: Array<{ id: string; text: string }> })
      .filter((message) => message.action === 'translate');
    expect(translateMessages).toHaveLength(2);
    expect(translateMessages.map((message) => message.pieces.map(({ id }) => id))).toEqual([
      ['1-0', '1-1'],
      ['1-2'],
    ]);
    for (const message of translateMessages) {
      const chars = message.pieces.reduce((sum, piece) => sum + piece.text.length, 0);
      expect(chars).toBeLessThanOrEqual(16);
    }
    expect(results.map(({ id }) => id)).toEqual(['1-0', '1-1', '1-2']);
  });

  it('does not perform viewer-side IndexedDB cache lookup (background handles it)', async () => {
    await translateParagraphs(
      [
        { pageNumber: 1, paragraph: { id: '1-0', text: 'hello', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
      ],
      'https://example.com/a.pdf',
    );

    // Only cacheTranslation (write-through) should be called, never getCachedTranslation.
    // The mock factory only defines cacheTranslation — if getCachedTranslation were
    // still imported by pdfTranslation.ts, Vitest would throw at module load time.
    expect(cacheTranslation).toHaveBeenCalled();
    // The coordinator issues one CLASSIFY_PDF_PARAGRAPHS call plus one 'translate'
    // call. Assert specifically that exactly one translate call happened (the
    // intent of this test is the cache-lookup invariant, not the call count).
    const translateMessages = vi.mocked(chrome.runtime.sendMessage).mock.calls
      .map(([message]) => message as unknown as { action: string })
      .filter((message) => message.action === 'translate');
    expect(translateMessages).toHaveLength(1);
  });

  it(`evicts the oldest document when cache exceeds MAX_CACHED_DOCUMENTS (${MAX_CACHED_DOCUMENTS})`, () => {
    // Fill cache to exactly the limit
    for (let i = 0; i < MAX_CACHED_DOCUMENTS; i++) {
      setMemoryCachedPage(`https://example.com/doc-${i}.pdf`, 1, new Map([['p', `text-${i}`]]), 'en', 'vi');
    }

    // All 10 should be present
    for (let i = 0; i < MAX_CACHED_DOCUMENTS; i++) {
      expect(getMemoryCachedPage(`https://example.com/doc-${i}.pdf`, 1, 'en', 'vi')).not.toBeNull();
    }

    // Add one more — this should evict doc-0 (the oldest)
    setMemoryCachedPage('https://example.com/doc-new.pdf', 1, new Map([['p', 'new']]), 'en', 'vi');

    // doc-0 should be evicted
    expect(getMemoryCachedPage('https://example.com/doc-0.pdf', 1, 'en', 'vi')).toBeNull();

    // doc-1 through doc-9 should still be present
    for (let i = 1; i < MAX_CACHED_DOCUMENTS; i++) {
      expect(getMemoryCachedPage(`https://example.com/doc-${i}.pdf`, 1, 'en', 'vi')).not.toBeNull();
    }

    // The new entry should be present
    expect(getMemoryCachedPage('https://example.com/doc-new.pdf', 1, 'en', 'vi')?.get('p')).toBe('new');
  });

  it('keeps math paragraphs verbatim and does not send them to the translator', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const action = (message as { action: string }).action;
      if (action === 'CLASSIFY_PDF_PARAGRAPHS') {
        const pieces = (message as { paragraphs: Array<{ id: string }> }).paragraphs;
        return {
          success: true,
          labels: Object.fromEntries(pieces.map(({ id }) => [id, 'prose'])),
        };
      }
      const pieces = (message as { pieces: Array<{ id: string }> }).pieces;
      return {
        success: true,
        results: pieces.map(({ id }) => ({ id, translatedText: `translated-${id}` })),
      };
    });

    const results = await translateParagraphs(
      [
        // Pure math — should be kept verbatim, never sent to translator
        { pageNumber: 1, paragraph: { id: '1-0', text: 'f(x) = x² + 2x + 1', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
        // Prose — should be translated
        { pageNumber: 1, paragraph: { id: '1-1', text: 'This is a normal sentence about the model.', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
      ],
      'https://example.com/a.pdf',
    );

    // Math paragraph: translatedText equals its original source text
    const mathResult = results.find((r) => r.id === '1-0');
    expect(mathResult?.translatedText).toBe('f(x) = x² + 2x + 1');

    // Prose paragraph: translated normally
    const proseResult = results.find((r) => r.id === '1-1');
    expect(proseResult?.translatedText).toBe('translated-1-1');

    // The translator must NOT have received the math paragraph. Inspect every
    // sendMessage call whose action is 'translate' and collect their piece ids.
    const calls = vi.mocked(chrome.runtime.sendMessage).mock.calls;
    const translateCalls = calls.filter(
      ([msg]) => (msg as unknown as { action: string }).action === 'translate',
    );
    const translatedIds = translateCalls.flatMap(([msg]) =>
      (msg as unknown as { pieces: Array<{ id: string }> }).pieces.map((p) => p.id),
    );
    expect(translatedIds).not.toContain('1-0');
    expect(translatedIds).toContain('1-1');
  });

  it('keeps figure-labeled paragraphs verbatim', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const action = (message as { action: string }).action;
      if (action === 'CLASSIFY_PDF_PARAGRAPHS') {
        // Mark the short label as a figure axis label
        return { success: true, labels: { '1-0': 'figure', '1-1': 'prose' } };
      }
      const pieces = (message as { pieces: Array<{ id: string }> }).pieces;
      return {
        success: true,
        results: pieces.map(({ id }) => ({ id, translatedText: `translated-${id}` })),
      };
    });

    const results = await translateParagraphs(
      [
        { pageNumber: 1, paragraph: { id: '1-0', text: 'Accuracy', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
        { pageNumber: 1, paragraph: { id: '1-1', text: 'The model achieves high accuracy.', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
      ],
      'https://example.com/a.pdf',
    );

    expect(results.find((r) => r.id === '1-0')?.translatedText).toBe('Accuracy');
    expect(results.find((r) => r.id === '1-1')?.translatedText).toBe('translated-1-1');
  });

  it('fail-opens to translating all non-math when classification fails', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const action = (message as { action: string }).action;
      if (action === 'CLASSIFY_PDF_PARAGRAPHS') {
        return { success: false, error: 'network down' };
      }
      const pieces = (message as { pieces: Array<{ id: string }> }).pieces;
      return {
        success: true,
        results: pieces.map(({ id }) => ({ id, translatedText: `translated-${id}` })),
      };
    });

    const results = await translateParagraphs(
      [
        // Math still protected by rules, even though LLM is down
        { pageNumber: 1, paragraph: { id: '1-0', text: 'f(x) = x²', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
        { pageNumber: 1, paragraph: { id: '1-1', text: 'Normal prose sentence here.', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
      ],
      'https://example.com/a.pdf',
    );

    // Math: rule-based protection intact
    expect(results.find((r) => r.id === '1-0')?.translatedText).toBe('f(x) = x²');
    // Prose: translated despite classification failure (fail-open)
    expect(results.find((r) => r.id === '1-1')?.translatedText).toBe('translated-1-1');
  });

  it('defaults to prose when the classifier omits an id', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const action = (message as { action: string }).action;
      if (action === 'CLASSIFY_PDF_PARAGRAPHS') {
        // Classifier returns labels for only one of two paragraphs
        return { success: true, labels: { '1-0': 'prose' } };
      }
      const pieces = (message as { pieces: Array<{ id: string }> }).pieces;
      return {
        success: true,
        results: pieces.map(({ id }) => ({ id, translatedText: `translated-${id}` })),
      };
    });

    const results = await translateParagraphs(
      [
        { pageNumber: 1, paragraph: { id: '1-0', text: 'First paragraph of prose.', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
        { pageNumber: 1, paragraph: { id: '1-1', text: 'Second paragraph of prose.', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
      ],
      'https://example.com/a.pdf',
    );

    // Missing label → defaults to prose → translated
    expect(results.find((r) => r.id === '1-1')?.translatedText).toBe('translated-1-1');
  });

  it('skips the classification call entirely when all paragraphs are math', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const action = (message as { action: string }).action;
      if (action === 'CLASSIFY_PDF_PARAGRAPHS') {
        throw new Error('classification should not have been called');
      }
      const pieces = (message as { pieces: Array<{ id: string }> }).pieces;
      return {
        success: true,
        results: pieces.map(({ id }) => ({ id, translatedText: `translated-${id}` })),
      };
    });

    const results = await translateParagraphs(
      [
        { pageNumber: 1, paragraph: { id: '1-0', text: 'f(x) = x²', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
        { pageNumber: 1, paragraph: { id: '1-1', text: 'α + β = γ', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
      ],
      'https://example.com/a.pdf',
    );

    // Both kept verbatim
    expect(results.find((r) => r.id === '1-0')?.translatedText).toBe('f(x) = x²');
    expect(results.find((r) => r.id === '1-1')?.translatedText).toBe('α + β = γ');

    // No classification call was made
    const classifyCalls = vi.mocked(chrome.runtime.sendMessage).mock.calls.filter(
      ([msg]) => (msg as unknown as { action: string }).action === 'CLASSIFY_PDF_PARAGRAPHS',
    );
    expect(classifyCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Phase 2 Task 3: Streaming translation port tests
// ---------------------------------------------------------------------------

describe('streaming translation port (Phase 2)', () => {
  /** Messages the fake background will push through the port. */
  let outgoingMessages: PdfStreamPortMessage[];

  /** Create a fake chrome.runtime.Port that emits `outgoingMessages` when the
   *  viewer posts its request. Mirrors the real port contract:
   *  onMessage/onDisconnect listeners + postMessage + disconnect. */
  function createFakePort() {
    const messageListeners: Array<(msg: PdfStreamPortMessage) => void> = [];
    const disconnectListeners: Array<() => void> = [];
    return {
      name: PDF_STREAM_PORT,
      onMessage: {
        addListener: vi.fn((fn: (msg: PdfStreamPortMessage) => void) => {
          messageListeners.push(fn);
        }),
      },
      onDisconnect: {
        addListener: vi.fn((fn: () => void) => {
          disconnectListeners.push(fn);
        }),
      },
      postMessage: vi.fn((msg: PdfStreamPortMessage) => {
        if (msg.type === 'request') {
          // Emit outgoing messages asynchronously (mirrors real port behavior)
          setTimeout(() => {
            for (const m of outgoingMessages) {
              messageListeners.forEach((l) => l(m));
            }
          }, 0);
        }
      }),
      disconnect: vi.fn(() => {
        disconnectListeners.forEach((l) => l());
      }),
    };
  }

  beforeEach(() => {
    outgoingMessages = [];
    // Use a larger batch size so all paragraphs fit in one streaming batch
    vi.mocked(loadSettings).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      maxBatchChars: 5000,
    } as ExtensionSettings);
    // Ensure chrome.runtime.connect is a mock (not in vitest.setup.ts by default)
    if (!vi.isMockFunction(chrome.runtime.connect)) {
      chrome.runtime.connect = vi.fn();
    }
    vi.mocked(chrome.runtime.connect).mockImplementation(() => {
      return createFakePort() as unknown as chrome.runtime.Port;
    });
  });

  it('emits onPiece for each streamed paragraph and resolves with final results', async () => {
    const pieces = [
      { id: 'p1', text: 'Hello world this is long enough.' },
      { id: 'p2', text: 'Second paragraph of prose text.' },
    ];
    outgoingMessages = [
      { type: 'piece', id: 'p1', text: 'Xin chào' },
      { type: 'piece', id: 'p2', text: 'Thế giới' },
      {
        type: 'done',
        results: [
          { id: 'p1', translatedText: 'Xin chào' },
          { id: 'p2', translatedText: 'Thế giới' },
        ],
      },
    ];

    const onPiece = vi.fn();
    const results = await translateParagraphs(
      pieces.map((p) => ({
        pageNumber: 1,
        paragraph: { id: p.id, text: p.text, fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 },
      })),
      'https://example.com/a.pdf',
      onPiece,
    );

    // onPiece called for each streamed piece
    expect(onPiece).toHaveBeenCalledWith('p1', 'Xin chào');
    expect(onPiece).toHaveBeenCalledWith('p2', 'Thế giới');
    expect(onPiece).toHaveBeenCalledTimes(2);

    // Final results match the done message
    expect(results.map((r) => r.id)).toContain('p1');
    expect(results.map((r) => r.id)).toContain('p2');
    expect(results.find((r) => r.id === 'p1')?.translatedText).toBe('Xin chào');
    expect(results.find((r) => r.id === 'p2')?.translatedText).toBe('Thế giới');

    // Streaming port was used (connect called), not sendMessage for translate
    const translateMessages = vi.mocked(chrome.runtime.sendMessage).mock.calls
      .map(([message]) => message as unknown as { action: string })
      .filter((message) => message.action === 'translate');
    // Only the classify call should go through sendMessage; translate goes via port
    expect(translateMessages).toHaveLength(0);
  });

  it('falls back to non-streaming when port sends an error', async () => {
    const pieces = [
      { id: 'p1', text: 'Hello world this is long enough.' },
    ];
    outgoingMessages = [
      { type: 'error', error: 'Streaming not supported' },
    ];

    const onPiece = vi.fn();
    // The sendMessage mock from the outer beforeEach still returns translated-{id}
    const results = await translateParagraphs(
      pieces.map((p) => ({
        pageNumber: 1,
        paragraph: { id: p.id, text: p.text, fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 },
      })),
      'https://example.com/a.pdf',
      onPiece,
    );

    // onPiece was NOT called (stream failed before any piece)
    expect(onPiece).not.toHaveBeenCalled();

    // Fell back to non-streaming translate
    const translateMessages = vi.mocked(chrome.runtime.sendMessage).mock.calls
      .map(([message]) => message as unknown as { action: string })
      .filter((message) => message.action === 'translate');
    expect(translateMessages).toHaveLength(1);

    // Results came from the non-streaming fallback
    expect(results.find((r) => r.id === 'p1')?.translatedText).toBe('translated-p1');
  });

  it('falls back to non-streaming when port disconnects unexpectedly', async () => {
    const pieces = [
      { id: 'p1', text: 'Hello world this is long enough.' },
    ];
    // No done/error messages — port just disconnects
    outgoingMessages = [];

    // Override connect to simulate immediate disconnect after postMessage
    vi.mocked(chrome.runtime.connect).mockImplementation(() => {
      const port = createFakePort();
      // Override postMessage to trigger disconnect instead of emitting messages
      const originalPostMessage = port.postMessage;
      port.postMessage = vi.fn((msg: PdfStreamPortMessage) => {
        if (msg.type === 'request') {
          // Simulate port disconnecting before any message arrives
          setTimeout(() => {
            (port.onDisconnect.addListener as unknown as { mock: { calls: Array<Array<() => void>> } }).mock.calls.forEach(([fn]) => fn());
          }, 0);
        }
        void originalPostMessage;
      });
      return port as unknown as chrome.runtime.Port;
    });

    const onPiece = vi.fn();
    const results = await translateParagraphs(
      pieces.map((p) => ({
        pageNumber: 1,
        paragraph: { id: p.id, text: p.text, fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 },
      })),
      'https://example.com/a.pdf',
      onPiece,
    );

    // Fell back to non-streaming
    const translateMessages = vi.mocked(chrome.runtime.sendMessage).mock.calls
      .map(([message]) => message as unknown as { action: string })
      .filter((message) => message.action === 'translate');
    expect(translateMessages).toHaveLength(1);
    expect(results.find((r) => r.id === 'p1')?.translatedText).toBe('translated-p1');
  });

  it('does not use the streaming port when onPiece is not provided', async () => {
    vi.mocked(chrome.runtime.connect).mockImplementation(() => {
      throw new Error('connect should not be called without onPiece');
    });

    const results = await translateParagraphs(
      [
        { pageNumber: 1, paragraph: { id: 'p1', text: 'Hello world this is long enough.', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
      ],
      'https://example.com/a.pdf',
    );

    // Non-streaming path used
    const translateMessages = vi.mocked(chrome.runtime.sendMessage).mock.calls
      .map(([message]) => message as unknown as { action: string })
      .filter((message) => message.action === 'translate');
    expect(translateMessages).toHaveLength(1);
    expect(results.find((r) => r.id === 'p1')?.translatedText).toBe('translated-p1');
  });

  it('partial pieces before an error are discarded by the fallback', async () => {
    const pieces = [
      { id: 'p1', text: 'Hello world this is long enough.' },
      { id: 'p2', text: 'Second paragraph of prose text.' },
    ];
    // Stream emits p1 then errors — p1 piece should be discarded, both come from fallback
    outgoingMessages = [
      { type: 'piece', id: 'p1', text: 'Partial translation' },
      { type: 'error', error: 'stream truncated' },
    ];

    const onPiece = vi.fn();
    const results = await translateParagraphs(
      pieces.map((p) => ({
        pageNumber: 1,
        paragraph: { id: p.id, text: p.text, fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 },
      })),
      'https://example.com/a.pdf',
      onPiece,
    );

    // p1 piece WAS emitted during streaming (before the error)
    expect(onPiece).toHaveBeenCalledWith('p1', 'Partial translation');

    // But final results come from the non-streaming fallback (overwriting the partial)
    expect(results.find((r) => r.id === 'p1')?.translatedText).toBe('translated-p1');
    expect(results.find((r) => r.id === 'p2')?.translatedText).toBe('translated-p2');
  });
});

// ---------------------------------------------------------------------------
// Phase 4 Task: Provider-configurable batch size (resolution chain)
// ---------------------------------------------------------------------------

describe('provider-configurable batch size resolution', () => {
  /** Minimal PdfParagraph builder. */
  function para(id: string, text: string) {
    return { id, text, fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 };
  }

  /** Build settings that override the active pool provider's batch knobs. */
  function settingsWithProviderOverride(overrides: {
    maxBatchChars?: number;
    maxTextGroupCount?: number;
    globalMaxBatchChars?: number;
  }): ExtensionSettings {
    const base = {
      ...DEFAULT_SETTINGS,
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      maxBatchChars: overrides.globalMaxBatchChars ?? DEFAULT_SETTINGS.maxBatchChars,
    } as ExtensionSettings;
    const first = base.providers[0];
    if (!first) return base;
    base.providers = [
      {
        ...first,
        ...(overrides.maxBatchChars !== undefined ? { maxBatchChars: overrides.maxBatchChars } : {}),
        ...(overrides.maxTextGroupCount !== undefined ? { maxTextGroupCount: overrides.maxTextGroupCount } : {}),
      },
    ];
    return base;
  }

  /** Collect every 'translate' sendMessage call's pieces. */
  function translateCalls(): Array<Array<{ id: string; text: string }>> {
    return vi.mocked(chrome.runtime.sendMessage).mock.calls
      .map(([message]) => message as unknown as { action: string; pieces: Array<{ id: string; text: string }> })
      .filter((message) => message.action === 'translate')
      .map((message) => message.pieces);
  }

  it('uses the provider maxBatchChars override instead of the global default', async () => {
    // Global budget is huge (5000); provider override is tiny (8). If the
    // override wins, batches cap at 8 chars (2 paragraphs of 4). If the global
    // won, all 4 (16 chars) would fit in a single batch.
    vi.mocked(loadSettings).mockResolvedValue(
      settingsWithProviderOverride({ maxBatchChars: 8, globalMaxBatchChars: 5000 }),
    );

    await translateParagraphs(
      [
        { pageNumber: 1, paragraph: para('1-0', 'aaaa') },
        { pageNumber: 1, paragraph: para('1-1', 'bbbb') },
        { pageNumber: 1, paragraph: para('1-2', 'cccc') },
        { pageNumber: 1, paragraph: para('1-3', 'dddd') },
      ],
      'https://example.com/a.pdf',
    );

    const calls = translateCalls();
    expect(calls).toHaveLength(2);
    expect(calls.map((pieces) => pieces.map((p) => p.id))).toEqual([
      ['1-0', '1-1'],
      ['1-2', '1-3'],
    ]);
    for (const pieces of calls) {
      const chars = pieces.reduce((sum, p) => sum + p.text.length, 0);
      expect(chars).toBeLessThanOrEqual(8);
    }
  });

  it('falls back to the global default when provider maxBatchChars is 0', async () => {
    // Provider explicitly sets 0 (= use global). Global is 16. Four 8-char
    // paragraphs → 2 batches of 2 (16 chars each), matching the global budget.
    vi.mocked(loadSettings).mockResolvedValue(
      settingsWithProviderOverride({ maxBatchChars: 0, globalMaxBatchChars: 16 }),
    );

    await translateParagraphs(
      [
        { pageNumber: 1, paragraph: para('1-0', 'aaaaaaaa') },
        { pageNumber: 1, paragraph: para('1-1', 'bbbbbbbb') },
        { pageNumber: 1, paragraph: para('1-2', 'cccccccc') },
        { pageNumber: 1, paragraph: para('1-3', 'dddddddd') },
      ],
      'https://example.com/a.pdf',
    );

    const calls = translateCalls();
    expect(calls).toHaveLength(2);
    expect(calls.map((pieces) => pieces.map((p) => p.id))).toEqual([
      ['1-0', '1-1'],
      ['1-2', '1-3'],
    ]);
  });

  it('falls back to the global default when provider maxBatchChars is undefined (migration)', async () => {
    // No provider override at all (mirrors pre-existing settings that never
    // had the new field). Global is 16 → same 2-batch behavior as legacy.
    vi.mocked(loadSettings).mockResolvedValue(
      settingsWithProviderOverride({ globalMaxBatchChars: 16 }),
    );

    await translateParagraphs(
      [
        { pageNumber: 1, paragraph: para('1-0', 'aaaaaaaa') },
        { pageNumber: 1, paragraph: para('1-1', 'bbbbbbbb') },
        { pageNumber: 1, paragraph: para('1-2', 'cccccccc') },
        { pageNumber: 1, paragraph: para('1-3', 'dddddddd') },
      ],
      'https://example.com/a.pdf',
    );

    const calls = translateCalls();
    expect(calls).toHaveLength(2);
    for (const pieces of calls) {
      const chars = pieces.reduce((sum, p) => sum + p.text.length, 0);
      expect(chars).toBeLessThanOrEqual(16);
    }
  });

  it('enforces the provider maxTextGroupCount piece-count cap', async () => {
    // Char budget is huge (5000) so only the piece-count cap (2) governs.
    // Five 4-char paragraphs → batches of [2, 2, 1].
    vi.mocked(loadSettings).mockResolvedValue(
      settingsWithProviderOverride({
        maxBatchChars: 5000,
        maxTextGroupCount: 2,
        globalMaxBatchChars: 5000,
      }),
    );

    await translateParagraphs(
      [
        { pageNumber: 1, paragraph: para('1-0', 'aaaa') },
        { pageNumber: 1, paragraph: para('1-1', 'bbbb') },
        { pageNumber: 1, paragraph: para('1-2', 'cccc') },
        { pageNumber: 1, paragraph: para('1-3', 'dddd') },
        { pageNumber: 1, paragraph: para('1-4', 'eeee') },
      ],
      'https://example.com/a.pdf',
    );

    const calls = translateCalls();
    expect(calls.map((pieces) => pieces.length)).toEqual([2, 2, 1]);
    for (const pieces of calls) {
      expect(pieces.length).toBeLessThanOrEqual(2);
    }
  });

  it('ignores maxTextGroupCount when set to 0 (unlimited)', async () => {
    // Provider sets maxTextGroupCount = 0 (= unlimited). Char budget (16)
    // alone governs. Four 8-char paragraphs → 2 batches of 2.
    vi.mocked(loadSettings).mockResolvedValue(
      settingsWithProviderOverride({ maxTextGroupCount: 0, globalMaxBatchChars: 16 }),
    );

    await translateParagraphs(
      [
        { pageNumber: 1, paragraph: para('1-0', 'aaaaaaaa') },
        { pageNumber: 1, paragraph: para('1-1', 'bbbbbbbb') },
        { pageNumber: 1, paragraph: para('1-2', 'cccccccc') },
        { pageNumber: 1, paragraph: para('1-3', 'dddddddd') },
      ],
      'https://example.com/a.pdf',
    );

    const calls = translateCalls();
    expect(calls).toHaveLength(2);
  });

  it('enforces both maxBatchChars and maxTextGroupCount together', async () => {
    // Both limits active: maxBatchChars = 8, maxTextGroupCount = 2.
    // Five 4-char paragraphs. Each batch caps at 2 pieces AND 8 chars.
    // Batches: [1-0,1-1] (8 chars, 2 pieces), [1-2,1-3] (8 chars, 2 pieces),
    // [1-4] (4 chars, 1 piece).
    vi.mocked(loadSettings).mockResolvedValue(
      settingsWithProviderOverride({
        maxBatchChars: 8,
        maxTextGroupCount: 2,
        globalMaxBatchChars: 5000,
      }),
    );

    await translateParagraphs(
      [
        { pageNumber: 1, paragraph: para('1-0', 'aaaa') },
        { pageNumber: 1, paragraph: para('1-1', 'bbbb') },
        { pageNumber: 1, paragraph: para('1-2', 'cccc') },
        { pageNumber: 1, paragraph: para('1-3', 'dddd') },
        { pageNumber: 1, paragraph: para('1-4', 'eeee') },
      ],
      'https://example.com/a.pdf',
    );

    const calls = translateCalls();
    expect(calls).toHaveLength(3);
    for (const pieces of calls) {
      expect(pieces.length).toBeLessThanOrEqual(2);
      const chars = pieces.reduce((sum, p) => sum + p.text.length, 0);
      expect(chars).toBeLessThanOrEqual(8);
    }
  });

  it('preserves legacy behavior when settings have no provider batch fields', async () => {
    // Raw DEFAULT_SETTINGS (providers[0] has no maxBatchChars/maxTextGroupCount).
    // Global maxBatchChars = 2000. Three short paragraphs fit in one batch.
    vi.mocked(loadSettings).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      sourceLanguage: 'en',
      targetLanguage: 'vi',
    } as ExtensionSettings);

    await translateParagraphs(
      [
        { pageNumber: 1, paragraph: para('1-0', 'First short prose.') },
        { pageNumber: 1, paragraph: para('1-1', 'Second short prose.') },
        { pageNumber: 1, paragraph: para('1-2', 'Third short prose.') },
      ],
      'https://example.com/a.pdf',
    );

    const calls = translateCalls();
    // All three fit well within the 2000-char global default → one batch.
    expect(calls).toHaveLength(1);
    expect(calls[0].map((p) => p.id)).toEqual(['1-0', '1-1', '1-2']);
  });
});
