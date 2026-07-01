import { describe, it, expect, beforeEach, vi } from 'vitest';

let capturedManifestCuesHandler: ((payload: unknown) => Promise<void>) | null = null;
let capturedDomCuesHandler: ((payload: unknown) => Promise<void>) | null = null;
let capturedDomTrackChangedHandler: ((payload: unknown) => Promise<void>) | null = null;
let capturedExtensionMessageHandler: ((msg: unknown) => void) | null = null;

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

function invokeExtensionMessage(msg: unknown): void {
  expect(capturedExtensionMessageHandler).not.toBeNull();
  if (capturedExtensionMessageHandler) {
    capturedExtensionMessageHandler(msg);
  }
}

vi.mock('@/content/messageBridge', () => ({
  onSubtitleIntercepted: () => () => {},
  onTracksDiscovered: () => () => {},
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
    capturedDomTrackChangedHandler = null;
    capturedExtensionMessageHandler = null;
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
        onMessage: {
          addListener: (h: (msg: unknown) => void) => { capturedExtensionMessageHandler = h; },
          removeListener: () => { capturedExtensionMessageHandler = null; },
        },
      },
      storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
    } as unknown as typeof chrome;
  });

  it('activates manifest overlay from SUBTITLE_MANIFEST_CUES', async () => {
    setLocation('play.hbomax.com', '/video/watch/abc/def');
    const { startCoordinator, isInOverlayMode } = await import('@/content/subtitleCoordinator');
    const { initializeOverlay, updateCues } = await import('@/content/subtitleOverlay');

    startCoordinator();

    await invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'en',
      url: 'https://cdn.example.com/subs_en.ttml',
      cues: [{ startTime: 1, endTime: 2, text: 'Hello' }],
    });

    expect(isInOverlayMode()).toBe(true);
    // Map-based activation seeds the overlay with original-text fallback
    // (DOM-tier parity), then upgrades via updateCues once the delta resolves.
    const lastCues = vi.mocked(updateCues).mock.calls.at(-1)?.[0] as Array<{
      text: string; originalText?: string;
    }>;
    expect(lastCues).toBeDefined();
    expect(lastCues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Hello (vi)', originalText: 'Hello' }),
      ]),
    );
    // initializeOverlay is still called once to mount the overlay shell.
    expect(initializeOverlay).toHaveBeenCalledTimes(1);
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
    vi.mocked(updateCues).mockClear();

    await invokeDomCuesHandler({
      platform: 'hbomax',
      language: 'en',
      cues: [{ startTime: 5, endTime: 6, text: 'DOM line' }],
    });

    // DOM tier is suppressed — no new overlay mount, no DOM-driven cue updates.
    expect(vi.mocked(initializeOverlay).mock.calls.length).toBe(initCalls);
    expect(updateCues).not.toHaveBeenCalled();
  });

  it('re-seeds manifest cues when tier is already active (non-append VTT restart)', async () => {
    setLocation('play.hbomax.com', '/video/watch/abc/def');
    const { startCoordinator } = await import('@/content/subtitleCoordinator');
    const { initializeOverlay, updateCues } = await import('@/content/subtitleOverlay');

    startCoordinator();

    await invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'en',
      url: 'https://cdn.example.com/subs_en.vtt',
      cues: [{ startTime: 1, endTime: 2, text: 'first cue' }],
    });

    const initCallsBefore = vi.mocked(initializeOverlay).mock.calls.length;
    vi.mocked(updateCues).mockClear();

    // VTT capture restart (e.g. BFCache restore) sends a fresh non-append buffer
    // while the manifest tier is still marked active.
    await invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'en',
      url: 'https://cdn.example.com/subs_en.vtt',
      cues: [{ startTime: 10, endTime: 12, text: 'restarted cue' }],
    });

    expect(vi.mocked(initializeOverlay).mock.calls.length).toBe(initCallsBefore);
    expect(updateCues).toHaveBeenCalled();
    const lastCues = vi.mocked(updateCues).mock.calls.at(-1)?.[0] as Array<{
      text: string; originalText?: string;
    }>;
    expect(lastCues?.find((c) => c.originalText === 'restarted cue')?.text).toBe('restarted cue (vi)');
  });

  it('append segment translates the new cue delta (not raw source)', async () => {
    setLocation('play.hbomax.com', '/video/watch/abc/def');
    const { startCoordinator } = await import('@/content/subtitleCoordinator');
    const { updateCues } = await import('@/content/subtitleOverlay');

    startCoordinator();

    // First segment → activation.
    await invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'en',
      url: 'https://cdn.example.com/subs_en.vtt',
      cues: [{ startTime: 1, endTime: 2, text: 'first cue' }],
    });

    vi.mocked(updateCues).mockClear();

    // Appended segment: the capture module sends the FULL accumulated buffer
    // (existing + new cues), deduped by startTime.
    await invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'en',
      url: 'https://cdn.example.com/subs_en.vtt',
      cues: [
        { startTime: 1, endTime: 2, text: 'first cue' }, // already known
        { startTime: 3, endTime: 4, text: 'second cue' }, // NEW delta
      ],
      append: true,
    });

    // The last updateCues must carry TRANSLATED text for the appended cue,
    // not the raw source 'second cue'. (The pre-fix bug passed raw source.)
    const lastCues = vi.mocked(updateCues).mock.calls.at(-1)?.[0] as Array<{
      text: string; originalText?: string;
    }>;
    expect(lastCues).toBeDefined();
    const appended = lastCues.find((c) => c.originalText === 'second cue');
    expect(appended).toBeDefined();
    expect(appended?.text).toBe('second cue (vi)');
  });

  it('append segment preserves earlier translations in the persistent map', async () => {
    setLocation('play.hbomax.com', '/video/watch/abc/def');
    const { startCoordinator } = await import('@/content/subtitleCoordinator');
    const { updateCues } = await import('@/content/subtitleOverlay');

    startCoordinator();

    await invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'en',
      url: 'https://cdn.example.com/subs_en.vtt',
      cues: [{ startTime: 1, endTime: 2, text: 'first cue' }],
    });

    await invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'en',
      url: 'https://cdn.example.com/subs_en.vtt',
      cues: [
        { startTime: 1, endTime: 2, text: 'first cue' },
        { startTime: 3, endTime: 4, text: 'second cue' },
      ],
      append: true,
    });

    // After the append, the first cue must still show its translation — the
    // manifestTranslationMap persists across appends.
    const lastCues = vi.mocked(updateCues).mock.calls.at(-1)?.[0] as Array<{
      text: string; originalText?: string;
    }>;
    const first = lastCues.find((c) => c.originalText === 'first cue');
    expect(first?.text).toBe('first cue (vi)');
  });

  it('appended cue falls back to original text until its translation resolves', async () => {
    setLocation('play.hbomax.com', '/video/watch/abc/def');
    const { startCoordinator } = await import('@/content/subtitleCoordinator');
    const { updateCues } = await import('@/content/subtitleOverlay');

    startCoordinator();

    await invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'en',
      url: 'https://cdn.example.com/subs_en.vtt',
      cues: [{ startTime: 1, endTime: 2, text: 'first cue' }],
    });

    // Make the append delta translation FAIL so its new cue stays in the
    // original-text fallback (the map is never populated for it).
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({
      success: false,
      error: 'simulated delta failure',
    });

    vi.mocked(updateCues).mockClear();

    await invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'en',
      url: 'https://cdn.example.com/subs_en.vtt',
      cues: [
        { startTime: 1, endTime: 2, text: 'first cue' },
        { startTime: 3, endTime: 4, text: 'untranslated cue' },
      ],
      append: true,
    });

    // The failed delta leaves the new cue showing its ORIGINAL text as
    // graceful fallback, while the already-translated first cue keeps its
    // translation from the persistent map.
    const cuesAfterAppend = vi.mocked(updateCues).mock.calls.at(-1)?.[0] as Array<{
      text: string; originalText?: string;
    }>;
    const untranslated = cuesAfterAppend.find((c) => c.originalText === 'untranslated cue');
    expect(untranslated?.text).toBe('untranslated cue'); // fallback to original
    const first = cuesAfterAppend.find((c) => c.originalText === 'first cue');
    expect(first?.text).toBe('first cue (vi)');
  });

  it('SUBTITLE_CHUNK_TRANSLATED populates the manifest map and rebuilds', async () => {
    setLocation('play.hbomax.com', '/video/watch/abc/def');
    const { startCoordinator } = await import('@/content/subtitleCoordinator');
    const { updateCues } = await import('@/content/subtitleOverlay');

    startCoordinator();

    // Activate with two cues whose translations differ from chunk deltas.
    await invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'en',
      url: 'https://cdn.example.com/subs_en.vtt',
      cues: [
        { startTime: 1, endTime: 2, text: 'alpha' },
        { startTime: 3, endTime: 4, text: 'beta' },
      ],
    });

    vi.mocked(updateCues).mockClear();

    // Simulate the background sending a translated chunk delta for cue 1.
    invokeExtensionMessage({
      action: 'SUBTITLE_CHUNK_TRANSLATED',
      chunkStart: 1,
      sessionId: 42,
      chunkCues: [
        { startTime: 3, endTime: 4, text: 'beta (chunk)', originalText: 'beta' },
      ],
    });

    // Manifest tier routes chunk deltas through the map: the overlay should
    // reflect the chunk's translation for 'beta'.
    const lastCues = vi.mocked(updateCues).mock.calls.at(-1)?.[0] as Array<{
      text: string; originalText?: string;
    }>;
    expect(lastCues).toBeDefined();
    const beta = lastCues.find((c) => c.originalText === 'beta');
    expect(beta?.text).toBe('beta (chunk)');
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

  it('SUBTITLE_DOM_TRACK_CHANGED clears manifest translation buffers so old-track text is not redundantly resent', async () => {
    setLocation('play.hbomax.com', '/video/watch/abc/def');
    const { startCoordinator } = await import('@/content/subtitleCoordinator');

    startCoordinator();

    await invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'en',
      url: 'https://cdn.example.com/subs_en.vtt',
      cues: [{ startTime: 1, endTime: 2, text: 'first cue' }],
    });

    vi.mocked(chrome.runtime.sendMessage).mockClear();

    expect(capturedDomTrackChangedHandler).not.toBeNull();
    if (capturedDomTrackChangedHandler) {
      await capturedDomTrackChangedHandler({ platform: 'hbomax', language: 'en' });
    }

    // Re-activate the manifest tier for the newly-switched track (still
    // preferred-language 'en', e.g. switching from "English" to "English
    // [CC]") with an entirely NEW cue text. Re-activation always resends the
    // full manifestTranslatedTexts Set (not just this call's delta) — if the
    // switch left the OLD track's 'first cue' in that Set, it gets
    // redundantly resent alongside the new track's own cue.
    await invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'en',
      url: 'https://cdn.example.com/subs_en2.vtt',
      cues: [{ startTime: 1, endTime: 2, text: 'new track cue' }],
    });

    const translateCall = vi.mocked(chrome.runtime.sendMessage).mock.calls.find(
      ([msg]) => (msg as { action?: string }).action === 'translateSubtitle',
    );
    expect(translateCall).toBeDefined();
    const sentTexts = (translateCall?.[0] as unknown as { cues: { text: string }[] }).cues.map((c) => c.text);
    expect(sentTexts).toEqual(['new track cue']);
    expect(sentTexts).not.toContain('first cue');
  });

  it('seek clears manifest cue buffers but preserves translation cache — cached cues show translated immediately', async () => {
    setLocation('play.hbomax.com', '/video/watch/abc/def');
    const { startCoordinator } = await import('@/content/subtitleCoordinator');
    const { updateCues } = await import('@/content/subtitleOverlay');
    const { sendMessage: mockSendMessage } = await import('@/inject/messageBridge');

    // Create a video element so startVideoPlaybackWatcher attaches seeked listener.
    const video = document.createElement('video');
    document.body.appendChild(video);

    startCoordinator();

    // Activate manifest overlay with initial cues (both get translated).
    await invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'en',
      url: 'https://cdn.example.com/subs_en.vtt',
      cues: [
        { startTime: 1, endTime: 2, text: 'old cue A' },
        { startTime: 3, endTime: 4, text: 'old cue B' },
      ],
    });

    // Both cues are now in manifestTranslationMap: 'old cue A' → 'old cue A (vi)', etc.
    vi.mocked(updateCues).mockClear();
    vi.mocked(mockSendMessage).mockClear();

    // Simulate user seeking to a new position.
    video.dispatchEvent(new Event('seeked'));

    // Wait for the 200ms debounce to fire.
    await new Promise((r) => setTimeout(r, 300));

    // Overlay was cleared so stale cues from the old position don't show.
    expect(updateCues).toHaveBeenCalledWith([]);

    // SUBTITLE_SEEK_RESET was sent to the MAIN-world capture module.
    expect(mockSendMessage).toHaveBeenCalledWith('SUBTITLE_SEEK_RESET', expect.anything());

    vi.mocked(updateCues).mockClear();
    vi.mocked(chrome.runtime.sendMessage).mockClear();

    // New segment arrives after seek — includes a cached cue and a new cue.
    await invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'en',
      url: 'https://cdn.example.com/subs_en.vtt',
      cues: [
        { startTime: 10, endTime: 11, text: 'old cue A' }, // cached — should show translated
        { startTime: 12, endTime: 13, text: 'new seek cue' }, // new — needs translation
      ],
      append: true,
    });

    // The first updateCues after the append shows cached translations + fallback
    // for new text (before the delta translation resolves).
    const firstAppendCues = vi.mocked(updateCues).mock.calls.find(
      ([cues]) => Array.isArray(cues) && cues.length > 0,
    )?.[0] as Array<{ text: string; originalText?: string }> | undefined;
    expect(firstAppendCues).toBeDefined();
    const cachedInitial = firstAppendCues?.find((c) => c.originalText === 'old cue A');
    expect(cachedInitial?.text).toBe('old cue A (vi)'); // translated from cache
    const freshInitial = firstAppendCues?.find((c) => c.originalText === 'new seek cue');
    expect(freshInitial?.text).toBe('new seek cue'); // original fallback

    // Only the new text should be sent for translation (delta), not the cached one.
    const translateCall = vi.mocked(chrome.runtime.sendMessage).mock.calls.find(
      ([msg]) => (msg as { action?: string }).action === 'translateSubtitle',
    );
    expect(translateCall).toBeDefined();
    const sentTexts = (translateCall?.[0] as unknown as { cues: { text: string }[] }).cues.map((c) => c.text);
    expect(sentTexts).toEqual(['new seek cue']);
    expect(sentTexts).not.toContain('old cue A');

    // Clean up the video element.
    video.remove();
  });

  it('seek re-queues in-flight texts cancelled before translation completed', async () => {
    setLocation('play.hbomax.com', '/video/watch/abc/def');
    const { startCoordinator } = await import('@/content/subtitleCoordinator');
    const { sendMessage: mockSendMessage } = await import('@/inject/messageBridge');

    const video = document.createElement('video');
    Object.defineProperty(video, 'currentTime', { value: 100, writable: true, configurable: true });
    document.body.appendChild(video);

    startCoordinator();

    let appendResolve!: () => void;
    const appendGate = new Promise<void>((resolve) => {
      appendResolve = resolve;
    });
    let translateCalls = 0;

    vi.mocked(chrome.runtime.sendMessage).mockImplementation((...args: unknown[]) => {
      const msg = args[0] as { action: string; cues?: { text: string }[] };
      if (msg.action === 'translateSubtitle' && msg.cues) {
        translateCalls += 1;
        const cues = msg.cues;
        if (translateCalls === 1) {
          return Promise.resolve({
            success: true,
            cues: cues.map((c, i) => ({
              startTime: i,
              endTime: i + 1,
              text: `${c.text} (vi)`,
              originalText: c.text,
            })),
            sessionId: 42,
          });
        }
        return appendGate.then(() => ({
          success: true,
          cues: cues.map((c, i) => ({
            startTime: i,
            endTime: i + 1,
            text: `${c.text} (vi)`,
            originalText: c.text,
          })),
          sessionId: 43,
        }));
      }
      return Promise.resolve({ success: true });
    });

    await invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'en',
      url: 'https://cdn.example.com/subs_en.vtt',
      cues: [{ startTime: 1, endTime: 2, text: 'opening cue' }],
    });

    const appendPromise = invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'en',
      url: 'https://cdn.example.com/subs_en.vtt',
      cues: [
        { startTime: 1, endTime: 2, text: 'opening cue' },
        { startTime: 100, endTime: 101, text: 'stuck in-flight cue' },
      ],
      append: true,
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(translateCalls).toBe(2);

    vi.mocked(chrome.runtime.sendMessage).mockClear();
    vi.mocked(mockSendMessage).mockClear();

    video.dispatchEvent(new Event('seeked'));
    await new Promise((r) => setTimeout(r, 300));

    appendResolve();

    await appendPromise;

    await invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'en',
      url: 'https://cdn.example.com/subs_en.vtt',
      cues: [
        { startTime: 100, endTime: 101, text: 'stuck in-flight cue' },
      ],
      append: true,
    });

    const translateCall = vi.mocked(chrome.runtime.sendMessage).mock.calls.find(
      ([msg]) => (msg as { action?: string }).action === 'translateSubtitle',
    );
    expect(translateCall).toBeDefined();
    const sentTexts = (translateCall?.[0] as unknown as { cues: { text: string }[] }).cues.map((c) => c.text);
    expect(sentTexts).toEqual(['stuck in-flight cue']);

    video.remove();
  });

  it('append after seek prioritizes translation from current playback position forward', async () => {
    setLocation('play.hbomax.com', '/video/watch/abc/def');
    const { startCoordinator } = await import('@/content/subtitleCoordinator');

    const video = document.createElement('video');
    Object.defineProperty(video, 'currentTime', { value: 100, writable: true, configurable: true });
    document.body.appendChild(video);

    startCoordinator();

    await invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'en',
      url: 'https://cdn.example.com/subs_en.vtt',
      cues: [{ startTime: 1, endTime: 2, text: 'bootstrap' }],
    });

    vi.mocked(chrome.runtime.sendMessage).mockClear();

    video.dispatchEvent(new Event('seeked'));
    await new Promise((r) => setTimeout(r, 300));

    await invokeManifestCuesHandler({
      platform: 'hbomax',
      language: 'en',
      url: 'https://cdn.example.com/subs_en.vtt',
      cues: [
        { startTime: 10, endTime: 11, text: 'past A' },
        { startTime: 20, endTime: 21, text: 'past B' },
        { startTime: 100, endTime: 101, text: 'near current' },
        { startTime: 110, endTime: 111, text: 'future A' },
        { startTime: 120, endTime: 121, text: 'future B' },
      ],
      append: true,
    });

    const translateCall = vi.mocked(chrome.runtime.sendMessage).mock.calls.find(
      ([msg]) => (msg as { action?: string }).action === 'translateSubtitle',
    );
    expect(translateCall).toBeDefined();
    const sentTexts = (translateCall?.[0] as unknown as { cues: { text: string }[] }).cues.map((c) => c.text);
    expect(sentTexts.indexOf('near current')).toBeLessThan(sentTexts.indexOf('past A'));
    expect(sentTexts.slice(0, 3)).toEqual(['near current', 'future A', 'future B']);

    video.remove();
  });
});