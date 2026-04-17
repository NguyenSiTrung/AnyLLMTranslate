/**
 * Tests for subtitleCoordinator — handleIntercepted translation path
 * and activateOverlayMode translate path.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Module-level mock factories — vi.mock() is hoisted, so define fn vars here
// ============================================================================

const mockGetHandlerByPlatform = vi.fn();
vi.mock('@/inject/subtitleHandlers/registry', () => ({
  getHandlerByPlatform: mockGetHandlerByPlatform,
}));

const mockBuildBilingualVTT = vi.fn();
const mockBuildTranslationOnlyVTT = vi.fn();
vi.mock('@/lib/subtitleBuilder', () => ({
  buildBilingualVTT: mockBuildBilingualVTT,
  buildTranslationOnlyVTT: mockBuildTranslationOnlyVTT,
}));

const mockSendTranslatedSubtitle = vi.fn();
let capturedInterceptedHandler: ((payload: unknown, requestId: string) => Promise<void>) | null =
  null;
vi.mock('@/content/messageBridge', () => ({
  onSubtitleIntercepted: (handler: (payload: unknown, requestId: string) => Promise<void>) => {
    capturedInterceptedHandler = handler;
    return () => {};
  },
  sendTranslatedSubtitle: (...args: unknown[]) => mockSendTranslatedSubtitle(...args),
}));

const mockOnMessage = vi.fn(() => () => {});
vi.mock('@/inject/messageBridge', () => ({
  onMessage: (...args: unknown[]) => mockOnMessage(...args),
}));

const mockInitializeOverlay = vi.fn();
const mockUpdateCues = vi.fn();
const mockCleanupOverlay = vi.fn();
vi.mock('@/content/subtitleOverlay', () => ({
  initializeOverlay: (...args: unknown[]) => mockInitializeOverlay(...args),
  updateCues: (...args: unknown[]) => mockUpdateCues(...args),
  cleanup: (...args: unknown[]) => mockCleanupOverlay(...args),
}));

const mockInitializeControls = vi.fn();
vi.mock('@/content/subtitleControls', () => ({
  initializeControls: (...args: unknown[]) => mockInitializeControls(...args),
}));

const mockParseSubtitles = vi.fn();
vi.mock('@/lib/subtitleParser', () => ({
  parseSubtitles: (...args: unknown[]) => mockParseSubtitles(...args),
}));

const mockLoadSettings = vi.fn();
vi.mock('@/lib/config', () => ({
  loadSettings: (...args: unknown[]) => mockLoadSettings(...args),
}));

// ============================================================================
// Shared fixtures
// ============================================================================

const MOCK_CUES = [
  { startTime: 0, endTime: 2, text: 'Hello' },
  { startTime: 2, endTime: 4, text: 'World' },
];

const MOCK_TRANSLATED_CUES = [
  { startTime: 0, endTime: 2, text: 'Xin chào', originalText: 'Hello' },
  { startTime: 2, endTime: 4, text: 'Thế giới', originalText: 'World' },
];

const MOCK_SETTINGS = {
  targetLanguage: 'vi',
  sourceLanguage: 'en',
  displayMode: 'bilingual-below',
  subtitleSettings: {
    fontFamily: 'system',
    displayMode: 'bilingual',
    translationTimeout: 30,
    position: 'bottom',
    fontSize: 16,
    backgroundOpacity: 0.7,
    enabled: true,
  },
};

const mockHandler = {
  platform: 'youtube',
  detect: vi.fn(() => true),
  getPatterns: vi.fn(() => []),
  transformResponse: vi.fn(() => MOCK_CUES),
};

// ============================================================================
// Phase 1: handleIntercepted translation path
// ============================================================================

describe('subtitleCoordinator – handleIntercepted translation path', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedInterceptedHandler = null;

    // Reset module registry so coordinator re-registers on import
    vi.resetModules();

    // Per-test mock defaults
    mockInitializeControls.mockResolvedValue(undefined);
    mockLoadSettings.mockResolvedValue(MOCK_SETTINGS);
    mockGetHandlerByPlatform.mockReturnValue(mockHandler);
    mockHandler.transformResponse.mockReturnValue(MOCK_CUES);
    mockBuildBilingualVTT.mockReturnValue('WEBVTT\n\nbilingual');
    mockBuildTranslationOnlyVTT.mockReturnValue('WEBVTT\n\ntranslation-only');
    mockOnMessage.mockReturnValue(() => {});
    mockParseSubtitles.mockReturnValue(MOCK_CUES);

    global.chrome = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({ success: true, cues: MOCK_TRANSLATED_CUES }),
      },
    } as unknown as typeof chrome;

    // Import module (triggers module-level side-effects that capture the handler via mock)
    const mod = await import('@/content/subtitleCoordinator');
    // startCoordinator registers the onSubtitleIntercepted handler
    mod.startCoordinator();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('resolves handler by payload.platform and calls transformResponse', async () => {
    expect(capturedInterceptedHandler).toBeTruthy();

    const payload = {
      url: 'https://youtube.com/timedtext?v=abc',
      body: '<transcript><p t="0" d="2000">Hello</p></transcript>',
      contentType: 'application/json',
      platform: 'youtube',
      originalLanguage: 'en',
    };

    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-001');

    expect(mockGetHandlerByPlatform).toHaveBeenCalledWith('youtube');
    expect(mockHandler.transformResponse).toHaveBeenCalledWith(
      payload.body,
      payload.contentType,
      payload.url,
    );
  });

  it('calls background translateSubtitle with cues, sourceLanguage, targetLanguage', async () => {
    const payload = {
      url: 'https://youtube.com/timedtext',
      body: '<transcript>...</transcript>',
      contentType: 'application/json',
      platform: 'youtube',
      originalLanguage: 'en',
    };

    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-002');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'translateSubtitle',
        cues: MOCK_CUES,
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      }),
    );
  });

  it('falls back to settings.sourceLanguage when payload.originalLanguage is empty', async () => {
    const payload = {
      url: 'https://udemy.com/subtitles.vtt',
      body: 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nHello',
      contentType: 'text/vtt',
      platform: 'udemy',
      originalLanguage: '',
    };

    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-003');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLanguage: 'en', // settings.sourceLanguage fallback
      }),
    );
  });

  it('calls sendTranslatedSubtitle with correct requestId and VTT', async () => {
    const vttContent = 'WEBVTT\n\nbilingual';
    mockBuildBilingualVTT.mockReturnValue(vttContent);

    if (capturedInterceptedHandler) await capturedInterceptedHandler(
      {
        url: 'https://youtube.com/timedtext',
        body: '<transcript>...</transcript>',
        contentType: 'application/json',
        platform: 'youtube',
        originalLanguage: 'en',
      },
      'req-004',
    );

    expect(mockSendTranslatedSubtitle).toHaveBeenCalledWith({
      requestId: 'req-004',
      vttContent,
    });
  });

  it('calls clearPendingRequest so overlay is never triggered', async () => {
    vi.useFakeTimers();

    if (capturedInterceptedHandler) await capturedInterceptedHandler(
      {
        url: 'https://youtube.com/timedtext',
        body: '<transcript>...</transcript>',
        contentType: 'application/json',
        platform: 'youtube',
        originalLanguage: 'en',
      },
      'req-005',
    );

    // Run all timers — overlay should NOT activate because timeout was cleared
    await vi.runAllTimersAsync();

    expect(mockInitializeOverlay).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('silently skips when cues.length === 0 — no background call made', async () => {
    mockHandler.transformResponse.mockReturnValue([]);

    if (capturedInterceptedHandler) await capturedInterceptedHandler(
      {
        url: 'https://udemy.com/sprite-en.vtt',
        body: 'WEBVTT\n\n',
        contentType: 'text/vtt',
        platform: 'udemy',
        originalLanguage: '',
      },
      'req-006',
    );

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(mockSendTranslatedSubtitle).not.toHaveBeenCalled();
  });

  it('returns early when getHandlerByPlatform returns null', async () => {
    mockGetHandlerByPlatform.mockReturnValue(null);

    if (capturedInterceptedHandler) await capturedInterceptedHandler(
      {
        url: 'https://netflix.com/subtitles',
        body: '...',
        contentType: 'text/vtt',
        platform: 'netflix',
        originalLanguage: '',
      },
      'req-007',
    );

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(mockSendTranslatedSubtitle).not.toHaveBeenCalled();
  });

  it('logs warning and does NOT call sendTranslatedSubtitle on translation error', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (global.chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Background unavailable'),
    );

    if (capturedInterceptedHandler) await capturedInterceptedHandler(
      {
        url: 'https://youtube.com/timedtext',
        body: '<transcript>...</transcript>',
        contentType: 'application/json',
        platform: 'youtube',
        originalLanguage: 'en',
      },
      'req-008',
    );

    expect(mockSendTranslatedSubtitle).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('uses buildBilingualVTT when displayMode is bilingual-below', async () => {
    mockLoadSettings.mockResolvedValue({ ...MOCK_SETTINGS, displayMode: 'bilingual-below' });

    if (capturedInterceptedHandler) await capturedInterceptedHandler(
      {
        url: 'https://youtube.com/timedtext',
        body: '<transcript>...</transcript>',
        contentType: 'application/json',
        platform: 'youtube',
        originalLanguage: 'en',
      },
      'req-009',
    );

    expect(mockBuildBilingualVTT).toHaveBeenCalledWith(MOCK_TRANSLATED_CUES);
    expect(mockBuildTranslationOnlyVTT).not.toHaveBeenCalled();
  });

  it('uses buildTranslationOnlyVTT when displayMode is translation-only', async () => {
    mockLoadSettings.mockResolvedValue({ ...MOCK_SETTINGS, displayMode: 'translation-only' });

    if (capturedInterceptedHandler) await capturedInterceptedHandler(
      {
        url: 'https://youtube.com/timedtext',
        body: '<transcript>...</transcript>',
        contentType: 'application/json',
        platform: 'youtube',
        originalLanguage: 'en',
      },
      'req-010',
    );

    expect(mockBuildTranslationOnlyVTT).toHaveBeenCalledWith(MOCK_TRANSLATED_CUES);
    expect(mockBuildBilingualVTT).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Phase 2: activateOverlayMode translate path
// ============================================================================

describe('subtitleCoordinator – activateOverlayMode translate path', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedInterceptedHandler = null;
    vi.resetModules();

    mockInitializeControls.mockResolvedValue(undefined);
    mockLoadSettings.mockResolvedValue(MOCK_SETTINGS);
    mockParseSubtitles.mockReturnValue(MOCK_CUES);
    mockGetHandlerByPlatform.mockReturnValue(mockHandler);
    mockHandler.transformResponse.mockReturnValue(MOCK_CUES);
    mockOnMessage.mockReturnValue(() => {});

    global.chrome = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({ success: true, cues: MOCK_TRANSLATED_CUES }),
        lastError: undefined,
      },
    } as unknown as typeof chrome;

    const mod = await import('@/content/subtitleCoordinator');
    mod.startCoordinator();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('calls chrome.runtime.sendMessage(translateSubtitle) after parsing cues in overlay mode', async () => {
    const { forceOverlayMode, resetCoordinatorState } = await import(
      '@/content/subtitleCoordinator'
    );
    resetCoordinatorState(); // ensure isOverlayMode = false

    const vttContent = 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nHello\n\n';
    await forceOverlayMode('https://youtube.com/timedtext.vtt', vttContent);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'translateSubtitle',
        cues: MOCK_CUES,
      }),
    );
  });

  it('passes translated cues (not original) to initializeOverlay on success', async () => {
    const { forceOverlayMode, resetCoordinatorState } = await import(
      '@/content/subtitleCoordinator'
    );
    resetCoordinatorState();

    const vttContent = 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nHello\n\n';
    await forceOverlayMode('https://youtube.com/timedtext.vtt', vttContent);

    expect(mockInitializeOverlay).toHaveBeenCalledWith(
      MOCK_TRANSLATED_CUES,
      expect.objectContaining({ fontFamily: expect.any(String), displayMode: 'bilingual' }),
    );
    expect(mockInitializeOverlay).not.toHaveBeenCalledWith(MOCK_CUES, expect.anything());
  });

  it('gracefully falls back to original cues when translation rejects', async () => {
    (global.chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Service unavailable'),
    );

    const { forceOverlayMode, resetCoordinatorState } = await import(
      '@/content/subtitleCoordinator'
    );
    resetCoordinatorState();

    const vttContent = 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nHello\n\n';
    await forceOverlayMode('https://youtube.com/timedtext.vtt', vttContent);

    expect(mockInitializeOverlay).toHaveBeenCalledWith(
      MOCK_CUES,
      expect.objectContaining({ fontFamily: expect.any(String), displayMode: 'bilingual' }),
    );
  });

  it('gracefully falls back when background returns success: false', async () => {
    (global.chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'Translation failed',
    });

    const { forceOverlayMode, resetCoordinatorState } = await import(
      '@/content/subtitleCoordinator'
    );
    resetCoordinatorState();

    const vttContent = 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nHello\n\n';
    await forceOverlayMode('https://youtube.com/timedtext.vtt', vttContent);

    expect(mockInitializeOverlay).toHaveBeenCalledWith(
      MOCK_CUES,
      expect.objectContaining({ fontFamily: expect.any(String), displayMode: 'bilingual' }),
    );
  });
});
