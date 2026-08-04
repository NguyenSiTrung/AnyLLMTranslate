# Coursera Subtitle Overlay Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make translated subtitle overlays attach reliably to Coursera’s dynamic video player and prevent duplicate native HTML5 captions.

**Architecture:** Pass one coordinator-selected `HTMLVideoElement` through the renderer contract into the overlay module. Track pending cue/config state in the coordinator, retry attachment on media readiness and player remount events, and make native TextTrack hiding/restoration part of the successful renderer lifecycle.

**Tech Stack:** TypeScript, WXT content scripts, DOM media events, `MutationObserver`, Vitest/jsdom, ESLint, TypeScript compiler.

## Global Constraints

- Keep the fix platform-agnostic; do not add Coursera-specific selectors, settings, or URL behavior.
- Preserve the existing fixed-position overlay, fullscreen handling, drag offsets, cue timing, and subtitle translation protocol.
- Hide native HTML5 tracks only after the custom overlay successfully attaches.
- Restore only tracks changed from `showing` to `hidden` by the extension.
- Use named exports and strict TypeScript; production lint must remain free of non-null assertions.
- Add regression tests before implementation changes and run the narrowest relevant test after each task.
- Do not commit or push source changes until validation passes; use Beads issue `AnyLLMTranslate-h9g` for task status.

---

## File Map

- Modify `content/subtitleRenderer.ts`: return an attachment result from renderer initialization and forward the coordinator-selected video to the overlay implementation.
- Modify `content/subtitleOverlay.ts`: accept the supplied video as the authoritative target and return `false` when attachment cannot happen.
- Modify `content/subtitleCoordinator.ts`: import `findPrimaryVideo`, own pending renderer state, retry lifecycle, native TextTrack hide/restore, and route every subtitle activation/update path through the shared attachment helper.
- Modify `content/__tests__/subtitleOverlay.test.ts`: cover explicit video targeting and attachment failure.
- Create `content/__tests__/subtitleRenderer.test.ts`: verify the renderer forwards the exact video element and returns the overlay attachment result.
- Modify `content/__tests__/subtitleCoordinator.test.ts`: cover delayed attachment, player replacement, native-track cleanup, and changed renderer call expectations.

## Interfaces

The renderer contract will change from:

```ts
initialize(
  cues: SubtitleCue[],
  config: SubtitleDisplayConfig,
  video: HTMLVideoElement,
): Promise<void>;
```

to:

```ts
initialize(
  cues: SubtitleCue[],
  config: SubtitleDisplayConfig,
  video: HTMLVideoElement,
): Promise<boolean>;
```

`true` means the renderer owns an attached display; `false` means no display was attached and the coordinator must keep the session pending. `initializeOverlay` will likewise return `boolean`.

---

### Task 1: Make renderer targeting explicit

**Files:**
- Modify: `content/subtitleOverlay.ts:552-583`
- Modify: `content/subtitleRenderer.ts:24-58`
- Test: `content/__tests__/subtitleOverlay.test.ts`
- Create: `content/__tests__/subtitleRenderer.test.ts`

**Interfaces:**
- Consumes: the existing `SubtitleCue`, `OverlayConfig`, and `SubtitleDisplayConfig` types.
- Produces: `initializeOverlay(...): boolean` and `SubtitleRenderer.initialize(...): Promise<boolean>`.

- [ ] **Step 1: Write the failing overlay attachment tests**

Add tests proving that the overlay uses an explicitly supplied video even when another video appears first, and that it reports failure when no video exists:

```ts
it('uses the supplied video instead of resolving another page video', () => {
  document.body.innerHTML = '<video id="preview"></video><video id="player"></video>';
  const preview = document.querySelector('#preview') as HTMLVideoElement;
  const player = document.querySelector('#player') as HTMLVideoElement;

  initializeOverlay([{ startTime: 0, endTime: 2, text: 'Hello' }], {}, player);

  expect(isOverlayActive()).toBe(true);
  Object.defineProperty(player, 'currentTime', { configurable: true, value: 1 });
  player.dispatchEvent(new Event('timeupdate'));
  expect(document.querySelector('.anyllm-translate-subtitle-translated')?.textContent)
    .toBe('Hello');
  expect(preview).not.toBe(player);
});

it('returns false when no target video is available', () => {
  document.body.innerHTML = '';

  expect(initializeOverlay([{ startTime: 0, endTime: 2, text: 'Hello' }])).toBe(false);
  expect(isOverlayActive()).toBe(false);
});
```

- [ ] **Step 2: Run the focused overlay tests and verify the new assertions fail**

Run:

```bash
pnpm exec vitest run content/__tests__/subtitleOverlay.test.ts
```

Expected: the new tests fail because `initializeOverlay` currently returns `void` and the renderer can resolve a different video.

- [ ] **Step 3: Change `initializeOverlay` to use the supplied target and return attachment status**

Change the function signature and early return:

```ts
export function initializeOverlay(
  cues: SubtitleCue[],
  config?: Partial<OverlayConfig>,
  videoNode?: HTMLVideoElement,
): boolean {
  const video = videoNode || findVideoElement();
  if (!video) {
    console.warn('AnyLLMTranslate: No video element found for subtitle overlay');
    return false;
  }

  // existing cleanup, state initialization, positioning, listeners, and observer setup
  overlayState.isAttached = true;
  return true;
}
```

Do not alter `findVideoElement`; it remains the fallback for direct callers that do not provide a target.

- [ ] **Step 4: Add the renderer forwarding test**

Create `content/__tests__/subtitleRenderer.test.ts` with a mocked overlay module:

```ts
it('forwards the exact video target and returns the overlay result', async () => {
  const video = document.createElement('video');
  document.body.appendChild(video);
  mockInitializeOverlay.mockReturnValue(true);

  const renderer = new OverlayRenderer();
  const result = await renderer.initialize([{ startTime: 0, endTime: 1, text: 'Hi' }], {}, video);

  expect(result).toBe(true);
  expect(mockInitializeOverlay).toHaveBeenCalledWith(
    [{ startTime: 0, endTime: 1, text: 'Hi' }],
    {},
    video,
  );
});
```

- [ ] **Step 5: Update `OverlayRenderer.initialize` and the interface**

Use the passed video and return the overlay result:

```ts
initialize(
  cues: SubtitleCue[],
  config: SubtitleDisplayConfig,
  video: HTMLVideoElement,
): Promise<boolean> {
  return Promise.resolve(initializeOverlay(cues, config, video));
}
```

Update `SubtitleRenderer.initialize` to return `Promise<boolean>` and update any test mocks to return `true`.

- [ ] **Step 6: Run the focused tests and type-check**

Run:

```bash
pnpm exec vitest run content/__tests__/subtitleOverlay.test.ts content/__tests__/subtitleRenderer.test.ts
pnpm exec tsc --noEmit
```

Expected: both test files pass and TypeScript reports no errors.

- [ ] **Step 7: Commit the renderer contract change**

```bash
git add content/subtitleOverlay.ts content/subtitleRenderer.ts \
  content/__tests__/subtitleOverlay.test.ts content/__tests__/subtitleRenderer.test.ts
git commit -m "fix(subtitles): pass explicit video to overlay renderer"
```

### Task 2: Add coordinator-owned attachment retry and native-track lifecycle

**Files:**
- Modify: `content/subtitleCoordinator.ts:278-530, 780-835, 1038-1121, 1596-1659, 1760-1855, 1861-1935, 2090-2140, 2190-2225, 2550-2650`
- Test: `content/__tests__/subtitleCoordinator.test.ts`

**Interfaces:**
- Consumes: `findPrimaryVideo`, the renderer boolean result from Task 1, and existing coordinator cleanup/session functions.
- Produces: coordinator-private helpers `initializeActiveRenderer`, `updateActiveRendererCues`, `scheduleRendererAttachmentRetry`, `cleanupRendererAttachmentRetry`, `hideHtml5TextTracks`, and `restoreHtml5TextTracks`.

- [ ] **Step 1: Add failing coordinator tests for delayed attachment and native-track restoration**

Extend the coordinator test setup with a delayed video scenario and a real text-track-like mock. The tests should assert:

1. The coordinator does not treat a failed renderer initialization as a permanently attached display.
2. A later `play` or `loadedmetadata` event retries with the current primary video.
3. A video replacement is attached once without duplicate retry listeners.
4. A showing native track is hidden only after renderer success and restored by coordinator cleanup.

Use this shape for the delayed-attachment regression:

```ts
it('retries overlay attachment when the video becomes available', async () => {
  document.body.innerHTML = '';
  mockInitializeOverlay.mockReturnValue(false);

  await capturedInterceptedHandler?.(
    {
      url: 'https://www.coursera.org/subtitle_en.vtt',
      body: 'WEBVTT\\n\\n00:00:00.000 --> 00:00:02.000\\nHello\\n',
      contentType: 'text/vtt',
      platform: 'coursera',
      originalLanguage: 'en',
    },
    'coursera-delayed',
  );

  const video = document.createElement('video');
  document.body.appendChild(video);
  mockInitializeOverlay.mockReturnValue(true);
  video.dispatchEvent(new Event('loadedmetadata'));

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(mockInitializeOverlay).toHaveBeenLastCalledWith(
    expect.any(Array),
    expect.any(Object),
    video,
  );
});
```

The native-track test must use a track whose initial `mode` is `'showing'`, then assert the mode returns to `'showing'` after the coordinator cleanup function runs.

- [ ] **Step 2: Run the focused coordinator tests and verify the new tests fail**

Run:

```bash
pnpm exec vitest run content/__tests__/subtitleCoordinator.test.ts
```

Expected: the retry test fails because the coordinator currently creates an active renderer once and never retries, and the native-track test fails because the TextTrack path does not hide or restore tracks.

- [ ] **Step 3: Extend coordinator state for pending renderer ownership**

Add these fields to `CoordinatorState` and initialize them:

```ts
rendererVideo: HTMLVideoElement | null;
rendererCues: SubtitleCue[] | null;
rendererConfig: Partial<OverlayConfig> | null;
rendererRetryCleanup: (() => void) | null;
rendererRetryTimer: ReturnType<typeof setTimeout> | null;
rendererAttachPromise: Promise<boolean> | null;
hiddenHtml5Tracks: Set<TextTrack>;
```

Reset all of them in `resetCoordinatorState` and clear them during coordinator cleanup.

- [ ] **Step 4: Implement native TextTrack hide/restore helpers**

Replace the current non-owning `disableHtml5TextTracks` behavior with helpers that record only tracks changed by the extension:

```ts
function hideHtml5TextTracks(): void {
  try {
    for (const video of document.querySelectorAll<HTMLVideoElement>('video')) {
      for (let i = 0; i < video.textTracks.length; i += 1) {
        const track = video.textTracks[i];
        if (track && track.mode === 'showing') {
          state.hiddenHtml5Tracks.add(track);
          track.mode = 'hidden';
        }
      }
    }
  } catch {
    // Native track access can fail while a player is being replaced.
  }
}

function restoreHtml5TextTracks(): void {
  for (const track of state.hiddenHtml5Tracks) {
    try {
      track.mode = 'showing';
    } catch {
      // Ignore tracks removed during player teardown.
    }
  }
  state.hiddenHtml5Tracks.clear();
}
```

Call `restoreHtml5TextTracks()` from `cleanupActiveOverlay`, `resetCoordinatorState`, and the `startCoordinator` cleanup function. Do not hide tracks until renderer initialization returns `true`.

- [ ] **Step 5: Implement one shared renderer-attachment helper**

Add a helper that stores the latest cue/config snapshot, resolves the primary video once, replaces a stale renderer when the video changes, and only marks attachment success after the renderer returns `true`:

```ts
async function initializeActiveRenderer(
  cues: SubtitleCue[],
  config: Partial<OverlayConfig>,
): Promise<boolean> {
  state.rendererCues = cues;
  state.rendererConfig = config;
  const video = findPrimaryVideo();
  if (!video) return false;

  if (state.rendererVideo && state.rendererVideo !== video) {
    destroyRenderer();
  }
  if (state.activeRenderer && state.rendererVideo === video) {
    state.activeRenderer.updateCues(cues);
    hideHtml5TextTracks();
    return true;
  }

  const renderer = state.activeRenderer ?? (state.activeRenderer = createRenderer(video));
  const attached = await renderer.initialize(cues, config, video);
  if (!attached) {
    destroyRenderer();
    return false;
  }

  state.rendererVideo = video;
  hideHtml5TextTracks();
  const textContainer = getOverlayTextContainer();
  if (textContainer) state.dragCleanup = enableDragReposition(textContainer);
  cleanupRendererAttachmentRetry();
  return true;
}
```

Guard concurrent retry calls with `rendererAttachPromise`: return the existing promise while one attachment is in flight, and clear it in `finally`.

- [ ] **Step 6: Implement bounded readiness/remount retry**

Add `scheduleRendererAttachmentRetry()` with one capture-phase listener for each of `loadedmetadata`, `canplay`, and `play`, plus a `MutationObserver` on `document.documentElement`. Each trigger calls the pending attachment helper. Stop observing immediately after success, cleanup, navigation, or track change; also set a 10-second timer as a hard bound.

Use this lifecycle shape so only one retry set and one in-flight attachment exist:

```ts
function scheduleRendererAttachmentRetry(): void {
  if (
    state.rendererRetryCleanup ||
    !state.rendererCues ||
    !state.rendererConfig
  ) {
    return;
  }

  const attempt = (): void => {
    const cues = state.rendererCues;
    const config = state.rendererConfig;
    if (!cues || !config) return;
    void initializeActiveRenderer(cues, config).then((attached) => {
      if (attached) cleanupRendererAttachmentRetry();
    });
  };
  const onMediaReady = (): void => attempt();
  const mediaEvents = ['loadedmetadata', 'canplay', 'play'] as const;
  for (const eventName of mediaEvents) {
    document.addEventListener(eventName, onMediaReady, true);
  }
  const observer = new MutationObserver(() => attempt());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const timer = setTimeout(() => cleanupRendererAttachmentRetry(), 10_000);

  state.rendererRetryTimer = timer;
  state.rendererRetryCleanup = () => {
    for (const eventName of mediaEvents) {
      document.removeEventListener(eventName, onMediaReady, true);
    }
    observer.disconnect();
    clearTimeout(timer);
    state.rendererRetryTimer = null;
    state.rendererRetryCleanup = null;
  };
}
```

The cleanup function must remove all three document listeners, disconnect the observer, clear the timer, and null the state fields. It must be safe to call more than once. `initializeActiveRenderer` must use `rendererAttachPromise` as follows:

```ts
if (state.rendererAttachPromise) return state.rendererAttachPromise;
const attachPromise = attachRendererNow(cues, config).finally(() => {
  if (state.rendererAttachPromise === attachPromise) {
    state.rendererAttachPromise = null;
  }
});
state.rendererAttachPromise = attachPromise;
return attachPromise;
```

- [ ] **Step 7: Run the focused coordinator tests**

Run:

```bash
pnpm exec vitest run content/__tests__/subtitleCoordinator.test.ts
```

Expected: delayed attachment, replacement, native-track hide/restore, and all pre-existing coordinator tests pass.

- [ ] **Step 8: Commit the coordinator lifecycle change**

```bash
git add content/subtitleCoordinator.ts content/__tests__/subtitleCoordinator.test.ts
git commit -m "fix(subtitles): retry dynamic video overlay attachment"
```

### Task 3: Route every subtitle activation path through the lifecycle

**Files:**
- Modify: `content/subtitleCoordinator.ts:780-835, 1038-1121, 1596-1659, 1760-1935, 2030-2140, 2190-2225`
- Test: `content/__tests__/subtitleCoordinator.test.ts`

**Interfaces:**
- Consumes: `initializeActiveRenderer`, `updateActiveRendererCues`, and retry cleanup from Task 2.
- Produces: consistent attachment behavior for intercepted VTT, fetched VTT, TextTrack, MSE, manifest, and DOM cue flows.

- [ ] **Step 1: Add failing path-coverage assertions**

Update existing coordinator tests so every overlay activation asserts the exact video argument and successful attachment result. Add a test where translation completes while no video exists, then add the video and fire `play`; assert the translated cue array is attached, not the original array.

Also assert that the `SUBTITLE_TEXTTRACK_CUES` path hides a showing native track only after `mockInitializeOverlay` returns `true`.

- [ ] **Step 2: Replace direct renderer initialization calls**

Replace each direct call of the form:

```ts
await ensureRenderer().initialize(cuesToDisplay, overlayConfig, document.querySelector('video') as HTMLVideoElement);
```

with:

```ts
const attached = await initializeActiveRenderer(cuesToDisplay, overlayConfig);
if (!attached) scheduleRendererAttachmentRetry();
```

Apply this in:

- `activateOverlayWithParsedCues` for intercepted/proactive subtitle tracks;
- `activateOverlayMode` for fetched track URLs;
- `handleTextTrackCues`;
- `activateOverlayFromDom`;
- `activateOverlayFromManifestCues`;
- `handleMseCues` at the existing direct initialization block near line 2136.

After the replacements, verify that `grep -n "ensureRenderer().initialize\|document.querySelector('video') as HTMLVideoElement" content/subtitleCoordinator.ts` returns no direct renderer initialization call.

- [ ] **Step 3: Route cue updates through the pending snapshot helper**

Replace direct `state.activeRenderer?.updateCues(...)` calls with:

```ts
function updateActiveRendererCues(cues: SubtitleCue[]): void {
  state.rendererCues = cues;
  if (state.activeRenderer && state.rendererVideo) {
    state.activeRenderer.updateCues(cues);
    return;
  }
  if (state.isOverlayMode && state.rendererConfig) {
    void initializeActiveRenderer(cues, state.rendererConfig).then((attached) => {
      if (!attached) scheduleRendererAttachmentRetry();
    });
  }
}
```

Use it in `updateTranslatedCues`, `mergeTranslatedChunk`, DOM/manifest rebuild paths, MSE updates, and TextTrack refreshes. Preserve manifest/DOM map updates before calling this helper.

- [ ] **Step 4: Update cleanup and failure paths**

Ensure these paths call `cleanupRendererAttachmentRetry()`, clear the pending cue/config snapshot, destroy the renderer, and restore native HTML5 tracks:

- translation failure/error;
- track identity change;
- SPA navigation/reset;
- `cleanupActiveOverlay`;
- `startCoordinator` teardown.

Keep platform CSS caption restoration (`restoreNativeCaptions`) separate from HTML5 TextTrack restoration.

- [ ] **Step 5: Run focused regression tests and type-check**

Run:

```bash
pnpm exec vitest run content/__tests__/subtitleCoordinator.test.ts content/__tests__/subtitleOverlay.test.ts content/__tests__/subtitleRenderer.test.ts
pnpm exec tsc --noEmit
```

Expected: all focused tests pass and no TypeScript errors remain.

- [ ] **Step 6: Commit the activation-path wiring**

```bash
git add content/subtitleCoordinator.ts content/__tests__/subtitleCoordinator.test.ts
git commit -m "fix(subtitles): use shared attachment lifecycle for all sources"
```

### Task 4: Run project quality gates and close the bug

**Files:**
- Modify: `conductor/patterns.md` only if the final implementation reveals a reusable lifecycle rule.
- No source files should change during this task unless a quality gate identifies a concrete regression.

**Interfaces:**
- Consumes: all implementation commits from Tasks 1–3.
- Produces: verified source state and a closed Beads issue.

- [ ] **Step 1: Run the full test suite**

Run:

```bash
pnpm test
```

Expected: the complete Vitest suite passes with zero failures.

- [ ] **Step 2: Run lint and compile checks**

Run:

```bash
pnpm lint
pnpm exec tsc --noEmit
```

Expected: ESLint reports zero errors and TypeScript reports zero errors.

- [ ] **Step 3: Build the extension**

Run:

```bash
pnpm build
```

Expected: the WXT Chrome MV3 production build completes successfully.

- [ ] **Step 4: Review the final diff and working tree**

Run:

```bash
git diff --check
git status --short --branch
git log --oneline -6
```

Expected: no whitespace errors, only intended source/test/plan changes, and no untracked generated artifacts.

- [ ] **Step 5: Close the Beads issue**

```bash
bd close AnyLLMTranslate-h9g --reason="Shared subtitle renderer now retries dynamic video attachment and restores native tracks; tests and quality gates pass."
```

- [ ] **Step 6: Report validation without pushing**

Per the repository’s conservative Beads profile, report changed files, test/lint/type-check/build results, and the suggested next command. Do not run `git push` or `bd dolt push` unless explicitly requested.
