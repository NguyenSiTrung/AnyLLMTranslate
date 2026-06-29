import { describe, it, expect, beforeEach, vi } from 'vitest';

let capturedManifestCuesHandler: ((payload: unknown) => Promise<void>) | null = null;
let capturedDomCuesHandler: ((payload: unknown) => Promise<void>) | null = null;

async function invokeManifestCuesHandler(payload: unknown): Promise<void> {
  expect(capturedManifestCuesHandler).not.toBeNull();
  if (capturedManifestCuesHandler) {
    await capturedManifestCuesHandler(payload);
  }
}

async function invokeDomCuesHandler(payload: unknown): Promise<void> {
  expect(capturedDomCuesHandler).not.toBeNull();
  if (capturedDomCuesHandler) {
    await capturedDomCuesHandler(payload);
  }
}

vi.mock('@/content/messageBridge', () => ({
  onSubtitleIntercepted: () => () => {},
  onTracksDiscovered: () => () => {},
  onDomCues: (handler: (payload: unknown) => Promise<void>) => {
    capturedDomCuesHandler = handler;
    return () => {};
  },
  onDomTrackChanged: () => () => {},
  onTextTrackCues: () => () => {},
  onMseCues: () => () => {},
  onManifestCues: (handler: (payload: unknown) => Promise<void>) => {
    capturedManifestCuesHandler = handler;
    return () => {};
  },
  onMpdProcessing: () => () => {},
  sendTranslatedSubtitle: vi.fn(),
}));

vi.mock('@/inject/messageBridge', () => ({
  onMessage: () => () => {},
  sendMessage: vi.fn(),
}));

vi.mock('@/content/subtitleOverlay', () => ({
  initializeOverlay: vi.fn(),
  updateCues: vi.fn(),
  cleanup: vi.fn(),
  isOverlayActive: vi.fn(() => false),
  resetOverlayState: vi.fn(),
  getOverlayTextContainer: vi.fn(() => document.createElement('div')),
}));

vi.mock('@/content/subtitleControls', () => ({
  initializeControls: vi.fn(() => Promise.resolve({})),
  enableDragReposition: vi.fn(() => vi.fn()),
}));

const loadSettingsMock = vi.fn();
vi.mock('@/lib/config', () => ({
  loadSettings: (...args: unknown[]) => loadSettingsMock(...args),
}));

const detectCurrentHandlerMock = vi.fn();
vi.mock('@/inject/subtitleHandlers/registry', () => ({
  getHandlerByPlatform: vi.fn(() => null),
  detectCurrentHandler: (...args: unknown[]) => detectCurrentHandlerMock(...args),
}));

const baseSettings = {
  enableContextAwareTranslation: false,
  subtitleSettings: {
    enabled: true,
    autoActivateSubtitles: true,
    preferredSubtitleLanguage: 'en',
    fontSize: 20,
    position: 'bottom',
    backgroundOpacity: 0.75,
    fontFamily: 'system',
    displayMode: 'bilingual',
  },
  sourceLanguage: 'auto',
  targetLanguage: 'vi',
};

function setLocation(hostname: string, pathname: string): void {
  Object.defineProperty(window, 'location', {
    value: { hostname, pathname, href: `https://${hostname}${pathname}` },
    writable: true,
    configurable: true,
  });
}

describe('subtitleCoordinator — manifest cues (hbomax)', () => {
  beforeEach(async () => {
    const { resetCoordinatorState } = await import('@/content/subtitleCoordinator');
    resetCoordinatorState();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    capturedManifestCuesHandler = null;
    capturedDomCuesHandler = null;
    loadSettingsMock.mockReset();
    loadSettingsMock.mockResolvedValue(JSON.parse(JSON.stringify(baseSettings)));
    detectCurrentHandlerMock.mockReset();
    detectCurrentHandlerMock.mockReturnValue({
      platform: 'hbomax',
      getDomCueSource: () => ({
        cueSelector: '[data-testid="cueBoxRowTextCue"]',
        captionWindowSelector: '[data-testid="caption_renderer_overlay"]',
        observeRootSelector: '[data-testid="caption_renderer_overlay"]',
        readActiveLanguage: () => 'en',
      }),
      isWatchPage: () => true,
    });
    vi.clearAllMocks();

    global.chrome = {
      runtime: {
        sendMessage: vi.fn().mockImplementation((msg: { action: string; cues?: { text: string }[] }) => {
          if (msg.action === 'translateSubtitle' && msg.cues) {
            return Promise.resolve({
              success: true,
              cues: msg.cues.map((c, i) => ({
                startTime: i,
                endTime: i + 1,
                text: `${c.text} (vi)`,
                originalText: c.text,
              })),
              sessionId: 42,
            });
          }
          return Promise.resolve({ success: true });
        }),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
    } as unknown as typeof chrome;
  });

  it('activates manifest overlay from SUBTITLE_MANIFEST_CUES', async () => {
    setLocation('play.hbomax.com', '/video/watch/abc/def');
    const { startCoordinator, isInOverlayMode } = await import('@/content/subtitleCoordinator');
    const { initializeOverlay } = await import('@/content/subtitleOverlay');

    startCoordinator();

    await invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'en',
      url: 'https://cdn.example.com/subs_en.ttml',
      cues: [{ startTime: 1, endTime: 2, text: 'Hello' }],
    });

    expect(isInOverlayMode()).toBe(true);
    expect(initializeOverlay).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Hello (vi)' }),
      ]),
      expect.any(Object),
    );
  });

  it('manifest cues suppress subsequent DOM cues', async () => {
    setLocation('play.hbomax.com', '/video/watch/abc/def');
    const { startCoordinator } = await import('@/content/subtitleCoordinator');
    const { initializeOverlay, updateCues } = await import('@/content/subtitleOverlay');

    startCoordinator();

    await invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'en',
      url: 'https://cdn.example.com/subs_en.ttml',
      cues: [{ startTime: 1, endTime: 2, text: 'Manifest line' }],
    });

    const initCalls = vi.mocked(initializeOverlay).mock.calls.length;

    await invokeDomCuesHandler({
      platform: 'hbomax',
      language: 'en',
      cues: [{ startTime: 5, endTime: 6, text: 'DOM line' }],
    });

    expect(vi.mocked(initializeOverlay).mock.calls.length).toBe(initCalls);
    expect(updateCues).not.toHaveBeenCalled();
  });

  it('accepts MPD language variants matching preferred (zh-Hans-SG ↔ zh-Hans)', async () => {
    loadSettingsMock.mockResolvedValue({
      ...JSON.parse(JSON.stringify(baseSettings)),
      subtitleSettings: {
        ...baseSettings.subtitleSettings,
        preferredSubtitleLanguage: 'zh-Hans',
      },
    });
    setLocation('play.hbomax.com', '/video/watch/abc/def');
    const { startCoordinator, isInOverlayMode } = await import('@/content/subtitleCoordinator');
    const { initializeOverlay } = await import('@/content/subtitleOverlay');

    startCoordinator();

    await invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'zh-Hans-SG',
      url: 'https://cdn.example.com/subs_zh.ttml',
      cues: [{ startTime: 1, endTime: 2, text: '你好' }],
    });

    expect(isInOverlayMode()).toBe(true);
    expect(initializeOverlay).toHaveBeenCalled();
  });

  it('ignores non-preferred manifest language when preferred is set', async () => {
    setLocation('play.hbomax.com', '/video/watch/abc/def');
    const { startCoordinator, isInOverlayMode } = await import('@/content/subtitleCoordinator');

    startCoordinator();

    await invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'es',
      url: 'https://cdn.example.com/subs_es.ttml',
      cues: [{ startTime: 1, endTime: 2, text: 'Hola' }],
    });

    expect(isInOverlayMode()).toBe(false);
  });
});