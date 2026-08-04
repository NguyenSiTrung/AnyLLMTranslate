# Coursera Full-Track Seek Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Coursera's English VTT cues visible through startup/resume seeks
and progressively replace them with Vietnamese translations.

**Architecture:** Direct, complete subtitle files remain responsible for their
own fetch and parse step, then delegate to the existing parsed full-track
lifecycle. That lifecycle records full-track coverage, renders source cues,
allocates a content-owned session, and merges progressive translations; only
real HLS/DASH URLs remain on the manifest-map path.

**Tech Stack:** TypeScript 5, WXT 0.20.22, Chrome MV3 content scripts, Vitest
3 with jsdom, pnpm 9.

**Design:**
`docs/superpowers/specs/2026-08-04-coursera-full-track-seek-lifecycle-design.md`

## Global Constraints

- Translate the selected Coursera track from English (`en`) to Vietnamese
  (`vi`).
- Render the complete source cue array before waiting for translation.
- Allocate and publish the content-side session ID before sending
  `translateSubtitle`.
- Preserve the current in-range seek guard by recording complete direct-file
  cues in `state.interceptOriginalCues`; do not rename that field in this fix.
- Do not assign `state.activeSource = 'manifest'` to direct `.vtt`, `.srt`,
  `.ttml`, or other complete subtitle files.
- Keep `.m3u8` and `.mpd` routing on `activateOverlayModeFromManifest`.
- Keep out-of-range and genuinely rolling-source seek resets unchanged.
- On translation failure, tear down the custom renderer and restore any HTML5
  track mode changed by the renderer lifecycle.
- Do not add dependencies or Coursera-specific DOM selectors.
- Use TDD: observe the focused failure before changing production code.
- Repository policy is conservative: do not commit or push unless the user
  explicitly authorizes it. Commit commands below are prepared checkpoints,
  not standing authorization.

---

## File Map

- Modify `content/__tests__/subtitleCoordinator.test.ts`: update the obsolete
  direct-file expectations and add the Coursera seek/session regression plus an
  HLS/DASH routing guards.
- Modify `content/subtitleCoordinator.ts`: delegate complete direct files to
  `activateOverlayWithParsedCues`, pass the selected language hint, and correct
  full-track comments/logging.
- No new runtime modules, settings, message types, or dependencies.

### Task 1: Unify Direct Full-Track Activation

**Files:**

- Modify: `content/__tests__/subtitleCoordinator.test.ts:833`
- Modify: `content/subtitleCoordinator.ts:126-143`
- Modify: `content/subtitleCoordinator.ts:310-345`
- Modify: `content/subtitleCoordinator.ts:894-905`
- Modify: `content/subtitleCoordinator.ts:1157-1230`
- Modify: `content/subtitleCoordinator.ts:1598-1610`
- Modify: `content/subtitleCoordinator.ts:2679-2684`
- Modify: `content/subtitleCoordinator.ts:3269-3310`

**Interfaces:**

- Consumes: `selectSubtitleTrack(language: string): Promise<void>`,
  `parseSubtitles(content: string): SubtitleCue[]`, the existing
  `translateSubtitle` request, and `SUBTITLE_CHUNK_TRANSLATED` delta messages.
- Produces: internal
  `activateOverlayMode(subtitleUrl: string, options?: { content?: string;
  sourceLanguageHint?: string }): Promise<void>`.
- Preserves: exported
  `forceOverlayMode(subtitleUrl: string, content?: string): Promise<void>` and
  all HLS/DASH interfaces.

- [ ] **Step 1: Replace the obsolete direct-file success/failure test**

In the existing `subtitleCoordinator – activateOverlayMode translate path`
block, replace the test named “sends translateSubtitle after parsing cues and
initializes the overlay with translated (not original) cues on success” with
these three focused tests:

```ts
it('renders parsed full-track cues and applies translated cues', async () => {
  const { forceOverlayMode, resetCoordinatorState } = await import(
    '@/content/subtitleCoordinator'
  );
  resetCoordinatorState();

  const vttContent = 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nHello\n\n';
  await forceOverlayMode('https://www.coursera.org/subtitle_en.vtt', vttContent);

  const sendMessageMock = chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
  expect(mockInitializeOverlay).toHaveBeenLastCalledWith(
    MOCK_CUES,
    expect.objectContaining({
      fontFamily: 'system-ui, sans-serif',
      displayMode: 'bilingual',
      fontSize: 16,
      fontSizeMode: 'fixed',
      position: 'bottom',
      backgroundOpacity: 0.7,
    }),
    expect.any(HTMLVideoElement),
  );
  expect(sendMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'translateSubtitle',
      cues: MOCK_CUES,
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      sessionId: expect.any(Number),
    }),
  );
  expect(mockUpdateCues).toHaveBeenCalledWith(MOCK_TRANSLATED_CUES);
});

it('does not activate a direct full track when subtitle translation is disabled', async () => {
  const { forceOverlayMode, isInOverlayMode, resetCoordinatorState } = await import(
    '@/content/subtitleCoordinator'
  );
  resetCoordinatorState();
  mockLoadSettings.mockResolvedValue({
    ...MOCK_SETTINGS,
    subtitleSettings: {
      ...MOCK_SETTINGS.subtitleSettings,
      enabled: false,
    },
  });

  await forceOverlayMode(
    'https://www.coursera.org/subtitle_en.vtt',
    'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello\n',
  );

  const sentTranslate = (
    chrome.runtime.sendMessage as ReturnType<typeof vi.fn>
  ).mock.calls.some(
    ([message]) => (message as { action?: string }).action === 'translateSubtitle',
  );
  expect(sentTranslate).toBe(false);
  expect(isInOverlayMode()).toBe(false);
  expect(mockInitializeOverlay).not.toHaveBeenCalled();
});

it('tears down the direct-file renderer and restores the native track on translation failure', async () => {
  const { forceOverlayMode, isInOverlayMode, resetCoordinatorState } = await import(
    '@/content/subtitleCoordinator'
  );
  resetCoordinatorState();

  const video = document.querySelector('video');
  if (!video) throw new Error('test video is missing');
  const nativeTrack = { mode: 'showing' } as unknown as TextTrack;
  Object.defineProperty(video, 'textTracks', {
    configurable: true,
    value: { length: 1, 0: nativeTrack },
  });
  const sendMessageMock = chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
  sendMessageMock.mockImplementation((message: { action?: string }) => {
    if (message.action === 'translateSubtitle') {
      return Promise.reject(new Error('Service unavailable'));
    }
    return Promise.resolve({ success: true });
  });

  await forceOverlayMode(
    'https://www.coursera.org/subtitle_en.vtt',
    'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello\n',
  );

  expect(mockInitializeOverlay).toHaveBeenCalledWith(
    MOCK_CUES,
    expect.any(Object),
    video,
  );
  expect(mockCleanupOverlay).toHaveBeenCalled();
  expect(nativeTrack.mode).toBe('showing');
  expect(isInOverlayMode()).toBe(false);
});

```

- [ ] **Step 2: Add the Coursera startup-seek/session regression fixture**

Immediately after the shared fixtures/global cleanup and before the Phase 1
`handleIntercepted` describe block, add this self-contained describe block. It
runs before the older coordinator blocks that retain observers, and drives the
same HTML5 discovery → direct fetch → seek → progressive chunk sequence seen in
the supplied logs.

```ts
describe('subtitleCoordinator – Coursera direct full-track lifecycle', () => {
  const COURSERA_VTT_URL =
    'https://www.coursera.org/api/subtitleAssetProxy.v1/asset.vtt?fileExtension=vtt';
  const COURSERA_VTT =
    'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello\n\n' +
    '00:00:02.000 --> 00:00:04.000\nWorld\n';

  type TranslationReply = {
    success: boolean;
    cues?: typeof MOCK_TRANSLATED_CUES;
    error?: string;
    sessionId?: number;
  };

  let coordinator: typeof import('@/content/subtitleCoordinator');
  let stopCoordinator: (() => void) | null = null;
  let extensionMessageHandler: ((
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: () => void,
  ) => void) | null = null;
  let resolveTranslation: ((reply: TranslationReply) => void) | null = null;
  let runtimeSendMessage: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;
  let video: HTMLVideoElement;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    capturedInterceptedHandler = null;
    _capturedTracksHandler = null;
    extensionMessageHandler = null;
    resolveTranslation = null;

    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'www.coursera.org',
        pathname: '/learn/project-management/lecture/example',
        href: 'https://www.coursera.org/learn/project-management/lecture/example',
      },
      writable: true,
      configurable: true,
    });

    document.body.innerHTML = '';
    video = document.createElement('video');
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      writable: true,
      value: 201,
    });
    document.body.appendChild(video);

    const courseraHandler = {
      platform: 'coursera',
      detect: vi.fn(() => true),
      isWatchPage: vi.fn(() => true),
      getPatterns: vi.fn(() => []),
      transformResponse: vi.fn(() => MOCK_CUES),
    };
    mockDetectCurrentHandler.mockReturnValue(courseraHandler);
    mockGetHandlerByPlatform.mockImplementation((platform: string) =>
      platform === 'coursera' ? courseraHandler : null,
    );
    mockInitializeControls.mockResolvedValue(undefined);
    mockInitializeOverlay.mockReturnValue(true);
    mockLoadSettings.mockResolvedValue({
      ...MOCK_SETTINGS,
      sourceLanguage: 'auto',
      targetLanguage: 'vi',
      subtitleSettings: {
        ...MOCK_SETTINGS.subtitleSettings,
        preferredSubtitleLanguage: 'en',
        autoActivateSubtitles: false,
      },
    });
    mockParseSubtitles.mockReturnValue(MOCK_CUES);
    mockOnMessage.mockReturnValue(() => {});

    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => COURSERA_VTT,
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const pendingTranslation = new Promise<TranslationReply>((resolve) => {
      resolveTranslation = resolve;
    });
    runtimeSendMessage = vi.fn((message: { action?: string }) => {
      if (message.action === 'translateSubtitle') return pendingTranslation;
      return Promise.resolve({ success: true });
    });
    global.chrome = {
      runtime: {
        sendMessage: runtimeSendMessage,
        onMessage: {
          addListener: vi.fn((handler: (...args: unknown[]) => void) => {
            extensionMessageHandler = handler as typeof extensionMessageHandler;
          }),
          removeListener: vi.fn(),
        },
      },
    } as unknown as typeof chrome;

    coordinator = await import('@/content/subtitleCoordinator');
    stopCoordinator = coordinator.startCoordinator();
  });

  afterEach(() => {
    stopCoordinator?.();
    stopCoordinator = null;
    vi.clearAllTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    vi.resetModules();
  });

  async function discoverTrack(url: string): Promise<void> {
    if (!_capturedTracksHandler) throw new Error('track discovery handler was not registered');
    await _capturedTracksHandler({
      platform: 'html5',
      videoId: 'course-video-1',
      tracks: [{
        language: 'en',
        label: 'English',
        url,
        isAutoGenerated: false,
        platform: 'coursera',
        videoId: 'course-video-1',
      }],
    });
  }

  it('keeps direct VTT cues/session through an in-range startup seek and applies Vietnamese chunks', async () => {
    await discoverTrack(COURSERA_VTT_URL);

    const activation = coordinator.selectSubtitleTrack('en');
    await vi.waitFor(() => {
      expect(mockInitializeOverlay).toHaveBeenCalledWith(
        MOCK_CUES,
        expect.any(Object),
        video,
      );
    });

    const translateCall = runtimeSendMessage.mock.calls.find(
      ([message]) => (message as { action?: string }).action === 'translateSubtitle',
    );
    const translateRequest = translateCall?.[0] as {
      sourceLanguage?: string;
      targetLanguage?: string;
      sessionId?: number;
    } | undefined;
    if (!translateRequest || typeof translateRequest.sessionId !== 'number') {
      throw new Error('pre-assigned translation session was not sent');
    }
    expect(translateRequest).toEqual(expect.objectContaining({
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      sessionId: expect.any(Number),
    }));

    mockUpdateCues.mockClear();
    video.currentTime = 3;
    video.dispatchEvent(new Event('seeked'));

    const cancelCalls = runtimeSendMessage.mock.calls.filter(
      ([message]) =>
        (message as { action?: string }).action === 'CANCEL_SUBTITLE_SESSION',
    );
    expect(cancelCalls).toHaveLength(0);
    expect(mockUpdateCues).not.toHaveBeenCalledWith([]);

    if (!extensionMessageHandler) throw new Error('extension message handler was not registered');
    extensionMessageHandler(
      {
        action: 'SUBTITLE_CHUNK_TRANSLATED',
        chunkStart: 0,
        chunkCues: [MOCK_TRANSLATED_CUES[0]],
        sessionId: translateRequest.sessionId,
      },
      {} as chrome.runtime.MessageSender,
      () => {},
    );
    expect(mockUpdateCues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Xin chào', originalText: 'Hello' }),
      ]),
    );
    expect(mockUpdateCues).not.toHaveBeenCalledWith([]);

    mockUpdateCues.mockClear();
    extensionMessageHandler(
      {
        action: 'SUBTITLE_CHUNK_TRANSLATED',
        chunkStart: 0,
        chunkCues: [MOCK_TRANSLATED_CUES[0]],
        sessionId: translateRequest.sessionId + 1,
      },
      {} as chrome.runtime.MessageSender,
      () => {},
    );
    expect(mockUpdateCues).not.toHaveBeenCalled();

    const finishTranslation = resolveTranslation;
    if (!finishTranslation) throw new Error('translation resolver was not initialized');
    finishTranslation({
      success: true,
      cues: MOCK_TRANSLATED_CUES,
      sessionId: translateRequest.sessionId,
    });
    await activation;
    expect(mockUpdateCues).toHaveBeenLastCalledWith(MOCK_TRANSLATED_CUES);
  });

  it('leaves the native track untouched when direct fetch or parse fails', async () => {
    const nativeTrack = { mode: 'showing' } as unknown as TextTrack;
    Object.defineProperty(video, 'textTracks', {
      configurable: true,
      value: { length: 1, 0: nativeTrack },
    });

    fetchMock.mockRejectedValueOnce(new Error('CORS blocked'));
    await coordinator.forceOverlayMode('https://www.coursera.org/missing_en.vtt');
    expect(nativeTrack.mode).toBe('showing');
    expect(coordinator.isInOverlayMode()).toBe(false);
    expect(mockInitializeOverlay).not.toHaveBeenCalled();

    mockParseSubtitles.mockReturnValue([]);
    await coordinator.forceOverlayMode(
      'https://www.coursera.org/invalid_en.vtt',
      'not subtitle content',
    );
    expect(nativeTrack.mode).toBe('showing');
    expect(coordinator.isInOverlayMode()).toBe(false);
    expect(mockInitializeOverlay).not.toHaveBeenCalled();
  });

  it.each([
    ['HLS', 'https://cdn.example.com/subtitles/en.m3u8'],
    ['DASH', 'https://cdn.example.com/subtitles/en.mpd'],
  ])('keeps %s tracks on the manifest fetch path', async (_kind, url) => {
    await discoverTrack(url);

    await coordinator.selectSubtitleTrack('en');

    expect(runtimeSendMessage).toHaveBeenCalledWith({
      action: 'FETCH_MANIFEST_SUBTITLES',
      playlistUrl: url,
      preferredLanguage: 'en',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    const sentDirectTranslation = runtimeSendMessage.mock.calls.some(
      ([message]) => (message as { action?: string }).action === 'translateSubtitle',
    );
    expect(sentDirectTranslation).toBe(false);
  });
});
```

- [ ] **Step 3: Run the coordinator tests and confirm the regression is red**

Run:

```bash
pnpm exec vitest run content/__tests__/subtitleCoordinator.test.ts
```

Expected: FAIL in the updated direct-file and Coursera tests. The current code
waits for translation before renderer initialization, sends no content-owned
session ID/language hint, and the Coursera seek reaches the reset path. The
HLS/DASH routing cases should already pass. The pre-change baseline is 32/32
passing.

- [ ] **Step 4: Route complete direct files through the parsed-cue lifecycle**

In `content/subtitleCoordinator.ts`, replace `activateOverlayMode` with:

```ts
/**
 * Fetch and parse a complete subtitle file, then activate the shared
 * full-track renderer/translation lifecycle.
 */
async function activateOverlayMode(
  subtitleUrl: string,
  options: { content?: string; sourceLanguageHint?: string } = {},
): Promise<void> {
  if (state.isOverlayMode && state.activeSource === 'manifest') return;

  const settings = await loadSettings();
  if (!settings.subtitleSettings.enabled) {
    cleanupActiveOverlay();
    return;
  }

  let subtitleContent = options.content;
  if (!subtitleContent) {
    try {
      subtitleContent = await fetchSubtitleContent(subtitleUrl);
    } catch (error) {
      console.error('AnyLLMTranslate: Failed to fetch subtitle content', error);
      return;
    }
  }

  const cues = parseSubtitles(subtitleContent);
  if (cues.length === 0) {
    console.warn('AnyLLMTranslate: No cues found in subtitle content');
    return;
  }

  preemptLowerTierOverlay();
  resetActiveSource();
  state.fetchedTrackUrls.add(subtitleUrl);
  console.log('AnyLLMTranslate: Activating overlay from complete subtitle track URL');

  const sourceLanguage =
    settings.sourceLanguage === 'auto'
      ? options.sourceLanguageHint || 'en'
      : settings.sourceLanguage;

  await activateOverlayWithParsedCues({
    cues,
    sourceLanguage,
    settings,
    platform: detectCurrentHandler()?.platform,
  });
}
```

Update the exported test/manual wrapper without changing its public signature:

```ts
export async function forceOverlayMode(subtitleUrl: string, content?: string): Promise<void> {
  await activateOverlayMode(subtitleUrl, { content });
}
```

Update the direct-track branch in `selectSubtitleTrack` so an automatic source
setting resolves from the selected track:

```ts
state.fetchedTrackUrls.add(track.url);
await activateOverlayMode(track.url, { sourceLanguageHint: track.language });
```

- [ ] **Step 5: Correct the full-track lifecycle documentation in code**

Use these exact descriptions while retaining the historical state-field name:

```ts
/**
 * Full-file path: parsed cues from an intercepted subtitle body or a directly
 * fetched subtitle URL. Because the whole track is available upfront, any
 * in-range seek keeps these cues and the active translation session valid.
 */
interceptOriginalCues: SubtitleCue[];
```

```ts
/**
 * Activate overlay + progressive translation for already-parsed full-track cues.
 * Shared by intercepted full files, direct subtitle URLs, and proactive
 * YouTube timedtext fetches.
 */
```

Change the source-precedence comment from “Full-file intercept” to “Complete
full-file cues”, and change the in-range seek comment to identify
`state.interceptOriginalCues` as the full-file buffer rather than only the
intercept buffer. Do not change the guard logic.

- [ ] **Step 6: Run the focused test file and confirm green behavior**

Run:

```bash
pnpm exec vitest run content/__tests__/subtitleCoordinator.test.ts
```

Expected: PASS. The file should contain 38 passing tests: the 32-test baseline,
two extra tests from splitting the old broad assertion, one Coursera lifecycle
test, one fetch/parse failure test, and two parameterized manifest-routing
cases.

- [ ] **Step 7: Review the task diff**

Run:

```bash
git diff --check
git diff -- content/subtitleCoordinator.ts content/__tests__/subtitleCoordinator.test.ts
git status --short
```

Expected: no whitespace errors; only the planned coordinator/test changes plus
the already-known design, plan, and Beads tracking files are present.

- [ ] **Step 8: Prepare the task checkpoint**

Without explicit user authorization, stop after Step 7 and report the diff. If
the user explicitly authorizes a local commit, run:

```bash
git add content/subtitleCoordinator.ts content/__tests__/subtitleCoordinator.test.ts docs/superpowers/specs/2026-08-04-coursera-full-track-seek-lifecycle-design.md docs/superpowers/plans/2026-08-04-coursera-full-track-seek-lifecycle.md
git commit -m "fix(subtitles): preserve Coursera full-track overlay on seek"
```

Expected: one local Conventional Commit; do not push.

### Task 2: Verify Subtitle and Repository Regressions

**Files:**

- Verify: `content/subtitleCoordinator.ts`
- Verify: `content/__tests__/subtitleCoordinator.test.ts`
- Verify: `content/__tests__/subtitleRenderer.test.ts`
- Verify: `content/__tests__/subtitleOverlay.test.ts`
- Verify: `tests/unit/subtitleParser.test.ts`

**Interfaces:**

- Consumes: the implementation from Task 1 and existing pnpm scripts.
- Produces: test, type, lint, build, and manual Coursera evidence suitable for
  closing `AnyLLMTranslate-b6g.9`.

- [ ] **Step 1: Run the focused subtitle regression group**

Run:

```bash
pnpm exec vitest run content/__tests__/subtitleCoordinator.test.ts content/__tests__/subtitleRenderer.test.ts content/__tests__/subtitleOverlay.test.ts tests/unit/subtitleParser.test.ts
```

Expected: exit 0; all selected test files and all tests pass.

- [ ] **Step 2: Run static checks**

Run:

```bash
pnpm compile
pnpm lint
```

Expected: both commands exit 0 with no TypeScript or ESLint errors.

- [ ] **Step 3: Run the full automated suite**

Run:

```bash
pnpm test
```

Expected: exit 0; every Vitest file passes with no failing tests.

- [ ] **Step 4: Produce the Chrome MV3 build**

Run:

```bash
pnpm build
du -sh .output/chrome-mv3
```

Expected: WXT production build exits 0 and `.output/chrome-mv3` exists. Record
the reported bundle size; a material unexplained increase is not expected from
this dependency-free coordinator change.

- [ ] **Step 5: Verify the supplied Coursera scenario in Chrome**

Reload `.output/chrome-mv3` as the unpacked extension, set preferred/source
subtitles to English or automatic English detection, set the target to
Vietnamese, and open the supplied Coursera lecture. Then:

1. Start or resume playback with Coursera captions enabled.
2. Confirm English source text appears immediately in the AnyLLMTranslate
   overlay.
3. Confirm Vietnamese replaces/upgrades the source fallback as chunks arrive.
4. Seek within the VTT cue range and confirm the overlay does not go empty.
5. Confirm the console reports the in-range keep path and does not report a
   settled cue-buffer reset for that seek.
6. Confirm no matching-session Vietnamese chunk is logged as stale.

Expected: the overlay remains continuously populated and displays Vietnamese
for the selected English track.

- [ ] **Step 6: Record verification and hand off**

Run:

```bash
git diff --check
git status --short
```

Append the exact automated results and manual Coursera result to
`AnyLLMTranslate-b6g.9`. Close that Beads task and the parent bug only when all
acceptance criteria pass. Do not commit, push Git, or run `bd dolt push`
without explicit user authorization.
