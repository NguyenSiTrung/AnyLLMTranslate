# HBO Max Subtitle Capture & Rendering Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix HBO Max subtitle desync + dropped cues by threading DASH segment offsets through capture, render via native HTML5 `TextTrack`, and (conditionally) replace `PerformanceObserver` capture with in-flight interception.

**Architecture:** Phase 0 verifies three empirical facts about Max's player; Phase 1 threads `SegmentTimeline` `t`/`timescale` offsets into capture; Phase 2 replaces the custom overlay with native `TextTrack` rendering (overlay kept as fallback); Phase 3 (only if Phase 0 Probe 2 confirms observability) captures `.vtt`/`.mpd` in-flight and retires `PerformanceObserver`.

**Tech Stack:** TypeScript, WXT (Chrome MV3), Vitest, DOMParser, HTML5 `TextTrack`/`VTTCue`.

**Spec:** `docs/superpowers/specs/2026-07-02-max-subtitle-capture-render-redesign.md`

## Global Constraints

- All shell file ops use non-interactive flags (`cp -f`, `mv -f`, `rm -f`, `rm -rf`) — `cp`/`mv`/`rm` may be aliased to `-i` and will hang.
- Task tracking uses **`bd` (beads)**, NOT TodoWrite or markdown TODO lists.
- Commit messages follow existing convention: `fix(hbomax): ...`, `feat(subtitle): ...`, `refactor(subtitle): ...`.
- Run tests with `npx vitest run <path>` (non-watch) or `npm test`.
- Path alias `@/` maps to project root (see `tsconfig.json`).
- TDD: write the failing test first, watch it fail, implement minimally, watch it pass, commit.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `docs/superpowers/plans/2026-07-02-max-probe-results.md` | new (Task 1) | Recorded Phase 0 probe decisions |
| `lib/maxMpdSubtitles.ts` | modified (Task 2) | Extend segment builder to compute presentation-time offsets |
| `lib/dashSegmentOffsets.ts` | new (Task 2) | `buildSegmentOffsetMap(mpdBody, baseUrl)` |
| `lib/__tests__/dashSegmentOffsets.test.ts` | new (Task 2) | Offset math fixtures |
| `lib/applySegmentOffset.ts` | new (Task 3) | `applySegmentOffset(cues, offsetMs)` |
| `lib/__tests__/applySegmentOffset.test.ts` | new (Task 3) | Offset application cases |
| `inject/maxVttPerformanceCapture.ts` | modified (Task 4) / deleted (Task 10) | Apply offsets at capture; retire in Phase 3 |
| `lib/vttSegmentConcat.ts` | removed (Task 5) | Obsolete heuristic |
| `content/subtitleRenderer.ts` | new (Task 6) | Renderer interface + `createRenderer` factory |
| `content/nativeTrackRenderer.ts` | new (Task 7) | Native `TextTrack` rendering |
| `content/__tests__/nativeTrackRenderer.test.ts` | new (Task 7) | Mock-TextTrack tests |
| `content/subtitleCoordinator.ts` | modified (Task 8) | Dispatch via `createRenderer` |
| `inject/maxInFlightCapture.ts` | new (Task 9, conditional) | In-flight capture |
| `inject/subtitleHandlers/hbomax.ts` | modified (Task 9, conditional) | Enable `.vtt`/`.mpd` patterns |

---

## Task 1: Phase 0 — Verification Probes & Decision Recording

**Files:**
- Create: `docs/superpowers/plans/2026-07-02-max-probe-results.md`

**Purpose:** Empirically determine three facts about Max's player that gate later phases. This is **manual investigation on a live `play.max.com` session**, not code. Our own commit `9a47da2` shows we have been wrong about Max's observability before, so we verify rather than assume.

**Interfaces:** None (investigation). Produces three recorded decisions consumed by Tasks 4, 7, 9, 10.

- [ ] **Step 1: Probe 1 — Are `.vtt` segments segment-relative or absolute-timed?**

On `play.max.com`, start a title, scrub to ~10 minutes in (NOT the first segment). Open DevTools → Network → filter `vtt`. Click a `.vtt` request → Response tab. Inspect the **first cue's `startTime`**.

Record in the results file:
- If first cue `startTime` is near `0` (e.g. `00:00:00.000 --> ...`) → **RELATIVE** → Phase 1 (Tasks 2–5) builds.
- If first cue `startTime` is near `video.currentTime` (e.g. `00:09:58.000 --> ...`) → **ABSOLUTE** → Phase 1 shrinks: Tasks 2–3 still build (harmless, offsets apply as identity for absolute), Task 4 becomes a no-op verification, Task 5 still removes the dead heuristic.

Also note: does the segment contain an `X-TIMESTAMP-MAP=LOCAL:...;MPEGTS:...` header line? (If yes, `vttSegmentConcat`'s MPEGTS path was the intended offset source — relevant to Task 5.)

- [ ] **Step 2: Probe 2 — Are `.vtt`/`.mpd` observable to page-context fetch/XHR patching?**

Temporarily add logging to `inject/fetchInterceptor.ts` and `inject/xhrInterceptor.ts` (in the `matchUrl` check branch), build (`npm run dev`), load the unpacked extension on `play.max.com`. In a single session: load a title, **seek forward 5+ times, seek backward, switch subtitle language via the player's CC menu, reload mid-title**. Watch the console for intercepted `.vtt`/`.mpd` URLs.

Record in the results file one of:
- **GO** (intercepts reliably across initial load AND seeks AND track switches) → Phase 3 (Tasks 9–10) builds.
- **PARTIAL** (initial load only, misses on seeks) → Phase 3 dropped; `maxVttPerformanceCapture` kept with Task 4 offset fix.
- **NO-GO** (never observed) → Phase 3 dropped; `maxVttPerformanceCapture` kept with Task 4 offset fix.

Revert the temporary logging before committing anything.

- [ ] **Step 3: Probe 3 — Is `<video>.textTracks` populated by Max's player?**

Page console on `play.max.com` during playback:
```js
[...document.querySelector('video').textTracks].map(t => ({kind: t.kind, mode: t.mode, label: t.label, cues: t.cues?.length}))
```
Record the output. If non-empty subtitle tracks with cues exist, Task 7 (`NativeTrackRenderer`) must use distinct track labels to avoid colliding with Max's tracks and must NOT hide/destroy them.

- [ ] **Step 4: Write the results file**

Create `docs/superpowers/plans/2026-07-02-max-probe-results.md`:

```markdown
# Max Subtitle Redesign — Phase 0 Probe Results

**Date:** <fill in>
**Investigator:** <fill in>

## Probe 1 — Segment timing
- First cue startTime observed: <value>
- X-TIMESTAMP-MAP present: <yes/no>
- **Decision:** RELATIVE | ABSOLUTE
- **Impact:** Phase 1 <builds normally | offsets apply as identity, Task 4 is verification>

## Probe 2 — In-flight observability
- Observed on initial load: <yes/no>
- Observed on seek: <yes/no>
- Observed on track switch: <yes/no>
- **Decision:** GO | PARTIAL | NO-GO
- **Impact:** Phase 3 <builds | dropped>

## Probe 3 — Native textTracks
- textTracks output: <paste>
- **Impact:** NativeTrackRenderer <uses distinct labels, no collision | proceeds normally>
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-07-02-max-probe-results.md
git commit -m "docs: record Max subtitle redesign Phase 0 probe results"
```

**STOP.** Read the results file. If Probe 1 = ABSOLUTE, still do Tasks 2–3 (they're harmless) but treat Task 4 as verification-only. If Probe 2 ≠ GO, skip Tasks 9–10. Proceed accordingly.

---

## Task 2: DASH Segment Offset Extraction

**Files:**
- Modify: `lib/maxMpdSubtitles.ts` (extend `buildRepresentationSegmentUrls` + `BuiltRepresentationSegments`)
- Create: `lib/dashSegmentOffsets.ts`
- Test: `lib/__tests__/dashSegmentOffsets.test.ts`

**Purpose:** The authoritative per-segment presentation-time offset (`SegmentTimeline` `<S t=... d=... r=...>` ÷ `<SegmentTemplate timescale=...>`) currently exists in the MPD but is discarded — `countSegmentsFromTimeline` (`lib/maxMpdSubtitles.ts:378`) reads `<S>` elements but only counts them. This task computes the offset array parallel to the segment URL array.

**Interfaces:**
- Consumes: `parseMpd(mpdText, baseUrl): Document | null` (`lib/maxMpdSubtitles.ts:80`), `extractSubtitleTracks(mpdXml, baseUrl): MpdSubtitleTrack[]` (`lib/maxMpdSubtitles.ts:94`).
- Produces: `buildSegmentOffsetMap(mpdBody: string, baseUrl: string): Map<string, number>` — maps each segment URL to its presentation-time offset in **milliseconds**. Later consumed by Task 4 (`maxVttPerformanceCapture`) and Task 9 (`maxInFlightCapture`).

### DASH SegmentTimeline offset algorithm (reference)

`timescale` is on `<SegmentTemplate>`. For each `<S>` child of `<SegmentTimeline>`:
- If `S` has a `t` attribute → set `currentTime = parseInt(t)`. Else if it's the first `<S>` → `currentTime = 0`. Else → `currentTime` carries from the previous segment's end.
- `d = parseInt(S.d)`, `r = parseInt(S.r ?? 0)`.
- Emit `r+1` segments: each has offset `currentTime`; then `currentTime += d` after each.

Final offset in ms = `currentTimeValue / timescale * 1000`.

- [ ] **Step 1: Write the failing test**

`lib/__tests__/dashSegmentOffsets.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildSegmentOffsetMap } from '@/lib/dashSegmentOffsets';

// A Max-style text AdaptationSet: SegmentTemplate + SegmentTimeline + $Number$ template.
const MPD_RELATIVE = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT60S">
  <Period>
    <AdaptationSet id="41" lang="en-US" contentType="text">
      <Label>English</Label>
      <Role schemeIdUri="urn:mpeg:dash:role:2011" value="subtitle"/>
      <Representation id="t41" bandwidth="35" mimeType="text/vtt">
        <SegmentTemplate timescale="1000" startNumber="3" media="t/ff8956/t41/$Number$.vtt">
          <SegmentTimeline>
            <S t="0" d="1000" r="1"/>
            <S d="1000"/>
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

const BASE_URL = 'https://prd.media.max.com/asset/123/manifest-params=x';

describe('buildSegmentOffsetMap', () => {
  it('maps each segment URL to its cumulative presentation-time offset in ms', () => {
    const map = buildSegmentOffsetMap(MPD_RELATIVE, BASE_URL);
    // First <S t=0 d=1000 r=1>: 2 segments at t=0, t=1000 (timescale 1000 → 0ms, 1000ms)
    // Second <S d=1000> (no t): 1 segment at t=2000 → 2000ms
    const entries = [...map.entries()];
    expect(entries).toHaveLength(3);
    expect(entries[0][1]).toBe(0);       // t=0 → 0ms
    expect(entries[1][1]).toBe(1000);    // t=1000 → 1000ms
    expect(entries[2][1]).toBe(2000);    // t=2000 → 2000ms
  });

  it('returns absolute offsets that scale with timescale', () => {
    const mpdTimescale90k = MPD_RELATIVE.replace('timescale="1000"', 'timescale="90000"')
      .replace('d="1000"', 'd="90000"').replace('r="1"', 'r="1"');
    const map = buildSegmentOffsetMap(mpdTimescale90k, BASE_URL);
    const entries = [...map.entries()];
    expect(entries[0][1]).toBe(0);
    expect(entries[1][1]).toBe(1000);    // 90000/90000 * 1000 = 1000ms
    expect(entries[2][1]).toBe(2000);
  });

  it('uses the S.t attribute when present mid-timeline', () => {
    const mpd = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period>
  <AdaptationSet contentType="text"><Representation id="t1" mimeType="text/vtt">
    <SegmentTemplate timescale="1000" media="$Number$.vtt"><SegmentTimeline>
      <S t="0" d="5000"/>
      <S t="50000" d="5000"/>
    </SegmentTimeline></SegmentTemplate>
  </Representation></AdaptationSet>
</Period></MPD>`;
    const map = buildSegmentOffsetMap(mpd, 'https://x.com/m.mpd');
    const offsets = [...map.values()];
    expect(offsets).toEqual([0, 50000]);
  });

  it('returns an empty map when no subtitle AdaptationSets exist', () => {
    const mpd = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period>
  <AdaptationSet mimeType="video/mp4"><Representation id="v1"/></AdaptationSet>
</Period></MPD>`;
    expect(buildSegmentOffsetMap(mpd, 'https://x.com/m.mpd').size).toBe(0);
  });

  it('returns an empty map for unparseable input', () => {
    expect(buildSegmentOffsetMap('not xml', 'https://x.com/m.mpd').size).toBe(0);
    expect(buildSegmentOffsetMap('', 'https://x.com/m.mpd').size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/dashSegmentOffsets.test.ts`
Expected: FAIL — `buildSegmentOffsetMap` is not defined / module not found.

- [ ] **Step 3: Extend `buildRepresentationSegmentUrls` to compute offsets**

In `lib/maxMpdSubtitles.ts`, first extend the return type (around line 154):

```typescript
interface BuiltRepresentationSegments {
  urls: string[];
  offsetsMs: number[];
  segmentFetch?: SegmentFetchTemplate;
}
```

Add an offset-computation helper near `countSegmentsFromTimeline` (after line ~393):

```typescript
/** Compute the DASH presentation-time offset (ms) for each <S> segment in a
 *  SegmentTimeline, parallel to the segment URL order produced by
 *  buildRepresentationSegmentUrls. Returns [] when there is no timeline. */
function computeSegmentOffsetsMs(segmentTemplate: Element): number[] {
  const timeline = findChildByLocalName(segmentTemplate, 'SegmentTimeline');
  if (!timeline) return [];

  const timescale = parseInt(segmentTemplate.getAttribute('timescale') ?? '1', 10);
  if (!Number.isFinite(timescale) || timescale <= 0) return [];

  const offsets: number[] = [];
  let currentTime = 0;
  let first = true;

  for (const s of findChildrenByLocalName(timeline, 'S')) {
    const tAttr = s.getAttribute('t');
    if (tAttr !== null) {
      currentTime = parseInt(tAttr, 10);
    } else if (first) {
      currentTime = 0;
    }
    first = false;

    const d = parseInt(s.getAttribute('d') ?? '0', 10);
    const rAttr = s.getAttribute('r');
    const repeat = rAttr !== null ? parseInt(rAttr, 10) : 0;
    if (!Number.isFinite(repeat) || repeat < 0 || !Number.isFinite(d)) continue;

    for (let k = 0; k <= repeat; k++) {
      offsets.push((currentTime / timescale) * 1000);
      currentTime += d;
    }
  }

  return offsets;
}
```

Now thread offsets through every `return` in `buildRepresentationSegmentUrls` (lines ~200–250). For the **non-timeline** returns (BaseURL single file, SegmentList, progressive fetch, duration-template loop), offsets default to a zero per URL:

```typescript
// BaseURL single-file return:
return { urls: [resolved], offsetsMs: [0] };

// SegmentList return:
if (segmentListUrls) {
  return { urls: segmentListUrls, offsetsMs: segmentListUrls.map(() => 0) };
}

// Progressive fetch return:
return { urls: [firstUrl], offsetsMs: [0], segmentFetch: { ... } };

// Timeline / duration-template loop: compute real offsets
const timelineOffsets = computeSegmentOffsetsMs(segmentTemplate);
const urls: string[] = [];
for (let i = 0; i < segmentCount; i++) {
  const resolved = buildTemplatedSegmentUrl(templateContext, templateContext.startNumber + i);
  if (!resolved || isSelfReferentialSubtitleUrl(resolved, baseUrl)) continue;
  urls.push(resolved);
}
const offsetsMs =
  timelineOffsets.length === urls.length
    ? timelineOffsets
    : urls.map(() => 0);
return urls.length > 0 ? { urls, offsetsMs } : null;
```

- [ ] **Step 4: Create `lib/dashSegmentOffsets.ts`**

```typescript
/**
 * DASH segment presentation-time offset extraction.
 *
 * Given an MPD body + base URL, enumerate subtitle segment URLs and map each to
 * its DASH presentation-time offset (SegmentTimeline t ÷ timescale), in ms.
 *
 * Offsets are the authoritative source for converting segment-relative WebVTT
 * cue timestamps (cues that restart near 0 in each segment) into absolute
 * timeline times. Without this, cues from every segment collapse into the
 * first few seconds and the overlay finds nothing at later playback positions.
 */
import { parseMpd, extractSubtitleTracks, type MpdSubtitleTrack } from '@/lib/maxMpdSubtitles';

export function buildSegmentOffsetMap(mpdBody: string, baseUrl: string): Map<string, number> {
  const map = new Map<string, number>();
  if (!mpdBody || mpdBody.trim().length === 0) return map;

  const mpdXml = parseMpd(mpdBody, baseUrl);
  if (!mpdXml) return map;

  const tracks = extractSubtitleTracks(mpdXml, baseUrl);
  for (const track of tracks) {
    fillFromTrack(track, map);
  }
  return map;
}

function fillFromTrack(track: MpdSubtitleTrack, map: Map<string, number>): void {
  // extractSubtitleTracks returns offsets via a parallel array carried on a
  // non-enumerated extension; access it through the public segmentUrls list
  // paired with offsets queried from the builder output.
  // NOTE: buildRepresentationSegmentUrls populates offsetsMs; extractSubtitleTracks
  // exposes them through the track's segmentOffsets field (added in Task 2 Step 3).
  const urls = track.segmentUrls ?? (track.url ? [track.url] : []);
  const offsets = track.segmentOffsetsMs ?? urls.map(() => 0);
  for (let i = 0; i < urls.length && i < offsets.length; i++) {
    if (!map.has(urls[i])) map.set(urls[i], offsets[i]);
  }
}
```

To make `segmentOffsetsMs` available, extend `MpdSubtitleTrack` in `lib/maxMpdSubtitles.ts` (line 16):

```typescript
export interface MpdSubtitleTrack {
  url: string;
  segmentUrls?: string[];
  /** Presentation-time offset (ms) parallel to segmentUrls; absolute cues when
   *  undefined. Populated by buildRepresentationSegmentUrls. */
  segmentOffsetsMs?: number[];
  segmentFetch?: SegmentFetchTemplate;
  language: string;
  mimeType?: string;
}
```

And in `extractSubtitleTracks`, set it from `built.offsetsMs` (line ~112):

```typescript
tracks.push({
  url: built.urls[0],
  segmentUrls: built.urls.length > 1 ? built.urls : undefined,
  segmentOffsetsMs: built.offsetsMs,
  segmentFetch: built.segmentFetch,
  language: lang,
  mimeType,
});
```

Now simplify `lib/dashSegmentOffsets.ts`'s `fillFromTrack` to read `track.segmentOffsetsMs` directly (drop the stale comment block):

```typescript
function fillFromTrack(track: MpdSubtitleTrack, map: Map<string, number>): void {
  const urls = track.segmentUrls ?? (track.url ? [track.url] : []);
  const offsets = track.segmentOffsetsMs ?? urls.map(() => 0);
  for (let i = 0; i < urls.length && i < offsets.length; i++) {
    if (!map.has(urls[i])) map.set(urls[i], offsets[i]);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/dashSegmentOffsets.test.ts`
Expected: PASS (all 5 cases).

If offsets don't line up with the URL count, the `urls.map(() => 0)` fallback kicks in — investigate `computeSegmentOffsetsMs` against the fixture.

- [ ] **Step 6: Run full test suite to confirm no regressions in `maxMpdSubtitles`**

Run: `npx vitest run lib/__tests__/maxMpdSubtitles`
Expected: PASS (the new `offsetsMs` field is additive; existing assertions on `segmentUrls`/`url` are unaffected).

- [ ] **Step 7: Commit**

```bash
git add lib/maxMpdSubtitles.ts lib/dashSegmentOffsets.ts lib/__tests__/dashSegmentOffsets.test.ts
git commit -m "feat(subtitle): extract DASH SegmentTimeline presentation-time offsets"
```

---

## Task 3: `applySegmentOffset` Pure Helper

**Files:**
- Create: `lib/applySegmentOffset.ts`
- Test: `lib/__tests__/applySegmentOffset.test.ts`

**Purpose:** The single named operation the current `captureSegment` (`inject/maxVttPerformanceCapture.ts:221`) skips entirely. Pure and trivially testable.

**Interfaces:**
- Consumes: `SubtitleCue` (`@/types/subtitle`, fields `startTime`, `endTime`, `text`, plus optional `originalText`, `position`, `voice`, `metadata`).
- Produces: `applySegmentOffset(cues: SubtitleCue[], offsetMs: number): SubtitleCue[]`.

- [ ] **Step 1: Write the failing test**

`lib/__tests__/applySegmentOffset.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { applySegmentOffset } from '@/lib/applySegmentOffset';
import type { SubtitleCue } from '@/types/subtitle';

const cue = (start: number, end: number, text: string): SubtitleCue => ({ startTime: start, endTime: end, text });

describe('applySegmentOffset', () => {
  it('adds offset to start and end times (ms input, seconds output)', () => {
    const result = applySegmentOffset([cue(1, 2, 'hi')], 30000); // 30s offset
    expect(result[0].startTime).toBe(31);
    expect(result[0].endTime).toBe(32);
  });

  it('preserves cue text and optional fields', () => {
    const c: SubtitleCue = { startTime: 1, endTime: 2, text: 'hi', voice: 'Bob', position: { line: 1 } };
    const result = applySegmentOffset([c], 1000);
    expect(result[0].text).toBe('hi');
    expect(result[0].voice).toBe('Bob');
    expect(result[0].position).toEqual({ line: 1 });
  });

  it('offset 0 is a no-op', () => {
    const result = applySegmentOffset([cue(5, 7, 'x')], 0);
    expect(result).toEqual([cue(5, 7, 'x')]);
  });

  it('does not mutate the input array or its cues', () => {
    const input = [cue(1, 2, 'hi')];
    applySegmentOffset(input, 5000);
    expect(input[0].startTime).toBe(1); // unchanged
  });

  it('handles empty input', () => {
    expect(applySegmentOffset([], 1000)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/applySegmentOffset.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`lib/applySegmentOffset.ts`:

```typescript
import type { SubtitleCue } from '@/types/subtitle';

/**
 * Add a DASH presentation-time offset (given in milliseconds) to every cue's
 * start/end times (returned in seconds). Returns new cue objects; does not
 * mutate the input. This converts segment-relative cue timestamps into
 * absolute timeline times.
 */
export function applySegmentOffset(cues: SubtitleCue[], offsetMs: number): SubtitleCue[] {
  if (cues.length === 0) return [];
  const offsetSec = offsetMs / 1000;
  return cues.map((cue) => ({
    ...cue,
    startTime: cue.startTime + offsetSec,
    endTime: cue.endTime + offsetSec,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/applySegmentOffset.test.ts`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/applySegmentOffset.ts lib/__tests__/applySegmentOffset.test.ts
git commit -m "feat(subtitle): add applySegmentOffset pure helper"
```

---

## Task 4: Apply Offsets in `maxVttPerformanceCapture`

**Files:**
- Modify: `inject/maxVttPerformanceCapture.ts`

**Purpose:** THE FIX. When a `.mpd` is observed, fetch its body, build the offset map, and apply the per-segment offset in `captureSegment`. Today `captureSegment` parses segments and takes `startTime`/`endTime` verbatim (`inject/maxVttPerformanceCapture.ts:221-225`).

> **Phase 0 gate:** If Probe 1 = ABSOLUTE, this task is a **verification-only** change: apply the offsets anyway (identity for absolute times) and confirm via manual playback that timing is unchanged. The code change is identical; the confidence differs.

**Interfaces:**
- Consumes: `buildSegmentOffsetMap` (Task 2), `applySegmentOffset` (Task 3), `parseWebVTT` (`@/lib/subtitleParser`).

- [ ] **Step 1: Add the offset-map cache at module scope**

In `inject/maxVttPerformanceCapture.ts`, near the other module state (around line 40, alongside `cueBuffer`, `emittedTrack`, etc.):

```typescript
/** Cached DASH segment → presentation-time offset (ms), from the most recent
 *  .mpd observed for the active track. Reset on track switch / seek / teardown. */
let segmentOffsetMap: Map<string, number> = new Map();
```

- [ ] **Step 2: Populate the map when an `.mpd` is observed**

Find the `PerformanceObserver` resource-entry handling (the callback that inspects `entry.name` for `.vtt`). In the same callback, add a branch that detects `.mpd` entries (or `application/dash+xml` initatorType / the Max extensionless manifest host `prd.media.max.com`). Add a new handler function:

```typescript
async function captureMpdIfPresent(url: string, bridge: MessageBridgeSender): Promise<void> {
  // Detect Max .mpd / extensionless manifest URLs.
  const looksLikeMpd =
    /\.mpd(\?|$)/i.test(url) ||
    /(?:^|\.)prd\.media\.max\.com\//i.test(url);
  if (!looksLikeMpd) return;

  try {
    const response = await pageFetch(url, { signal: new AbortController().signal });
    if (!response.ok) return;
    const body = await response.text();
    const built = buildSegmentOffsetMap(body, url);
    if (built.size > 0) {
      segmentOffsetMap = built;
      console.log('AnyLLMTranslate: Max MPD offsets captured', { count: built.size });
    }
  } catch {
    // Non-fatal: capture proceeds with empty offset map (current behavior).
  }
}
```

Wire it into the observer callback alongside the existing `.vtt` check, e.g. for each new resource entry call `await captureMpdIfPresent(entry.name, bridge)` before the `.vtt` branch. (Use the existing dedup `seenUrls` set so each `.mpd` is fetched at most once.)

- [ ] **Step 3: Apply the offset in `captureSegment`**

In `captureSegment` (around line 221), replace the verbatim parse:

```typescript
// BEFORE (current):
const newCues = parseWebVTT(body).map((cue) => ({
  startTime: cue.startTime,
  endTime: cue.endTime,
  text: cue.text,
}));
```

with:

```typescript
const offsetMs = segmentOffsetMap.get(url) ?? 0;
const parsed = parseWebVTT(body);
const newCues = applySegmentOffset(
  parsed.map((cue) => ({ startTime: cue.startTime, endTime: cue.endTime, text: cue.text })),
  offsetMs,
);
if (offsetMs > 0) {
  console.log('AnyLLMTranslate: applied segment offset', { url, offsetMs, firstCue: newCues[0]?.startTime });
}
```

Add the imports at the top of the file:

```typescript
import { buildSegmentOffsetMap } from '@/lib/dashSegmentOffsets';
import { applySegmentOffset } from '@/lib/applySegmentOffset';
```

- [ ] **Step 4: Reset the offset map alongside cue buffer resets**

In the existing reset functions (`resetMaxVttPerformanceCapture`, `resetMaxVttCaptureForSeek`, `resetMaxVttPerformanceCaptureLock` — around lines 86, 99, 119), add `segmentOffsetMap = new Map();` wherever `cueBuffer = [];` / `seenUrls.clear()` is reset. For `resetMaxVttCaptureForSeek` (seek reset), clearing the map forces a re-fetch of the `.mpd` on the next segment batch — correct, because seeking may switch to a new Period.

- [ ] **Step 5: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual E2E verification on Max** (this is the real bug verification — the unit tests can't reproduce Max's stream)

Load the dev extension on `play.max.com`. Verify:
- Initial load → first cue appears at the correct time.
- Seek forward 10 min → cue at new position correct (the desync scenario).
- Seek backward → correct.
- 20+ min continuous playback → no cumulative drift.
- Check the console for `applied segment offset` logs with sensible `offsetMs` values that grow across segments.

- [ ] **Step 7: Commit**

```bash
git add inject/maxVttPerformanceCapture.ts
git commit -m "fix(hbomax): apply DASH segment presentation-time offsets at capture"
```

---

## Task 5: Remove Obsolete `vttSegmentConcat` Offset Heuristic

**Files:**
- Audit: `lib/vttSegmentConcat.ts` and all importers
- Possibly remove: `lib/vttSegmentConcat.ts`, `lib/__tests__/vttSegmentConcat.test.ts`

**Purpose:** `concatVttSegments` reconstructs segment offsets with a wrong heuristic (cue-end accumulation, `lib/vttSegmentConcat.ts:208-242`). After Task 4, offsets are applied correctly upstream. This function must not double-offset.

**Interfaces:** None new. Pure deletion/audit.

- [ ] **Step 1: Find all importers**

Run: `grep -rn "vttSegmentConcat\|concatVttSegments" --include="*.ts" . | grep -v node_modules | grep -v .output`

Record every importer. Expect: possibly `lib/maxMpdSubtitles.ts`, `inject/maxVttPerformanceCapture.ts`, or none.

- [ ] **Step 2: Decide based on importers**

- If **no importer** (Task 4's `captureSegment` parses segments individually and never calls `concatVttSegments`): delete `lib/vttSegmentConcat.ts` and `lib/__tests__/vttSegmentConcat.test.ts`.
- If **importer exists**: replace the call with the already-offset-applied cues (the caller should not be concatenating raw segments — after Task 4, each segment is parsed and offset individually, then merged by `mergeCues`). Remove the call, then delete the file.

- [ ] **Step 3: Delete (if no importer)**

```bash
rm -f lib/vttSegmentConcat.ts lib/__tests__/vttSegmentConcat.test.ts
```

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: PASS, no test references the deleted module.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(subtitle): remove obsolete vttSegmentConcat offset heuristic"
```

---

## Task 6: `SubtitleRenderer` Interface + Overlay Adapter

**Files:**
- Create: `content/subtitleRenderer.ts`
- Test: `content/__tests__/subtitleRenderer.test.ts`

**Purpose:** Introduce a renderer interface so the coordinator doesn't know or care whether native `TextTrack` or the custom overlay is rendering. The overlay (existing module-level functions) is wrapped behind the interface as a fallback (spec decision D3).

**Interfaces:**
- Consumes: existing `initializeOverlay`/`updateCues`/`cleanup` (`@/content/subtitleOverlay`), `OverlayConfig`, `SubtitleCue` (`@/types/subtitle`).
- Produces: `SubtitleRenderer` interface, `OverlayRenderer` class, `createRenderer(video): SubtitleRenderer` factory (Task 6 returns overlay-only; Task 7 adds the native branch).

- [ ] **Step 1: Write the failing test**

`content/__tests__/subtitleRenderer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRenderer, OverlayRenderer } from '@/content/subtitleRenderer';
import type { SubtitleCue } from '@/types/subtitle';

// Mock the overlay module so the test doesn't touch the DOM.
vi.mock('@/content/subtitleOverlay', () => ({
  initializeOverlay: vi.fn(),
  updateCues: vi.fn(),
  cleanup: vi.fn(),
  getOverlayTextContainer: vi.fn(() => null),
}));

describe('createRenderer (overlay fallback)', () => {
  beforeEach(() => {
    // No video/VTTCue in jsdom → capability check fails → overlay.
    Object.defineProperty(globalThis, 'VTTCue', { configurable: true, value: undefined });
    Object.defineProperty(HTMLElement.prototype, 'addTextTrack', { configurable: true, value: undefined });
  });

  it('returns OverlayRenderer when VTTCue/addTextTrack unavailable', () => {
    const fakeVideo = document.createElement('video');
    const renderer = createRenderer(fakeVideo);
    expect(renderer).toBeInstanceOf(OverlayRenderer);
  });
});

describe('OverlayRenderer', () => {
  it('delegates initialize/updateCues/destroy to the overlay module', async () => {
    const { initializeOverlay, updateCues, cleanup } = await import('@/content/subtitleOverlay');
    const renderer = new OverlayRenderer();
    const cues: SubtitleCue[] = [{ startTime: 1, endTime: 2, text: 'hi' }];
    await renderer.initialize(cues, {}, document.createElement('video'));
    renderer.updateCues(cues);
    renderer.destroy();
    expect(initializeOverlay).toHaveBeenCalled();
    expect(updateCues).toHaveBeenCalledWith(cues);
    expect(cleanup).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run content/__tests__/subtitleRenderer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`content/subtitleRenderer.ts`:

```typescript
/**
 * Subtitle renderer abstraction.
 *
 * The coordinator calls createRenderer(video) and gets back an object whose
 * implementation is either native HTML5 TextTrack (preferred — browser handles
 * timing/fullscreen/positioning) or the legacy custom overlay (fallback when
 * the browser/player lacks TextTrack support, spec decision D3).
 */
import type { SubtitleCue } from '@/types/subtitle';
import {
  initializeOverlay,
  updateCues,
  cleanup as cleanupOverlay,
} from '@/content/subtitleOverlay';

export interface SubtitleDisplayConfig {
  displayMode?: 'bilingual' | 'translation-only';
  fontSizeMode?: 'auto' | 'fixed';
  // Mirror of the overlay-relevant OverlayConfig fields; passed through.
  [key: string]: unknown;
}

export interface SubtitleRenderer {
  initialize(cues: SubtitleCue[], config: SubtitleDisplayConfig, video: HTMLVideoElement): Promise<void>;
  updateCues(cues: SubtitleCue[]): void;
  destroy(): void;
}

/** Legacy custom-overlay renderer (fallback). */
export class OverlayRenderer implements SubtitleRenderer {
  async initialize(cues: SubtitleCue[], config: SubtitleDisplayConfig, video: HTMLVideoElement): Promise<void> {
    initializeOverlay(cues, config, video);
  }
  updateCues(cues: SubtitleCue[]): void {
    updateCues(cues);
  }
  destroy(): void {
    cleanupOverlay();
  }
}

/** Whether the environment can render subtitles via native TextTrack. */
export function canRenderNatively(video: HTMLVideoElement): boolean {
  return (
    typeof VTTCue !== 'undefined' &&
    typeof video.addTextTrack === 'function'
  );
}

/** Returns a native renderer if supported, else the overlay fallback. */
export function createRenderer(video: HTMLVideoElement): SubtitleRenderer {
  if (canRenderNatively(video)) {
    // Lazy import to avoid pulling native code into the fallback path; cycles
    // are avoided because nativeTrackRenderer imports only types from here.
    // (Static import is fine — kept lazy via dynamic require pattern below.)
    // Implemented in Task 7: return new NativeTrackRenderer();
    // For now (Task 6), fall through to overlay.
    return new OverlayRenderer();
  }
  return new OverlayRenderer();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run content/__tests__/subtitleRenderer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add content/subtitleRenderer.ts content/__tests__/subtitleRenderer.test.ts
git commit -m "feat(subtitle): add SubtitleRenderer interface with overlay fallback"
```

---

## Task 7: `NativeTrackRenderer` + Factory Native Branch

**Files:**
- Create: `content/nativeTrackRenderer.ts`
- Modify: `content/subtitleRenderer.ts` (wire native branch)
- Test: `content/__tests__/nativeTrackRenderer.test.ts`

**Purpose:** Render bilingual subtitles via two synthetic `TextTrack`s (spec D2). Eliminates the `timeupdate`→`findActiveCue`→`updateDisplayedText` loop — the browser tracks active cues by timestamp.

**Interfaces:**
- Consumes: `SubtitleRenderer`, `SubtitleDisplayConfig` (Task 6), `SubtitleCue` (`@/types/subtitle`).
- Produces: `NativeTrackRenderer` class implementing `SubtitleRenderer`.

> **Phase 0 gate:** If Probe 3 showed Max populates its own `textTracks`, use distinct labels (`'AnyLLM-Original'`, `'AnyLLM-Translation'`) and do NOT touch Max's tracks.

- [ ] **Step 1: Write the failing test**

`content/__tests__/nativeTrackRenderer.test.ts` — reuse the mock-TextTrack pattern from `lib/__tests__/textTrackCues.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NativeTrackRenderer } from '@/content/nativeTrackRenderer';
import type { SubtitleCue } from '@/types/subtitle';

function makeTrack(cues: any[] = []): any {
  return {
    kind: 'subtitles',
    mode: 'disabled',
    label: '',
    language: '',
    cues: cues as any,
    addCue: vi.fn((c) => cues.push(c)),
    removeCue: vi.fn((c) => {
      const i = cues.indexOf(c);
      if (i >= 0) cues.splice(i, 1);
    }),
    oncuechange: null,
  };
}

function makeVideo(tracks: any[]): any {
  const textTracks = tracks;
  textTracks.addEventListener = vi.fn();
  textTracks.removeEventListener = vi.fn();
  return {
    addTextTrack: vi.fn(() => {
      const t = makeTrack();
      tracks.push(t);
      return t;
    }),
    textTracks,
  };
}

// Provide a VTTCue stub.
class FakeVTTCue {
  startTime: number; endTime: number; text: string;
  constructor(s: number, e: number, t: string) { this.startTime = s; this.endTime = e; this.text = t; }
}
(globalThis as any).VTTCue = FakeVTTCue;

describe('NativeTrackRenderer', () => {
  let video: any;
  beforeEach(() => { video = makeVideo([]); });

  it('creates two showing tracks and adds cues to each', async () => {
    const r = new NativeTrackRenderer();
    const cues: SubtitleCue[] = [
      { startTime: 1, endTime: 2, text: 'hello', originalText: 'hello' },
    ];
    await r.initialize(cues, { displayMode: 'bilingual' }, video);
    expect(video.addTextTrack).toHaveBeenCalledTimes(2);
    const [orig, trans] = video.textTracks;
    expect(orig.mode).toBe('showing');
    expect(trans.mode).toBe('showing');
    expect(orig.cues.length).toBe(1);   // original text
    expect(trans.cues.length).toBe(1);  // translation text
  });

  it('uses originalText for the original track and text for translation', async () => {
    const r = new NativeTrackRenderer();
    const cues: SubtitleCue[] = [
      { startTime: 1, endTime: 2, text: 'hola', originalText: 'hello' },
    ];
    await r.initialize(cues, { displayMode: 'bilingual' }, video);
    const [orig] = video.textTracks;
    expect((orig.cues[0] as any).text).toBe('hello');
    expect((video.textTracks[1].cues[0] as any).text).toBe('hola');
  });

  it('translation-only mode creates only one track', async () => {
    const r = new NativeTrackRenderer();
    await r.initialize([{ startTime: 1, endTime: 2, text: 'hi' }], { displayMode: 'translation-only' }, video);
    expect(video.addTextTrack).toHaveBeenCalledTimes(1);
  });

  it('updateCues adds new cues without duplicating stable ones (delta only)', async () => {
    const r = new NativeTrackRenderer();
    await r.initialize([{ startTime: 1, endTime: 2, text: 'a' }], { displayMode: 'translation-only' }, video);
    const track = video.textTracks[0];
    expect(track.cues.length).toBe(1);
    r.updateCues([
      { startTime: 1, endTime: 2, text: 'a' },          // stable
      { startTime: 5, endTime: 6, text: 'b' },          // new
    ]);
    expect(track.cues.length).toBe(2);
  });

  it('destroy removes all cues and disables tracks', async () => {
    const r = new NativeTrackRenderer();
    await r.initialize([{ startTime: 1, endTime: 2, text: 'a' }], { displayMode: 'bilingual' }, video);
    r.destroy();
    for (const t of video.textTracks) {
      expect(t.mode).toBe('disabled');
      expect(t.cues.length).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run content/__tests__/nativeTrackRenderer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`content/nativeTrackRenderer.ts`:

```typescript
/**
 * Native HTML5 TextTrack subtitle renderer.
 *
 * Creates synthetic subtitle tracks on the <video> and adds VTTCue objects;
 * the browser handles active-cue timing, positioning, and fullscreen. This
 * replaces the custom overlay's timeupdate/findActiveCue/updateDisplayedText
 * loop (spec decision D2: two tracks for bilingual display).
 */
import type { SubtitleCue } from '@/types/subtitle';
import type { SubtitleRenderer, SubtitleDisplayConfig } from '@/content/subtitleRenderer';

const ORIGINAL_LABEL = 'AnyLLM-Original';
const TRANSLATION_LABEL = 'AnyLLM-Translation';

export class NativeTrackRenderer implements SubtitleRenderer {
  private originalTrack: TextTrack | null = null;
  private translationTrack: TextTrack | null = null;
  private seenKeys = new Set<string>();
  private displayMode: SubtitleDisplayConfig['displayMode'] = 'bilingual';

  async initialize(
    cues: SubtitleCue[],
    config: SubtitleDisplayConfig,
    video: HTMLVideoElement,
  ): Promise<void> {
    this.displayMode = config.displayMode ?? 'bilingual';
    this.createTracks(video);
    this.seenKeys.clear();
    this.addCues(cues);
  }

  private createTracks(video: HTMLVideoElement): void {
    // Probe 3 guard: never destroy Max's own tracks — use distinct labels.
    if (this.displayMode === 'bilingual') {
      this.originalTrack = video.addTextTrack('subtitles', ORIGINAL_LABEL);
      this.originalTrack.mode = 'showing';
    }
    this.translationTrack = video.addTextTrack('subtitles', TRANSLATION_LABEL);
    this.translationTrack.mode = 'showing';
  }

  private addCues(cues: SubtitleCue[]): void {
    for (const cue of cues) {
      const key = this.keyFor(cue);
      if (this.seenKeys.has(key)) continue;
      this.seenKeys.add(key);

      if (this.originalTrack) {
        const text = cue.originalText ?? cue.text;
        this.originalTrack.addCue(new VTTCue(cue.startTime, cue.endTime, text));
      }
      this.translationTrack?.addCue(new VTTCue(cue.startTime, cue.endTime, cue.text));
    }
  }

  updateCues(cues: SubtitleCue[]): void {
    // Delta-only: stable cues already added are skipped by the seenKeys check.
    this.addCues(cues);
  }

  destroy(): void {
    this.clearTrack(this.originalTrack);
    this.clearTrack(this.translationTrack);
    if (this.originalTrack) this.originalTrack.mode = 'disabled';
    if (this.translationTrack) this.translationTrack.mode = 'disabled';
    this.seenKeys.clear();
  }

  private clearTrack(track: TextTrack | null): void {
    if (!track || !track.cues) return;
    for (let i = track.cues.length - 1; i >= 0; i--) {
      track.removeCue(track.cues[i]);
    }
  }

  private keyFor(cue: SubtitleCue): string {
    return `${cue.startTime}|${cue.endTime}|${cue.text}`;
  }
}
```

- [ ] **Step 4: Wire native branch in `createRenderer`**

In `content/subtitleRenderer.ts`, replace the placeholder branch:

```typescript
import { NativeTrackRenderer } from '@/content/nativeTrackRenderer';

export function createRenderer(video: HTMLVideoElement): SubtitleRenderer {
  if (canRenderNatively(video)) {
    return new NativeTrackRenderer();
  }
  return new OverlayRenderer();
}
```

Remove the old placeholder comment block.

- [ ] **Step 5: Update the Task 6 test**

The Task 6 test asserted `createRenderer` returns `OverlayRenderer` when `VTTCue`/`addTextTrack` are undefined — that still holds. Add a positive case to `subtitleRenderer.test.ts`:

```typescript
import { NativeTrackRenderer } from '@/content/nativeTrackRenderer';
// ...
it('returns NativeTrackRenderer when VTTCue and addTextTrack are available', () => {
  (globalThis as any).VTTCue = class { constructor(public s: number, public e: number, public t: string) {} };
  const fakeVideo = document.createElement('video');
  (fakeVideo as any).addTextTrack = () => ({ mode: 'disabled', cues: [], addCue() {}, removeCue() {} });
  expect(createRenderer(fakeVideo)).toBeInstanceOf(NativeTrackRenderer);
});
```

- [ ] **Step 6: Run both renderer test files**

Run: `npx vitest run content/__tests__/nativeTrackRenderer.test.ts content/__tests__/subtitleRenderer.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add content/nativeTrackRenderer.ts content/subtitleRenderer.ts content/__tests__/nativeTrackRenderer.test.ts content/__tests__/subtitleRenderer.test.ts
git commit -m "feat(subtitle): native TextTrack renderer with bilingual dual tracks"
```

---

## Task 8: Coordinator Dispatch via `createRenderer`

**Files:**
- Modify: `content/subtitleCoordinator.ts`

**Purpose:** Route all render calls through `createRenderer(video)`. The coordinator has ~6 `initializeOverlay` and ~15 `updateCues` call sites; swap them to a renderer instance.

**Interfaces:**
- Consumes: `createRenderer`, `SubtitleRenderer` (Task 6/7).

- [ ] **Step 1: Create a renderer instance in coordinator state**

Near the top of `content/subtitleCoordinator.ts`, add to imports:

```typescript
import { createRenderer, type SubtitleRenderer } from '@/content/subtitleRenderer';
```

Remove (or keep but unused) the direct `initializeOverlay`/`updateCues`/`cleanupOverlay`/`getOverlayTextContainer` imports from `@/content/subtitleOverlay`. Find the state object (around line 224 where `activeSource` lives) and add:

```typescript
let activeRenderer: SubtitleRenderer | null = null;

function ensureRenderer(video: HTMLVideoElement): SubtitleRenderer {
  if (!activeRenderer) activeRenderer = createRenderer(video);
  return activeRenderer;
}

function destroyRenderer(): void {
  activeRenderer?.destroy();
  activeRenderer = null;
}
```

- [ ] **Step 2: Replace `initializeOverlay` call sites**

Each `initializeOverlay(cuesToDisplay, overlayConfig)` (lines ~494, 645, 1061, 1229, 1307, 1534) becomes:

```typescript
const video = document.querySelector('video') as HTMLVideoElement;
await ensureRenderer(video).initialize(cuesToDisplay, overlayConfig, video);
```

(If the enclosing function is not already `async`, make it `async` — most handlers already are.) If `getOverlayTextContainer()` was used for drag-reposition, keep that one direct import (it reads overlay DOM only relevant in fallback mode) — or gate it behind `if (!(activeRenderer instanceof NativeTrackRenderer))`.

- [ ] **Step 3: Replace `updateCues` call sites**

Each `updateCues(...)` (lines ~503, 741, 850, 958, 998, 1147, 1421, 1447, 1605, 1635, 1850, 1861) becomes:

```typescript
activeRenderer?.updateCues(...);
```

- [ ] **Step 4: Replace `cleanupOverlay` with `destroyRenderer`**

In the coordinator's teardown path (search for `cleanupOverlay` / `resetOverlayState`), call `destroyRenderer()` instead.

- [ ] **Step 5: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run coordinator tests**

Run: `npx vitest run content/__tests__/subtitleCoordinator.test.ts`
Expected: PASS. (If tests instantiated the overlay directly, mock `createRenderer` to return the existing overlay-backed renderer.)

- [ ] **Step 7: Manual E2E on Max** — confirm native rendering:
- Captions appear (now via native TextTrack, not the overlay div).
- Fullscreen works without the overlay's reparenting logic.
- Translation deltas still update (new lines appear as translation lands).

- [ ] **Step 8: Commit**

```bash
git add content/subtitleCoordinator.ts
git commit -m "refactor(subtitle): dispatch rendering via SubtitleRenderer interface"
```

---

## Task 9 (CONDITIONAL — only if Probe 2 = GO): In-Flight Capture

> **Skip this task and Task 10 if Probe 2 = PARTIAL or NO-GO.** Keep `maxVttPerformanceCapture` with Task 4's offset fix.

**Files:**
- Create: `inject/maxInFlightCapture.ts`
- Modify: `inject/subtitleHandlers/hbomax.ts` (enable patterns)
- Modify: `inject/interceptorRegistry.ts` (wire patterns, if needed)

**Purpose:** Capture `.mpd` and `.vtt` via the existing MAIN-world `FetchInterceptor`/`XhrInterceptor` (which run in page context with auth — unlike the old broken background pipeline). Apply the same offsets as Task 4.

**Interfaces:**
- Consumes: `buildSegmentOffsetMap` (Task 2), `applySegmentOffset` (Task 3), `parseWebVTT` (`@/lib/subtitleParser`), `MessageBridgeSender` (`@/inject/messageBridge`).

- [ ] **Step 1: Enable Max URL patterns**

In `inject/subtitleHandlers/hbomax.ts`, replace `getPatterns()` (line 28, currently returns `[]`):

```typescript
getPatterns(): SubtitleUrlPattern[] {
  return [
    { platform: 'hbomax', pattern: /\.vtt(?:\?|$)/i },
  ];
}
```

(The `.mpd` is captured via `getManifestPatterns()`, already present at line 33.)

- [ ] **Step 2: Implement the in-flight capture handler**

`inject/maxInFlightCapture.ts`:

```typescript
/**
 * In-flight (page-context) capture of HBO Max .vtt/.mpd responses.
 *
 * Replaces the PerformanceObserver re-fetch path (maxVttPerformanceCapture)
 * when Probe 2 confirms Max's subtitle fetches are observable to
 * FetchInterceptor/XhrInterceptor. Runs in the MAIN world with the page's
 * auth context — unlike the old broken background relay.
 */
import type { MessageBridgeSender } from '@/inject/messageBridge';
import { parseWebVTT } from '@/lib/subtitleParser';
import { buildSegmentOffsetMap } from '@/lib/dashSegmentOffsets';
import { applySegmentOffset } from '@/lib/applySegmentOffset';
import type { SubtitleCue } from '@/types/subtitle';
import type { SubtitleManifestCuesPayload } from '@/types/subtitle';

let segmentOffsetMap = new Map<string, number>();

/** Called when an intercepted .mpd body is available. */
export function onMpdBody(body: string, url: string): void {
  const built = buildSegmentOffsetMap(body, url);
  if (built.size > 0) segmentOffsetMap = built;
}

/** Called when an intercepted .vtt body is available. Emits translated-input cues. */
export function onVttBody(body: string, url: string, bridge: MessageBridgeSender): void {
  if (!body.trimStart().startsWith('WEBVTT')) return;
  const offsetMs = segmentOffsetMap.get(url) ?? 0;
  const cues = applySegmentOffset(
    parseWebVTT(body).map((c: SubtitleCue) => ({ startTime: c.startTime, endTime: c.endTime, text: c.text })),
    offsetMs,
  );
  if (cues.length === 0) return;
  bridge.send('SUBTITLE_MANIFEST_CUES', {
    cues,
    platform: 'hbomax',
    language: '',
    url,
    append: true,
  } as SubtitleManifestCuesPayload);
}

export function resetMaxInFlightCapture(): void {
  segmentOffsetMap = new Map();
}
```

- [ ] **Step 3: Wire the handler into the interceptors**

In `entrypoints/inject.content/index.ts`, after the interceptors are enabled (around line 64), import `onMpdBody`/`onVttBody` and register them on the `InterceptorRegistry`'s manifest/subtitle match callbacks. The existing `FetchInterceptor` already clones matching responses and posts `SUBTITLE_INTERCEPTED`; add a parallel non-blocking call that feeds the body into `onMpdBody` (manifest match) and `onVttBody` (subtitle match) before/alongside the existing bridge post.

(If the registry doesn't expose a body hook, add one: `InterceptorRegistry.onManifestBody(cb)` / `onSubtitleBody(cb)` — small additions to `inject/interceptorRegistry.ts` and `inject/fetchInterceptor.ts`/`xhrInterceptor.ts` mirroring the existing metadata-pass-through.)

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual E2E** — confirm in-flight capture matches Performance capture:
- Console logs show `.vtt`/`.mpd` intercepted.
- Cues appear at correct times (offsets applied).
- Seek + track switch still produce correct cues (the Probe 2 GO criterion).

- [ ] **Step 6: Commit**

```bash
git add inject/maxInFlightCapture.ts inject/subtitleHandlers/hbomax.ts entrypoints/inject.content/index.ts inject/interceptorRegistry.ts inject/fetchInterceptor.ts inject/xhrInterceptor.ts
git commit -m "feat(hbomax): in-flight capture of .vtt/.mpd via page-context interceptors"
```

---

## Task 10 (CONDITIONAL — only if Probe 2 = GO): Retire `PerformanceObserver` Capture

> **Skip if Task 9 was skipped.**

**Files:**
- Remove: `inject/maxVttPerformanceCapture.ts`, `inject/__tests__/maxVttPerformanceCapture.test.ts` (if exists)
- Modify: `entrypoints/inject.content/index.ts`, `content/subtitleCoordinator.ts`

**Purpose:** With Task 9 confirmed reliable across seeks + track switches (Probe 2 GO), the `PerformanceObserver` re-fetch layer is redundant complexity. Remove it (spec decision D4).

- [ ] **Step 1: Remove the bootstrap call**

In `entrypoints/inject.content/index.ts`, delete the block (lines ~158–168) that starts `maxVttPerformanceCapture` conditionally for `hbomax`. Remove the import.

- [ ] **Step 2: Remove `SUBTITLE_SEEK_RESET` handling specific to Performance capture**

In `content/subtitleCoordinator.ts`, find the `SUBTITLE_SEEK_RESET` handler (around line 934) that told the MAIN-world capture to clear its buffer. If `maxInFlightCapture` needs seek reset, route `resetMaxInFlightCapture()` there instead. If nothing needs it, remove the message type usage (keep the type in `types/subtitle.ts` to avoid a breaking change — just stop emitting/handling it).

- [ ] **Step 3: Remove grace-window interplay that existed only to bridge capture→DOM**

Audit `MAX_MPD_DOM_GRACE_MS` (line 73) and `MAX_MPD_IN_FLIGHT_CAP_MS` (line 75) and `hbomaxUsesMpdSubtitlePipeline()` (lines 78–85). If these existed solely to give `maxVttPerformanceCapture` time before the DOM fallback, and in-flight capture is synchronous, simplify: lower or remove the grace window. **Be conservative** — if unsure, leave them; they only add latency, not incorrectness.

- [ ] **Step 4: Delete the file**

```bash
rm -f inject/maxVttPerformanceCapture.ts
rm -f inject/__tests__/maxVttPerformanceCapture.test.ts
```

- [ ] **Step 5: Verify build + tests**

Run: `npx tsc --noEmit && npm test`
Expected: no errors, all tests pass.

- [ ] **Step 6: Manual E2E on Max** — full regression:
- Initial load, seek forward/backward, track switch, fullscreen, reload mid-title.
- Confirm no regression vs. the Performance capture path.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(hbomax): retire PerformanceObserver capture in favor of in-flight"
```

---

## Self-Review (completed by plan author)

**Spec coverage check:**
- Phase 0 probes → Task 1 ✓
- Phase 1 offset pipeline → Tasks 2–5 ✓ (`dashSegmentOffsets`, `applySegmentOffset`, capture wiring, heuristic removal)
- Phase 2 native TextTrack → Tasks 6–8 ✓ (interface+factory, native impl, coordinator dispatch)
- Phase 3 in-flight interception → Tasks 9–10 ✓ (conditional on Probe 2)
- D1 gating → Task 1 records decisions; Tasks 9–10 explicitly conditional ✓
- D2 two TextTracks → Task 7 ✓
- D3 overlay fallback → Task 6 `OverlayRenderer` + capability check ✓
- D4 retire on confirmation → Task 10 ✓
- Error handling (empty offset map, missing per-segment offset) → Task 4 falls back to offset 0 ✓
- Testing strategy (unit fixtures, mock-TextTrack, manual E2E) → Tasks 2/3/7 unit + Task 4/8/10 manual ✓

**Placeholder scan:** None. All code blocks are complete; probe decisions are recorded in a real file (Task 1 Step 4).

**Type consistency:** `buildSegmentOffsetMap(mpdBody, baseUrl): Map<string, number>` used identically in Tasks 2, 4, 9. `applySegmentOffset(cues, offsetMs): SubtitleCue[]` used identically in Tasks 3, 4, 9. `SubtitleRenderer`/`SubtitleDisplayConfig` defined in Task 6, consumed unchanged in Tasks 7, 8. `MpdSubtitleTrack.segmentOffsetsMs` added in Task 2, read in Task 2's `fillFromTrack`.
