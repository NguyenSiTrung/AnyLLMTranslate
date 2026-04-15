/**
 * Tests: handleTranslateSelection — cache read behaviour (FR-2)
 *
 * Phase 1 of cache-hardening_20260415.
 * These tests verify that getCachedTranslation is called before
 * service.translate, and that the fast-path is taken on hit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMessage } from '../background';

// ── Shared mock state ───────────────────────────────────────────────────────
const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
  tabs: { onRemoved: { addListener: vi.fn() } },
});

// ── Module-level mocks (hoisted) ─────────────────────────────────────────────
vi.mock('@/services/cacheManager', () => ({
  getCachedTranslation: vi.fn(),
  cacheTranslation: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────
function mockFetchTranslation(content: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: 'test',
          choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
        }),
      text: () => Promise.resolve(''),
    }),
  );
}

const translateSelectionMsg = (text = 'Hello') => ({
  action: 'translateSelection' as const,
  text,
  sourceLanguage: 'en',
  targetLanguage: 'vi',
});

const fakeSender = {} as chrome.runtime.MessageSender;

// ── Tests ────────────────────────────────────────────────────────────────────
describe('handleTranslateSelection — cache read (FR-2)', () => {
  let getCachedTranslation: ReturnType<typeof vi.fn>;
  let cacheTranslation: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    delete mockStorage['anyllm-translate-settings'];
    vi.clearAllMocks();

    // Re-acquire mocks after clearAllMocks
    const mod = await import('@/services/cacheManager');
    getCachedTranslation = mod.getCachedTranslation as ReturnType<typeof vi.fn>;
    cacheTranslation = mod.cacheTranslation as ReturnType<typeof vi.fn>;
  });

  it('returns cached value immediately without calling service.translate on cache hit', async () => {
    // Arrange
    getCachedTranslation.mockResolvedValue('Xin chào (cached)');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    // Act
    const result = await handleMessage(translateSelectionMsg(), fakeSender);

    // Assert
    expect(getCachedTranslation).toHaveBeenCalledWith('Hello', 'en', 'vi');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, translatedText: 'Xin chào (cached)' });
  });

  it('calls service.translate when cache miss (getCachedTranslation returns null)', async () => {
    // Arrange
    getCachedTranslation.mockResolvedValue(null);
    mockFetchTranslation(JSON.stringify({ translations: { selection: 'Xin chào' } }));

    // Act
    const result = await handleMessage(translateSelectionMsg(), fakeSender);

    // Assert
    expect(getCachedTranslation).toHaveBeenCalledWith('Hello', 'en', 'vi');
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalled();
    expect(result).toEqual({ success: true, translatedText: 'Xin chào' });
  });

  it('cache hit returns correct { success: true, translatedText } shape', async () => {
    // Arrange
    getCachedTranslation.mockResolvedValue('Bonjour (cached)');

    // Act
    const result = await handleMessage(
      translateSelectionMsg('Hello'),
      fakeSender,
    ) as { success: boolean; translatedText?: string };

    // Assert
    expect(result.success).toBe(true);
    expect(result.translatedText).toBe('Bonjour (cached)');
  });

  it('writes to cache after a cache miss + successful LLM call', async () => {
    // Arrange
    getCachedTranslation.mockResolvedValue(null);
    mockFetchTranslation(JSON.stringify({ translations: { selection: 'Xin chào' } }));

    // Act
    await handleMessage(translateSelectionMsg(), fakeSender);

    // Assert — write-back happens after LLM success
    expect(cacheTranslation).toHaveBeenCalledWith('Hello', 'Xin chào', 'en', 'vi');
  });
});
