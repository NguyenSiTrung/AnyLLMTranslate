# HBO Max Subtitle — Capture & Rendering Redesign

**Date:** 2026-07-02
**Status:** Proposed
**Supersedes:** portions of `2026-06-19-hbomax-subtitle-design.md` (the capture/offset and rendering sections)

---

## Problem Statement

Users observe two of the worst failures a subtitle translator can have on HBO Max / Max.com (`play.max.com`):

1. **Timeline desync** — translated subtitles lag or lead the audio, drifting over time and jumping after a seek.
2. **Dropped cues** — some lines never get translated or shown; gaps in the subtitle stream.

Secondary concerns: the custom overlay re-implements fullscreen reparenting, `ResizeObserver`, and reposition timers (rendering fragility); the Max pipeline spans five capture tiers and feels over-engineered; adding a new streaming site requires a new TS handler class plus two register sites rather than a config edit.

### Root cause (identified, pending empirical confirmation)

The current Max capture path — `inject/maxVttPerformanceCapture.ts` — uses a `PerformanceObserver` to discover `.vtt` segment URLs and **re-fetches them out of band**, then parses each segment and takes `startTime`/`endTime` **as-is with no offset applied** (`maxVttPerformanceCapture.ts:221-225`):

```ts
const newCues = parseWebVTT(body).map((cue) => ({
  startTime: cue.startTime,   // taken verbatim — no segment offset applied
  endTime: cue.endTime,
  text: cue.text,
}));
```

Max serves subtitles as **segmented WebVTT over DASH** (confirmed via the open-source `read-frog` adapter). In the DASH segmented-WebVTT convention, cues inside each `.vtt` segment are **relative to the segment start** (they begin near 0); the authoritative presentation-time offset is the segment's `SegmentTimeline` entry `t ÷ timescale` from the `.mpd` manifest.

The current code discards that offset before it reaches the runtime capture path:

- `maxVttPerformanceCapture.captureSegment` applies no offset.
- `lib/vttSegmentConcat.ts` does attempt offsetting but reconstructs it with a **wrong heuristic** — "the end-time of the previous segment's last cue" (`vttSegmentConcat.ts:232, 241`), gated on a guess that a segment "restarts" if `cues[0].startTime < timeOffset` (`vttSegmentConcat.ts:212`). This is incorrect for DASH, where the offset is a manifest value, not a sequential accumulation.

**Result:** relative-timed cues from every segment collapse into the ~0–10s window regardless of their true position in a multi-hour title. The overlay's `findActiveCue(currentTime)` (binary search) finds no cue at e.g. 45:00 → **cues never appear (dropped)**; near playback start every segment's near-zero cues collide → **desync**. One architectural gap, both symptoms.

> **Caveat:** The architecture is confirmed offset-blind; whether Max's *specific* segments are relative or absolute is **Probe 1** of Phase 0 below. If they are absolute, the no-offset path is accidentally correct and Phase 1 shrinks to a verification stub. The DASH convention plus `read-frog`'s explicit offset handling make relative-times the strong expectation.

### Why "copy Immersive Translate" is not the fix

Immersive Translate's Max config carries the note `自托管会导致时间轴对应不上` ("self-hosting breaks timeline alignment") — they hit the *same* desync when swapping the translated VTT back into the player's XHR response. Their mitigation (`enableHookDownload:true`) is structurally the same out-of-band fetch + overlay we already use as our primary path. Adopting their architecture would not address the offset gap that produces both bugs.

---

## Scope

**In scope:**
- Thread DASH `SegmentTimeline` offsets through the capture pipeline (the confirmed root cause).
- Replace the custom overlay with native HTML5 `TextTrack` rendering, keeping the overlay as a capability-gated fallback.
- Re-attempt in-flight (page-context) interception of `.vtt`/`.mpd` for Max, and — **only if confirmed reliable** — retire the `PerformanceObserver` capture layer.

**Out of scope:**
- Migrating per-host config to a JSON rule file (Immersive-style `default_config.json`). This does not address any of the four confirmed concerns and trades away type safety for ~6 sites. Deferred indefinitely.
- Ambient/SDH filtering of non-translatable cues like `(sighs)`, `[music]`. A real but small, independent gap; track separately.
- Non-Max platforms. The renderer interface is additive and other platforms keep using the overlay unchanged.
- Background translation pipeline, caching, profiles, prompt building — zero changes.

---

## Locked Design Decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Verification gating | Phase 3 is conditional on Probe 2; Phase 1 shrinks if Probe 1 shows absolute times. The spec carries explicit go/no-go branches. |
| D2 | Bilingual rendering | **Two `TextTrack`s**, both `mode: 'showing'` — original (dim) + translation (bright). Browser stacks them; `::cue` styles each track independently. A single `\n`-joined cue cannot style the two lines differently. |
| D3 | Overlay fallback | Keep `subtitleOverlay.ts` as a degraded-mode fallback behind a capability check. Primary = native TextTrack; overlay only if `video.addTextTrack`/`VTTCue` unavailable or native render throws. |
| D4 | PerformanceObserver fate | If Probe 2 confirms in-flight interception works reliably (incl. seeks + track switches), **fully retire** `maxVttPerformanceCapture.ts`. Otherwise keep it (with the offset fix). |

---

## Architecture

```
Phase 0: VERIFY (probes)  ← gates everything below; ~1h investigation, not prod code
   │
   ├─ Probe 1: are .vtt segments segment-relative?         → determines if Phase 1 is needed
   ├─ Probe 2: are .vtt/.mpd observable to page-context   → determines Phase 3 + PerformanceObserver fate
   │           fetch/XHR patching (across seeks + switches)?
   └─ Probe 3: is <video>.textTracks populated by player? → adjusts Phase 2 details only
   │
Phase 1: OFFSET FIX (builds regardless of P2/P3, unless Probe 1 = absolute)
   Thread DASH SegmentTimeline t/timescale from MPD → apply at capture
   │
Phase 2: NATIVE TEXTTRACK RENDERING (builds regardless of P2)
   Replace custom overlay with synthetic video.addTextTrack + addCue(VTTCue)
   │
Phase 3: IN-FLIGHT INTERCEPTION (ONLY if Probe 2 confirms)
   Enable .vtt/.mpd patterns in HboMaxHandler.getPatterns(); retire maxVttPerformanceCapture
```

**Why gated:** commit `9a47da2` already cost us one cycle when a direct-interception pipeline ("MPD relay") broke. The worker-invisibility claim that justified `PerformanceObserver` may or may not still hold; `read-frog`'s success with direct interception suggests it might not. This is an empirical question, so Phase 3 is built only on confirmation. Phases 1 and 2 are independently valuable regardless of the answer.

---

## Phase 0 — Verification Probes

Three quick empirical checks, each with an explicit go/no-go. Investigation only — temporary console logging, not production code.

### Probe 1 — Segment timing mode *(gates Phase 1)*

- **Method:** On `play.max.com` mid-playback (not the first segment), capture a `.vtt` body from devtools Network and inspect the first cue's `startTime`.
- **Decision:**
  - Near `0` → **segment-relative** → Phase 1 builds the offset pipeline.
  - Near `video.currentTime` → **absolute** → Phase 1 becomes a verification-only stub (current no-offset path is accidentally correct).

### Probe 2 — In-flight observability *(gates Phase 3 + PerformanceObserver retirement)*

- **Method:** Temporarily log matching URLs in `FetchInterceptor`/`XhrInterceptor` on `play.max.com`. Load a title, seek several times, switch subtitle tracks.
- **Decision:**
  - **Go** (reliable across initial load **and** seeks **and** track switches) → Phase 3 builds; PerformanceObserver retired on confirmation.
  - **Partial** (initial load only, misses seeks) → Phase 3 dropped; keep PerformanceObserver with offset fix.
  - **No-go** (never observed) → Phase 3 dropped; keep PerformanceObserver with offset fix.
- **Honest expectation:** our git history says these were not observable; `read-frog` suggests they might be now. Treat as genuinely unknown.

### Probe 3 — Native `textTracks` population *(adjusts Phase 2 details)*

- **Method:** Page console — `[...document.querySelector('video').textTracks].map(t => ({kind, mode, cues: t.cues?.length}))`.
- **Impact:** If Max already populates a track with cues, Phase 2 must avoid clobbering it (read from it as an additional capture source; namespace synthetic tracks distinctly). If empty (expected), proceed with synthetic tracks.
- Does not gate a phase.

### Probe outputs

Recorded in the implementation plan as a checkpoint with three decisions before Phase 1 begins. If a probe result invalidates a phase, the plan branch is pruned at that point.

---

## Phase 1 — DASH Segment Offset Pipeline

**Goal:** the authoritative per-segment presentation-time offset is parsed from the `.mpd` and applied to every cue at capture time.

### New pure module: `lib/dashSegmentOffsets.ts`

```ts
/**
 * Given an MPD body + base URL, enumerate segment URLs and map each to its
 * DASH presentation-time offset (SegmentTimeline t ÷ timescale, in ms).
 */
export interface SegmentOffset {
  segmentUrl: string;
  presentationTimeOffsetMs: number;
}
export function buildSegmentOffsetMap(
  mpdBody: string,
  baseUrl: string
): Map<string, number>;
```

- Reuses the SegmentTemplate/SegmentTimeline parsing already in `lib/maxMpdSubtitles.ts` (`extractSubtitleTracks` / segment-template URL builder). **Extract to a shared helper if needed rather than duplicating the parser.**
- Handles: `$Number$` template expansion, BaseURL resolution, missing `t` (default 0), query-param preservation (interacts with `mergeManifestQueryParams`).

### New pure module: `lib/applySegmentOffset.ts`

```ts
export function applySegmentOffset(
  cues: SubtitleCue[],
  offsetMs: number
): SubtitleCue[];
```

Tiny but explicitly named and tested — the operation the current `captureSegment` skips entirely.

### Change: `inject/maxVttPerformanceCapture.ts`

- When a `.mpd` resource entry is observed, fetch the body, call `buildSegmentOffsetMap`, cache the result keyed by track id (extracted via the existing `/\/t\/[^/]+\/(t\d+)\//i` regex, `maxVttPerformanceCapture.ts:297`).
- In `captureSegment`, look up `offsetMap.get(url)` and call `applySegmentOffset` before `mergeCues`. (Today it applies nothing.)
- Fall back to current behavior (no offset) if no MPD was seen or the URL is not in the map — one misaligned segment is preferable to dropping the track.

### Change: `lib/vttSegmentConcat.ts`

The cue-end-time offset heuristic (`vttSegmentConcat.ts:208-242`) is **removed**. If this function is still called anywhere after Phase 1, it concatenates cues whose offsets have already been applied upstream — it must not re-offset. (Audit call sites; if unused after Phase 1, delete it.)

### Data flow (Phase 1)

```
.mpd observed (Performance) → fetch body → buildSegmentOffsetMap → offsetMap (cached, keyed by trackId)
.vtt observed (Performance) → fetch body → parseWebVTT → segment-relative cues
                           → applySegmentOffset(cues, offsetMap.get(url)) → ABSOLUTE cues  ← THE FIX
                           → mergeCues → SUBTITLE_MANIFEST_CUES(append)
```

---

## Phase 2 — Native TextTrack Rendering

**Goal:** the browser renders captions itself — perfect fullscreen, perfect timing, no positioning/reparenting code.

### New interface: `content/subtitleRenderer.ts`

```ts
export interface SubtitleDisplayConfig {
  displayMode: 'bilingual' | 'translation-only';
  fontSizeMode: 'auto' | 'fixed';
  // mirrors the existing overlay config shape
}

export interface SubtitleRenderer {
  initialize(
    cues: SubtitleCue[],
    config: SubtitleDisplayConfig,
    video: HTMLVideoElement
  ): Promise<void>;
  updateCues(cues: SubtitleCue[]): void;   // translation deltas land here
  destroy(): void;
}

/** Native TextTrack if available, else overlay fallback (D3). */
export function createRenderer(video: HTMLVideoElement): SubtitleRenderer;
```

### New implementation: `content/nativeTrackRenderer.ts` (primary)

- Creates **two** synthetic tracks: `video.addTextTrack('subtitles', 'Original', sourceLang)` and `('Translation', targetLang)`, both `mode: 'showing'` (D2).
- Maintains a `Map<cueKey, VTTCue>` per track (key = `startTime|endTime|originalText`).
- On `updateCues`: add new cues, update changed cues (remove + re-add — `VTTCue` is immutable on timing), leave stable cues untouched (**deltas only**, mirroring the existing overlay's `updateCues` semantics).
- Styling via injected `::cue` CSS scoped per track. Track identity established by track `label`/`language` + creation order. See Error Handling for the degradation path.
- **Eliminates** the `timeupdate` → `findActiveCue` → `updateDisplayedText` loop entirely — the browser tracks active cues by timestamp. Removes ~150 lines of manual timing/positioning logic and a whole class of bugs.

### Demote: `content/subtitleOverlay.ts` (fallback, D3)

- Unchanged internally. Now instantiated only by `createRenderer` when `video.addTextTrack` or `VTTCue` is absent, or when `nativeTrackRenderer.initialize` throws.

### Change: `content/subtitleCoordinator.ts`

- Replace the direct `initializeOverlay`/overlay construction call with `createRenderer(video)`.
- Source ranking, translate requests, caching, the MPD-in-flight grace windows (`MAX_MPD_DOM_GRACE_MS`, `MAX_MPD_IN_FLIGHT_CAP_MS`) — **untouched**.
- `hideNativeCaptions` / `restoreNativeCaptions` — unchanged (native caption *window* hiding still applies; our synthetic tracks are separate).

### Probe 3 interaction

If Probe 3 shows Max populates its own `textTracks`, Phase 2 must (a) not destroy or hide them, (b) possibly read cues from them as an additional capture source. Synthetic tracks use distinct labels to avoid collision. Adjusted in implementation, not a design change.

---

## Phase 3 — In-Flight Interception (conditional on Probe 2)

**Goal:** capture `.vtt`/`.mpd` in-flight via the existing MAIN-world interceptors; retire `PerformanceObserver` re-fetch.

### New module: `inject/maxInFlightCapture.ts` (only if Probe 2 = Go)

- Hooks the existing `FetchInterceptor`/`XhrInterceptor` for Max `.mpd` + `.vtt`. Enabled by changing `HboMaxHandler.getPatterns()` to return real patterns instead of `[]` (`inject/subtitleHandlers/hbomax.ts:28`).
- `.mpd` response → clone body → `buildSegmentOffsetMap`.
- `.vtt` response → clone body → `parseWebVTT` → `applySegmentOffset` → emit `SUBTITLE_MANIFEST_CUES` (append mode, same payload shape as today).

### Change: `inject/subtitleHandlers/hbomax.ts`

- `getPatterns()` returns Max `.vtt` and `.mpd` URL patterns (previously `[]`).

### Retirement: `inject/maxVttPerformanceCapture.ts` (D4)

On confirmation that interception is reliable across seeks and track switches:
- Delete `inject/maxVttPerformanceCapture.ts`.
- Remove its bootstrap in `entrypoints/inject.content/index.ts:158-168`.
- Remove `SUBTITLE_SEEK_RESET` handling specific to it (or keep if shared).
- Remove `MAX_VTT_CAPTURE_DEADLINE_MS` and the MPD/VTT grace window interplay in `subtitleCoordinator.ts` that existed *only* to bridge capture→DOM fallback.

If interception proves unreliable on seeks, **keep** `maxVttPerformanceCapture.ts` with the Phase 1 offset fix and drop Phase 3.

---

## Component Summary

| Unit | Status | Purpose | Deps |
|---|---|---|---|
| `lib/dashSegmentOffsets.ts` | new (pure) | MPD → segmentUrl→offsetMs map | `maxMpdSubtitles.ts` parser |
| `lib/applySegmentOffset.ts` | new (pure) | offset application | `types/subtitle.ts` |
| `content/subtitleRenderer.ts` | new | renderer interface + factory | both renderers |
| `content/nativeTrackRenderer.ts` | new | native TextTrack rendering | `subtitleRenderer.ts` |
| `content/subtitleOverlay.ts` | existing, demoted | fallback renderer | `subtitleRenderer.ts` |
| `content/subtitleCoordinator.ts` | changed | render dispatch swap | `subtitleRenderer.ts` |
| `inject/maxVttPerformanceCapture.ts` | changed (P1) / deleted (P3) | offset application or retirement | `dashSegmentOffsets.ts`, `applySegmentOffset.ts` |
| `inject/maxInFlightCapture.ts` | new, conditional (P3) | in-flight capture | `dashSegmentOffsets.ts`, interceptors |
| `inject/subtitleHandlers/hbomax.ts` | changed (P3) | enable URL patterns | registry |
| `lib/vttSegmentConcat.ts` | removed/audit (P1) | obsolete offset heuristic | — |

---

## Error Handling & Fallbacks

| Failure | Behavior |
|---|---|
| No `.mpd` observed → offset map empty | Apply no offset (current behavior); log warning. If Probe 1 = relative, this case means degraded sync — acceptable, not a crash. |
| `offsetMap.get(url)` missing for a segment | Offset that segment by 0; do not block others. One misaligned segment beats dropping the whole track. |
| `video.addTextTrack` / `VTTCue` unavailable | `createRenderer` returns `OverlayRenderer` (D3). |
| Native track rendering throws at runtime | `nativeTrackRenderer.initialize` catches, tears down, falls back to overlay. |
| `::cue` cannot style two tracks distinctly | Degrade: translation track styled, original track unstyled or hidden (translation-only). Log. |
| Phase 3 interception misses segments on seeks | Caught by Probe 2 reliability check *before* building. If it slips through post-release, keep PerformanceObserver as hidden fallback for that release, then retire once confirmed. |
| Probe 3 reveals Max populates its own tracks | Synthetic tracks use distinct labels; do not destroy/hide Max's tracks. |

---

## Testing Strategy

### Unit (pure logic)

- **`dashSegmentOffsets.test.ts`** — real MPD fixtures: a Max-style `AdaptationSet` (`contentType="text"`, `mimeType="text/vtt"`) with `SegmentTemplate` + `SegmentTimeline` + `$Number$` template, multi-segment, with `t`/`timescale`. Assert correct URL enumeration, correct offset math (`t ÷ timescale`), BaseURL resolution, missing-`t` defaulting to 0, query-param preservation.
- **`applySegmentOffset.test.ts`** — offset application; negative offsets; zero offset; empty cues; idempotency.
- **`nativeTrackRenderer.test.ts`** — using the mock-TextTrack pattern from `lib/__tests__/textTrackCues.test.ts`. Assert: two tracks created, both `showing`, correct `kind`/`label`/`language`; cue add on new, remove+re-add on changed, stable untouched (deltas only); `destroy` removes all cues and tracks.
- **`createRenderer.test.ts`** — capability check returns correct implementation; falls back to overlay when `addTextTrack` absent or when native `initialize` throws.

### Integration

- Extend `content/__tests__/subtitleCoordinator.test.ts` — render dispatch picks native vs overlay per capability; offset-applied cues flow through the (unchanged) translate pipeline; delta merge unchanged.

### Manual E2E (Max, the real bug verification)

- Initial load → first cue appears at correct time.
- Seek forward 10 min → cue at new position correct (the current desync scenario).
- Seek backward → correct.
- Switch subtitle language → new track locks, old clears.
- Fullscreen enter/exit → captions render natively (no reparenting needed).
- 20+ min continuous playback → no cumulative drift (the offset-accumulation bug).
- Reload mid-title → resumes correctly.
- Capability-disabled environment → overlay fallback renders correctly.

### Regression

Existing subtitle tests (YouTube, Udemy, Coursera, LinkedIn, Youku) untouched — the renderer interface is additive; non-Max paths keep using the overlay.

---

## Risks

1. **Probe outcomes invalidate phases.** Mitigated by the explicit gating; phases are independently valuable, so pruning any one still leaves a working improvement.
2. **Native TextTrack rendering gaps in target browsers.** Mitigated by the capability-gated overlay fallback (D3); never a "no subtitles at all" regression.
3. **`::cue` cross-browser styling inconsistency.** Mitigated by degradation to translation-only (see Error Handling).
4. **Re-introducing the worker-invisibility failure** (commit `9a47da2`) if Phase 3 is attempted without Probe 2 confirmation. Mitigated by D1 gating — Phase 3 builds only on Go.
5. **Parser duplication** between `dashSegmentOffsets.ts` and `maxMpdSubtitles.ts`. Mitigated by extracting the SegmentTemplate/SegmentTimeline walker to a shared helper.

---

## Open Questions (resolved during Phase 0, recorded for the plan)

- Exact Probe 1 result (relative vs absolute) — determines Phase 1 build vs stub.
- Exact Probe 2 reliability profile — determines Phase 3 build + retirement.
- Whether Max populates native `textTracks` (Probe 3) — adjusts Phase 2 collision handling.
- Whether `lib/vttSegmentConcat.ts` has any remaining call sites after Phase 1 — determines delete vs audit.
