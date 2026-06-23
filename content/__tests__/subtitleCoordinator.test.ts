/**
 * Tests for subtitleCoordinator — handleIntercepted translation path
 * and activateOverlayMode translate path.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Module-level mock factories — vi.mock() is hoisted, so define fn vars here
// ============================================================================

const mockGetHandlerByPlatform = vi.fn();
const mockDetectCurrentHandler = vi.fn(() => null);
vi.mock('@/inject/subtitleHandlers/registry', () => ({
  getHandlerByPlatform: mockGetHandlerByPlatform,
  detectCurrentHandler: mockDetectCurrentHandler,
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
let _capturedTracksHandler: ((payload: unknown) => Promise<void>) | null = null;
vi.mock('@/content/messageBridge', () => ({
  onSubtitleIntercepted: (handler: (payload: unknown, requestId: string) => Promise<void>) => {
    capturedInterceptedHandler = handler;
    return () => {};
  },
  onTracksDiscovered: (handler: (payload: unknown) => Promise<void>) => {
    _capturedTracksHandler = handler;
    return () => {};
  },
  onDomCues: () => () => {},
  onDomTrackChanged: () => () => {},
  sendTranslatedSubtitle: (...args: unknown[]) => { mockSendTranslatedSubtitle(...args); },
}));

const mockOnMessage = vi.fn().mockReturnValue(() => {});
vi.mock('@/inject/messageBridge', () => ({
  onMessage: (...args: unknown[]) => { mockOnMessage(...args); },
}));

const mockInitializeOverlay = vi.fn();
const mockUpdateCues = vi.fn();
const mockCleanupOverlay = vi.fn();
const mockGetOverlayTextContainer = vi.fn<(...args: unknown[]) => null>(() => null);
vi.mock('@/content/subtitleOverlay', () => ({
  initializeOverlay: (...args: unknown[]) => { mockInitializeOverlay(...args); },
  updateCues: (...args: unknown[]) => { mockUpdateCues(...args); },
  cleanup: (...args: unknown[]) => { mockCleanupOverlay(...args); },
  getOverlayTextContainer: (...args: unknown[]) => { mockGetOverlayTextContainer(...args); },
}));

const mockInitializeControls = vi.fn();
const mockEnableDragReposition = vi.fn<(...args: unknown[]) => (() => void)>(() => vi.fn());
vi.mock('@/content/subtitleControls', () => ({
  initializeControls: (...args: unknown[]) => { mockInitializeControls(...args); },
  enableDragReposition: (...args: unknown[]) => { mockEnableDragReposition(...args); },
}));

const mockParseSubtitles = vi.fn();
vi.mock('@/lib/subtitleParser', () => ({
  parseSubtitles: (...args: unknown[]) => mockParseSubtitles(...args),
}));

const mockLoadSettings = vi.fn();
vi.mock('@/lib/config', () => ({
  loadSettings: (...args: unknown[]) => mockLoadSettings(...args),
}));

const mockExtractPageContext = vi.fn();
const mockResolveCategory = vi.fn();
const mockDetectLLMCategoryIfNeeded = vi.fn().mockResolvedValue(undefined);
const mockTriggerAutoCategoryDetection = vi.fn().mockResolvedValue(undefined);
vi.mock('@/content/utils/pageContext', () => ({
  extractPageContext: (...args: unknown[]) => mockExtractPageContext(...args),
  resolveCategory: (...args: unknown[]) => mockResolveCategory(...args),
  detectLLMCategoryIfNeeded: (...args: unknown[]) => mockDetectLLMCategoryIfNeeded(...args),
  triggerAutoCategoryDetection: (...args: unknown[]) => mockTriggerAutoCategoryDetection(...args),
  DOMAIN_CATEGORY_MAP: {},
}));

const mockFindMatchingRule = vi.fn();
vi.mock('@/lib/siteRules', () => ({
  findMatchingRule: (...args: unknown[]) => mockFindMatchingRule(...args),
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
    fontSizeMode: 'fixed',
    backgroundOpacity: 0.7,
    enabled: true,
    preferredSubtitleLanguage: 'en',
    autoActivateSubtitles: false,
  },
};

const mockHandler = {
  platform: 'youtube',
  detect: vi.fn(() => true),
  getPatterns: vi.fn(() => []),
  transformResponse: vi.fn(() => MOCK_CUES),
  isWatchPage: vi.fn(() => window.location.pathname === '/watch'),
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

    // Simulate a YouTube watch page so isOnWatchPage() returns true
    Object.defineProperty(window, 'location', {
      value: { hostname: 'www.youtube.com', pathname: '/watch', href: 'https://www.youtube.com/watch?v=test123' },
      writable: true,
      configurable: true,
    });

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
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    } as unknown as typeof chrome;

    // Import module (triggers module-level side-effects that capture the handler via mock)
    const mod = await import('@/content/subtitleCoordinator');
    // startCoordinator registers the onSubtitleIntercepted handler
    mod.startCoordinator();
  });

  afterEach(() => {
    // startCoordinator() schedules a real 1500ms proactive-category-detection
    // timer (subtitleCoordinator.ts:859). This block uses real timers, so that
    // pending timer would otherwise fire during the later "proactive category
    // detection" block (which uses fake timers + advanceTimersByTimeAsync),
    // inflating mockTriggerAutoCategoryDetection call counts. Clear pending
    // timers here without altering the fake/real timer mode.
    vi.clearAllTimers();
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

  it('includes the resolved profile on the translateSubtitle payload', async () => {
    // Override the beforeEach hostname stub to a bare mapped domain so the
    // resolved profile is concretely verifiable (youtube.com → media), not a
    // tautology against whatever the coordinator computed. Keep platform
    // consistent with the handler mock (youtube).
    Object.defineProperty(window, 'location', {
      value: { hostname: 'youtube.com', pathname: '/watch', href: 'https://youtube.com/watch?v=test123' },
      writable: true,
      configurable: true,
    });

    if (capturedInterceptedHandler) {
      await capturedInterceptedHandler(
        {
          url: 'https://youtube.com/timedtext',
          body: '<transcript>...</transcript>',
          contentType: 'application/json',
          platform: 'youtube',
          originalLanguage: 'en',
        },
        'req-profile',
      );
    }

    const sent = (chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => (c[0] as { action?: string }).action === 'translateSubtitle',
    );
    expect(sent).toBeDefined();
    expect((sent[0] as { profile?: string }).profile).toBe('media');
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

  it('calls sendTranslatedSubtitle with correct requestId and empty VTT to disable native player', async () => {
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
      vttContent: 'WEBVTT\n\n',
    });
  });

  it('applies SiteRule category even when category detection is off and no tab override', async () => {
    // Edge case: enableLLMPageCategoryDetection=false → extractPageContext returns no category
    // No tab override set. But a SiteRule with a category exists → should still be applied.
    mockLoadSettings.mockResolvedValue({
      ...MOCK_SETTINGS,
      enableContextAwareTranslation: true,
      enableLLMPageCategoryDetection: false,
      siteRules: [{ hostname: 'youtube.com', category: 'entertainment' }],
    });
    mockExtractPageContext.mockReturnValue({
      title: 'Test Video',
      description: '',
      domain: 'youtube.com',
    });
    mockFindMatchingRule.mockReturnValue({ hostname: 'youtube.com', category: 'entertainment' });
    mockResolveCategory.mockReturnValue('entertainment');

    const payload = {
      url: 'https://youtube.com/timedtext',
      body: '<transcript>...</transcript>',
      contentType: 'application/json',
      platform: 'youtube',
      originalLanguage: 'en',
    };

    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-013');

    expect(mockFindMatchingRule).toHaveBeenCalledWith('www.youtube.com', [{ hostname: 'youtube.com', category: 'entertainment' }]);
    expect(mockResolveCategory).toHaveBeenCalledWith(
      undefined, // no auto-detected category (detection off)
      'entertainment', // from SiteRule
      undefined, // no tab override
    );
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        pageContext: expect.objectContaining({ category: 'entertainment' }),
      }),
    );
  });

  it('activates overlay immediately with original cues', async () => {
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

    expect(mockInitializeOverlay).toHaveBeenCalledWith(
      MOCK_CUES,
      expect.objectContaining({
        fontFamily: 'system-ui, sans-serif',
        displayMode: 'bilingual',
        fontSize: 16,
        fontSizeMode: 'fixed',
        position: 'bottom',
        backgroundOpacity: 0.7,
      }),
    );
  });

  it('maps all subtitle appearance settings into the runtime overlay config', async () => {
    mockLoadSettings.mockResolvedValue({
      ...MOCK_SETTINGS,
      subtitleSettings: {
        ...MOCK_SETTINGS.subtitleSettings,
        fontFamily: 'serif',
        displayMode: 'translation-only',
        fontSize: 28,
        position: 'top',
        backgroundOpacity: 0.35,
      },
    });

    if (capturedInterceptedHandler) await capturedInterceptedHandler(
      {
        url: 'https://youtube.com/timedtext',
        body: '<transcript>...</transcript>',
        contentType: 'application/json',
        platform: 'youtube',
        originalLanguage: 'en',
      },
      'req-appearance',
    );

    expect(mockInitializeOverlay).toHaveBeenCalledWith(
      MOCK_CUES,
      expect.objectContaining({
        fontFamily: 'Georgia, serif',
        displayMode: 'translation-only',
        fontSize: 28,
        fontSizeMode: 'fixed',
        position: 'top',
        backgroundOpacity: 0.35,
      }),
    );
  });

  it('passes original subtitle content through and skips translation when subtitles are disabled', async () => {
    mockLoadSettings.mockResolvedValue({
      ...MOCK_SETTINGS,
      subtitleSettings: {
        ...MOCK_SETTINGS.subtitleSettings,
        enabled: false,
      },
    });

    const payload = {
      url: 'https://youtube.com/timedtext',
      body: '<transcript>original</transcript>',
      contentType: 'application/json',
      platform: 'youtube',
      originalLanguage: 'en',
    };

    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-disabled');

    expect(mockSendTranslatedSubtitle).toHaveBeenCalledWith({
      requestId: 'req-disabled',
      vttContent: payload.body,
    });
    expect(mockHandler.transformResponse).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(mockInitializeOverlay).not.toHaveBeenCalled();
  });

  it('passes original content through when cues.length === 0 — no background call made', async () => {
    mockHandler.transformResponse.mockReturnValue([]);

    const body = 'WEBVTT\n\n';
    if (capturedInterceptedHandler) await capturedInterceptedHandler(
      {
        url: 'https://udemy.com/sprite-en.vtt',
        body,
        contentType: 'text/vtt',
        platform: 'udemy',
        originalLanguage: '',
      },
      'req-006',
    );

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(mockSendTranslatedSubtitle).toHaveBeenCalledWith({
      requestId: 'req-006',
      vttContent: body,
    });
  });

  it('passes original content through when getHandlerByPlatform returns null', async () => {
    mockGetHandlerByPlatform.mockReturnValue(null);

    const body = '...';
    if (capturedInterceptedHandler) await capturedInterceptedHandler(
      {
        url: 'https://netflix.com/subtitles',
        body,
        contentType: 'text/vtt',
        platform: 'netflix',
        originalLanguage: '',
      },
      'req-007',
    );

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(mockSendTranslatedSubtitle).toHaveBeenCalledWith({
      requestId: 'req-007',
      vttContent: body,
    });
  });

  it('logs warning and does NOT call updateTranslatedCues on translation error', async () => {
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

    // Initial empty VTT is still sent to prevent duplicate, but cues aren't updated
    expect(mockSendTranslatedSubtitle).toHaveBeenCalled();
    expect(mockUpdateCues).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('calls updateTranslatedCues when background responds successfully', async () => {
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

    expect(mockUpdateCues).toHaveBeenCalledWith(MOCK_TRANSLATED_CUES);
  });

  it('sends pageContext when enableContextAwareTranslation is true', async () => {
    mockLoadSettings.mockResolvedValue({
      ...MOCK_SETTINGS,
      enableContextAwareTranslation: true,
      enableLLMPageCategoryDetection: true,
      siteRules: [],
    });
    mockExtractPageContext.mockReturnValue({
      title: 'Test Video',
      description: 'A test video',
      domain: 'youtube.com',
      category: 'video platform',
    });
    mockResolveCategory.mockReturnValue('video platform');

    const payload = {
      url: 'https://youtube.com/timedtext',
      body: '<transcript>...</transcript>',
      contentType: 'application/json',
      platform: 'youtube',
      originalLanguage: 'en',
    };

    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-010');

    expect(mockExtractPageContext).toHaveBeenCalledWith(document, true);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'translateSubtitle',
        pageContext: expect.objectContaining({
          title: 'Test Video',
          domain: 'youtube.com',
          category: 'video platform',
        }),
      }),
    );
  });

  it('omits pageContext when enableContextAwareTranslation is false', async () => {
    mockLoadSettings.mockResolvedValue({
      ...MOCK_SETTINGS,
      enableContextAwareTranslation: false,
    });

    const payload = {
      url: 'https://youtube.com/timedtext',
      body: '<transcript>...</transcript>',
      contentType: 'application/json',
      platform: 'youtube',
      originalLanguage: 'en',
    };

    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-011');

    expect(mockExtractPageContext).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'translateSubtitle',
      }),
    );
    const sentMessage = (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sentMessage.pageContext).toBeUndefined();
  });

  it('resolves category with tab override > site rule > auto-detected', async () => {
    mockLoadSettings.mockResolvedValue({
      ...MOCK_SETTINGS,
      enableContextAwareTranslation: true,
      enableLLMPageCategoryDetection: true,
      siteRules: [{ hostname: 'youtube.com', category: 'entertainment' }],
    });
    mockExtractPageContext.mockReturnValue({
      title: 'Test',
      domain: 'youtube.com',
      category: 'video platform',
    });
    mockFindMatchingRule.mockReturnValue({ hostname: 'youtube.com', category: 'entertainment' });
    mockResolveCategory.mockReturnValue('entertainment');

    const payload = {
      url: 'https://youtube.com/timedtext',
      body: '<transcript>...</transcript>',
      contentType: 'application/json',
      platform: 'youtube',
      originalLanguage: 'en',
    };

    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-012');

    expect(mockResolveCategory).toHaveBeenCalledWith(
      'video platform',
      'entertainment',
      undefined,
    );
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        pageContext: expect.objectContaining({ category: 'entertainment' }),
      }),
    );
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

    // Simulate a YouTube watch page so isOnWatchPage() returns true
    Object.defineProperty(window, 'location', {
      value: { hostname: 'www.youtube.com', pathname: '/watch', href: 'https://www.youtube.com/watch?v=test123' },
      writable: true,
      configurable: true,
    });

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
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
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
      expect.objectContaining({
        fontFamily: 'system-ui, sans-serif',
        displayMode: 'bilingual',
        fontSize: 16,
        fontSizeMode: 'fixed',
        position: 'bottom',
        backgroundOpacity: 0.7,
      }),
    );
    expect(mockInitializeOverlay).not.toHaveBeenCalledWith(MOCK_CUES, expect.anything());
  });

  it('does not force overlay mode when subtitle settings are disabled', async () => {
    mockLoadSettings.mockResolvedValue({
      ...MOCK_SETTINGS,
      subtitleSettings: {
        ...MOCK_SETTINGS.subtitleSettings,
        enabled: false,
      },
    });

    const { forceOverlayMode, resetCoordinatorState, isInOverlayMode } = await import(
      '@/content/subtitleCoordinator'
    );
    resetCoordinatorState();

    const vttContent = 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nHello\n\n';
    await forceOverlayMode('https://youtube.com/timedtext.vtt', vttContent);

    expect(isInOverlayMode()).toBe(false);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(mockInitializeOverlay).not.toHaveBeenCalled();
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

  it('sends pageContext in overlay mode when context-aware is enabled', async () => {
    mockLoadSettings.mockResolvedValue({
      ...MOCK_SETTINGS,
      enableContextAwareTranslation: true,
      enableLLMPageCategoryDetection: false,
      siteRules: [],
    });
    mockExtractPageContext.mockReturnValue({
      title: 'Overlay Test',
      description: '',
      domain: 'udemy.com',
    });
    mockResolveCategory.mockReturnValue(undefined);

    const { forceOverlayMode, resetCoordinatorState } = await import(
      '@/content/subtitleCoordinator'
    );
    resetCoordinatorState();

    const vttContent = 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nHello\n\n';
    await forceOverlayMode('https://udemy.com/subtitle.vtt', vttContent);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'translateSubtitle',
        pageContext: expect.objectContaining({
          title: 'Overlay Test',
          domain: 'udemy.com',
        }),
      }),
    );
  });
});

// ============================================================================
// Phase 1: Stale subtitle chunk rejection
// ============================================================================

describe('subtitleCoordinator – stale subtitle chunk rejection', () => {
  let extensionMessageHandler: (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: () => void,
  ) => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    capturedInterceptedHandler = null;
    vi.resetModules();

    Object.defineProperty(window, 'location', {
      value: { hostname: 'www.youtube.com', pathname: '/watch', href: 'https://www.youtube.com/watch?v=test123' },
      writable: true,
      configurable: true,
    });

    mockInitializeControls.mockResolvedValue(undefined);
    mockLoadSettings.mockResolvedValue(MOCK_SETTINGS);
    mockGetHandlerByPlatform.mockReturnValue(mockHandler);
    mockHandler.transformResponse.mockReturnValue(MOCK_CUES);
    mockOnMessage.mockReturnValue(() => {});
    mockParseSubtitles.mockReturnValue(MOCK_CUES);

    // Return sessionId in translateSubtitle response
    global.chrome = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({ success: true, cues: MOCK_TRANSLATED_CUES, sessionId: 42 }),
        onMessage: {
          addListener: vi.fn((handler: (...args: unknown[]) => void) => {
            extensionMessageHandler = handler as typeof extensionMessageHandler;
          }),
          removeListener: vi.fn(),
        },
      },
    } as unknown as typeof chrome;

    const mod = await import('@/content/subtitleCoordinator');
    mod.startCoordinator();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('stores activeSubtitleSessionId after successful interception', async () => {
    const payload = {
      url: 'https://youtube.com/timedtext',
      body: '<transcript>...</transcript>',
      contentType: 'application/json',
      platform: 'youtube',
      originalLanguage: 'en',
    };

    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-session-1');

    // Verify updateCues was called with the translated cues (session accepted)
    expect(mockUpdateCues).toHaveBeenCalledWith(MOCK_TRANSLATED_CUES);
  });

  it('rejects SUBTITLE_CHUNK_TRANSLATED with stale sessionId', async () => {
    // First, trigger an interception to establish session 42
    const payload = {
      url: 'https://youtube.com/timedtext',
      body: '<transcript>...</transcript>',
      contentType: 'application/json',
      platform: 'youtube',
      originalLanguage: 'en',
    };
    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-stale-1');

    // Clear mock to isolate the chunk test
    mockUpdateCues.mockClear();

    // Simulate a stale chunk arriving with old sessionId (41 instead of 42)
    extensionMessageHandler(
      { action: 'SUBTITLE_CHUNK_TRANSLATED', cues: MOCK_TRANSLATED_CUES, sessionId: 41 },
      {} as chrome.runtime.MessageSender,
      () => {},
    );

    // Stale chunk should be dropped — updateCues NOT called
    expect(mockUpdateCues).not.toHaveBeenCalled();
  });

  it('accepts SUBTITLE_CHUNK_TRANSLATED with matching sessionId', async () => {
    // Establish session 42
    const payload = {
      url: 'https://youtube.com/timedtext',
      body: '<transcript>...</transcript>',
      contentType: 'application/json',
      platform: 'youtube',
      originalLanguage: 'en',
    };
    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-match-1');

    mockUpdateCues.mockClear();

    // Simulate a chunk with matching sessionId
    extensionMessageHandler(
      { action: 'SUBTITLE_CHUNK_TRANSLATED', cues: MOCK_TRANSLATED_CUES, sessionId: 42 },
      {} as chrome.runtime.MessageSender,
      () => {},
    );

    // Matching chunk should be accepted — updateCues called
    expect(mockUpdateCues).toHaveBeenCalledWith(MOCK_TRANSLATED_CUES);
  });

  it('P0 regression: chunk delta merges onto full-array translatedCues (not a fresh array)', async () => {
    // Establish session 42 with a full-array update (updateTranslatedCues path)
    const payload = {
      url: 'https://youtube.com/timedtext',
      body: '<transcript>...</transcript>',
      contentType: 'application/json',
      platform: 'youtube',
      originalLanguage: 'en',
    };
    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-merge-1');

    mockUpdateCues.mockClear();

    // Send a chunk delta at offset 0 with a single cue (subset of the full array).
    // Before the fix, updateTranslatedCues never set state.translatedCues, so the merge
    // started from a fresh sparse array and the other cue was lost. After the fix, the
    // merge starts from the full array; updateCues receives an array where the chunk cue
    // replaced index 0 and the original index-1 cue is preserved.
    extensionMessageHandler(
      {
        action: 'SUBTITLE_CHUNK_TRANSLATED',
        chunkStart: 0,
        chunkCues: [{ startTime: 0, endTime: 2, text: 'Bonjour', originalText: 'Hello' }],
        sessionId: 42,
      },
      {} as chrome.runtime.MessageSender,
      () => {},
    );

    expect(mockUpdateCues).toHaveBeenCalledTimes(1);
    const mergedArg = mockUpdateCues.mock.calls[0][0] as Array<{ text: string }>;
    // Length must equal the full array (2), not the chunk (1) — proves translatedCues was retained
    expect(mergedArg).toHaveLength(2);
    // Chunk cue replaced index 0
    expect(mergedArg[0].text).toBe('Bonjour');
    // Original index-1 cue preserved (would be undefined before the fix)
    expect(mergedArg[1].text).toBe('Thế giới');
  });

  it('accepts chunks when no session has been established yet (backward compat)', async () => {
    // Establish overlay mode via interception, but mock the response WITHOUT sessionId
    // to simulate a legacy background that doesn't send sessionId yet
    (global.chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      cues: MOCK_TRANSLATED_CUES,
      // no sessionId — simulates legacy background
    });

    const payload = {
      url: 'https://youtube.com/timedtext',
      body: '<transcript>...</transcript>',
      contentType: 'application/json',
      platform: 'youtube',
      originalLanguage: 'en',
    };
    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-compat-1');

    // Now overlay mode is active but activeSubtitleSessionId is null
    mockUpdateCues.mockClear();

    // Legacy chunks without sessionId should still be accepted
    extensionMessageHandler(
      { action: 'SUBTITLE_CHUNK_TRANSLATED', cues: MOCK_TRANSLATED_CUES },
      {} as chrome.runtime.MessageSender,
      () => {},
    );

    expect(mockUpdateCues).toHaveBeenCalledWith(MOCK_TRANSLATED_CUES);
  });
});

// ============================================================================
// Auto-detected category from shared singleton state (regression test for C1)
// ============================================================================

describe('auto-detected category from shared state', () => {
  // categoryState is NOT mocked, so it uses the real module. However, vi.resetModules()
  // creates a fresh module instance for dynamically imported modules. We must import
  // categoryState dynamically (after the coordinator) to share the same instance.
  let categoryStateMod: {
    setAutoDetectedCategory: (category: string | undefined) => void;
    _resetCategoryState: () => void;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    capturedInterceptedHandler = null;
    vi.resetModules();

    // Simulate a YouTube watch page so isOnWatchPage() returns true
    Object.defineProperty(window, 'location', {
      value: { hostname: 'www.youtube.com', pathname: '/watch', href: 'https://www.youtube.com/watch?v=test123' },
      writable: true,
      configurable: true,
    });

    mockInitializeControls.mockResolvedValue(undefined);
    mockLoadSettings.mockResolvedValue(MOCK_SETTINGS);
    mockGetHandlerByPlatform.mockReturnValue(mockHandler);
    mockHandler.transformResponse.mockReturnValue(MOCK_CUES);
    mockOnMessage.mockReturnValue(() => {});
    mockParseSubtitles.mockReturnValue(MOCK_CUES);

    global.chrome = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({ success: true, cues: MOCK_TRANSLATED_CUES }),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    } as unknown as typeof chrome;

    // Import coordinator (triggers module-level side-effects that capture the handler)
    const mod = await import('@/content/subtitleCoordinator');
    mod.startCoordinator();

    // Import categoryState AFTER the coordinator so we share the same fresh
    // module instance (vi.resetModules() invalidates the previous registry).
    categoryStateMod = await import('@/content/categoryState');
    categoryStateMod._resetCategoryState();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('uses the shared autoDetectedCategory singleton value in resolveCategory', async () => {
    // Seed the singleton with an LLM-detected category
    categoryStateMod.setAutoDetectedCategory('News');

    mockLoadSettings.mockResolvedValue({
      ...MOCK_SETTINGS,
      enableContextAwareTranslation: true,
      enableLLMPageCategoryDetection: true,
      llmCategoryDetectionMode: 'async',
      siteRules: [],
    });
    mockExtractPageContext.mockReturnValue({
      title: 'Test Video',
      description: '',
      domain: 'youtube.com',
      // no category — heuristic found nothing
    });
    mockFindMatchingRule.mockReturnValue(undefined);
    mockResolveCategory.mockReturnValue('News');

    const payload = {
      url: 'https://youtube.com/timedtext',
      body: 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello',
      contentType: 'text/vtt',
      platform: 'youtube',
      originalLanguage: 'en',
    };

    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-cat-001');

    expect(mockResolveCategory).toHaveBeenCalledWith(
      'News', // from the shared singleton, NOT undefined (heuristic found nothing)
      undefined, // no siteRule
      undefined, // no tab override
    );
  });
});

describe('subtitleCoordinator – proactive category detection', () => {
  let categoryStateMod: {
    setAutoDetectedCategory: (category: string | undefined) => void;
    _resetCategoryState: () => void;
  } | null = null;

  beforeEach(async () => {
    // Fake timers make the 1500ms proactive debounce deterministic and prevent
    // leftover real timers from other tests firing during our waits.
    vi.useFakeTimers();
    vi.clearAllTimers();
    vi.clearAllMocks();
    capturedInterceptedHandler = null;
    vi.resetModules();

    mockHandler.isWatchPage.mockImplementation(() => window.location.pathname === '/watch');
    mockDetectCurrentHandler.mockReturnValue(mockHandler);

    // YouTube watch page
    Object.defineProperty(window, 'location', {
      value: { hostname: 'www.youtube.com', pathname: '/watch', href: 'https://www.youtube.com/watch?v=test123' },
      writable: true,
      configurable: true,
    });

    mockInitializeControls.mockResolvedValue(undefined);
    mockLoadSettings.mockResolvedValue({
      ...MOCK_SETTINGS,
      enableLLMPageCategoryDetection: true,
      enableContextAwareTranslation: true,
      llmCategoryDetectionMode: 'async',
      siteRules: [],
    });
    mockGetHandlerByPlatform.mockReturnValue(mockHandler);
    mockHandler.transformResponse.mockReturnValue(MOCK_CUES);
    mockBuildBilingualVTT.mockReturnValue('WEBVTT\n\nbilingual');
    mockBuildTranslationOnlyVTT.mockReturnValue('WEBVTT\n\ntranslation-only');
    mockOnMessage.mockReturnValue(() => {});
    mockParseSubtitles.mockReturnValue(MOCK_CUES);
    mockExtractPageContext.mockReturnValue({ title: 'Watch page', description: '', domain: 'www.youtube.com' });
    mockDetectLLMCategoryIfNeeded.mockResolvedValue(undefined);
    mockTriggerAutoCategoryDetection.mockClear();
    mockTriggerAutoCategoryDetection.mockResolvedValue(undefined);
    mockFindMatchingRule.mockReturnValue(undefined);
    mockResolveCategory.mockReturnValue(undefined);

    global.chrome = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({ success: true, cues: MOCK_TRANSLATED_CUES }),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    } as unknown as typeof chrome;

    const mod = await import('@/content/subtitleCoordinator');
    mod.startCoordinator();
    categoryStateMod = await import('@/content/categoryState');
    categoryStateMod._resetCategoryState();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it('fires triggerAutoCategoryDetection on startCoordinator when on a watch page', async () => {
    // Advance past the 1500ms debounce. await vi.advanceTimersByTimeAsync so any
    // microtasks scheduled inside the timer callback (loadSettings) also flush.
    await vi.advanceTimersByTimeAsync(1700);
    expect(mockTriggerAutoCategoryDetection).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire proactive detection on a non-watch page (YouTube home)', async () => {
    vi.resetModules();
    mockTriggerAutoCategoryDetection.mockClear();
    mockDetectCurrentHandler.mockReturnValue(mockHandler);
    mockHandler.isWatchPage.mockReturnValue(false);
    Object.defineProperty(window, 'location', {
      value: { hostname: 'www.youtube.com', pathname: '/', href: 'https://www.youtube.com/' },
      writable: true,
      configurable: true,
    });
    const mod = await import('@/content/subtitleCoordinator');
    mod.startCoordinator();
    await vi.advanceTimersByTimeAsync(1700);
    expect(mockTriggerAutoCategoryDetection).not.toHaveBeenCalled();
  });

  it('does NOT fire when LLM detection is disabled', async () => {
    vi.resetModules();
    mockLoadSettings.mockResolvedValue({
      ...MOCK_SETTINGS,
      enableLLMPageCategoryDetection: false,
      enableContextAwareTranslation: true,
      siteRules: [],
    });
    const mod = await import('@/content/subtitleCoordinator');
    mod.startCoordinator();
    await vi.advanceTimersByTimeAsync(1700);
    expect(mockTriggerAutoCategoryDetection).not.toHaveBeenCalled();
  });

  it('passes the category override through to triggerAutoCategoryDetection when set (categoryChanged received)', async () => {
    // Dispatch a categoryChanged to every registered runtime listener; only the
    // coordinator's listener mutates state.categoryOverride, the rest ignore it.
    const addListenerCalls = (global.chrome.runtime.onMessage.addListener as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    for (const call of addListenerCalls) {
      const l = call[0] as (m: { action: string; category?: string }) => void;
      try { l({ action: 'categoryChanged', category: 'Gaming' }); } catch { /* ignore */ }
    }
    await vi.advanceTimersByTimeAsync(1700);
    // The scheduler always invokes the helper; the override no-op guard lives inside
    // the real triggerAutoCategoryDetection (covered by its own unit tests). Here we
    // verify the override is propagated as the manualOverride argument so the guard
    // will short-circuit in production.
    expect(mockTriggerAutoCategoryDetection).toHaveBeenCalledTimes(1);
    expect(mockTriggerAutoCategoryDetection).toHaveBeenCalledWith(
      expect.anything(),
      'Gaming',
      expect.any(Function),
    );
  });
});
