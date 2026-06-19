import { describe, it, expect, beforeEach, vi } from 'vitest';

// Capture the onDomCues handler so we can invoke it directly with payloads.
let capturedDomCuesHandler: ((payload: unknown) => Promise<void>) | null = null;

/** Invoke the captured DOM cues handler, asserting it was registered. */
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
  getOverlayTextContainer: vi.fn(() => null),
}));

vi.mock('@/content/subtitleControls', () => ({
  initializeControls: vi.fn(() => Promise.resolve()),
  enableDragReposition: vi.fn(() => vi.fn()),
}));

vi.mock('@/lib/subtitleParser', () => ({
  parseSubtitles: vi.fn(() => []),
}));

// Default settings mock; per-test overrides via mockResolvedValue.
const loadSettingsMock = vi.fn();
vi.mock('@/lib/config', () => ({
  loadSettings: (...args: unknown[]) => loadSettingsMock(...args),
}));

vi.mock('@/inject/subtitleHandlers/registry', () => ({
  getHandlerByPlatform: vi.fn(() => null),
  detectCurrentHandler: vi.fn(() => null),
}));

const baseSettings = {
  enableContextAwareTranslation: false,
  subtitleSettings: {
    enabled: true,
    autoActivateSubtitles: true,
    preferredSubtitleLanguage: 'auto',
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

describe('subtitleCoordinator — DOM branch (hbomax)', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    capturedDomCuesHandler = null;
    loadSettingsMock.mockReset();
    loadSettingsMock.mockResolvedValue(JSON.parse(JSON.stringify(baseSettings)));
    vi.clearAllMocks();
    loadSettingsMock.mockResolvedValue(JSON.parse(JSON.stringify(baseSettings)));

    global.chrome = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({
          success: true,
          cues: [{ startTime: 0, endTime: 2, text: 'hi (vi)' }],
          sessionId: 1,
        }),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    } as unknown as typeof chrome;
  });

  it('isOnWatchPage returns true for /video/watch on max.com', async () => {
    setLocation('www.max.com', '/video/watch/abc-123/def');
    const { isOnWatchPage } = await import('@/content/subtitleCoordinator');
    expect(isOnWatchPage()).toBe(true);
  });

  it('isOnWatchPage returns true for /video/watch on play.hbomax.com', async () => {
    setLocation('play.hbomax.com', '/video/watch/abc-123/def');
    const { isOnWatchPage } = await import('@/content/subtitleCoordinator');
    expect(isOnWatchPage()).toBe(true);
  });

  it('isOnWatchPage returns false for non-watch path on max.com', async () => {
    setLocation('www.max.com', '/browse');
    const { isOnWatchPage } = await import('@/content/subtitleCoordinator');
    expect(isOnWatchPage()).toBe(false);
  });

  it('handleDomCues ignores payload when not on a watch page', async () => {
    setLocation('www.max.com', '/browse');
    const mod = await import('@/content/subtitleCoordinator');
    mod.startCoordinator();
    await invokeDomCuesHandler({
      cues: [{ startTime: 0, endTime: 2, text: 'hi' }],
      platform: 'hbomax',
      language: 'en',
    });
    const { initializeOverlay } = await import('@/content/subtitleOverlay');
    expect(vi.mocked(initializeOverlay)).not.toHaveBeenCalled();
    mod.resetCoordinatorState();
  });

  it('resetCoordinatorState removes an injected caption-hide style', async () => {
    setLocation('www.max.com', '/video/watch/abc/def');
    const { detectCurrentHandler } = await import('@/inject/subtitleHandlers/registry');
    vi.mocked(detectCurrentHandler).mockReturnValue({
      platform: 'hbomax',
      getDomCueSource: () => ({
        cueSelector: '[data-testid="cueBoxRowTextCue"]',
        captionWindowSelector: '[data-testid="caption_renderer_overlay"]',
        observeRootSelector: '[data-testid="caption_renderer_overlay"]',
        readActiveLanguage: () => 'en',
      }),
    } as never);

    const mod = await import('@/content/subtitleCoordinator');
    mod.startCoordinator();

    await invokeDomCuesHandler({
      cues: [{ startTime: 0, endTime: 2, text: 'hi' }],
      platform: 'hbomax',
      language: 'en',
    });

    expect(document.head.querySelector('style[data-anyllm-role="caption-hide"]')).not.toBeNull();

    mod.resetCoordinatorState();

    expect(document.head.querySelector('style[data-anyllm-role="caption-hide"]')).toBeNull();
  });

  it('handleDomCues refreshes cues via updateCues when already in overlay mode', async () => {
    setLocation('www.max.com', '/video/watch/abc/def');
    const { detectCurrentHandler } = await import('@/inject/subtitleHandlers/registry');
    vi.mocked(detectCurrentHandler).mockReturnValue({
      platform: 'hbomax',
      getDomCueSource: () => ({
        cueSelector: '[data-testid="cueBoxRowTextCue"]',
        captionWindowSelector: '[data-testid="caption_renderer_overlay"]',
        observeRootSelector: '[data-testid="caption_renderer_overlay"]',
        readActiveLanguage: () => 'en',
      }),
    } as never);

    const mod = await import('@/content/subtitleCoordinator');
    mod.startCoordinator();

    // First payload activates overlay mode.
    await invokeDomCuesHandler({
      cues: [{ startTime: 0, endTime: 2, text: 'first' }],
      platform: 'hbomax',
      language: 'en',
    });
    const { updateCues, initializeOverlay } = await import('@/content/subtitleOverlay');
    vi.mocked(initializeOverlay).mockClear();
    vi.mocked(updateCues).mockClear();

    // Second payload should refresh via updateCues, NOT re-init overlay.
    await invokeDomCuesHandler({
      cues: [{ startTime: 2, endTime: 4, text: 'second' }],
      platform: 'hbomax',
      language: 'en',
    });
    expect(vi.mocked(updateCues)).toHaveBeenCalledWith([
      { startTime: 2, endTime: 4, text: 'second' },
    ]);
    expect(vi.mocked(initializeOverlay)).not.toHaveBeenCalled();

    mod.resetCoordinatorState();
  });
});

describe('subtitleCoordinator — Max activation precondition (tryAutoActivateForDom)', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    loadSettingsMock.mockReset();
    loadSettingsMock.mockResolvedValue(JSON.parse(JSON.stringify(baseSettings)));
    vi.clearAllMocks();
    loadSettingsMock.mockResolvedValue(JSON.parse(JSON.stringify(baseSettings)));
    global.chrome = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({ success: true, cues: [], sessionId: 1 }),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    } as unknown as typeof chrome;
  });

  it('skips with reason "captions off" when caption overlay is absent', async () => {
    setLocation('www.max.com', '/video/watch/x/y');
    // No caption_renderer_overlay in DOM → captions off.
    const { detectCurrentHandler } = await import('@/inject/subtitleHandlers/registry');
    vi.mocked(detectCurrentHandler).mockReturnValue({
      platform: 'hbomax',
      getDomCueSource: () => ({
        cueSelector: '[data-testid="cueBoxRowTextCue"]',
        captionWindowSelector: '[data-testid="caption_renderer_overlay"]',
        observeRootSelector: '[data-testid="caption_renderer_overlay"]',
        readActiveLanguage: () => '',
      }),
    } as never);

    const { tryAutoActivateForDom } = await import('@/content/subtitleCoordinator');
    const result = await tryAutoActivateForDom();
    expect(result.activated).toBe(false);
    expect(result.reason).toContain('captions');
  });

  it('skips with reason "captions off" when overlay visible but active language empty (Off selected)', async () => {
    setLocation('www.max.com', '/video/watch/x/y');
    const overlay = document.createElement('div');
    overlay.setAttribute('data-testid', 'caption_renderer_overlay');
    overlay.style.visibility = 'visible';
    document.body.appendChild(overlay);

    const { detectCurrentHandler } = await import('@/inject/subtitleHandlers/registry');
    vi.mocked(detectCurrentHandler).mockReturnValue({
      platform: 'hbomax',
      getDomCueSource: () => ({
        cueSelector: '[data-testid="cueBoxRowTextCue"]',
        captionWindowSelector: '[data-testid="caption_renderer_overlay"]',
        observeRootSelector: '[data-testid="caption_renderer_overlay"]',
        readActiveLanguage: () => '',
      }),
    } as never);

    const { tryAutoActivateForDom } = await import('@/content/subtitleCoordinator');
    const result = await tryAutoActivateForDom();
    expect(result.activated).toBe(false);
    expect(result.reason).toContain('captions');
  });

  it('skips when active language does not match preferredSubtitleLanguage', async () => {
    setLocation('www.max.com', '/video/watch/x/y');
    const overlay = document.createElement('div');
    overlay.setAttribute('data-testid', 'caption_renderer_overlay');
    overlay.style.visibility = 'visible';
    document.body.appendChild(overlay);
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'player-ux-text-track-button');
    btn.setAttribute('aria-label', 'Thai');
    btn.setAttribute('aria-checked', 'true');
    document.body.appendChild(btn);

    const { detectCurrentHandler } = await import('@/inject/subtitleHandlers/registry');
    vi.mocked(detectCurrentHandler).mockReturnValue({
      platform: 'hbomax',
      getDomCueSource: () => ({
        cueSelector: '[data-testid="cueBoxRowTextCue"]',
        captionWindowSelector: '[data-testid="caption_renderer_overlay"]',
        observeRootSelector: '[data-testid="caption_renderer_overlay"]',
        readActiveLanguage: () => 'th',
      }),
    } as never);

    // Preferred language = en, active = th → mismatch.
    loadSettingsMock.mockResolvedValue({
      ...JSON.parse(JSON.stringify(baseSettings)),
      subtitleSettings: {
        ...baseSettings.subtitleSettings,
        preferredSubtitleLanguage: 'en',
      },
    });

    const { tryAutoActivateForDom } = await import('@/content/subtitleCoordinator');
    const result = await tryAutoActivateForDom();
    expect(result.activated).toBe(false);
    expect(result.reason).toContain('language');
  });

  it('activates when overlay visible and language matches (preferred=auto)', async () => {
    setLocation('www.max.com', '/video/watch/x/y');
    const overlay = document.createElement('div');
    overlay.setAttribute('data-testid', 'caption_renderer_overlay');
    overlay.style.visibility = 'visible';
    document.body.appendChild(overlay);
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'player-ux-text-track-button');
    btn.setAttribute('aria-label', 'English');
    btn.setAttribute('aria-checked', 'true');
    document.body.appendChild(btn);

    const { detectCurrentHandler } = await import('@/inject/subtitleHandlers/registry');
    vi.mocked(detectCurrentHandler).mockReturnValue({
      platform: 'hbomax',
      getDomCueSource: () => ({
        cueSelector: '[data-testid="cueBoxRowTextCue"]',
        captionWindowSelector: '[data-testid="caption_renderer_overlay"]',
        observeRootSelector: '[data-testid="caption_renderer_overlay"]',
        readActiveLanguage: () => 'en',
      }),
    } as never);

    const { tryAutoActivateForDom, resetCoordinatorState } = await import('@/content/subtitleCoordinator');
    const result = await tryAutoActivateForDom();
    expect(result.activated).toBe(true);
    expect(result.reason).toContain('en');
    resetCoordinatorState();
  });
});