/**
 * Tests for subtitleCoordinator — handleIntercepted translation path
 * and activateOverlayMode translate path.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ProfileKnobs } from '@/lib/subtitleProfiles';

// ============================================================================
// Module-level mock factories — vi.mock() is hoisted, so define fn vars here
// ============================================================================

const mockGetHandlerByPlatform = vi.fn();
const mockDetectCurrentHandler = vi.fn<() => unknown>(() => null);
vi.mock('@/inject/subtitleHandlers/registry', () => ({
  getHandlerByPlatform: mockGetHandlerByPlatform,
  detectCurrentHandler: mockDetectCurrentHandler,
}));

// Mock subtitleToast with a spy so tests can assert on calls deterministically,
// independent of the real module's cross-test singleton state.
const mockShowSubtitleToast = vi.fn();
vi.mock('@/content/subtitleToast', () => ({
  showSubtitleToast: mockShowSubtitleToast,
  hideSubtitleToast: vi.fn(),
}));

vi.mock('@/content/miniProgress', () => ({
  updateMiniProgress: vi.fn(),
  hideMiniProgress: vi.fn(),
  isMiniProgressVisible: vi.fn(() => false),
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
  onTextTrackCues: () => () => {},
  onMseCues: () => () => {},
  onManifestCues: () => () => {},
  onMpdProcessing: () => () => {},
  sendTranslatedSubtitle: (...args: unknown[]) => { mockSendTranslatedSubtitle(...args); },
}));

const mockOnMessage = vi.fn().mockReturnValue(() => {});
const mockInjectSendMessage = vi.fn();
vi.mock('@/inject/messageBridge', () => ({
  onMessage: (...args: unknown[]) => mockOnMessage(...args),
  sendMessage: (...args: unknown[]) => mockInjectSendMessage(...args),
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
  getDomCueSource: vi.fn(
    (): {
      cueSelector: string;
      captionWindowSelector: string;
      captionHideMethod: 'visibility' | 'display' | 'opacity';
    } | null => null,
  ),
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

  it('resolves handler by payload.platform, calls transformResponse, and sends translateSubtitle with cues, languages, and a pre-assigned sessionId', async () => {
    expect(capturedInterceptedHandler).toBeTruthy();

    const payload = {
      url: 'https://youtube.com/timedtext?v=abc',
      body: '<transcript><p t="0" d="2000">Hello</p></transcript>',
      contentType: 'application/json',
      platform: 'youtube',
      originalLanguage: 'en',
    };

    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-001');

    // Handler resolution + cue extraction
    expect(mockGetHandlerByPlatform).toHaveBeenCalledWith('youtube');
    expect(mockHandler.transformResponse).toHaveBeenCalledWith(
      payload.body,
      payload.contentType,
      payload.url,
    );

    // Background translateSubtitle carries cues + source/target languages
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'translateSubtitle',
        cues: MOCK_CUES,
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      }),
    );

    // SessionId pre-assigned on translateSubtitle so progressive chunks can match
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'translateSubtitle',
        sessionId: expect.any(Number),
      }),
    );

    // Override the beforeEach hostname stub to a bare mapped domain so the
    // resolved profile is concretely verifiable (youtube.com → media), not a
    // tautology against whatever the coordinator computed. Keep platform
    // consistent with the handler mock (youtube).
    Object.defineProperty(window, 'location', {
      value: { hostname: 'youtube.com', pathname: '/watch', href: 'https://youtube.com/watch?v=test123' },
      writable: true,
      configurable: true,
    });

    // Dispatch setSubtitleKnobOverride to every registered runtime listener;
    // only the coordinator's listener mutates state.subtitleKnobOverride.
    const addListenerCalls = (global.chrome.runtime.onMessage.addListener as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    for (const call of addListenerCalls) {
      const l = call[0] as (m: { action: string; knobOverrides?: Partial<ProfileKnobs> | null }) => void;
      try { l({ action: 'setSubtitleKnobOverride', knobOverrides: { faithfulness: 'literal' } }); } catch { /* ignore */ }
    }
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockClear();

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
    if (!sent) throw new Error('Expected translateSubtitle message');
    expect((sent[0] as { profile?: string }).profile).toBe('media');
    expect((sent[0] as { knobOverrides?: Partial<ProfileKnobs> }).knobOverrides).toEqual({ faithfulness: 'literal' });

    vi.clearAllMocks();
    mockHandler.transformResponse.mockReturnValue(MOCK_CUES);
    const fallbackPayload = {
      url: 'https://udemy.com/subtitles.vtt',
      body: 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nHello',
      contentType: 'text/vtt',
      platform: 'udemy',
      originalLanguage: '',
    };

    if (capturedInterceptedHandler) await capturedInterceptedHandler(fallbackPayload, 'req-003');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLanguage: 'en', // settings.sourceLanguage fallback
      }),
    );

    mockSendTranslatedSubtitle.mockClear();
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

  it('activates overlay immediately with original cues and maps subtitle appearance settings into the runtime overlay config', async () => {
    // Scenario 1: overlay activates with original cues + default appearance mapping
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

    // Scenario 2: overridden appearance settings are all mapped into the runtime config.
    // Reset overlay state first so the second intercept re-initializes the
    // overlay (fresh-test semantics) instead of only updating cues.
    const mod = await import('@/content/subtitleCoordinator');
    mod.resetCoordinatorState();
    mockInitializeOverlay.mockClear();
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

  it('passes original content through (no background call) when subtitles disabled, cues empty, or no handler matches', async () => {
    // Scenario 1: subtitles disabled
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

    // Scenario 2: transformResponse yields zero cues — no background call made
    mockLoadSettings.mockResolvedValue(MOCK_SETTINGS);
    mockHandler.transformResponse.mockReturnValue([]);

    const emptyBody = 'WEBVTT\n\n';
    if (capturedInterceptedHandler) await capturedInterceptedHandler(
      {
        url: 'https://udemy.com/sprite-en.vtt',
        body: emptyBody,
        contentType: 'text/vtt',
        platform: 'udemy',
        originalLanguage: '',
      },
      'req-006',
    );

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(mockSendTranslatedSubtitle).toHaveBeenCalledWith({
      requestId: 'req-006',
      vttContent: emptyBody,
    });

    // Scenario 3: getHandlerByPlatform returns null
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

    mockUpdateCues.mockClear();
    (global.chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockReset();
    (global.chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      cues: MOCK_TRANSLATED_CUES,
    });
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

  it('sends pageContext with resolved category (tab override > site rule > auto-detected) when context-aware is enabled', async () => {
    const payload = {
      url: 'https://youtube.com/timedtext',
      body: '<transcript>...</transcript>',
      contentType: 'application/json',
      platform: 'youtube',
      originalLanguage: 'en',
    };

    // Scenario 1: auto-detected category passes through on the pageContext
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

    // Scenario 2: site rule wins over the auto-detected category
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
// YouTube ASR AI re-align cache
// ============================================================================

describe('subtitleCoordinator – YouTube ASR AI re-align cache', () => {
  const ASR_URL = 'https://www.youtube.com/api/timedtext?v=test123&kind=asr&lang=en';
  const AI_CUES = [
    { startTime: 0, endTime: 4, text: 'Hello World' },
  ];
  const CACHED_CUES = [
    { startTime: 0, endTime: 4, text: 'Cached Hello World' },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    capturedInterceptedHandler = null;
    vi.resetModules();

    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'www.youtube.com',
        pathname: '/watch',
        href: 'https://www.youtube.com/watch?v=test123',
      },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(document, 'title', {
      value: 'Test Video - YouTube',
      configurable: true,
    });

    mockInitializeControls.mockResolvedValue(undefined);
    mockLoadSettings.mockResolvedValue({
      ...MOCK_SETTINGS,
      subtitleSettings: {
        ...MOCK_SETTINGS.subtitleSettings,
        youtubeAsrResegment: { enable: true, aiEnable: true },
      },
    });
    mockGetHandlerByPlatform.mockReturnValue(mockHandler);
    mockHandler.transformResponse.mockReturnValue(MOCK_CUES);
    mockBuildBilingualVTT.mockReturnValue('WEBVTT\n\nbilingual');
    mockOnMessage.mockReturnValue(() => {});

    global.chrome = {
      runtime: {
        sendMessage: vi.fn().mockImplementation(async (msg: { action?: string }) => {
          if (msg?.action === 'GET_ASR_REALIGN_CACHE') {
            return { success: true };
          }
          if (msg?.action === 'RESEGMENT_YOUTUBE_ASR') {
            return { success: true, cues: AI_CUES };
          }
          if (msg?.action === 'SAVE_ASR_REALIGN_CACHE') {
            return { success: true };
          }
          if (msg?.action === 'translateSubtitle') {
            return { success: true, cues: MOCK_TRANSLATED_CUES };
          }
          return { success: true };
        }),
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
    vi.clearAllTimers();
    vi.resetModules();
  });

  it('covers ASR cache hit, miss, and fail-open re-alignment paths', async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      async (msg: { action?: string }) => {
        if (msg?.action === 'GET_ASR_REALIGN_CACHE') {
          return { success: true, entry: { cues: CACHED_CUES, key: 'k' } };
        }
        if (msg?.action === 'translateSubtitle') {
          return { success: true, cues: MOCK_TRANSLATED_CUES };
        }
        return { success: true };
      },
    );

    await capturedInterceptedHandler?.(
      {
        url: ASR_URL,
        body: '{}',
        contentType: 'application/json',
        platform: 'youtube',
        originalLanguage: 'en',
      },
      'req-asr-hit',
    );

    const hitActions = (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => (c[0] as { action?: string }).action,
    );
    expect(hitActions).toContain('GET_ASR_REALIGN_CACHE');
    expect(hitActions).not.toContain('RESEGMENT_YOUTUBE_ASR');
    expect(hitActions).not.toContain('SAVE_ASR_REALIGN_CACHE');
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'translateSubtitle',
        cues: CACHED_CUES,
      }),
    );

    // Cache miss runs AI, saves the realigned entry, and translates AI cues.
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>)
      .mockClear()
      .mockImplementation(async (msg: { action?: string }) => {
        if (msg?.action === 'GET_ASR_REALIGN_CACHE') return { success: true };
        if (msg?.action === 'RESEGMENT_YOUTUBE_ASR') {
          return { success: true, cues: AI_CUES };
        }
        if (msg?.action === 'translateSubtitle') {
          return { success: true, cues: MOCK_TRANSLATED_CUES };
        }
        return { success: true };
      });
    await capturedInterceptedHandler?.(
      {
        url: ASR_URL,
        body: '{}',
        contentType: 'application/json',
        platform: 'youtube',
        originalLanguage: 'en',
      },
      'req-asr-miss',
    );

    const missActions = (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => (c[0] as { action?: string }).action,
    );
    expect(missActions).toContain('GET_ASR_REALIGN_CACHE');
    expect(missActions).toContain('RESEGMENT_YOUTUBE_ASR');
    expect(missActions).toContain('SAVE_ASR_REALIGN_CACHE');
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SAVE_ASR_REALIGN_CACHE',
        entry: expect.objectContaining({
          videoId: 'test123',
          mode: 'ai',
          cues: AI_CUES,
        }),
      }),
    );
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'translateSubtitle',
        cues: AI_CUES,
      }),
    );

    // AI failure does not save and falls back to the original translation path.
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      async (msg: { action?: string }) => {
        if (msg?.action === 'GET_ASR_REALIGN_CACHE') return { success: true };
        if (msg?.action === 'RESEGMENT_YOUTUBE_ASR') {
          return { success: false, error: 'parse failed' };
        }
        if (msg?.action === 'translateSubtitle') {
          return { success: true, cues: MOCK_TRANSLATED_CUES };
        }
        return { success: true };
      },
    );
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockClear();

    await capturedInterceptedHandler?.(
      {
        url: ASR_URL,
        body: '{}',
        contentType: 'application/json',
        platform: 'youtube',
        originalLanguage: 'en',
      },
      'req-asr-fail',
    );

    const failActions = (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => (c[0] as { action?: string }).action,
    );
    expect(failActions).toContain('RESEGMENT_YOUTUBE_ASR');
    expect(failActions).not.toContain('SAVE_ASR_REALIGN_CACHE');
    expect(mockShowSubtitleToast).toHaveBeenCalledWith(
      expect.stringMatching(/AI re-align failed/i),
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

  it('sends translateSubtitle after parsing cues and initializes the overlay with translated (not original) cues on success', async () => {
    const { forceOverlayMode, resetCoordinatorState, isInOverlayMode } = await import(
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

    mockInitializeOverlay.mockClear();
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockClear();
    mockLoadSettings.mockResolvedValue({
      ...MOCK_SETTINGS,
      subtitleSettings: {
        ...MOCK_SETTINGS.subtitleSettings,
        enabled: false,
      },
    });

    resetCoordinatorState();

    await forceOverlayMode('https://youtube.com/timedtext.vtt', vttContent);

    expect(isInOverlayMode()).toBe(false);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(mockInitializeOverlay).not.toHaveBeenCalled();

    mockLoadSettings.mockResolvedValue(MOCK_SETTINGS);
    (global.chrome.runtime.sendMessage as ReturnType<typeof vi.fn>)
      .mockReset()
      .mockRejectedValue(new Error('Service unavailable'));

    resetCoordinatorState();

    await forceOverlayMode('https://youtube.com/timedtext.vtt', vttContent);

    expect(mockInitializeOverlay).toHaveBeenCalledWith(
      MOCK_CUES,
      expect.objectContaining({ fontFamily: expect.any(String), displayMode: 'bilingual' }),
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

    // Matching full-array and chunk-delta forms are accepted.
    mockUpdateCues.mockClear();
    extensionMessageHandler(
      { action: 'SUBTITLE_CHUNK_TRANSLATED', cues: MOCK_TRANSLATED_CUES, sessionId: 42 },
      {} as chrome.runtime.MessageSender,
      () => {},
    );
    expect(mockUpdateCues).toHaveBeenCalledWith(MOCK_TRANSLATED_CUES);

    // A chunk-delta form with a valid session id is also accepted.
    // Defense-in-depth: a cleared/null active session must NOT treat every
    // late-or-racing chunk as stale.
    mockUpdateCues.mockClear();
    extensionMessageHandler(
      {
        action: 'SUBTITLE_CHUNK_TRANSLATED',
        chunkStart: 0,
        chunkCues: MOCK_TRANSLATED_CUES,
        sessionId: 42,
      },
      {} as chrome.runtime.MessageSender,
      () => {},
    );
    expect(mockUpdateCues).toHaveBeenCalled();

    // P0 regression: a delta merges onto the retained full-array state.
    mockUpdateCues.mockClear();
    // Establish session 42 with a full-array update (updateTranslatedCues path)
    const mergePayload = {
      url: 'https://youtube.com/timedtext',
      body: '<transcript>...</transcript>',
      contentType: 'application/json',
      platform: 'youtube',
      originalLanguage: 'en',
    };
    if (capturedInterceptedHandler) await capturedInterceptedHandler(mergePayload, 'req-merge-1');

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

  it('sub-project 5a — VTT path: over-fast cues are extended but already-readable cues are NOT shortened', async () => {
    // Establish session 42 via interception (mirrors the chunk-merge regression test).
    // Note: session setup pre-populates state.translatedCues with MOCK_TRANSLATED_CUES
    // (cue at startTime 0, cue at startTime 2). Our chunk cue merges at offset 0,
    // so the resulting array is [ourCue(start 0), mockCue(start 2)] — meaning our
    // cue's extension is capped by the next cue at startTime 2 (cap = 2 - 0.05 = 1.95),
    // tighter than the 2.3s required read time.
    const payload = {
      url: 'https://youtube.com/timedtext',
      body: '<transcript>...</transcript>',
      contentType: 'application/json',
      platform: 'youtube',
      originalLanguage: 'en',
    };
    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-timing-1');

    mockUpdateCues.mockClear();

    // Scenario 1: over-fast cue — required read = max(24/12, 40/20) + 0.3 = 2.3s; window 1s.
    // Capped by next cue (start 2): finalEnd = min(2.3, absCap 4, neighborCap 1.95) = 1.95.
    extensionMessageHandler(
      {
        action: 'SUBTITLE_CHUNK_TRANSLATED',
        chunkStart: 0,
        chunkCues: [
          { startTime: 0, endTime: 1, text: 'a'.repeat(24), originalText: 'b'.repeat(40) },
        ],
        sessionId: 42,
      },
      {} as chrome.runtime.MessageSender,
      () => {},
    );

    expect(mockUpdateCues).toHaveBeenCalledTimes(1);
    const extendedArg = mockUpdateCues.mock.calls[0][0] as Array<{ endTime: number }>;
    // Extended from 1 -> 1.95 (capped by the next cue at startTime 2), proving
    // adaptCueTimings ran on the merged array before updateCues.
    expect(extendedArg[0].endTime).toBeCloseTo(1.95, 5);
    expect(extendedArg[0].endTime).toBeGreaterThan(1);

    // Scenario 2: already-readable cue — window 10s, tiny text -> required ~0.35s.
    // endTime must stay 10 (floor). The mock cue still sits at startTime 2, so
    // the merged layout matches scenario 1.
    mockUpdateCues.mockClear();
    extensionMessageHandler(
      {
        action: 'SUBTITLE_CHUNK_TRANSLATED',
        chunkStart: 0,
        chunkCues: [{ startTime: 0, endTime: 10, text: 'hi', originalText: 'ho' }],
        sessionId: 42,
      },
      {} as chrome.runtime.MessageSender,
      () => {},
    );

    const readableArg = mockUpdateCues.mock.calls[0][0] as Array<{ endTime: number }>;
    expect(readableArg[0].endTime).toBe(10);
  });

  it('sub-project 6 — surfaces a toast on SUBTITLE_CHUNK_FAILED (idempotent within cooldown)', async () => {
    // Establish session 42 via interception (same setup as the chunk-merge tests).
    const payload = {
      url: 'https://youtube.com/timedtext',
      body: '<transcript>...</transcript>',
      contentType: 'application/json',
      platform: 'youtube',
      originalLanguage: 'en',
    };
    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-fail-1');
    mockShowSubtitleToast.mockClear();

    // Send a chunk-failed message — the failure toast should be shown.
    extensionMessageHandler(
      { action: 'SUBTITLE_CHUNK_FAILED', chunkStart: 25, sessionId: 42 },
      {} as chrome.runtime.MessageSender,
      () => {},
    );
    expect(mockShowSubtitleToast).toHaveBeenCalledTimes(1);
    expect(mockShowSubtitleToast.mock.calls[0][0]).toContain("couldn't be translated");

    // A second failed message within the cooldown window must NOT show another
    // toast (idempotency). The spy call count stays at 1.
    extensionMessageHandler(
      { action: 'SUBTITLE_CHUNK_FAILED', chunkStart: 50, sessionId: 42 },
      {} as chrome.runtime.MessageSender,
      () => {},
    );
    expect(mockShowSubtitleToast).toHaveBeenCalledTimes(1);
  });
});

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
  let cleanupCoordinator: (() => void) | undefined;

  const stopCoordinator = () => {
    cleanupCoordinator?.();
    cleanupCoordinator = undefined;
  };

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
    cleanupCoordinator = mod.startCoordinator();
    categoryStateMod = await import('@/content/categoryState');
    categoryStateMod._resetCategoryState();
  });

  afterEach(() => {
    stopCoordinator();
    vi.useRealTimers();
    vi.resetModules();
  });

  it('does NOT fire proactive detection on a non-watch page, when LLM detection is disabled, or with a category override', async () => {
    // On a watch page, the debounced detector fires after startup.
    await vi.advanceTimersByTimeAsync(1700);
    expect(mockTriggerAutoCategoryDetection).toHaveBeenCalled();

    // Scenario 1: non-watch page (YouTube home)
    stopCoordinator();
    vi.resetModules();
    mockTriggerAutoCategoryDetection.mockClear();
    mockDetectCurrentHandler.mockReturnValue(mockHandler);
    mockHandler.isWatchPage.mockReturnValue(false);
    Object.defineProperty(window, 'location', {
      value: { hostname: 'www.youtube.com', pathname: '/', href: 'https://www.youtube.com/' },
      writable: true,
      configurable: true,
    });
    let mod = await import('@/content/subtitleCoordinator');
    cleanupCoordinator = mod.startCoordinator();
    await vi.advanceTimersByTimeAsync(1700);
    expect(mockTriggerAutoCategoryDetection).not.toHaveBeenCalled();

    // Scenario 2: LLM detection disabled (back on a watch page)
    stopCoordinator();
    vi.resetModules();
    mockTriggerAutoCategoryDetection.mockClear();
    mockHandler.isWatchPage.mockImplementation(() => window.location.pathname === '/watch');
    Object.defineProperty(window, 'location', {
      value: { hostname: 'www.youtube.com', pathname: '/watch', href: 'https://www.youtube.com/watch?v=test123' },
      writable: true,
      configurable: true,
    });
    mockLoadSettings.mockResolvedValue({
      ...MOCK_SETTINGS,
      enableLLMPageCategoryDetection: false,
      enableContextAwareTranslation: true,
      siteRules: [],
    });
    mod = await import('@/content/subtitleCoordinator');
    cleanupCoordinator = mod.startCoordinator();
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
    // The override is propagated as the manualOverride argument so the guard
    // will short-circuit in production.
    expect(mockTriggerAutoCategoryDetection).toHaveBeenCalledWith(
      expect.anything(),
      'Gaming',
      expect.any(Function),
    );
  });
});

// ============================================================================
// Youku regression: in-range seeks must NOT cancel an active intercept-path
// translation session. Youku's KUI player fires `seeked` on initial resume,
// every buffer transition, and on scrubs. Before the fix, the intercept path
// never engaged the in-range guard (it only fired for activeSource === 'manifest'),
// so every seek null'd out state.activeSubtitleSessionId and every subsequent
// SUBTITLE_CHUNK_TRANSLATED was dropped as stale — translation never appeared.
// ============================================================================

describe('subtitleCoordinator – seek does not invalidate intercept-path session', () => {
  let extensionMessageHandler: (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: () => void,
  ) => void;
  let stopCoordinator: (() => void) | null = null;

  beforeEach(async () => {
    vi.clearAllMocks();
    capturedInterceptedHandler = null;
    vi.resetModules();

    Object.defineProperty(window, 'location', {
      value: { hostname: 'www.youku.tv', pathname: '/v/v_show/id_XNjUxNTI4OTk3Mg==.html', href: 'https://www.youku.tv/v/v_show/id_XNjUxNTI4OTk3Mg==.html' },
      writable: true,
      configurable: true,
    });

    mockInitializeControls.mockResolvedValue(undefined);
    mockLoadSettings.mockResolvedValue(MOCK_SETTINGS);
    mockGetHandlerByPlatform.mockReturnValue(mockHandler);
    mockDetectCurrentHandler.mockReturnValue({ isWatchPage: () => true });
    mockHandler.transformResponse.mockReturnValue(MOCK_CUES);
    mockBuildBilingualVTT.mockReturnValue('WEBVTT\n\nbilingual');
    mockBuildTranslationOnlyVTT.mockReturnValue('WEBVTT\n\ntranslation-only');
    mockOnMessage.mockReturnValue(() => {});
    mockParseSubtitles.mockReturnValue(MOCK_CUES);

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
    stopCoordinator = mod.startCoordinator();
  });

  afterEach(() => {
    vi.clearAllTimers();
    if (stopCoordinator) {
      stopCoordinator();
      stopCoordinator = null;
    }
    document.querySelectorAll('video').forEach((v) => v.remove());
    vi.resetModules();
  });

  /** Helper: a real <video> must exist BEFORE startCoordinator so scanForVideos
   *  attaches the seeked listener. Created per-test (not in beforeEach) so the
   *  intercept-only assertions don't depend on it, and removed in afterEach. */
  function attachSeekVideo(): HTMLVideoElement {
    const video = document.createElement('video');
    Object.defineProperty(video, 'currentTime', { writable: true, value: 201 });
    document.body.appendChild(video);
    return video;
  }

  it('keeps the session alive across an in-range seek and still accepts chunks with the original sessionId', async () => {
    // Establish the intercept-path session.
    const payload = {
      url: 'https://sub.ykimg.com/test.ass',
      body: '[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hello',
      contentType: 'text/plain',
      platform: 'youku',
      originalLanguage: 'en',
    };
    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-seek-1');

    // Sanity: intercept must have activated overlay mode for the seek guard to engage.
    expect(mockUpdateCues).toHaveBeenCalled();

    const sendMessageMock = global.chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    sendMessageMock.mockClear();
    mockUpdateCues.mockClear();

    // Add the seek target video AFTER intercept; the coordinator's
    // MutationObserver attaches the seeked listener on insertion.
    const video = attachSeekVideo();
    // Wait a microtask for the MutationObserver callback to fire.
    await Promise.resolve();

    // In-range seek (201s → 3s; cues cover [0,4], so 3s is in range).
    (video.currentTime as number) = 3;
    video.dispatchEvent(new Event('seeked'));

    // The in-range guard returns synchronously without scheduling the reset
    // timer, so we can assert immediately.
    const cancelCalls = sendMessageMock.mock.calls.filter(
      ([msg]) => (msg as { action?: string }).action === 'CANCEL_SUBTITLE_SESSION',
    );
    expect(cancelCalls).toHaveLength(0);
    // Overlay must NOT have been blanked.
    expect(mockUpdateCues).not.toHaveBeenCalledWith([]);

    // A subsequent chunk for the same session must be accepted, not dropped.
    mockUpdateCues.mockClear();
    extensionMessageHandler(
      { action: 'SUBTITLE_CHUNK_TRANSLATED', cues: MOCK_TRANSLATED_CUES, sessionId: 42 },
      {} as chrome.runtime.MessageSender,
      () => {},
    );
    expect(mockUpdateCues).toHaveBeenCalledWith(MOCK_TRANSLATED_CUES);
  });

  it('Youku ASS intercept blanks native with empty ASS (hides original Dialogue)', async () => {
    const assBody = `[Script Info]
Title: Youku

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hello`;

    mockHandler.transformResponse.mockReturnValue(MOCK_CUES);
    mockHandler.getDomCueSource = vi.fn(() => ({
      cueSelector: '#subtitle',
      captionWindowSelector: '#subtitle',
      captionHideMethod: 'visibility' as const,
    }));
    const payload = {
      url: 'https://sub.ykimg.com/test.ass',
      body: assBody,
      contentType: 'text/plain',
      platform: 'youku',
      originalLanguage: 'en',
    };
    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-youku-ass');

    const sent = mockSendTranslatedSubtitle.mock.calls.find(
      (c) => (c[0] as { requestId?: string }).requestId === 'req-youku-ass',
    );
    expect(sent).toBeTruthy();
    const vttContent = (sent![0] as { vttContent: string }).vttContent;
    expect(vttContent).toMatch(/\[Script Info\]/);
    // Must remain ASS-shaped (Youku Dialogue parser), never WEBVTT …
    expect(vttContent).not.toMatch(/^WEBVTT/m);
    // … but must not re-show original Dialogue lines under the overlay.
    expect(vttContent).not.toMatch(/Dialogue:/i);
    expect(vttContent).not.toContain('Hello');

    // Intercept path uses display:none (full track already captured — no DOM scrape).
    const hideStyle = document.head.querySelector('style[data-anyllm-role="caption-hide"]');
    expect(hideStyle?.textContent).toMatch(/#subtitle\s*\{\s*display:\s*none\s*!important/i);
  });

  it('regression: an out-of-range seek still cancels the session', async () => {
    const payload = {
      url: 'https://sub.ykimg.com/test.ass',
      body: '[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hello',
      contentType: 'text/plain',
      platform: 'youku',
      originalLanguage: 'en',
    };
    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-seek-3');
    expect(mockUpdateCues).toHaveBeenCalled();

    vi.useFakeTimers();
    try {
      const video = attachSeekVideo();
      await Promise.resolve();

      const sendMessageMock = global.chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
      sendMessageMock.mockClear();

      // Out-of-range seek (201s → 9999s; cues cover [0,4], so 9999 is out of range).
      (video.currentTime as number) = 9999;
      video.dispatchEvent(new Event('seeked'));

      await vi.advanceTimersByTimeAsync(250);

      const cancelCalls = sendMessageMock.mock.calls.filter(
        ([msg]) => (msg as { action?: string }).action === 'CANCEL_SUBTITLE_SESSION',
      );
      // Out-of-range seeks are NOT short-circuited by the in-range guard —
      // they still cancel the active session. (Count may exceed 1 if the
      // fake-timer window also flushes other pending senders; we only need to
      // prove the cancel path fired at least once.)
      expect(cancelCalls.length).toBeGreaterThanOrEqual(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ============================================================================
// YouTube first-load CC-on: AI re-align toast + proactive/unified fetch path
// ============================================================================

describe('subtitleCoordinator – YouTube ASR first-load pipeline', () => {
  let cleanupCoordinator: (() => void) | null = null;

  beforeEach(async () => {
    vi.clearAllMocks();
    capturedInterceptedHandler = null;
    _capturedTracksHandler = null;
    cleanupCoordinator?.();
    cleanupCoordinator = null;
    document.body.innerHTML = '';
    vi.resetModules();

    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'www.youtube.com',
        pathname: '/watch',
        href: 'https://www.youtube.com/watch?v=daXaTug8rL4',
      },
      writable: true,
      configurable: true,
    });

    mockInitializeControls.mockResolvedValue(undefined);
    mockLoadSettings.mockResolvedValue({
      ...MOCK_SETTINGS,
      subtitleSettings: {
        ...MOCK_SETTINGS.subtitleSettings,
        autoActivateSubtitles: false,
        youtubeAsrResegment: {
          enable: true,
          aiEnable: true,
        },
      },
    });
    // YouTube has no DOM cue source — ensure play path uses tryAutoActivate,
    // not tryAutoActivateForDom (truthy getDomCueSource function would steal it).
    const youtubeHandler = {
      ...mockHandler,
      platform: 'youtube',
      getDomCueSource: undefined as unknown as typeof mockHandler.getDomCueSource,
      getManifestPatterns: undefined as unknown as (() => unknown[]) | undefined,
      transformResponse: vi.fn(() => MOCK_CUES),
    };
    mockGetHandlerByPlatform.mockReturnValue(youtubeHandler);
    mockDetectCurrentHandler.mockReturnValue(youtubeHandler);
    mockBuildBilingualVTT.mockReturnValue('WEBVTT\n\nbilingual');
    mockOnMessage.mockReturnValue(() => {});
    mockParseSubtitles.mockReturnValue(MOCK_CUES);
    mockExtractPageContext.mockReturnValue({});
    mockResolveCategory.mockReturnValue('media');

    global.chrome = {
      runtime: {
        sendMessage: vi.fn().mockImplementation(async (msg: { action?: string }) => {
          if (msg.action === 'GET_ASR_REALIGN_CACHE') {
            return {
              success: true,
              entry: {
                key: 'ai:daXaTug8rL4:en:hash',
                cues: [
                  { startTime: 0, endTime: 2.5, text: 'Hello world realigned' },
                ],
              },
            };
          }
          if (msg.action === 'RESEGMENT_YOUTUBE_ASR') {
            return {
              success: true,
              cues: [{ startTime: 0, endTime: 2.5, text: 'Hello world realigned' }],
            };
          }
          if (msg.action === 'translateSubtitle') {
            return { success: true, cues: MOCK_TRANSLATED_CUES, sessionId: 7 };
          }
          if (msg.action === 'FETCH_SUBTITLE') {
            return {
              content:
                'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello\n\n00:00:02.000 --> 00:00:04.000\nWorld\n',
            };
          }
          return { success: true };
        }),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    } as unknown as typeof chrome;

    const mod = await import('@/content/subtitleCoordinator');
    cleanupCoordinator = mod.startCoordinator();
  });

  afterEach(() => {
    cleanupCoordinator?.();
    cleanupCoordinator = null;
    document.body.innerHTML = '';
    vi.clearAllTimers();
    vi.resetModules();
  });

  it('shows re-align progress on subtitle toast for AI cache hit (intercept path and selectSubtitleTrack path)', async () => {
    // Scenario 1: intercept-path AI cache hit surfaces a "saved re-align" toast
    // and translates the cached (realigned) cues.
    const payload = {
      url: 'https://www.youtube.com/api/timedtext?v=daXaTug8rL4&lang=en&kind=asr&fmt=json3',
      body: JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'Hello' }] }] }),
      contentType: 'application/json',
      platform: 'youtube',
      originalLanguage: 'en',
    };

    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-realign-toast');

    expect(mockShowSubtitleToast).toHaveBeenCalledWith(
      expect.stringMatching(/saved re-align|Using saved re-align/i),
      expect.anything(),
    );
    const translateCall = (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => (c[0] as { action?: string }).action === 'translateSubtitle',
    );
    expect(translateCall).toBeTruthy();
    expect((translateCall![0] as { cues: Array<{ text: string }> }).cues[0].text).toContain(
      'realigned',
    );

    // Scenario 2: manual selectSubtitleTrack for YouTube ASR goes through the
    // same unified cache/resegment intercept pipeline before translate.
    // Reset coordinator state so this scenario runs from a clean slate, like
    // a standalone test.
    cleanupCoordinator?.();
    cleanupCoordinator = null;
    vi.resetModules();
    capturedInterceptedHandler = null;
    _capturedTracksHandler = null;
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockClear();
    const mod = await import('@/content/subtitleCoordinator');
    cleanupCoordinator = mod.startCoordinator();

    // Discover ASR track first
    expect(_capturedTracksHandler).toBeTruthy();
    await _capturedTracksHandler!({
      platform: 'youtube',
      videoId: 'daXaTug8rL4',
      tracks: [
        {
          language: 'en',
          label: 'English (auto-generated)',
          url: 'https://www.youtube.com/api/timedtext?v=daXaTug8rL4&lang=en&kind=asr&fmt=json3',
          isAutoGenerated: true,
          platform: 'youtube',
          videoId: 'daXaTug8rL4',
        },
      ],
    });

    // Flush discovery debounce
    await new Promise((r) => setTimeout(r, 160));

    await mod.selectSubtitleTrack('en');

    const actions = (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => (c[0] as { action?: string }).action,
    );
    // Unified path must hit cache/resegment before translate (not bare overlay translate only).
    expect(actions).toContain('GET_ASR_REALIGN_CACHE');
    expect(actions).toContain('translateSubtitle');
    expect(mockShowSubtitleToast).toHaveBeenCalledWith(
      expect.stringMatching(/saved re-align|Using saved re-align|Re-aligning/i),
      expect.anything(),
    );
  });

  it('hides YouTube native caption window when overlay activates (proactive path)', async () => {
    const mod = await import('@/content/subtitleCoordinator');
    const youtubeHandler = {
      platform: 'youtube',
      detect: () => true,
      getPatterns: () => [],
      transformResponse: vi.fn(() => MOCK_CUES),
      isWatchPage: () => true,
      getNativeCaptionHide: () => ({
        selector: '.ytp-caption-window-container, .caption-window',
        method: 'display' as const,
      }),
    };
    mockGetHandlerByPlatform.mockReturnValue(youtubeHandler);
    mockDetectCurrentHandler.mockReturnValue(youtubeHandler);

    await _capturedTracksHandler!({
      platform: 'youtube',
      videoId: 'daXaTug8rL4',
      tracks: [
        {
          language: 'en',
          label: 'English (auto-generated)',
          url: 'https://www.youtube.com/api/timedtext?v=daXaTug8rL4&lang=en&kind=asr&fmt=json3',
          isAutoGenerated: true,
          platform: 'youtube',
          videoId: 'daXaTug8rL4',
        },
      ],
    });
    await new Promise((r) => setTimeout(r, 160));
    await mod.selectSubtitleTrack('en');

    const hideStyle = document.head.querySelector('style[data-anyllm-role="caption-hide"]');
    expect(hideStyle).toBeTruthy();
    expect(hideStyle?.textContent).toMatch(/ytp-caption-window-container/);
    expect(hideStyle?.textContent).toMatch(/display:\s*none/i);
  });

  it('proactively fetches preferred YouTube ASR after play when no intercept session yet', async () => {
    const mod = await import('@/content/subtitleCoordinator');

    await _capturedTracksHandler!({
      platform: 'youtube',
      videoId: 'daXaTug8rL4',
      tracks: [
        {
          language: 'en',
          label: 'English (auto-generated)',
          url: 'https://www.youtube.com/api/timedtext?v=daXaTug8rL4&lang=en&kind=asr&fmt=json3',
          isAutoGenerated: true,
          platform: 'youtube',
          videoId: 'daXaTug8rL4',
        },
      ],
    });
    await new Promise((r) => setTimeout(r, 160));

    const video = document.createElement('video');
    document.body.appendChild(video);
    video.dispatchEvent(new Event('play'));

    // Playback watcher yields 200ms before auto path; the proactive chain
    // (debounce + cache lookup + translate) is async, so poll for the expected
    // messages instead of relying on a fixed wall-clock delay.
    const sendMessageMock = chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    let actions: Array<string | undefined> = [];
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 100));
      actions = sendMessageMock.mock.calls.map((c) => (c[0] as { action?: string }).action);
      if (actions.includes('GET_ASR_REALIGN_CACHE') && actions.includes('translateSubtitle')) {
        break;
      }
    }
    // Even with autoActivateSubtitles=false, YouTube watch pages should
    // safety-net fetch preferred/ASR when play starts and no intercept ran.
    expect(actions).toContain('GET_ASR_REALIGN_CACHE');
    expect(actions).toContain('translateSubtitle');
    void mod;
  });
});

// ============================================================================
// Watch-page URL rules (ported from tests/unit/subtitleCoordinator.test.ts)
// ============================================================================

describe('subtitleCoordinator – watch page URL rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // Fall through to the built-in URL rules (no handler-specific isWatchPage).
    mockDetectCurrentHandler.mockReturnValue(null);
    mockOnMessage.mockReturnValue(() => {});
    global.chrome = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    } as unknown as typeof chrome;
  });

  it.each([
    ['www.youtube.com', '/watch', true],
    ['www.max.com', '/video/watch/123', true],
    ['www.max.com', '/browse', false],
    ['www.linkedin.com', '/learning/course', true],
    ['www.linkedin.com', '/feed/', false],
  ])('evaluates watch page for %s %s correctly', async (hostname, pathname, expected) => {
    Object.defineProperty(window, 'location', {
      value: { hostname, pathname, href: `https://${hostname}${pathname}` },
      writable: true,
      configurable: true,
    });
    const mod = await import('@/content/subtitleCoordinator');
    expect(mod.isOnWatchPage()).toBe(expected);
  });
});
