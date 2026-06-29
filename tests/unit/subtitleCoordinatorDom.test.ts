import { describe, it, expect, beforeEach, vi } from 'vitest';

// Capture the onDomCues / onDomTrackChanged handlers so we can invoke them directly.
let capturedDomCuesHandler: ((payload: unknown) => Promise<void>) | null = null;
let capturedDomTrackChangedHandler: ((payload: unknown) => Promise<void>) | null = null;
let capturedTracksDiscoveredHandler: ((payload: unknown) => Promise<void>) | null = null;

/** Invoke the captured DOM cues handler, asserting it was registered. */
async function invokeDomCuesHandler(payload: unknown): Promise<void> {
  expect(capturedDomCuesHandler).not.toBeNull();
  if (capturedDomCuesHandler) {
    await capturedDomCuesHandler(payload);
  }
}

vi.mock('@/content/messageBridge', () => ({
  onSubtitleIntercepted: () => () => {},
  onTracksDiscovered: (handler: (payload: unknown) => Promise<void>) => {
    capturedTracksDiscoveredHandler = handler;
    return () => {};
  },
  onDomCues: (handler: (payload: unknown) => Promise<void>) => {
    capturedDomCuesHandler = handler;
    return () => {};
  },
  onDomTrackChanged: (handler: (payload: unknown) => Promise<void>) => {
    capturedDomTrackChangedHandler = handler;
    return () => {};
  },
  onTextTrackCues: () => () => {},
  onMseCues: () => () => {},
  onManifestCues: () => () => {},
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
    capturedDomTrackChangedHandler = null;
    loadSettingsMock.mockReset();
    loadSettingsMock.mockResolvedValue(JSON.parse(JSON.stringify(baseSettings)));
    vi.clearAllMocks();
    loadSettingsMock.mockResolvedValue(JSON.parse(JSON.stringify(baseSettings)));

    global.chrome = {
      runtime: {
        // Return translated cues keyed by originalText so the merge map works.
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
              sessionId: 1,
            });
          }
          return Promise.resolve({ success: true, cues: [], sessionId: 1 });
        }),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
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

  it('handleDomCues does not activate DOM before play when HBO Max MPD pipeline is available', async () => {
    setLocation('play.hbomax.com', '/video/watch/abc/def');
    const { detectCurrentHandler } = await import('@/inject/subtitleHandlers/registry');
    vi.mocked(detectCurrentHandler).mockReturnValue({
      platform: 'hbomax',
      getManifestPatterns: () => [{ platform: 'hbomax', pattern: /\.mpd/i }],
      getDomCueSource: () => ({
        cueSelector: '[data-testid="cueBoxRowTextCue"]',
        captionWindowSelector: '[data-testid="caption_renderer_overlay"]',
        observeRootSelector: '[data-testid="caption_renderer_overlay"]',
        readActiveLanguage: () => 'en',
      }),
      isWatchPage: () => true,
    } as never);

    const mod = await import('@/content/subtitleCoordinator');
    mod.startCoordinator();

    await invokeDomCuesHandler({
      cues: [{ startTime: 0, endTime: 2, text: 'preview caption' }],
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

  it('handleDomCues translates new cues on subsequent batches without clobbering translated cues', async () => {
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

    // First payload activates overlay mode and translates 'first'.
    await invokeDomCuesHandler({
      cues: [{ startTime: 0, endTime: 2, text: 'first' }],
      platform: 'hbomax',
      language: 'en',
    });
    const { updateCues, initializeOverlay } = await import('@/content/subtitleOverlay');
    vi.mocked(initializeOverlay).mockClear();
    vi.mocked(updateCues).mockClear();

    // Second payload adds a new cue 'second'. The coordinator must translate
    // the delta and update the overlay with BILINGUAL cues (originalText + text),
    // NOT overwrite with raw source cues.
    await invokeDomCuesHandler({
      cues: [
        { startTime: 0, endTime: 2, text: 'first' },
        { startTime: 2, endTime: 4, text: 'second' },
      ],
      platform: 'hbomax',
      language: 'en',
    });
    expect(vi.mocked(updateCues)).toHaveBeenCalled();
    // The last updateCues call should carry translated cues: each has originalText
    // (source) and text (translated).
    const lastCall = vi.mocked(updateCues).mock.calls.at(-1)?.[0] as Array<{
      text: string;
      originalText?: string;
    }>;
    expect(lastCall).toBeDefined();
    const secondCue = lastCall.find((c) => c.originalText === 'second');
    expect(secondCue).toBeDefined();
    expect(secondCue?.text).toBe('second (vi)');
    // Must not re-init the overlay on subsequent batches.
    expect(vi.mocked(initializeOverlay)).not.toHaveBeenCalled();

    mod.resetCoordinatorState();
  });
});

describe('subtitleCoordinator — Max activation precondition (tryAutoActivateForDom)', () => {
  beforeEach(async () => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    // Reset module-level coordinator state (shared across describe blocks).
    const { resetCoordinatorState } = await import('@/content/subtitleCoordinator');
    resetCoordinatorState();
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

  it('manual tryAutoActivateForDom activates when preferred language mismatches active track', async () => {
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

    loadSettingsMock.mockResolvedValue({
      ...JSON.parse(JSON.stringify(baseSettings)),
      subtitleSettings: {
        ...baseSettings.subtitleSettings,
        preferredSubtitleLanguage: 'en',
      },
    });

    const { tryAutoActivateForDom, resetCoordinatorState } = await import('@/content/subtitleCoordinator');
    const manual = await tryAutoActivateForDom({ manual: true });
    expect(manual.activated).toBe(true);
    resetCoordinatorState();
  });

  it('handleDomTrackChanged clears overlay cues and cancels background session', async () => {
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
      cues: [{ startTime: 0, endTime: 2, text: 'first' }],
      platform: 'hbomax',
      language: 'en',
    });

    const { updateCues } = await import('@/content/subtitleOverlay');
    vi.mocked(updateCues).mockClear();

    expect(capturedDomTrackChangedHandler).not.toBeNull();
    if (capturedDomTrackChangedHandler) {
      await capturedDomTrackChangedHandler({ platform: 'hbomax', language: 'th' });
    }

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CANCEL_SUBTITLE_SESSION' }),
    );
    expect(vi.mocked(updateCues)).toHaveBeenCalledWith([]);

    mod.resetCoordinatorState();
  });

  it('manualActivateSubtitles succeeds on DOM platform without track URLs', async () => {
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

    const { manualActivateSubtitles, tryAutoActivateForDom, resetCoordinatorState } =
      await import('@/content/subtitleCoordinator');
    await expect(manualActivateSubtitles()).resolves.toBeUndefined();
    const after = await tryAutoActivateForDom({ manual: true });
    expect(after.activated).toBe(true);
    resetCoordinatorState();
  });

  describe('manifest and DOM precedence integration', () => {
    beforeEach(() => {
      // Only capturedTracksDiscoveredHandler is registered by this file's
      // messageBridge mock (onTextTrackCues / onMseCues return no-op cleanups
      // and capture nothing). Reset the one handler these tests actually invoke.
      capturedTracksDiscoveredHandler = null;
    });

    it('processTracksDiscovered uses payload.tracks directly and selectSubtitleTrack routes to manifest if track has a url', async () => {
      setLocation('www.max.com', '/video/watch/x/y');
      
      const { detectCurrentHandler } = await import('@/inject/subtitleHandlers/registry');
      const mockHandler = {
        platform: 'hbomax',
        getDomCueSource: () => ({
          cueSelector: '[data-testid="cueBoxRowTextCue"]',
          captionWindowSelector: '[data-testid="caption_renderer_overlay"]',
          observeRootSelector: '[data-testid="caption_renderer_overlay"]',
          readActiveLanguage: () => 'en',
        }),
        extractAvailableTracks: vi.fn(() => [
          { language: 'en', label: 'English', url: undefined, platform: 'hbomax' }
        ]),
      };
      vi.mocked(detectCurrentHandler).mockReturnValue(mockHandler as never);

      const mod = await import('@/content/subtitleCoordinator');
      mod.startCoordinator();

      expect(capturedTracksDiscoveredHandler).not.toBeNull();

      // 1. Simulate discovery of a manifest track with a URL
      const manifestTracks = [
        { language: 'en', label: 'English', url: 'https://cdn.max.com/sub.m3u8', platform: 'hbomax', videoId: 'y' }
      ];
      if (capturedTracksDiscoveredHandler) {
        await capturedTracksDiscoveredHandler({
          platform: 'hbomax',
          tracks: manifestTracks,
          videoId: 'y',
        });
      }

      // Assert HboMaxHandler.extractAvailableTracks was NOT called (payload.tracks used directly)
      expect(mockHandler.extractAvailableTracks).not.toHaveBeenCalled();

      // 2. Select track and verify it attempts manifest fetch rather than falling back to DOM scraping
      // Mock background response for FETCH_MANIFEST_SUBTITLES
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({
        success: true,
        cues: [{ startTime: 0, endTime: 2, text: 'hello from manifest' }],
      });
      // Mock background response for translateSubtitle
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({
        success: true,
        cues: [{ startTime: 0, endTime: 2, text: 'translated hello' }],
      });

      await mod.selectSubtitleTrack('en');

      // Verify FETCH_MANIFEST_SUBTITLES was called, indicating selectSubtitleTrack routed to manifest
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'FETCH_MANIFEST_SUBTITLES', playlistUrl: 'https://cdn.max.com/sub.m3u8' })
      );

      mod.resetCoordinatorState();
    });

    it('activateOverlayModeFromManifest overrides DOM overlay and suppresses subsequent DOM cues', async () => {
      setLocation('www.max.com', '/video/watch/x/y');
      
      const { detectCurrentHandler } = await import('@/inject/subtitleHandlers/registry');
      const mockHandler = {
        platform: 'hbomax',
        getDomCueSource: () => ({
          cueSelector: '[data-testid="cueBoxRowTextCue"]',
          captionWindowSelector: '[data-testid="caption_renderer_overlay"]',
          observeRootSelector: '[data-testid="caption_renderer_overlay"]',
          readActiveLanguage: () => 'en',
        }),
      };
      vi.mocked(detectCurrentHandler).mockReturnValue(mockHandler as never);

      const mod = await import('@/content/subtitleCoordinator');
      mod.startCoordinator();

      // 1. Activate DOM-sourced overlay first
      const { initializeOverlay, updateCues } = await import('@/content/subtitleOverlay');
      vi.mocked(initializeOverlay).mockClear();
      vi.mocked(updateCues).mockClear();

      // Mock translateSubtitle for DOM cues
      // Mock chrome.runtime.sendMessage based on action to handle parallel / sequential flows correctly
      vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (msg: unknown) => {
        const message = msg as { action?: string; cues?: Array<{ text: string }> };
        if (message.action === 'translateSubtitle') {
          if (message.cues?.[0]?.text === 'dom cue') {
            return { success: true, cues: [{ startTime: 0, endTime: 2, text: 'translated dom' }] };
          }
          return { success: true, cues: [{ startTime: 0, endTime: 2, text: 'translated manifest' }] };
        }
        if (message.action === 'FETCH_MANIFEST_SUBTITLES') {
          return { success: true, cues: [{ startTime: 0, endTime: 2, text: 'manifest cue' }] };
        }
        return { success: true };
      });

      await invokeDomCuesHandler({
        cues: [{ startTime: 0, endTime: 2, text: 'dom cue' }],
        platform: 'hbomax',
        language: 'en',
      });

      expect(vi.mocked(initializeOverlay)).toHaveBeenCalled();

      // 2. Simulate discovery and activation of manifest track (higher priority)
      // Directly trigger selectSubtitleTrack with a manifest track
      const manifestTracks = [
        { language: 'en', label: 'English', url: 'https://cdn.max.com/sub.m3u8', platform: 'hbomax', videoId: 'y' }
      ];
      if (capturedTracksDiscoveredHandler) {
        await capturedTracksDiscoveredHandler({
          platform: 'hbomax',
          tracks: manifestTracks,
          videoId: 'y',
        });
      }

      vi.mocked(initializeOverlay).mockClear();
      await mod.selectSubtitleTrack('en');

      // Verify initializeOverlay was called again with manifest cues
      expect(vi.mocked(initializeOverlay)).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ text: 'translated manifest' })
        ]),
        expect.any(Object)
      );

      // 3. Verify that subsequent DOM cues are suppressed (shouldSuppressSource('dom') returns true)
      vi.mocked(updateCues).mockClear();
      await invokeDomCuesHandler({
        cues: [{ startTime: 2, endTime: 4, text: 'new dom cue' }],
        platform: 'hbomax',
        language: 'en',
      });

      expect(vi.mocked(updateCues)).not.toHaveBeenCalled();

      mod.resetCoordinatorState();
    });
  });
});