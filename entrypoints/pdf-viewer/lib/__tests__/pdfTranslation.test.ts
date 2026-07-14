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
  PdfTranslationError,
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

  it('throws PdfTranslationError with retryAfter when pool is cooling', async () => {
    const retryAfter = Date.now() + 60_000;
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const action = (message as { action: string }).action;
      if (action === 'CLASSIFY_PDF_PARAGRAPHS') {
        const pieces = (message as { paragraphs: Array<{ id: string }> }).paragraphs;
        return {
          success: true,
          labels: Object.fromEntries(pieces.map(({ id }) => [id, 'prose'])),
        };
      }
      return {
        success: false,
        error: 'All providers are cooling down or rate-limited. Wait for cooldown, then retry.',
        retryAfter,
      };
    });

    const err = await translateParagraphs(
      [
        {
          pageNumber: 1,
          paragraph: {
            id: '1-0',
            text: 'Normal prose that needs translation.',
            fontSize: 12,
            isHeading: false,
            x: 0,
            y: 0,
            width: 0,
            height: 0,
          },
        },
      ],
      'https://example.com/cool.pdf',
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PdfTranslationError);
    expect((err as PdfTranslationError).retryAfter).toBe(retryAfter);
    expect((err as PdfTranslationError).message).toMatch(/cooling/i);
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
});
