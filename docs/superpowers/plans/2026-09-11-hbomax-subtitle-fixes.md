# HBO Max Subtitle Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 42 findings in `docs/hbomax-subtitle-risk-audit.md` so Max subtitle capture is fail-safe, navigation-safe, cost-bounded and language-correct, without live Max access.

**Architecture:** Work inside the existing five-tier pipeline (Performance-API VTT capture → MPD manifest → intercept → TextTrack → DOM scraping). Add fail-safe behaviour at the tier boundaries (watchdog + demotion, navigation reset, per-tab session cancellation), make the MAIN-world capture state explicit and testable, and change two contracts deliberately: (a) `SUBTITLE_MANIFEST_CUES` appends become sequenced deltas with periodic full resync, (b) the coordinator may hand multi-segment DASH track metadata to the background. No new subsystems.

**Tech Stack:** TypeScript, WXT (MV3), Vitest (jsdom for `content/**`, `lib/**` selected files, `tests/**`, `inject/**`), ESLint 10, React 19 (options UI only).

**Spec:** `docs/hbomax-subtitle-risk-audit.md` (the audit) — this plan argues from it and from `docs/superpowers/plans/2026-07-02-max-probe-results.md` (live probe ground truth).

## Global Constraints

- **No live Max access this pass.** Every Max-specific behaviour change must be defensive: keep a fallback path, never silently disable a tier, and log/toast when a path degrades.
- **Keep `preferredSubtitleLanguage` default `'en'`.** Add `'auto'` to the UI and a one-shot user-visible toast when a track is skipped (user decision 2026-09-11).
- **Git:** conservative profile — do NOT commit, push, or run `bd dolt push`. Replace every "commit" checkpoint with a test run and a status note. (AGENTS.md overrides the skill's commit steps.)
- **Tests are mandatory and test-first** (TDD): each task writes a failing test, watches it fail for the right reason, implements minimally, then re-runs the file plus the neighbouring suites.
- **Do not regress:** after each phase run `npx vitest run <touched suites>` and `npx tsc --noEmit`; at phase ends run `npx eslint .`.
- **Line numbers in this plan are pre-change anchors.** Re-locate by symbol name before editing.
- **Bead tracking:** each phase maps to a beads issue (see `bd list`); mark claimed issues `bd update <id> --claim` when starting a phase and close them when the phase's tests are green.

---

## File Structure

**Modify**
- `inject/maxVttPerformanceCapture.ts` — capture state machine, identity, retries, watchdog, delta protocol, broader URL/format support.
- `inject/domCueSource.ts` — re-attach validation, navigation reset, pause/resume, multi-row cues.
- `inject/messageBridge.ts` — early-queue additions.
- `inject/subtitleHandlers/hbomax.ts` — caption-hide method, language robustness, manifest patterns.
- `inject/fetchInterceptor.ts`, `inject/xhrInterceptor.ts` — non-200 replay, safe Response construction, loadend hold.
- `content/subtitleCoordinator.ts` — stall demotion, navigation reset message, texttrack deferral, grace cap, session ids, settings teardown, toast, permission-safe log.
- `content/subtitleOverlay.ts` — popover fail-safe (no false success).
- `lib/maxSubtitleLanguages.ts` — checked-state matrix, attrLang sanity, label cleanup.
- `lib/subtitleLanguageMatch.ts` — `zh` script normalization.
- `lib/maxMpdSubtitles.ts` — BaseURL hierarchy, `$Time$`/width formats, per-Period counts, detection robustness.
- `lib/subtitleSites.ts` — HBO Max method hint (post-change).
- `services/background.ts` — per-tab session sets, provided segment metadata, permission warning, cap logging.
- `entrypoints/options/sections/subtitles/SourceTrackCard.tsx` — `auto` option.
- `types/subtitle.ts`, `types/config.ts` — payload/type additions only.
- `vitest.config.ts` — coverage include + dangling glob.
- `docs/PUBLISHING.md` — host-justification alignment.

**Create**
- `inject/__tests__/maxVttPerformanceCapture.test.ts` — the capture state machine (new; module previously untested).
- `tests/unit/hbomaxHandler.test.ts` — restored handler tests.
- `lib/__tests__/maxSubtitleLanguages.test.ts` — restored language helper tests (also fixes the dangling vitest glob).
- `lib/__tests__/subtitleTeardown.test.ts` — settings teardown predicate.

---

## Phase 1 — Capture resilience (P1)

Beads: `AnyLLMTranslate-gyd` (MAX-1), `AnyLLMTranslate-04b` (MAX-2), `AnyLLMTranslate-vap` (MAX-5); also covers MAX-17, MAX-19, MAX-20, MAX-21, MAX-32, MAX-33.

### Task 1.1: Stable track identity + representation switch

**Files:**
- Modify: `inject/maxVttPerformanceCapture.ts`
- Test: `inject/__tests__/maxVttPerformanceCapture.test.ts` (create)

**Interfaces:**
- Produces: `export function resolveTrackIdentity(url: string): string | null` — returns `t3`-style ids when present, else the `/t/<x>/` directory id (e.g. `t6`), else `null`.
- Produces: `export const TRACK_SWITCH_IDLE_MS: number` (3000).
- Internal: `let emittedIdentity: string | null`, `let lastEmissionAt = 0`, `let captureGeneration = 0`.

- [x] **Step 1: Write failing tests**

```ts
// inject/__tests__/maxVttPerformanceCapture.test.ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/inject/nativeFetch', () => ({ nativeFetch: vi.fn() }));
vi.mock('@/lib/maxSubtitleLanguages', () => ({
  readMaxActiveSubtitleLanguage: () => 'en',
}));

import { nativeFetch } from '@/inject/nativeFetch';
import {
  resolveTrackIdentity,
  startMaxVttPerformanceCapture,
  resetMaxVttPerformanceCapture,
  setPerformanceObserverCtorForTests,
  resetPerformanceObserverCtorForTests,
  TRACK_SWITCH_IDLE_MS,
} from '@/inject/maxVttPerformanceCapture';
import type { MessageBridgeSender } from '@/inject/messageBridge';

function makeBridge() {
  const sent: Array<{ type: string; payload: unknown }> = [];
  const bridge: MessageBridgeSender = { send: (type, payload) => { sent.push({ type, payload }); return 'id'; } };
  return { bridge, sent };
}

const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n';

class FakeObserver {
  static instances: FakeObserver[] = [];
  cb: (list: { getEntries: () => PerformanceEntry[] }) => void;
  constructor(cb: (list: { getEntries: () => PerformanceEntry[] }) => void) { this.cb = cb; FakeObserver.instances.push(this); }
  observe() {}
  disconnect() {}
  emit(url: string) { this.cb({ getEntries: () => [{ name: url } as PerformanceEntry] }); }
}

describe('resolveTrackIdentity', () => {
  it('prefers the t<digit> representation id', () => {
    expect(resolveTrackIdentity('https://cf.asia.prd.media.max.com/a/t/caa516/t3/8.vtt?x=1')).toBe('t3');
  });
  it('falls back to the /t/<dir>/ component for directory-style tracks', () => {
    expect(resolveTrackIdentity('https://cf.asia.prd.media.max.com/a/t/t6/1.vtt?x=1')).toBe('t6');
  });
  it('returns null when there is no /t/ marker', () => {
    expect(resolveTrackIdentity('https://cf.asia.prd.media.max.com/a/other/1.vtt')).toBeNull();
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run inject/__tests__/maxVttPerformanceCapture.test.ts`
Expected: FAIL — `resolveTrackIdentity` is not exported.

- [x] **Step 3: Implement identity + generation**

In `inject/maxVttPerformanceCapture.ts`:

```ts
export const TRACK_SWITCH_IDLE_MS = 3_000;

export function resolveTrackIdentity(url: string): string | null {
  const specific = url.match(/\/t\/[^/]+\/(t\d+)\//i);
  if (specific?.[1]) return specific[1].toLowerCase();
  const directory = url.match(/\/t\/([^/]+)\//i);
  if (directory?.[1]) return directory[1].toLowerCase();
  return null;
}
```

Replace `let emittedTrack: string | null = null;` with `emittedIdentity` + `lastEmissionAt` + `captureGeneration`. In `captureSegment`, capture `const generation = captureGeneration;` *before* `await`, resolve `const identity = resolveTrackIdentity(url) ?? url`, and after the fetch:

```ts
if (generation !== captureGeneration) return;            // stale continuation (MAX-21)
const now = Date.now();
if (emittedIdentity !== null && identity !== emittedIdentity) {
  const idle = now - lastEmissionAt;
  if (idle < TRACK_SWITCH_IDLE_MS) return;               // interleaved foreign segment
  cueBuffer = [];                                        // representation switch: re-seed
  emittedIdentity = identity;
}
if (emittedIdentity === null) emittedIdentity = identity;
```

Every reset function (`resetMaxVttPerformanceCapture`, `resetMaxVttPerformanceCaptureLock`, `resetMaxVttCaptureForSeek`) increments `captureGeneration`; the lock/seek resets also clear `emittedIdentity`/`lastEmissionAt` where they already did. Update the append decision to compare `identity` instead of `trackId`.

- [x] **Step 4: Re-run and watch green**

Run: `npx vitest run inject/__tests__/maxVttPerformanceCapture.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Add the switch/race tests**

Add tests: (a) segment with `/t/t6/` twice → second is not dropped; (b) after a lock on `t1`, a `t3` segment older than `TRACK_SWITCH_IDLE_MS` (fake timers) re-seeds and emits; (c) a foreign segment inside the idle window is dropped; (d) a reset during an in-flight fetch prevents the stale continuation from re-locking.

- [x] **Step 6: Re-run + typecheck**

Run: `npx vitest run inject/__tests__/maxVttPerformanceCapture.test.ts && npx tsc --noEmit`

### Task 1.2: Mark seen after success, bounded retry, log failures

**Files:** Modify `inject/maxVttPerformanceCapture.ts`; Test `inject/__tests__/maxVttPerformanceCapture.test.ts`

**Interfaces:**
- Produces: `export const MAX_SEGMENT_FETCH_ATTEMPTS = 2`.
- Internal: `const seenUrls = new Set<string>()` (now written only on success/exhaustion), `const inFlightUrls = new Set<string>()`, `const attempts = new Map<string, number>()`.

- [x] **Step 1: Failing test**

```ts
// helper used by every capture test
const flush = () => new Promise((r) => setTimeout(r, 0));

it('retries a transient fetch failure and still emits the segment', async () => {
  const fetchMock = vi.mocked(nativeFetch);
  fetchMock.mockRejectedValueOnce(new Error('network'));
  fetchMock.mockResolvedValueOnce(new Response(VTT, { status: 200 }));
  startMaxVttPerformanceCapture(bridge);
  FakeObserver.instances.at(-1)!.emit('https://cf.asia.prd.media.max.com/a/t/t3/1.vtt?x=1');
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(sent.some((m) => m.type === 'SUBTITLE_MANIFEST_CUES')).toBe(true);
});

it('gives up after MAX_SEGMENT_FETCH_ATTEMPTS and logs once', async () => {
  const fetchMock = vi.mocked(nativeFetch);
  fetchMock.mockRejectedValue(new Error('403'));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  startMaxVttPerformanceCapture(bridge);
  FakeObserver.instances.at(-1)!.emit('https://cf.asia.prd.media.max.com/a/t/t3/1.vtt?x=1');
  await flush();
  // A later observer delivery for the SAME url must not fetch again.
  FakeObserver.instances.at(-1)!.emit('https://cf.asia.prd.media.max.com/a/t/t3/1.vtt?x=1');
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(MAX_SEGMENT_FETCH_ATTEMPTS);
  expect(warn).toHaveBeenCalled();
});
```

(`FakeObserver.instances` is populated by the `setPerformanceObserverCtorForTests(FakeObserver)` call in `beforeEach`.)

- [x] **Step 2: Run → FAIL** (`fetch` called once / no retry).

- [x] **Step 3: Implement**

In `handleEntries`, guard with `seenUrls`/`inFlightUrls` but do **not** add to `seenUrls`. Add `inFlightUrls.add(url)` before the fetch and remove it in `finally`. In `captureSegment`, on successful parse (`body.trimStart().startsWith('WEBVTT')`) add to `seenUrls`. On fetch `null`:

```ts
const tries = (attempts.get(url) ?? 0) + 1;
attempts.set(url, tries);
if (tries >= MAX_SEGMENT_FETCH_ATTEMPTS) {
  seenUrls.add(url);
  console.warn('AnyLLMTranslate: Max VTT segment permanently unavailable', { url, tries });
}
```

`fetchSegment` gets an `onError` log (`console.warn` with URL + reason) instead of a bare catch.

- [x] **Step 4: Run → GREEN**, then `npx tsc --noEmit`.

### Task 1.3: Watchdog + coordinator demotion

**Files:** Modify `inject/maxVttPerformanceCapture.ts`, `content/subtitleCoordinator.ts`; Test both test files (`content/__tests__/subtitleCoordinator.test.ts`).

**Interfaces:**
- Produces (MAIN): `export const CAPTURE_STALL_MS = 20_000`, `export const WATCHDOG_INTERVAL_MS = 5_000`.
- Produces (bridge): `SUBTITLE_MPD_PROCESSING` payload gains `status: 'started' | 'complete' | 'stalled'`.
- Produces (coordinator): `function demoteManifestTier(reason: string): void` — sets `activeSource = null`, `mpdProcessingInFlight = false`, `mpdGraceUntil = 0`, clears the pending DOM timer, logs and toasts once.

- [x] **Step 1: Failing tests**

The coordinator suite already captures bridge handlers through its module mocks (`_capturedManifestCuesHandler`, `capturedInterceptedHandler`). Extend the mock so the MPD handler is captured too:

```ts
// in content/__tests__/subtitleCoordinator.test.ts, module mock block
let _capturedMpdHandler: ((payload: { status: string; success?: boolean }) => void) | null = null;
vi.mock('@/inject/messageBridge', () => ({
  onMessage: (...args: unknown[]) => mockOnMessage(...args),
  sendMessage: (...args: unknown[]) => mockInjectSendMessage(...args),
  onMpdProcessing: (handler: (payload: { status: string; success?: boolean }) => void) => {
    _capturedMpdHandler = handler;
    return () => {};
  },
}));
```

```ts
it('demotes the manifest tier when capture stalls so DOM cues can flow again', async () => {
  // arrange: activate from manifest via _capturedManifestCuesHandler (existing helper)
  _capturedMpdHandler!({ status: 'stalled', success: false });
  // act: a DOM cue arrives
  capturedDomCuesHandler?.({ cues: [{ startTime: 1, endTime: 2, text: 'hola' }], platform: 'hbomax', language: 'es' });
  await flushMicrotasks();
  // assert: the DOM payload reached the renderer instead of being suppressed by rank
  expect(mockUpdateCues).toHaveBeenCalledWith(
    expect.arrayContaining([expect.objectContaining({ originalText: 'hola' })]),
  );
});
```

The capture-side stall test uses fake timers:

```ts
it('emits a stalled lifecycle message when segments stop while the video plays', async () => {
  vi.useFakeTimers();
  document.body.innerHTML = '<video></video>';
  Object.defineProperty(document.querySelector('video')!, 'paused', { value: false, configurable: true });
  // lock an identity with one successful segment, then stop emitting
  FakeObserver.instances.at(-1)!.emit(VTT_URL);
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(WATCHDOG_INTERVAL_MS + CAPTURE_STALL_MS + 1);
  expect(sent.some((m) => m.type === 'SUBTITLE_MPD_PROCESSING'
    && (m.payload as { status: string }).status === 'stalled')).toBe(true);
});
```

- [x] **Step 2: Run → FAIL** (no `stalled` handling; DOM cue still suppressed).

- [x] **Step 3: Implement watchdog (MAIN)**

```ts
function startWatchdog(bridge: MessageBridgeSender): void {
  stopWatchdog();
  watchdogTimer = setInterval(() => {
    if (emittedIdentity === null || stalledNotified) return;
    if (Date.now() - lastEmissionAt < CAPTURE_STALL_MS) return;
    const video = findPrimaryVideo();
    if (!video || video.paused) return;      // paused playback is not a stall
    stalledNotified = true;
    bridge.send('SUBTITLE_MPD_PROCESSING', {
      mpdUrl: activeCaptureUrl, platform: 'hbomax', status: 'stalled', success: false,
    });
  }, WATCHDOG_INTERVAL_MS);
}
```

Call `startWatchdog` from `startMaxVttPerformanceCapture`; `stopWatchdog()` from `stopObserver`; clear `stalledNotified` on each successful emission.

- [x] **Step 4: Implement demotion (coordinator)**

In `handleMpdProcessing`:

```ts
if (payload.status === 'stalled') {
  demoteManifestTier('capture stalled');
  return;
}
```

`demoteManifestTier` must not destroy the overlay (keep the last rendered cues visible until DOM cues arrive) and must show the toast only once per navigation epoch.

- [x] **Step 5: Run both files → GREEN**; `npx tsc --noEmit`.

### Task 1.4: Deadline counts from playback + bridge early queue

**Files:** Modify `inject/maxVttPerformanceCapture.ts`, `inject/messageBridge.ts`; Tests as above + `inject/__tests__/messageBridge.test.ts`.

**Interfaces:** Internal `MAX_DEADLINE_TOTAL_MS = 600_000`; `armCaptureDeadline(bridge)` re-arms while the primary video is paused.

- [x] **Step 1: Failing tests**

```ts
it('does not give up while playback has not started', () => {
  vi.useFakeTimers();
  document.body.innerHTML = '<video></video>';   // paused by default in jsdom
  // start capture, advance MAX_VTT_CAPTURE_DEADLINE_MS * 2
  expect(sent.filter((m) => (m.payload as { status: string }).status === 'complete')).toHaveLength(0);
});

it('queues SUBTITLE_MPD_PROCESSING until the coordinator is ready', () => {
  const { bridge, sent } = makeBridge();          // bridge here = real sendMessage
  sendMessage('SUBTITLE_MPD_PROCESSING', { status: 'started' });
  expect(postMessageSpy).not.toHaveBeenCalled();
  window.dispatchEvent(new MessageEvent('message', { data: { channel: 'anyllm-translate', type: 'COORDINATOR_READY' }, origin: window.location.origin }));
  expect(postMessageSpy).toHaveBeenCalledTimes(1);
});
```

- [x] **Step 2: Run → FAIL.**

- [x] **Step 3: Implement**

`armCaptureDeadline`: on fire, if `processingCompleted` return; if a primary video exists, is paused, and elapsed since start < `MAX_DEADLINE_TOTAL_MS` → re-arm for `MAX_VTT_CAPTURE_DEADLINE_MS`; else send `complete success:false` as today.

`QUEUED_UNTIL_READY` becomes `['SUBTITLE_INTERCEPTED', 'SUBTITLE_TRACKS_DISCOVERED', 'SUBTITLE_METADATA', 'SUBTITLE_MPD_PROCESSING', 'SUBTITLE_MANIFEST_CUES', 'SUBTITLE_DOM_CUES']`.

- [x] **Step 4: Run → GREEN.**

### Task 1.5: Ordered concurrent fetch, sequenced delta appends, resource-timing headroom

**Files:** Modify `inject/maxVttPerformanceCapture.ts`, `content/subtitleCoordinator.ts`, `types/subtitle.ts`; Tests both.

**Interfaces:**
- `SubtitleManifestCuesPayload` gains: `seq?: number; full?: boolean;`.
- Produces: `export const FULL_RESYNC_EVERY = 20;`, `export const SEGMENT_FETCH_CONCURRENCY = 3;`.
- Coordinator: `let lastManifestSeq = -1;` — a payload is a **full replace** when `!payload.append || payload.full || payload.seq !== lastManifestSeq + 1`; otherwise it merges by `startTime|endTime|text` identity.

- [x] **Step 1: Failing tests**

```ts
// capture side: two segments on the same track
it('appends only the new cues and carries an increasing seq', async () => {
  vi.mocked(nativeFetch)
    .mockResolvedValueOnce(new Response(VTT, { status: 200 }))
    .mockResolvedValueOnce(new Response(VTT_2, { status: 200 }));
  // emit .../t3/1.vtt then .../t3/2.vtt, awaiting flush between
  const emissions = sent.filter((m) => m.type === 'SUBTITLE_MANIFEST_CUES').map((m) => m.payload as SubtitleManifestCuesPayload);
  expect(emissions[0]!.cues).toHaveLength(1);
  expect(emissions[1]!.seq).toBe((emissions[0]!.seq ?? 0) + 1);
  expect(emissions[1]!.cues).toHaveLength(1);          // delta, not the merged buffer
});

it('re-sends the full buffer every FULL_RESYNC_EVERY segments', async () => {
  // ...emit FULL_RESYNC_EVERY + 1 distinct segments
  expect(emissions.at(-1)!.full).toBe(true);
});
```

```ts
// coordinator suite (uses the captured manifest handler from the existing mock)
it('merges a sequenced append instead of replacing the buffer', async () => {
  await _capturedManifestCuesHandler!({ cues: [cue('a', 1, 2)], platform: 'hbomax', language: 'en', append: true, seq: 0 });
  await _capturedManifestCuesHandler!({ cues: [cue('b', 3, 4)], platform: 'hbomax', language: 'en', append: true, seq: 1 });
  expect(mockUpdateCues).toHaveBeenLastCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ originalText: 'a' }),
      expect.objectContaining({ originalText: 'b' }),
    ]),
  );
});

it('treats a seq gap as a full replace', async () => {
  await _capturedManifestCuesHandler!({ cues: [cue('a', 1, 2)], platform: 'hbomax', language: 'en', append: true, seq: 0 });
  await _capturedManifestCuesHandler!({ cues: [cue('c', 5, 6)], platform: 'hbomax', language: 'en', append: true, seq: 7 });
  const last = mockUpdateCues.mock.calls.at(-1)![0] as Array<{ originalText?: string }>;
  expect(last.map((c) => c.originalText)).toEqual(['c']);
});
```

(`cue(text, start, end)` is a tiny local factory; `flushMicrotasks()` already exists in the suite.)

- [x] **Step 2: Run → FAIL.**

- [x] **Step 3: Implement**

MAIN: fetch new URLs with a 3-way concurrency helper but **process results in the original URL order** (`const bodies = await mapWithConcurrency(newUrls, 3, fetchSegment); for (const [i, url] of newUrls.entries()) await processBody(url, bodies[i], bridge);`). Keep a module `seq` counter; send `{ cues: newCues, append: true, seq: seq++, language, url }`; every `FULL_RESYNC_EVERY`-th emission send `{ cues: cueBuffer, append: true, full: true, seq: seq++ }`.

Coordinator: `mergeManifestOriginalCues(incoming, meta)` implements the replace/merge rule; keep the translated-text diff logic unchanged so only new texts are sent for translation.

Resource timing: at start, `performance.setResourceTimingBufferSize?.(500)`; add a `resourcetimingbufferfull` listener that scans `performance.getEntriesByType('resource')` for matching unseen URLs and feeds them through `handleEntries` (deduped by `seenUrls`).

- [x] **Step 4: Run → GREEN**, then the coordinator suite (existing append tests may need their fixtures updated to include `seq`; update them to the new contract).

### Task 1.6: Broaden capture hosts and formats

**Files:** Modify `inject/maxVttPerformanceCapture.ts`; Test capture file.

**Interfaces:** `export function isMaxCdnSubtitleUrl(url: string): boolean` (replaces `isMaxCdnVttUrl`, kept as an alias for compatibility) — matches `*.media.max.com`, `*.hbomax.com`, `*.max.com` paths ending `.vtt`/`.ttml` with a `/t/` marker.

- [x] **Step 1: Failing tests** — `cf.eu.prd.media.max.com/.../t/t3/1.vtt?x=1` → true; `beam-1.prd.api.hbomax.com/x/t/t1/1.ttml` → true; `media.max.com` (no prd) → true; an unrelated `.vtt` on `example.com` → false.
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** the new regex + parse with `parseSubtitleContent(body, contentType, url)` so TTML segments parse; keep the `startsWith('WEBVTT')` fast-path only for VTT.
- [x] **Step 4: Run → GREEN**; full Phase 1 checkpoint: `npx vitest run inject/__tests__ lib/__tests__/maxMpdSubtitles.test.ts content/__tests__/subtitleCoordinator.test.ts && npx tsc --noEmit`.

---

**Status (implemented):** all Phase 1 tasks landed with TDD (beads
`AnyLLMTranslate-gyd` MAX-1, `AnyLLMTranslate-04b` MAX-2, `AnyLLMTranslate-vap`
MAX-5 all closed). `inject/maxVttPerformanceCapture.ts` now carries: a stable
track identity that survives the `t/t6/1.vtt` shape and Period transitions
(`resolveTrackIdentity` + `captureGeneration` invalidation for MAX-2/MAX-21),
mark-seen-after-success with bounded retry and loud failures (MAX-5),
`sawProgress`-style stall watchdog with coordinator demotion (MAX-1),
playback-anchored deadline extensions (MAX-17), an ordered concurrent fetch with
sequenced delta appends (`inFlightUrls`, `RESOURCE_TIMING_BUFFER_SIZE = 500` +
`resourcetimingbufferfull` handling — MAX-19/20/33), and the broadened
`isMaxCdnSubtitleUrl` matcher with TTML parsing (MAX-32). Covered by 19 cases in
`inject/__tests__/maxVttPerformanceCapture.test.ts` across 8 describes
(identity, URL matching, TTML, representation identity, fetch resilience,
watchdog, playback deadline, delta protocol).
## Phase 2 — Lifecycle, navigation and DOM scraper (P1)

Beads: `AnyLLMTranslate-5z2` (MAX-3), `AnyLLMTranslate-6ht` (MAX-6); also MAX-7, MAX-8, MAX-28, MAX-30, MAX-37.

### Task 2.1: `SUBTITLE_CAPTURE_RESET` bridge message

**Files:** Modify `types/subtitle.ts`, `entrypoints/inject.content/index.ts`, `content/subtitleCoordinator.ts`, `inject/domCueSource.ts`; Tests `inject/__tests__/messageBridge.test.ts`, `content/__tests__/subtitleCoordinator.test.ts`, `tests/unit/domCueSource.test.ts`.

**Interfaces:** `BridgeMessageType` gains `'SUBTITLE_CAPTURE_RESET'`; payload `{ platform?: string }`.

- [x] **Step 1: Failing test** — mock `@/content/spaNavigationWatcher` (`startSpaNavigationWatcher: (cb) => { capturedNav = cb; return () => {}; }`), call `startCoordinator()`, invoke `capturedNav('https://play.hbomax.com/video/watch/other')`, and assert `mockInjectSendMessage` was called with `'SUBTITLE_CAPTURE_RESET'` before the coordinator state reset (order assertion via `mock.invocationCallOrder`).
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement**
  - `inject.content` MAIN: `onMessage('SUBTITLE_CAPTURE_RESET', () => { resetMaxVttPerformanceCapture(); })`.
  - `domCueSource.ts`: register its own `onMessage('SUBTITLE_CAPTURE_RESET', ...)` → `resetBuffer(); detach(); tryAttach();` and include the unsubscribe in the returned cleanup.
  - Coordinator `handleNavigation`: `sendMessage('SUBTITLE_CAPTURE_RESET', { platform: detectCurrentHandler()?.platform })` **before** `resetCoordinatorState()`.
- [x] **Step 4: Run → GREEN.**

### Task 2.2: Scraper re-attach validation + navigation/video-change reset

**Files:** Modify `inject/domCueSource.ts`; Test `tests/unit/domCueSource.test.ts`.

**Interfaces:** `attached` gains `rootEl: HTMLElement`; internal `ensureAttached(): boolean` re-validates and re-attaches.

- [x] **Step 1: Failing tests** — (a) removing the caption root and adding a fresh one re-attaches (assert the new root receives mutations and cues still emit); (b) replacing the `<video>` rebinds timing to the new element; (c) a `SUBTITLE_CAPTURE_RESET` message clears the rolling buffer (next emit contains only post-reset cues).
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** — extend `tryAttach`:

```ts
const stillValid =
  attached !== null &&
  attached.rootEl.isConnected &&
  attached.video.isConnected &&
  findPrimaryVideo() === attached.video;
if (attached && !stillValid) detach();
if (attached) return;
```

Run `tryAttach()` at the top of the debounced mutation callback and on `documentObserver` fires. Add `emptied`/`loadstart` listeners on the attached video → `resetBuffer(); sampleCue(video);` and remove them in `detach()`.
- [x] **Step 4: Run → GREEN.**

### Task 2.3: Pause/resume + multi-row cue text

**Files:** Modify `inject/domCueSource.ts`; Test `tests/unit/domCueSource.test.ts`.

- [x] **Step 1: Failing tests** — (a) pause mid-cue then resume and later text change → the cue's `endTime` is the *next* cue's start, not the pause time (the paused line stays matchable); (b) two `cueBoxRowTextCue` nodes → emitted cue text contains both rows in DOM order.
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement**

```ts
const readCueText = (rootEl: HTMLElement): string => {
  const scoped = rootEl.querySelectorAll<HTMLElement>(domSource.cueSelector);
  const nodes = scoped.length > 0 ? Array.from(scoped) : Array.from(document.querySelectorAll<HTMLElement>(domSource.cueSelector));
  return nodes.map((n) => n.textContent?.trim() ?? '').filter(Boolean).join('\n');
};
```

`pauseHandler` becomes `() => emit(domSource.readActiveLanguage(), domSource.videoIdExtractor?.())` (never mutates `openCue`). Add a `playHandler` → `sampleCue(video)`.
- [x] **Step 4: Run → GREEN.**

### Task 2.4: Caption hide method + native TextTrack re-hide

**Files:** Modify `inject/subtitleHandlers/hbomax.ts`, `content/subtitleCoordinator.ts`; Tests `tests/unit/hbomaxHandler.test.ts` (created in Task 8.2), `content/__tests__/subtitleCoordinator.test.ts`.

- [x] **Step 1: Failing tests** — (a) `new HboMaxHandler().getDomCueSource().captionHideMethod === 'visibility'`; (b) `hideHtml5TextTracks()` is re-run after a DOM track change (spy on `track.mode` setter: a track switched back to `'showing'` is hidden again).
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** — add `captionHideMethod: 'visibility'` to the Max `DomCueSource` with a comment citing `docs/superpowers/specs/2026-06-19-hbomax-subtitle-design.md:84-102` and the live-verification backlog; call `hideHtml5TextTracks()` in `handleDomTrackChanged`, on `loadedmetadata`/`play` in `startVideoPlaybackWatcher`, and once after `initializeActiveRenderer` succeeds.
- [x] **Step 4: Run → GREEN**; phase checkpoint `npx vitest run tests/unit/domCueSource.test.ts content/__tests__/subtitleCoordinator.test.ts && npx tsc --noEmit`.

---

**Status (implemented):** all Phase 2 tasks landed with TDD. Extra coverage beyond the plan: `emptied`/`loadstart` timeline reset, native-track re-hide on `play`/`loadedmetadata`, and a guard test that native captions stay visible while our overlay is inactive. Test-hygiene fix: coordinators started by describes that ignore their cleanup are now stopped by a file-level `afterEach` (their leaked SPA watchers were firing navigation resets into later suites). Verification: `npx vitest run` → 642 tests / 210 files green; `npx tsc --noEmit` clean; ESLint clean on all touched files.


## Phase 3 — Sessions and cost (P1/P2)

Beads: `AnyLLMTranslate-8nl` (MAX-4); also MAX-13, MAX-14, MAX-15, MAX-16.

### Task 3.1: Cancel every session owned by a tab

**Files:** Modify `services/background.ts`; Test `services/__tests__/background.test.ts`.

**Interfaces:** `const tabSessions = new Map<number, Set<TranslationSession>>();` — `stopSubtitleSession(tabId)` cancels and clears every entry.

- [x] **Step 1: Failing test** — start two progressive subtitle sessions for the same tab (two `translateSubtitle` requests with >CHUNK_SIZE cues each), call the cancel path, advance timers, assert `translateChunk`-equivalent provider calls stop for **both** (count calls before/after cancel).
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** — register on session creation (`tabSessions.get(tabId) ?? new Set()` → add), remove in the loop's `finally`, and rewrite `stopSubtitleSession` to iterate the set. Keep `activeSessions` for "current session" lookups (priority updates) but never rely on it for cancellation.
- [x] **Step 4: Run → GREEN.**

### Task 3.2: Tear down when subtitles/site are disabled

**Files:** Create `lib/subtitleTeardown.ts`; Modify `content/subtitleCoordinator.ts`; Test `lib/__tests__/subtitleTeardown.test.ts`.

**Interfaces:** `export function shouldTeardownSubtitleSession(prev: SubtitleSettings, next: SubtitleSettings, platform: string): boolean` — true when `prev.enabled && !next.enabled`, or when `platform` was enabled and is now in `next.disabledSubtitleSites`.

- [x] **Step 1: Failing tests** — enabled→disabled true; disabled→enabled false; platform added to disabled list true; unrelated change false.
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** the pure predicate, then in `settingsChangeListener` compare the previous cached settings with the new ones and call `cleanupActiveOverlay(); cancelBackgroundSubtitleSession(); hideSubtitleToast();` when true.
- [x] **Step 4: Run → GREEN.**

### Task 3.3: Cache translations that equal the source

**Files:** Modify `content/subtitleCoordinator.ts`; Test `content/__tests__/subtitleCoordinator.test.ts`.

- [x] **Step 1: Failing test** — a batch whose translated text equals the source is stored in `manifestTranslationMap`/`domTranslationMap` (assert via the existing state test helpers) and is not re-sent after a seek reset.
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** — in `applyTranslatedCueBatchToMap`, `if (src) map.set(src, c.text);` (drop the `c.text !== src` condition). Ensure empty/missing `text` falls back to `src`.
- [x] **Step 4: Run → GREEN.**

### Task 3.4: Pre-allocate DOM session ids

**Files:** Modify `content/subtitleCoordinator.ts`; Test coordinator suite.

- [x] **Step 1: Failing test** — when `activateOverlayFromDom`/steady-state DOM translation runs with `activeSubtitleSessionId === null`, a session id is allocated **before** the request is sent, and a response carrying a different id is ignored.
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** — in `translateDomCueTexts`, if `sessionId === null` allocate `const sessionId = allocateSubtitleSessionId(); state.activeSubtitleSessionId = sessionId;` before sending; keep the existing stale guard.
- [x] **Step 4: Run → GREEN.**

### Task 3.5: Track switch keeps translation caches

**Files:** Modify `content/subtitleCoordinator.ts`; Test coordinator suite.

- [x] **Step 1: Failing test** — after `handleDomTrackChanged`, `domTranslationMap`/`manifestTranslationMap` still hold prior entries and `*TranslatedTexts` is not replaced, while cue buffers are cleared.
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** — new `resetCueBuffersForTrackSwitch()` that clears `domOriginalCues`/`domTranslatedCues`/`manifestOriginalCues`/`manifestTranslatedCues` and `activeSubtitleSessionId`, but preserves both translation maps and text sets; use it in `handleDomTrackChanged` instead of `clearDomTranslationBuffers()` + `clearManifestTranslationBuffers()`.
- [x] **Step 4: Run → GREEN**; phase checkpoint `npx vitest run services/__tests__/background.test.ts content/__tests__/subtitleCoordinator.test.ts lib/__tests__/subtitleTeardown.test.ts && npx tsc --noEmit`.

---

**Status (implemented):** all Phase 3 tasks landed with TDD. Implementation notes: (a) cancellation needs a per-tab *generation* as well as the session set — a cancel that arrives while a request's chunk 0 is in flight must also stop the queue that has not been registered yet; (b) the manifest tier re-activates after a seek reset, so its activation path now filters already-cached texts instead of re-sending the whole pending set (MAX-16); (c) `activateOverlayFromDom`/`handleTextTrackCues` seed `state.cachedSettings` so the new teardown predicate has a previous snapshot to diff. Carried-over tradeoff: translation maps survive a track switch and are keyed by cue text only — a switch to a *different source language* could serve a translation produced from another language's text for an identical string. Accepted per plan (cache hit rate wins); revisit if a live case appears. Verification: `npx vitest run` → 660 tests / 211 files green; `npx tsc --noEmit` clean; ESLint clean.


## Phase 4 — Language correctness (P1/P2)

Beads: `AnyLLMTranslate-wxt` (MAX-36); also MAX-9, MAX-38, MAX-40, MPD-11.

### Task 4.1: Robust checked-state and label handling

**Files:** Modify `lib/maxSubtitleLanguages.ts`; Test `lib/__tests__/maxSubtitleLanguages.test.ts` (create).

**Interfaces:** `export function isTrackOptionChecked(el: Element): boolean`; `normalizeMaxSubtitleLanguage(label, attrLang)` prefers a label-map hit over `attrLang`.

- [x] **Step 1: Failing tests** — checked via `aria-checked`, `aria-selected`, `aria-pressed`, `data-state="checked"`; `aria-label="English (CC)"` → `en`; `attrLang="ui-locale"`-style junk falls back to the label; `attrLang="es-419"` still wins when the label is unknown.
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** the matrix + label cleanup: exact map → case-insensitive map → strip trailing `(...)` qualifiers and retry → localized map → `normalizeLanguageCode(label)`; `attrLang` is consulted only when the normalized value matches `/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i` **and** the label produced no match.
- [x] **Step 4: Run → GREEN.**

### Task 4.2: `auto` option + skip toast (user decision)

**Files:** Modify `entrypoints/options/sections/subtitles/SourceTrackCard.tsx`, `content/subtitleCoordinator.ts`; Tests `entrypoints/options/sections/__tests__/SubtitlesSection.test.tsx` (if it covers SourceTrackCard) + coordinator suite.

- [x] **Step 1: Failing tests** — (a) the source-language `<Select>` contains an `auto` option; (b) a manifest cue whose language mismatches a non-auto preference triggers `showSubtitleToast` exactly once per navigation, naming both languages.
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** — remove the `.filter((l) => l.code !== 'auto')`; add a visible "Auto (match the active track)" label; in `handleManifestCues` replace the silent `return` with `notifyPreferredLanguageSkip(payload.language, preferred)` (module flag reset in `resetCoordinatorState`). Keep the `en` default.
- [x] **Step 4: Run → GREEN.**

### Task 4.3: `zh` script normalization

**Files:** Modify `lib/subtitleLanguageMatch.ts`; Test `lib/__tests__/subtitleLanguageMatch.test.ts`.

- [x] **Step 1: Failing tests** — `subtitleLanguagesMatch('zh-Hant', 'zh') === false`; `subtitleLanguagesMatch('zh-Hans', 'zh') === true`; `('zh-Hant', 'zh-TW') === true`; `('zh-Hans', 'zh-Hans-SG') === true`.
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** in `normalizeSubtitleLanguage`: bare `zh` → `zh-hans`; `zh-tw`/`zh-hk`/`zh-mo`/`zh-hant*` → `zh-hant`; keep ISO 639-2 conversion order (convert `zho`/`chi` to `zh` first, then apply the script default).
- [x] **Step 4: Run → GREEN.**

### Task 4.4: Cover Max's track list in the UI

**Files:** Modify `lib/languages.ts`; Test `lib/__tests__/languages.test.ts`.

- [x] **Step 1: Failing test** — `LANGUAGES` contains unique codes for `nb`, `sl`, `et`, `lv`, `lt`, `ca` (the Max tracks currently missing) and still exposes exactly one `auto` entry.
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** the entries (native names: Norsk bokmål, Slovenščina, Eesti, Latviešu, Lietuvių, Català).
- [x] **Step 4: Run → GREEN**; phase checkpoint `npx vitest run lib/__tests__/subtitleLanguageMatch.test.ts lib/__tests__/maxSubtitleLanguages.test.ts content/__tests__/subtitleCoordinator.test.ts && npx tsc --noEmit`.

---

**Status (implemented):** all Phase 4 tasks landed with TDD. Extra coverage beyond the plan: nested checked-state detection (a checked descendant inside the track button), case-insensitive label matching, and a sweep asserting every entry of `MAX_LABEL_TO_LANGUAGE` still resolves through `normalizeMaxSubtitleLanguage`. Decision recorded: ISO 639-2 `zho`/`chi` normalize to `zh` and then to the Simplified default `zh-Hans`, matching the UI's `zh` entry — a Traditional tag (`zh-Hant`/`zh-TW`) does not match them. Verification: `npx vitest run` → 688 tests / 213 files green; `npx tsc --noEmit` clean; ESLint clean.


## Phase 5 — Fallback tiers and UX (P2)

Also MAX-10, MAX-11, MAX-12, MAX-18, MAX-28, MAX-29, MAX-34, MAX-35.

### Task 5.1: Multi-segment DASH tracks reach the background

**Files:** Modify `content/subtitleCoordinator.ts`, `services/background.ts`, `types/subtitle.ts`; Tests coordinator + background suites.

**Interfaces:** `FETCH_MANIFEST_SUBTITLES` message gains `segmentUrls?: string[]`, `segmentFetch?: SubtitleSegmentFetchTemplate`, `language?: string`.

- [x] **Step 1: Failing tests** — (a) driving `selectSubtitleTrack` with a `.vtt` track that carries `segmentUrls` (length > 1) sends `FETCH_MANIFEST_SUBTITLES` including those URLs; (b) `handleFetchManifestSubtitles` in the background uses provided `segmentUrls` without calling `parseDashManifest` (spy on the fetch count); (c) two same-language Period tracks discovered in order produce a request whose `segmentUrls` is the concatenation in Period order.
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** — change `activateOverlayModeFromManifest(playlistUrl)` to `activateOverlayModeFromManifest(track: AvailableSubtitleTrack)`; route tracks with `segmentUrls?.length || segmentFetch` through it even when the URL is not `.m3u8/.mpd`; in `selectSubtitleTrack`, collect same-language tracks in discovery order and merge `segmentUrls` (concat) / prefer the first `segmentFetch`; background prefers provided metadata.
- [x] **Step 4: Run → GREEN.**

**Status (implemented):** MAX-10/11. `activateOverlayModeFromManifest()` takes
the whole `AvailableSubtitleTrack` and hands the background the
`segmentUrls`/`segmentFetch` the MPD parser already resolved (plus the track
language); `selectSubtitleTrack()` merges same-language Period tracks in
discovery order (concat + dedup) and routes a leaf `.vtt`/`.mpd` URL through the
manifest path whenever it carries segment metadata. In the background,
`handleFetchManifestSubtitles()` short-circuits to `fetchDashSegmentBodies()` /
`fetchProgressiveDashSegments()` before any manifest re-parse, and only the
segment path echoes `language` (a plain manifest request keeps its old shape).
Tests: 4 coordinator cases (`multi-segment DASH tracks (MAX-10/11)`) + 2
background cases (`FETCH_MANIFEST_SUBTITLES segment passthrough (MAX-10)`).
### Task 5.2: TextTrack tier defers to the manifest tier on Max

**Files:** Modify `content/subtitleCoordinator.ts`; Test coordinator suite.

- [x] **Step 1: Failing test** — with `hbomaxUsesMpdSubtitlePipeline()` true and the manifest in flight, `handleTextTrackCues` stores the payload instead of activating; after `SUBTITLE_MPD_PROCESSING {status:'complete', success:false}` the stored payload is processed.
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** — add `state.pendingTextTrackCuesPayload`; gate at the top of `handleTextTrackCues` (`!state.isOverlayMode && hbomaxUsesMpdSubtitlePipeline() && shouldDeferDomForMpd()`); process it in the same flush path as `pendingDomCuesPayload`.
- [x] **Step 4: Run → GREEN.**

### Task 5.3: Cap the MPD grace window and the busy-wait

**Files:** Modify `content/subtitleCoordinator.ts`; Test coordinator suite.

- [x] **Step 1: Failing test** — repeated `SUBTITLE_TRACKS_DISCOVERED` for Max does not extend the grace window past `MAX_MPD_DOM_GRACE_MS * 3` from the first arm; `waitForMpdGraceIfNeeded` returns within the in-flight cap even if `mpdProcessingInFlight` never clears (fake timers).
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** — `state.mpdGraceArmedAt`; clamp in `armMpdDomGraceWindow`; add `mpdInFlightExceededCap()` and an iteration cap to the `while` condition.
- [x] **Step 4: Run → GREEN.**

**Status (implemented):** Tasks 5.2 and 5.3 are implemented together in
`content/subtitleCoordinator.ts`:

- `handleTextTrackCues()` now holds Max full-track cues in
  `state.pendingTextTrackCuesPayload` while the manifest tier is in flight or
  inside the armed grace window, scheduling the same fallback retry as DOM cues.
- `flushPendingDomCuesAfterMpd()` became `flushPendingCuesAfterMpd()`: TextTrack
  cues (Tier 4) are flushed before scraped DOM cues (Tier 5), which then get
  suppressed by `shouldSuppressSource('dom')`.
- `armMpdDomGraceWindow()` clamps the window to `MAX_MPD_DOM_GRACE_MS * 3` from
  `state.mpdGraceArmedAt`, so a player that keeps emitting
  `SUBTITLE_TRACKS_AVAILABLE` (caption menu re-renders) cannot defer the lower
  tiers for the whole episode.
- `waitForMpdGraceIfNeeded()` is bounded three ways: `mpdInFlightExceededCap()`,
  an iteration cap (`MAX_MPD_IN_FLIGHT_CAP_MS / 200 + 5`) and a wall-clock cap.
- `clearMpdGraceEpisode()` ends the episode (cap, success, stall demotion, SPA
  reset, manifest activation) and resets `mpdGraceArmedAt`.

Tests: 5 new cases in `content/__tests__/subtitleCoordinator.test.ts`
(`TextTrack tier defers to the manifest tier on Max (MAX-12)`), each verified to
fail before the implementation (the in-flight-cap case was re-checked by
temporarily disabling the cap).
### Task 5.4: Overlay/UX defensive fixes

**Files:** Modify `content/subtitleCoordinator.ts`, `content/subtitleOverlay.ts`, `styles/subtitle.css`; Tests coordinator + overlay suites.

- [x] **Step 1: Failing tests** — (a) `manualActivateSubtitles()` off a watch page shows a toast; (b) `showManualPopover` returns `false` (not `true`) when `showPopover()` throws.
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** — (a) toast for `not a watch page` / `no DOM cue source` in the manual path; (b) `catch { return false; }`; when fullscreen-with-video popover is unavailable, `console.warn` + one-time toast instead of pretending success; (c) make the overlay box `pointer-events: none` and give the drag affordance an explicit small handle with `pointer-events: auto` (keep the existing visibility rule so hidden overlays stay click-through).
- [x] **Step 4: Run → GREEN**; phase checkpoint `npx vitest run content/__tests__ services/__tests__/background.test.ts && npx tsc --noEmit`.

---

**Status (implemented):** Phase 5 is complete.

- 5.4(a) MAX-35: `manualActivateSubtitles()` now toasts
  `Open a video page to translate subtitles.` off a watch page and
  `No subtitle source found on this page.` when the handler exposes no DOM cue
  source (or no tracks at all) — Alt+S is no longer a silent no-op.
- 5.4(b) MAX-29: `showManualPopover()` drops the `popover` attribute and returns
  `false` when `showPopover()` throws (leaving the attribute would have hidden
  the overlay outright); `syncOverlayHost()` then `console.warn`s and shows a
  one-time toast (`Subtitles may not be visible in fullscreen on this browser.`)
  via `fullscreenPopoverFallbackWarned`, reset by `resetOverlayState()`.
- 5.4(c) MAX-34: `.anyllm-translate-subtitle-text` is `pointer-events: none`
  (both the base and the `all: revert` block) and a new
  `.anyllm-translate-subtitle-drag-handle` (24px dot-grip, `pointer-events: auto`,
  `cursor: grab`, hidden state still click-through, `:fullscreen` override
  retargeted to it) owns dragging. `enableDragReposition` is still wired to the
  text container, which receives the handle's bubbled `mousedown` — no
  coordinator change needed.

Tests: 2 new cases in `content/__tests__/subtitleCoordinator.test.ts`
(`manual activation feedback (MAX-35)`) and 3 in
`content/__tests__/subtitleOverlay.test.ts` (popover warn/toast-once, handle
presence, CSS pointer-events contract read from `styles/subtitle.css`).
## Phase 6 — Interceptor hardening (P2)

Also MAX-25, MAX-26, MAX-27.

### Task 6.1: Replay page handlers on non-200 XHR responses

**Files:** Modify `inject/xhrInterceptor.ts`; Test `tests/unit/interception.test.ts`.

- [x] **Step 1: Failing test** — an intercepted XHR that completes with 403 still fires the page's `onload`/`readystatechange` handlers exactly once (spy).
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** — in `handleResponse`, before the `status !== 200` return, call the same replay routine used by the success path (guard with a `replayed` flag so cancellation/timeout cannot double-fire).
- [x] **Step 4: Run → GREEN.**

### Task 6.2: Safe translated `Response` construction

**Files:** Modify `inject/fetchInterceptor.ts`; Test `tests/unit/interception.test.ts`.

- [x] **Step 1: Failing test** — (a) a 206 response's translated `Response` does not carry `content-length`/`content-range`/`content-encoding`; (b) a 204 response resolves with the **original** response (no hang, no throw).
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** — build a `Headers` copy dropping hop-by-hop/length-carrying headers, keep `content-type`; if `[101, 204, 205, 304].includes(response.status)` resolve the original response immediately and clear the listener.
- [x] **Step 4: Run → GREEN.**

### Task 6.3: Hold `loadend` too

**Files:** Modify `inject/xhrInterceptor.ts`; Test `tests/unit/interception.test.ts`.

- [x] **Step 1: Failing test** — the page's `loadend` listener does not fire before translation resolves, and fires exactly once after replay.
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** — divert `loadend` like `load`, wrap `onloadend`, and replay all three in `replayHandlers()`; leave `progress`/`error`/`timeout` passing through.
- [x] **Step 4: Run → GREEN**; phase checkpoint `npx vitest run tests/unit/interception.test.ts && npx tsc --noEmit`.

---

**Status (implemented):** Phase 6 is complete.

- 6.1 MAX-25: the XHR interception path now routes the readyState-4 delivery
  through a `routed` flag and a shared `replayHandlers()`. A non-200 status
  (403 expired token, 304 revalidation, 5xx) replays the divested page handlers
  instead of returning silently, so the player's request always completes.
- 6.2 MAX-26: `FetchInterceptor.interceptSubtitle()` returns the original
  response for null-body statuses (`101/204/205/304`) — replacing the body made
  `new Response(...)` throw and left the page's fetch promise unsettled — and
  builds the translated `Response` from a header copy that drops
  `content-length`, `content-range`, `content-encoding`, `transfer-encoding`
  and `content-md5` while keeping `content-type`.
- 6.3 MAX-27: `loadend` is diverted in the patched `addEventListener`,
  `onloadend` is captured and nulled in `send()`, and both are replayed in
  native order (`readystatechange` → `load` → `loadend`) with a `replayed`
  guard, so abort/timeout/translation cannot double-fire the page's handlers.
  `progress`/`error`/`timeout` still pass through untouched.

Note discovered while testing: jsdom fires a native `readystatechange` at
OPENED from `open()`, so the property-handler assertion is written against the
observed readyState (exactly one DONE transition) rather than a raw call count.

Tests: 5 new cases in `tests/unit/interception.test.ts`
(`interceptor hardening (MAX-25/26/27)`), each verified RED before the fix.
## Phase 7 — Manifest, permissions, background (P2/P3)

### Task 7.1: Align host permissions and store justification

**Files:** Modify `wxt.config.ts`, `services/background.ts`, `docs/PUBLISHING.md`; Test `services/__tests__/background.test.ts` (permission warning helper).

- [x] **Step 1: Failing test** — a pure helper `subtitleFetchPermissionOrigin(url): string | null` returns the `*://host/*` origin pattern, and the background logs a warning when `chrome.permissions.contains` reports it missing (mock the API).
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** — add `*://*.hbo.com/*` and `*://*.delivery.mp.microsoft.com/*` to `host_permissions`; add the pre-flight `chrome.permissions.contains` warning in the subtitle fetch path (guarded for tests); update `docs/PUBLISHING.md` to name `hbomax.com` alongside `max.com`.
- [x] **Step 4: Run → GREEN.**

### Task 7.2: BaseURL hierarchy and Representation BaseURL

**Files:** Modify `lib/maxMpdSubtitles.ts`; Test `lib/__tests__/maxMpdSubtitles.test.ts`.

- [x] **Step 1: Failing tests** — (a) MPD-root `<BaseURL>` is applied; (b) a relative AdaptationSet `<BaseURL>` resolves against the Period BaseURL instead of being dropped; (c) a Representation `<BaseURL>` that is a directory (`t/t6/`) still goes through the SegmentTemplate instead of being fetched as a file.
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** — `resolveBaseChain(mpdUrl, periodBase, adaptationBase)` folding each level with `new URL(relative, parent)`; treat a Representation BaseURL as terminal only when it looks like a file (has an extension or the AdaptationSet has no SegmentTemplate/media).
- [x] **Step 4: Run → GREEN.**

### Task 7.3: `$Time$`, width formats and per-Period counts

**Files:** Modify `lib/maxMpdSubtitles.ts`; Test `lib/__tests__/maxMpdSubtitles.test.ts`.

- [x] **Step 1: Failing tests** — (a) `media="t/$Time$.vtt"` with a SegmentTimeline produces per-`S` URLs from `t` (and `t`+accumulated `d` when absent); (b) `$Number%05d$` → `00008`; (c) segment count uses the current Period's duration, not the first Period's.
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement** — extend `applySegmentTemplate` with a number formatter and a `$Time$` mode (pass the timeline entry time); pass the enclosing Period's duration/start into `resolveSegmentCount`.
- [x] **Step 4: Run → GREEN.**

### Task 7.4: Surface progressive DASH truncation + detection robustness

**Files:** Modify `services/background.ts`, `lib/maxMpdSubtitles.ts`; Tests both.

- [x] **Step 1: Failing tests** — (a) hitting `MAX_PROGRESSIVE_DASH_SEGMENTS` logs a warning with the truncation count; (b) `detectMpdRequests` accepts a nested extensionless manifest path (`/v1/asset?manifest-params=…`) but still rejects `.vtt`/`.ttml` leaves; (c) `mergeManifestQueryParams` re-attaches the token for any `*.max.com`/`*.hbomax.com` host, not only `prd.media.max.com`.
- [x] **Step 2: Run → FAIL.**
- [x] **Step 3: Implement.**
- [x] **Step 4: Run → GREEN**; phase checkpoint `npx vitest run services/__tests__/background.test.ts lib/__tests__/maxMpdSubtitles.test.ts && npx tsc --noEmit`.

---

**Status (implemented):** Phase 7 is complete.

- 7.1 MAX-39/42: `subtitleFetchPermissionOrigin(url)` + a once-per-origin
  pre-flight (`chrome.permissions.contains`) warn when an allow-listed CDN host
  has no manifest grant; called from `handleFetchSubtitle` and
  `handleFetchManifestSubtitles` (playlist + segments).
  `host_permissions` gained `*://*.hbo.com/*` and
  `*://*.delivery.mp.microsoft.com/*`; `docs/PUBLISHING.md` now names
  `hbomax.com` and the CDN edges.
- 7.2 MAX-22/23: `getMpdRootBaseUrl()` + `resolveBaseChain()` fold the
  MPD → Period → AdaptationSet → Representation BaseURL hierarchy level by
  level (a relative AdaptationSet BaseURL is no longer dropped when the Period
  is absolute). A Representation BaseURL is terminal only when it looks like a
  file (or nothing else describes the media); a directory BaseURL is folded
  into the SegmentTemplate/SegmentList. `TemplateContext` now carries the fully
  resolved `mediaBaseUrl`, and the persisted `segmentFetch` stores that folded
  base (older templates' raw period/adaptation pair still resolves through
  `getEffectiveMediaBaseUrl`).
- 7.3 MAX-24: `expandSegmentTimeline()` is the single timeline walker behind
  both segment offsets and the new `$Time$` media substitution; `$Number%0Nd$`
  (and `$Bandwidth%0Nd$`) honour the zero-padded width tag, and the
  duration-based segment count uses the enclosing Period's duration (with a
  presentation-duration-minus-start fallback) instead of the first Period's.
- 7.4 MAX-31/41: the progressive walk logs the safety-cap truncation with the
  fetched count; `detectMpdRequests` accepts a short nested extensionless
  prefix (`/v1/<asset>?manifest-params=…`) while still rejecting deeper or
  numeric segment paths; `mergeManifestQueryParams` re-attaches the token for
  any `*.max.com`/`*.hbomax.com` host (`MAX_OWNED_HOST`), not only
  `*.prd.media.max.com`.

Tests: 4 new background cases (host permission pre-flight + progressive cap)
and 8 new MPD cases (BaseURL hierarchy, `$Time$`/width formats, per-Period
counts, nested manifest detection, Max-owned token merge). All verified RED
before implementation. Checkpoint: `npx vitest run
services/__tests__/background.test.ts lib/__tests__/maxMpdSubtitles.test.ts` →
34 tests green; `npx tsc --noEmit` and ESLint clean.
## Phase 8 — Tests, coverage, docs (QA)

Beads: `AnyLLMTranslate-6i3`.

### Task 8.1: Coverage and config hygiene

**Files:** Modify `vitest.config.ts`.

- [x] **Step 1:** Add `'inject/**'` to `coverage.include`; remove the dangling `lib/**/__tests__/maxSubtitleLanguages.test.ts` glob (the file is created in Task 4.1 — keep the glob once it exists).
- [x] **Step 2:** Run `npx vitest run --coverage inject/__tests__` and record inject coverage in the summary.
- [x] **Step 3:** Confirm no other config references deleted files (`grep -n "__tests__" vitest.config.ts`).

### Task 8.2: Restore the Max handler tests

**Files:** Create `tests/unit/hbomaxHandler.test.ts`.

- [x] **Step 1:** Cover: `detect()` for all seven host shapes and a spoofed host; `isWatchPage()` for `/video/watch/<id>` and `/browse`; `getPatterns()` `/\.vtt$/` language extraction; `getManifestPatterns()` matching `.m3u8`/`.mpd`/extensionless; `extractAvailableTracks()` with mixed checked states and localized labels; `getDomCueSource()` contract fields.
- [x] **Step 2:** Run `npx vitest run tests/unit/hbomaxHandler.test.ts` → GREEN.

### Task 8.3: Final verification

- [x] `npx tsc --noEmit` → 0 errors.
- [x] `npx eslint .` → 0 errors.
- [x] Full suite: `npx vitest run` → expect ≥ the previous 592 passing; every failure accounted for by an intentional contract change (list them).
- [x] `npx vitest run --coverage` → record inject/ and lib/ percentages.
- [x] Update `docs/hbomax-subtitle-risk-audit.md` with a status column per MAX id, and append the live-verification backlog (below) to the plan's status section.
- [x] Report changed files, test counts, and open live-verification items. **Do not commit.**

---

**Status (implemented):**

- 8.1: `vitest.config.ts` coverage `include` now lists `inject/**` next to
  `services/**`, `lib/**`, `content/**`, `types/**`; the
  `lib/**/__tests__/maxSubtitleLanguages.test.ts` environment glob was already
  valid (the file exists). Scoped run:
  `npx vitest run --coverage inject/__tests__` → 31 tests green, inject 39.14%
  statements for that slice.
- 8.2: `tests/unit/hbomaxHandler.test.ts` grew from 4 to 9 cases — `detect()`
  over six Max-owned host shapes plus four look-alike/spoofed hosts,
  `isWatchPage()` (`/video/watch/` vs `/browse` vs `/`), the `.vtt` pattern with
  its checked-button/`t<id>` language extractor, all three manifest patterns
  (`.m3u8`, `.mpd`, extensionless `manifest-params`), `extractAvailableTracks()`
  with mixed localised labels + the `Off` skip, and the `getDomCueSource()`
  contract. Recorded observation: `Español (Latinoamérica)` normalises to
  `es-419` (regional), not bare `es`.
- 8.3: `npx tsc --noEmit` → 0 errors; `npx eslint .` → 0 errors; full suite
  `npx vitest run` → **725 tests / 213 files passing** (no failures, so no
  intentional contract changes to list); `npx vitest run --coverage` → all files
  78.31% statements, **inject 81.86%**, lib 89.25%, content 68.09%,
  services 73.01%, types 99.62%. `docs/hbomax-subtitle-risk-audit.md` now ends
  with a per-MAX status table (§6) and the live-verification backlog (§7).
  Nothing was committed (conservative git profile).
## Deliberately unchanged (do not "fix" these)

- **Segment-relative VTT offsets (`lib/dashSegmentOffsets.ts`)** stay dormant. The live probe (`docs/superpowers/plans/2026-07-02-max-probe-results.md`, Probe 1) confirmed Max serves absolute-timed files with `X-TIMESTAMP-MAP MPEGTS:0`; applying offsets would corrupt them. The latent risk is recorded in the audit and re-checked only if a segment-relative source is observed.
- **`autoActivateSubtitles` continues to gate only the DOM tier.** The manifest/TextTrack tiers auto-activating is existing product behaviour used by YouTube and others; changing it is a separate product decision, not a Max fix.
- **No new Max CDN hosts beyond the heuristics in Task 1.6/7.4.** Guessing additional hosts without live traffic would be speculative; the permission pre-flight warning (Task 7.1) makes any future gap loud instead of silent.
- **`NativeTrackRenderer` stays out of the live path** (probe: duplicate original-language lines).

---

## Live-verification backlog (requires a real Max session)

These changes are defensive but cannot be proven without live traffic. Each must be verified in a manual session before release; none blocks the automated work.

1. **Caption-hide method** (Task 2.4): confirm `visibility: hidden` keeps Max's caption renderer producing cues and that no ghost box overlaps the player controls. Fallback if it regresses: revert to `display: none` (the current behaviour) and update the design note.
2. **Multi-row cue text** (Task 2.3): confirm a two-line Max cue is emitted as one cue with two rows and translates as a unit.
3. **Representation switch** (Task 1.1): on a title with a lead-in Period, confirm the main Period's cues are captured after the lead-in.
4. **Watchdog** (Task 1.3): confirm no false stall while the user pauses, and that a genuine stall produces the toast + DOM fallback.
5. **Selector inventory** (`data-testid` values): confirm the cue selector, caption root, and track button names still match after any Max UI update; record the observed values in `tests/unit/hbomaxHandler.test.ts` fixtures.
6. **Manifest multi-segment fallback** (Task 5.1): temporarily disable the Performance capture (or use a title where it does not fire) and confirm DASH tracks assemble beyond segment 1.
7. **Popover fullscreen** (Task 5.4): confirm subtitles still render when Max fullscreens the `<video>` element itself.
