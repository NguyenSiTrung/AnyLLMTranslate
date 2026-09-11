# Subtitle Hardening Round 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Close the seven remaining risks found by the 2026-09-11 subtitle audit follow-up: unrecoverable segment loss, un-cancellable background segment downloads, ambiguous representation identity, unbounded capture buffers, sequential DASH fetching, silent untranslated lines, and an inaccurate permission pre-flight warning.

**Architecture:** All changes stay inside the existing tiers. MAIN-world capture gains a cooldown-based recovery map instead of a permanent `seenUrls` poison; the background gains a per-tab `AbortController` set mirroring the existing `asrRealignControllers` pattern; the coordinator gains one one-shot user-visible notice. No new modules are introduced — `lib/concurrency.runWithConcurrency` (already imported by the background) is reused for segment fan-out.

**Tech Stack:** TypeScript, Vitest (jsdom), MV3 service worker + content scripts, WXT.

**Baseline evidence (2026-09-11, before this plan):** `npx vitest run` on the focused subtitle suites → 5 files / 136 tests passing; `npx tsc --noEmit` → 0 errors; `npx eslint .` → 0 errors.

---

## File Structure

| File | Responsibility after this plan |
|------|-------------------------------|
| `inject/maxVttPerformanceCapture.ts` | Capture segments; recover transiently-failed segments under a cooldown; derive representation identity from the pathname tail; bound the rolling buffer |
| `services/background.ts` | Abort in-flight subtitle segment fetches per tab; bounded-concurrency ordered segment fetch; declared-`host_permissions` pre-flight |
| `content/subtitleCoordinator.ts` | One user-visible notice when a delta's translation ladder is exhausted; bounded manifest buffer |
| `inject/__tests__/maxVttPerformanceCapture.test.ts` | Tests for identity, recovery, buffer bound |
| `services/__tests__/background.test.ts` | Tests for abort, concurrency/order, permission matching |
| `content/__tests__/subtitleCoordinator.test.ts` | Tests for the untranslated notice + buffer bound |

**Task order** (linear; Tasks 1–3 share one file, Tasks 4–6 share another):

1. Representation identity (JP7) — smallest, isolated, unlocks nothing else
2. Segment recovery (6RZ)
3. Bounded manifest buffer (738, capture half)
4. DASH fetch concurrency + body-read timeout (ULI)
5. Per-tab fetch abort (41Q)
6. Permission pre-flight accuracy (8QA)
7. Untranslated notice + coordinator buffer bound (PJT, 738 coordinator half)

---

## Task 1: Representation identity from the pathname tail (JP7)

**Files:**
- Modify: `inject/maxVttPerformanceCapture.ts:136-147`
- Test: `inject/__tests__/maxVttPerformanceCapture.test.ts` (`describe('resolveTrackIdentity')`)

- [x] **Step 1: Failing tests**

Replace the `resolveTrackIdentity` describe block with:

```ts
describe('resolveTrackIdentity', () => {
  it('prefers the t<digit> representation id', () => {
    expect(resolveTrackIdentity('https://cf.asia.prd.media.max.com/a/t/caa516/t3/8.vtt?x=1')).toBe('t3');
  });

  it('falls back to the /t/<dir>/ component for directory-style tracks', () => {
    expect(resolveTrackIdentity('https://cf.asia.prd.media.max.com/a/t/t6/1.vtt?x=1')).toBe('t6');
  });

  it('uses the /t/ component nearest the segment file when the path nests several', () => {
    expect(resolveTrackIdentity('https://host.example/a/t/lead/t1/main/t3/8.vtt')).toBe('t3');
  });

  it('ignores a /t/ marker that only appears in the query string', () => {
    expect(resolveTrackIdentity('https://cf.asia.prd.media.max.com/a/other/1.vtt?path=/t/t6/')).toBeNull();
  });

  it('returns null when there is no /t/ marker', () => {
    expect(resolveTrackIdentity('https://cf.asia.prd.media.max.com/a/other/1.vtt')).toBeNull();
  });
});
```

- [x] **Step 2: Run → FAIL**

`npx vitest run inject/__tests__/maxVttPerformanceCapture.test.ts -t resolveTrackIdentity`
Expected: the nested-path and query-string cases fail (`t1`/`t6` returned instead of `t3`/`null`).

- [x] **Step 3: Implement**

```ts
/**
 * Stable identity for a Max subtitle segment URL: the `/t/<dir>/` component
 * nearest the segment file, matched against the PATHNAME only.
 *
 * Why the last component and not the first: Max nests the real representation
 * directory adjacent to the segment (`…/t/caa516/t3/8.vtt`), and lead-in /
 * preview segments can carry an earlier `/t/` component of their own. Taking
 * the first match let an unrelated directory become the identity, which either
 * merged two representations or split one. Matching the pathname also stops a
 * `/t/…` sequence inside the query string from hijacking the identity.
 */
export function resolveTrackIdentity(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url.split('?')[0] ?? url;
  }
  const matches = [...pathname.matchAll(/\/t\/([^/]+)\//gi)];
  const last = matches.at(-1)?.[1];
  return last ? last.toLowerCase() : null;
}
```

- [x] **Step 4: Run → GREEN**

`npx vitest run inject/__tests__/maxVttPerformanceCapture.test.ts`
Expected: all pass, including the pre-existing `representation identity` cases.

---

## Task 2: Recover a segment whose fetch failed (6RZ)

**Files:**
- Modify: `inject/maxVttPerformanceCapture.ts` (constants, `handleEntries`, `captureSegment`, `startWatchdog`, `reset*`)
- Test: `inject/__tests__/maxVttPerformanceCapture.test.ts` (`describe('Max VTT capture — fetch resilience')`)

**Contract:** a URL whose fetch exhausted `MAX_SEGMENT_FETCH_ATTEMPTS` leaves `seenUrls` alone and enters `failedSegments: Map<url, {attempts, nextAttemptAt}>`. It is re-fetched when its cooldown elapses — driven by the watchdog tick, which already runs every `WATCHDOG_INTERVAL_MS`. A successful parse clears the entry. After `SEGMENT_RECOVERY_MAX_ATTEMPTS` cycles the backoff saturates at `SEGMENT_RECOVERY_MAX_COOLDOWN_MS` (60 s) rather than poisoning the URL, so a late successful replay still recovers the segment.

- [x] **Step 1: Failing tests** — replace the `stops retrying after MAX_SEGMENT_FETCH_ATTEMPTS even if the URL reappears` case with:

```ts
  it('recovers a segment once its cooldown elapses instead of losing it permanently', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockRejectedValueOnce(new Error('403'))
      .mockRejectedValueOnce(new Error('403')) // initial attempt pair
      .mockResolvedValueOnce(new Response(vtt('recovered'), { status: 200 }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    startMaxVttPerformanceCapture(bridge);
    FakeObserver.instances.at(-1)!.emit('https://cf.asia.prd.media.max.com/a/t/caa516/t3/1.vtt');
    await vi.advanceTimersByTimeAsync(0);
    expect(captureEmissions()).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(SEGMENT_RECOVERY_COOLDOWN_MS + WATCHDOG_INTERVAL_MS + 1);

    expect(captureEmissions()).toHaveLength(1);
    expect(captureEmissions()[0]!.cues.map((c) => c.text)).toEqual(['recovered']);
    expect(warn).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does not refetch a segment that already parsed', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(new Response(vtt('hello'), { status: 200 }));

    startMaxVttPerformanceCapture(bridge);
    const observer = FakeObserver.instances.at(-1)!;
    observer.emit('https://cf.asia.prd.media.max.com/a/t/caa516/t3/1.vtt');
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(SEGMENT_RECOVERY_COOLDOWN_MS * 3 + WATCHDOG_INTERVAL_MS * 3);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('forgets recovery state on a seek reset', async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error('403'));
    const { bridge: seekBridge, sent: seekSent } = makeBridge();

    startMaxVttPerformanceCapture(seekBridge);
    FakeObserver.instances.at(-1)!.emit('https://cf.asia.prd.media.max.com/a/t/caa516/t3/1.vtt');
    await vi.advanceTimersByTimeAsync(0);
    const attemptsBefore = fetchMock.mock.calls.length;

    resetMaxVttCaptureForSeek();
    await vi.advanceTimersByTimeAsync(SEGMENT_RECOVERY_COOLDOWN_MS + WATCHDOG_INTERVAL_MS + 1);

    expect(fetchMock.mock.calls.length).toBe(attemptsBefore);
    expect(seekSent.filter((m) => m.type === 'SUBTITLE_MANIFEST_CUES')).toHaveLength(0);
    vi.useRealTimers();
  });
```

- [x] **Step 2: Run → FAIL** (unresolved import `SEGMENT_RECOVERY_COOLDOWN_MS`, then the recovery assertions).

- [x] **Step 3: Implement**

Add near the existing retry constants:

```ts
/** Cooldown before a segment whose fetch failed is attempted again. */
export const SEGMENT_RECOVERY_COOLDOWN_MS = 5_000;
/** Recovery cycles before the cooldown saturates (never a permanent poison). */
export const SEGMENT_RECOVERY_MAX_ATTEMPTS = 4;
/** Saturated cooldown for a segment that keeps failing. */
const SEGMENT_RECOVERY_MAX_COOLDOWN_MS = 60_000;
/** Failed segments re-driven per watchdog tick. */
const SEGMENT_RECOVERY_PER_TICK = 2;
```

State + helpers:

```ts
/** URLs whose fetch exhausted its attempts: url → { attempts, nextAttemptAt }. */
const failedSegments = new Map<string, { attempts: number; nextAttemptAt: number }>();

/** Record a failed fetch and schedule the next recovery attempt. */
function recordSegmentFailure(url: string): void {
  const attempts = (failedSegments.get(url)?.attempts ?? 0) + 1;
  const backoff = Math.min(
    SEGMENT_RECOVERY_COOLDOWN_MS * 2 ** (attempts - 1),
    SEGMENT_RECOVERY_MAX_COOLDOWN_MS,
  );
  failedSegments.set(url, { attempts, nextAttemptAt: Date.now() + backoff });
}

/** Forget a failed segment (successful parse, seek, or full reset). */
function clearSegmentFailure(url: string): void {
  failedSegments.delete(url);
}

/** True while a failed segment is inside its cooldown — skip it this pass. */
function isSegmentRecoveryCoolingDown(url: string, now: number): boolean {
  const entry = failedSegments.get(url);
  return entry !== undefined && entry.nextAttemptAt > now;
}

/** Failed segments due for another attempt, oldest first, bounded per tick. */
function dueFailedSegments(now: number): string[] {
  const due: string[] = [];
  for (const [url, entry] of failedSegments) {
    if (entry.nextAttemptAt > now) continue;
    if (seenUrls.has(url) || inFlightUrls.has(url)) continue;
    due.push(url);
  }
  return due.slice(0, SEGMENT_RECOVERY_PER_TICK);
}
```

In `handleEntries`, extend the filter:

```ts
  const now = Date.now();
  for (const entry of entries) {
    const url = entry.name;
    if (seenUrls.has(url) || inFlightUrls.has(url)) continue;
    if (!isMaxCdnSubtitleUrl(url)) continue;
    // A segment that failed recently waits out its cooldown; a fresh Resource
    // Timing entry after that is a legitimate second chance.
    if (isSegmentRecoveryCoolingDown(url, now)) continue;
    newUrls.push(url);
  }
```

In `captureSegment`, replace the `body === null` branch and mark success:

```ts
  if (body === null) {
    // Exhausted the immediate attempts. Do NOT poison the URL: keep it in the
    // cooldown map so the watchdog re-drives it instead of losing the segment
    // for the rest of the session (a transient 403/CORS/timeout is the common
    // case, and seenUrls is only cleared by seek/track-switch/navigation).
    recordSegmentFailure(url);
    console.warn('AnyLLMTranslate: Max VTT segment fetch failed — scheduled for recovery', { url });
    return;
  }
```

and after `seenUrls.add(url);` (the success path) add `clearSegmentFailure(url);`.

Add the recovery driver and call it from the watchdog:

```ts
/** Re-fetch failed segments whose cooldown elapsed. Never throws. */
async function retryFailedSegments(bridge: MessageBridgeSender): Promise<void> {
  const due = dueFailedSegments(Date.now());
  if (due.length === 0) return;
  const generationAtFetch = captureGeneration;
  for (const url of due) inFlightUrls.add(url);
  try {
    const bodies = await mapWithConcurrency(due, SEGMENT_FETCH_CONCURRENCY, (url) =>
      fetchSegmentWithRetry(url),
    );
    for (let i = 0; i < due.length; i++) {
      const url = due[i];
      if (url === undefined) continue;
      await captureSegment(url, bridge, bodies[i], generationAtFetch);
    }
  } finally {
    for (const url of due) inFlightUrls.delete(url);
  }
}

function startWatchdog(bridge: MessageBridgeSender): void {
  stopWatchdog();
  watchdogTimer = setInterval(() => {
    // Recovery runs regardless of the stall state: a session with no emission
    // yet (emittedIdentity === null) has the most to gain from it.
    void retryFailedSegments(bridge);
    if (stalledNotified || emittedIdentity === null) return;
    ...
  }, WATCHDOG_INTERVAL_MS);
}
```

Clear the map in all three resets (`resetMaxVttPerformanceCapture`, `resetMaxVttPerformanceCaptureLock`, `resetMaxVttCaptureForSeek`) via `failedSegments.clear()`.

- [x] **Step 4: Run → GREEN** on the capture suite.

---

## Task 3: Bound the rolling manifest buffer (738 — capture half)

**Files:**
- Modify: `inject/maxVttPerformanceCapture.ts` (`mergeCues`, export constant)
- Test: `inject/__tests__/maxVttPerformanceCapture.test.ts`

- [x] **Step 1: Failing test**

```ts
describe('Max VTT capture — rolling buffer bound', () => {
  it('keeps only the most recent MAX_MANIFEST_CUES cues', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    FakeObserver.instances.length = 0;
    setPerformanceObserverCtorForTests(FakeObserver as unknown as typeof PerformanceObserver);
    resetMaxVttPerformanceCapture();
    const { bridge, sent } = makeBridge();
    const body = 'WEBVTT\n\n' +
      Array.from({ length: MAX_MANIFEST_CUES + 25 }, (_, i) =>
        `00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000 --> ` +
        `00:${String(Math.floor((i + 1) / 60)).padStart(2, '0')}:${String((i + 1) % 60).padStart(2, '0')}.000\nline ${i}`,
      ).join('\n\n') + '\n';
    setPageFetchForTests(vi.fn().mockResolvedValue(new Response(body, { status: 200 })) as unknown as typeof fetch);

    startMaxVttPerformanceCapture(bridge);
    FakeObserver.instances.at(-1)!.emit('https://cf.asia.prd.media.max.com/a/t/caa516/t3/1.vtt');
    await flush();

    const payload = sent.find((m) => m.type === 'SUBTITLE_MANIFEST_CUES')!.payload as { cues: Array<{ text: string }> };
    expect(payload.cues).toHaveLength(MAX_MANIFEST_CUES);
    expect(payload.cues.at(-1)!.text).toBe(`line ${MAX_MANIFEST_CUES + 24}`);
    expect(payload.cues[0]!.text).toBe('line 25');
  });
});
```

- [x] **Step 2: Run → FAIL** (`MAX_MANIFEST_CUES` unresolved).

- [x] **Step 3: Implement**

```ts
/**
 * Upper bound on the rolling capture buffer. A long title emits thousands of
 * cues; the overlay only needs the neighbourhood of the playhead and a seek
 * re-captures from the new position, so retaining the most recent window keeps
 * memory flat without losing reachable content.
 */
export const MAX_MANIFEST_CUES = 2000;
```

```ts
function mergeCues(existing: SubtitleCue[], incoming: SubtitleCue[]): SubtitleCue[] {
  const byIdentity = new Map<string, SubtitleCue>();
  const keyFor = (cue: SubtitleCue) => `${cue.startTime}|${cue.endTime}|${cue.text}`;
  for (const cue of existing) byIdentity.set(keyFor(cue), cue);
  for (const cue of incoming) byIdentity.set(keyFor(cue), cue);
  const merged = Array.from(byIdentity.values()).sort((a, b) =>
    a.startTime - b.startTime ||
    a.endTime - b.endTime ||
    a.text.localeCompare(b.text),
  );
  return merged.length > MAX_MANIFEST_CUES ? merged.slice(-MAX_MANIFEST_CUES) : merged;
}
```

- [x] **Step 4: Run → GREEN.**

---

## Task 4: DASH segment fetch — bounded concurrency + body-read timeout (ULI)

**Files:**
- Modify: `services/background.ts` (`fetchWithTimeout`, `fetchDashSegmentBodies`, `fetchProgressiveDashSegments`)
- Test: `services/__tests__/background.test.ts`

- [x] **Step 1: Failing tests**

```ts
  it('fetches DASH segments with bounded concurrency while preserving cue order', async () => {
    let inFlight = 0;
    let peak = 0;
    const bodies = new Map<string, string>([
      [SEG_1, 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nfirst\n'],
      [SEG_2, 'WEBVTT\n\n00:00:02.000 --> 00:00:03.000\nsecond\n'],
      [SEG_3, 'WEBVTT\n\n00:00:03.000 --> 00:00:04.000\nthird\n'],
    ]);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return new Response(bodies.get(url)!, { status: 200 });
    }));

    const result = await handleMessage(
      { action: 'FETCH_MANIFEST_SUBTITLES', playlistUrl: MPD_URL, segmentUrls: [SEG_1, SEG_2, SEG_3] },
      {} as chrome.runtime.MessageSender,
    );

    expect(result).toMatchObject({ success: true });
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
    expect(result.cues!.map((c) => c.text)).toEqual(['first', 'second', 'third']);
  });

  it('aborts a stalled segment body read instead of hanging', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      new ReadableStream({ start() { /* never enqueues */ } }),
      { status: 200 },
    )));

    const pending = handleMessage(
      { action: 'FETCH_MANIFEST_SUBTITLES', playlistUrl: MPD_URL, segmentUrls: [SEG_1] },
      {} as chrome.runtime.MessageSender,
    );
    await vi.advanceTimersByTimeAsync(31_000);

    await expect(pending).resolves.toMatchObject({ success: false });
    vi.useRealTimers();
  });
```

- [x] **Step 2: Run → FAIL.**

- [x] **Step 3: Implement**

```ts
/** Max concurrent subtitle segment downloads (ordered result assembly). */
const SEGMENT_FETCH_CONCURRENCY = 4;

/** Read a response body under the same deadline as its headers. */
async function fetchTextWithTimeout(
  url: string,
  signal?: AbortSignal,
): Promise<{ ok: true; status: number; text: string } | { ok: false; status: number }> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', forwardAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), SUBTITLE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return { ok: false, status: response.status };
    // Read inside the deadline: `fetchWithTimeout` returns at the headers, so a
    // stalled body would otherwise hang the assembly forever.
    return { ok: true, status: response.status, text: await response.text() };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}
```

with `const SUBTITLE_FETCH_TIMEOUT_MS = 30_000;` extracted and reused by `fetchWithTimeout`.

`fetchDashSegmentBodies` becomes ordered-concurrent:

```ts
async function fetchDashSegmentBodies(
  urls: string[],
  signal?: AbortSignal,
): Promise<{ success: true; bodies: string[] } | { success: false; error: string }> {
  for (const url of urls) {
    if (!isAllowedSubtitleUrl(url)) {
      return { success: false, error: 'Segment URL not in allow-list' };
    }
  }
  let aborted = false;
  const results = await runWithConcurrency(urls, async (url) => {
    if (signal?.aborted) {
      aborted = true;
      return { ok: false as const, status: 0 };
    }
    try {
      return await fetchTextWithTimeout(url, signal);
    } catch {
      aborted ||= signal?.aborted === true;
      return { ok: false as const, status: 0 };
    }
  }, { concurrency: SEGMENT_FETCH_CONCURRENCY });

  if (aborted || signal?.aborted) return { success: false, error: 'cancelled' };
  const bodies: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const result = results[i]!;
    if (!result.ok) {
      return { success: false, error: `Segment fetch failed: HTTP ${result.status}` };
    }
    bodies.push(result.text);
  }
  return { success: true, bodies };
}
```

`fetchProgressiveDashSegments` keeps its stop-at-first-gap semantics by fetching a window of `SEGMENT_FETCH_CONCURRENCY` numbers at a time and consuming the window in number order, breaking on the first failure; `reachedCap` reporting is unchanged.

- [x] **Step 4: Run → GREEN.**

---

## Task 5: Abort in-flight segment fetches per tab (41Q)

**Files:**
- Modify: `services/background.ts` (`subtitleFetchControllers`, `stopSubtitleSession`, `handleFetchManifestSubtitles`, message router, `__reset…ForTest`)
- Modify: `content/subtitleCoordinator.ts` (`activateOverlayModeFromManifest` — no toast for `cancelled`)
- Test: `services/__tests__/background.test.ts`, `content/__tests__/subtitleCoordinator.test.ts`

- [x] **Step 1: Failing tests**

```ts
  it('aborts an in-flight manifest segment fetch when the tab session is cancelled', async () => {
    let aborted = 0;
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          aborted += 1;
          reject(new DOMException('aborted', 'AbortError'));
        });
      })));

    const pending = handleMessage(
      { action: 'FETCH_MANIFEST_SUBTITLES', playlistUrl: MPD_URL, segmentUrls: [SEG_1, SEG_2] },
      { tab: { id: 77 } } as unknown as chrome.runtime.MessageSender,
    );
    await new Promise((r) => setTimeout(r, 0));

    await handleMessage({ action: 'CANCEL_SUBTITLE_SESSION' }, { tab: { id: 77 } } as unknown as chrome.runtime.MessageSender);

    await expect(pending).resolves.toEqual({ success: false, error: 'cancelled' });
    expect(aborted).toBeGreaterThan(0);
  });
```

and in the coordinator suite: a `FETCH_MANIFEST_SUBTITLES` mock resolving `{ success: false, error: 'cancelled' }` must not call `showSubtitleToast`.

- [x] **Step 2: Run → FAIL.**

- [x] **Step 3: Implement**

```ts
/**
 * In-flight subtitle *fetch* work per tab. `stopSubtitleSession` cancels
 * translation loops, but a DASH assembly can be downloading dozens of segments
 * with no session attached — the Stop button / seek / navigation must abort it
 * or the worker keeps fetching and stays alive for a page the user left.
 */
const subtitleFetchControllers = new Map<number, AbortController>();

/** Supersede this tab's previous fetch and expose its signal to the caller. */
function beginSubtitleFetch(tabId: number | undefined): {
  signal?: AbortSignal;
  end: () => void;
} {
  if (tabId === undefined) return { signal: undefined, end: () => {} };
  subtitleFetchControllers.get(tabId)?.abort();
  const controller = new AbortController();
  subtitleFetchControllers.set(tabId, controller);
  return {
    signal: controller.signal,
    end: () => {
      if (subtitleFetchControllers.get(tabId) === controller) {
        subtitleFetchControllers.delete(tabId);
      }
    },
  };
}
```

In `stopSubtitleSession`, before cancelling sessions:

```ts
  subtitleFetchControllers.get(tabId)?.abort();
  subtitleFetchControllers.delete(tabId);
```

`handleFetchManifestSubtitles(message, signal?)` forwards `signal` to both segment helpers and, on abort, returns `{ success: false, error: 'cancelled' }` before the generic catch can convert it into a status message. Router:

```ts
    case 'FETCH_MANIFEST_SUBTITLES': {
      const fetchWork = beginSubtitleFetch(_sender.tab?.id);
      try {
        return await handleFetchManifestSubtitles(message, fetchWork.signal);
      } finally {
        fetchWork.end();
      }
    }
```

Coordinator (`activateOverlayModeFromManifest`): treat `cancelled` as a silent no-op:

```ts
    if (!response?.success || !response.cues || response.cues.length === 0) {
      if (response?.error === 'cancelled') {
        console.log('AnyLLMTranslate: Manifest subtitle fetch cancelled');
        return;
      }
      ...
    }
```

Clear `subtitleFetchControllers` in the module's reset-for-test hook.

- [x] **Step 4: Run → GREEN.**

---

## Task 6: Accurate host_permissions pre-flight (8QA)

**Files:**
- Modify: `services/background.ts` (`warnIfSubtitleHostPermissionMissing` + new pure matcher)
- Test: `services/__tests__/background.test.ts`

- [x] **Step 1: Failing tests**

```ts
  it('treats a declared wildcard pattern as covering a deeper subdomain', () => {
    const declared = ['*://*.media.max.com/*', '*://*.hbomax.com/*'];
    expect(isHostCoveredByDeclaredPermissions('cf.asia.prd.media.max.com', declared)).toBe(true);
    expect(isHostCoveredByDeclaredPermissions('media.max.com', declared)).toBe(true);
    expect(isHostCoveredByDeclaredPermissions('evil-max.com', declared)).toBe(false);
    expect(isHostCoveredByDeclaredPermissions('media.max.com.evil.test', declared)).toBe(false);
  });

  it('stays silent when the manifest grant covers the host via a wildcard', async () => {
    const previousManifest = (chrome.runtime as { getManifest?: unknown }).getManifest;
    (chrome.runtime as { getManifest?: unknown }).getManifest = () => ({
      host_permissions: ['*://*.media.max.com/*'],
    });

    warnIfSubtitleHostPermissionMissing(MAX_SEGMENT_URL);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(warnSpy).not.toHaveBeenCalled();
    (chrome.runtime as { getManifest?: unknown }).getManifest = previousManifest;
  });
```

- [x] **Step 2: Run → FAIL.**

- [x] **Step 3: Implement**

```ts
/**
 * Whether a declared match pattern covers `host`. Chrome's `*.example.com`
 * matches the apex and every subdomain, so `*://*.media.max.com/*` covers
 * `cf.asia.prd.media.max.com`. Returns false for anything unparseable.
 */
export function hostMatchesSubtitlePermissionPattern(host: string, pattern: string): boolean {
  const match = /^(\*|https?|file|ftp):\/\/([^/]*)\//.exec(pattern.trim());
  if (!match) return false;
  const patternHost = (match[2] ?? '').toLowerCase();
  const target = host.toLowerCase();
  if (patternHost === '' || patternHost === '*') return true;
  if (patternHost.startsWith('*.')) {
    const domain = patternHost.slice(2);
    return target === domain || target.endsWith(`.${domain}`);
  }
  return target === patternHost;
}

/** True when any declared host permission covers `host`. */
export function isHostCoveredByDeclaredPermissions(
  host: string,
  declared: readonly string[],
): boolean {
  return declared.some((pattern) => hostMatchesSubtitlePermissionPattern(host, pattern));
}
```

`warnIfSubtitleHostPermissionMissing` checks the declared manifest first and only falls back to `chrome.permissions.contains` when `getManifest()` is unavailable (tests, older runtimes), preserving the existing single-query-per-origin behavior and its `origin` payload:

```ts
  warnedSubtitlePermissionOrigins.add(origin);
  const manifest = chrome.runtime?.getManifest?.() as { host_permissions?: string[] } | undefined;
  const declared = manifest?.host_permissions;
  if (Array.isArray(declared)) {
    if (!isHostCoveredByDeclaredPermissions(new URL(url).hostname, declared)) {
      console.warn(
        'AnyLLMTranslate: subtitle host is in the fetch allow-list but missing from host_permissions',
        { url, origin },
      );
    }
    return;
  }
  // …existing chrome.permissions.contains fallback unchanged
```

- [x] **Step 4: Run → GREEN.**

---

## Task 7: Surface untranslated lines + bound the coordinator buffer (PJT, 738)

**Files:**
- Modify: `content/subtitleCoordinator.ts` (`translateManifestCueTexts`, `translateDomCueTexts`, `mergeManifestOriginalCues`, `resetCoordinatorState`)
- Test: `content/__tests__/subtitleCoordinator.test.ts`

- [x] **Step 1: Failing tests** — with every `translateSubtitle` call failing, a manifest delta shows the "showing original text" notice exactly once; a second failing delta does not repeat it; a navigation clears the flag.

- [x] **Step 2: Run → FAIL.**

- [x] **Step 3: Implement**

```ts
/**
 * One-shot guard: tell the user once per navigation that some lines could not
 * be translated and the original text is shown, instead of leaving only a
 * console warning. Reset by resetCoordinatorState().
 */
let untranslatedNoticeShown = false;

function notifyUntranslatedSource(): void {
  if (untranslatedNoticeShown) return;
  untranslatedNoticeShown = true;
  showSubtitleToast('Some lines could not be translated — showing the original text.');
}
```

Call site in `translateManifestCueTexts`, after the ladder gives up on a batch:

```ts
    if (!anySubOk && remaining.length === batchTexts.length) {
      // Entire batch failed even after sub-batch retry — the warning was already
      // logged by translateManifestBatch. Tell the user once that the lines on
      // screen are untranslated rather than leaving it to a console warning.
      notifyUntranslatedSource();
    }
```

and in `translateDomCueTexts`'s failure branch. Add `untranslatedNoticeShown = false;` beside `manifestStallNotified = false;` in `resetCoordinatorState`.

Coordinator buffer bound, mirroring Task 3 — in `mergeManifestOriginalCues`:

```ts
  state.manifestOriginalCues = isSequentialDelta
    ? mergeCuesByIdentity(state.manifestOriginalCues, incoming)
    : incoming.map((c) => ({ ...c }));
  if (state.manifestOriginalCues.length > MAX_MANIFEST_CUES) {
    state.manifestOriginalCues = state.manifestOriginalCues.slice(-MAX_MANIFEST_CUES);
  }
```

with `export const MAX_MANIFEST_CUES = 2000;` imported from `@/inject/maxVttPerformanceCapture` so the two halves cannot drift.

- [x] **Step 4: Run → GREEN.**

---

## Self-Review

**Spec coverage:** JP7 → Task 1; 6RZ → Task 2; 738 → Tasks 3 + 7; ULI → Task 4; 41Q → Task 5; 8QA → Task 6; PJT → Task 7. All seven findings covered.

**Known non-goals (deliberate):** `stpp`/subtitle-in-MP4 capture, MessageBridge early-queue coverage, and the `handleFetchSubtitle` per-URL timeout path stay out of scope — none was raised by this audit round.

**Type consistency:** `MAX_MANIFEST_CUES` is defined once in `lib/constants.ts` and imported by both the capture module and the coordinator; `SEGMENT_RECOVERY_COOLDOWN_MS` is exported by the capture module and used only by its tests; `runWithConcurrency` and the DASH `SEGMENT_FETCH_CONCURRENCY = 4` are background-local (the capture module exports an unrelated constant of the same name, value 3); `fetchSegmentText` is the single body-reading helper used by both DASH paths.

---

## Deviations from the plan (as implemented)

1. **`MAX_MANIFEST_CUES` lives in `lib/constants.ts`, not the capture module.** The coordinator runs in the ISOLATED world; importing `@/inject/maxVttPerformanceCapture` would pull the MAIN-world capture module (and its `nativeFetch` resolution) into the content-script bundle. `lib/constants.ts` is world-neutral and already shared by both, so the single definition lives there.
2. **The untranslated notice reuses the existing chunk-failure cooldown instead of a new one-shot flag.** `notifyUntranslatedSection()` shares `lastChunkFailedToastAt` + `CHUNK_FAILED_TOAST_COOLDOWN_MS` with the `SUBTITLE_CHUNK_FAILED` handler and emits the same user-facing sentence ("A section of subtitles couldn't be translated — showing original."). One flag, one message, one cooldown; a burst of failed deltas still produces one toast. Consequence: the guard is a 5 s cooldown rather than per-navigation, so a later navigation that fails within 5 s of a previous toast stays silent — acceptable and consistent with background chunk failures.
3. **The DOM-delta call site fires only on an explicit `success: false`, not on a thrown messaging error**, so an invalidated extension context or a transport failure does not raise a "showing original" toast. The manifest ladder call site fires only after sub-batch retry exhaustion — and only when the last one-text-per-request retry also failed, so a batch the ladder eventually recovered no longer raises a false alarm.
4. **The permission matcher also accepts `<all_urls>`** (a declared pattern that is not `scheme://host` shaped) and decides before touching `chrome.permissions`, so the wildcard grant no longer needs a permissions-API round trip. An empty host component (`file:///*`) is not a grant for an http(s) host.
5. **The identity rule changed during implementation.** The plan's Task 1 snippet took the last `/t/([^/]+)/` match, which returns `caa516` for `…/a/t/caa516/t3/8.vtt` and fails the plan's own nested-path expectation. What shipped prefers the last `t<digits>` directory in the pathname and falls back to the last directory, so the canonical case resolves to `t3`.
6. **The manifest-buffer cap is windowed around the playhead**, not `slice(-MAX_MANIFEST_CUES)`. A tail slice is right for the progressive capture (it only ever holds the recent window) but wrong for a full-track activation, where the background hands over the whole assembled track while the playhead is still at the start — the opening cues would be dropped with the platform's own captions already hidden.
7. **`notifyUntranslatedSection` is not the last word on the toast.** Both activation paths post a status toast after the awaited translation resolves, which would erase the notice before it was painted; they now re-post the notice copy instead of "Subtitles processing...".
8. **The plan's helper name `fetchTextWithTimeout` was never implemented under that name** — the body-read deadline lives in `fetchSegmentText` (`SUBTITLE_FETCH_TIMEOUT_MS`) and covers both DASH assembly paths.

---

## Final verification

- [x] `npx vitest run` (full suite)
- [x] `npx tsc --noEmit`
- [x] `npx eslint .`
- [x] `bd close` each of the seven issues with the verification evidence
