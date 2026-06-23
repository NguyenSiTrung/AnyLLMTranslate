# Subtitle Reading-Speed & Timing Adaptation — Design

Date: 2026-06-23
Status: Approved (pending user spec review)
Roadmap: Sub-project 5a of the subtitle-quality pipeline (spec
`2026-06-23-subtitle-profiles-and-prompt-design.md`, "Roadmap context").

## Problem

This extension's subtitle overlay is **bilingual**: for every cue it shows the
original line on top and the translation below. That is ~2× the text of a native
subtitle. But the cue's `startTime`/`endTime` are inherited verbatim from the
source (a VTT timed for one line), so translations routinely vanish before the
viewer finishes reading them. Generic CPS standards (Netflix ~17 cps, EBU ~20)
assume one line; this tool is in a different regime and has no CPS / timing
logic at all today.

A second, separate problem is a correctness bug on the Max/HBO path
(`inject/domCueSource.ts`), the DOM-scraper that derives cue timing by sampling
`video.currentTime`:

- **Seek-collapse.** The `seeked` handler sets the open cue's
  `endTime = startTime` — a zero-duration cue that vanishes as if it never
  existed, even though it was just displayed.
- **Magic sentinel.** The currently-open cue uses `endTime = t + 86400` (one
  day) as a "still open" marker. A film longer than 24h would break it, and the
  bare `86400` is a footgun for future readers.

These two are correctness issues, not refinements. Any CPS/timing logic fed
those values produces garbage: a 0s cue has infinite CPS (triggers extension of
a glitch); an `86400s` cue has ~0 CPS (triggers nothing, text never closes).
**Garbage timing in → garbage adaptation out**, so the Max fix is a hard
prerequisite to the adaptation layer.

## Goal

Add a **reading-speed-driven timing adaptation** layer to translated bilingual
cues, and fix the two Max DOM timing bugs. Make cues readable in the time the
bilingual overlay needs, without desyncing audio or flickering. Do this purely
and incrementally so it benefits every supported site (YouTube, Udemy, Coursera,
Max).

Line-wrapping logic is **explicitly out of scope** (deferred to sub-project 5b,
which will reuse the CPS helper built here).

## Approach

The four bundled concerns (Max fix, CPS, timing extension, wrapping) are a
dependency stack, not peers:

```
4. Wrapping         ← visual polish              (5b — deferred)
3. CPS limit        ← the measurement/detector
2. Timing extension ← the actual user value
1. Max DOM fix      ← correct input timing       (prerequisite)
```

This sub-project (5a) ships layers 1–3. Wrapping (4) is a fast-follow that will
reuse layer 3's CPS helper, so deferring it costs no rework.

### The bilingual reading load (the through-line)

A readable duration must account for the viewer scanning the original **and**
studying the translation. The reading-time model takes the **max** of the two:

```
readTime = max( chars(original) / CPS_ORIG , chars(translation) / CPS_TRANS )
```

with `CPS_ORIG = 20` (native scan) and `CPS_TRANS = 12` (learner studying a
foreign line). A cue is "readable" when `endTime - startTime >= readTime +
margin` (`margin = 0.3s`).

### Duration policy — extend + cap (never shorten, never split)

```
finalEnd(i) = max( originalEnd(i),                           // floor: never shorten
                   min( originalStart(i) + MAX_EXT_ABS,       // absolute cap (+4s)
                        originalStart(i) * (1 + MAX_EXT_RATIO),  // ratio cap (+50%)
                        nextCueStart(i) - GAP ))              // don't overlap next cue
```

- **Never shorten** — original timing is a floor.
- **Cap** at both `+50%` (relative) and `+4s` (absolute), whichever is smaller,
  and never overlap the next cue (`GAP = 50ms`).
- **No split.** A capped cue that still can't be read stays hard — an honest
  failure, not worth the bilingual-pair flicker/desync that splitting would
  cause. In a bilingual overlay a single cue is already an original/translation
  pair; splitting either duplicates the pair (flicker) or severs it across two
  cues (breaks the feature and fights the chunk delta-merge logic in
  `subtitleCoordinator.ts:756`). Split is a clean future extension point if
  real data shows it's needed.
- **Last cue** (no next neighbor): capped by `+4s` / `+50%` only.

Why extend+cap over the alternatives:

- **Extend-only** is too timid: a dense educational cue (Udemy/Coursera) against
  fast lecture audio genuinely cannot be read in its source window; pure
  extend-only that hits an immediate next cue gives the user nothing.
- **Extend + cap + split** is the wrong default for a bilingual overlay: the
  complexity/flicker cost is large and the payoff (the rare cue still unreadable
  after a capped extension) is small. Professional tools (Subtitle Edit,
  Netflix timed-text guidelines) likewise extend-to-CPS, cap to next cue, and
  never auto-split.

### Max/HBO DOM timing fix — principled surgical

The scraper already derives timings from neighbor boundaries correctly (it
closes the previous cue at the next cue's start). The only broken derivations
are the two bugs. A full rework would rebuild logic that already works.

1. **Kill the seek-collapse.** Finalize the open cue at `video.currentTime` on
   seek, clamped so backward seeks don't produce negative duration:
   `endTime = max(currentTime, startTime + 0.1)`. A forward seek retains the
   cue's real pre-seek span; a backward seek vanishes the cue correctly (it
   should not linger after the user jumped back).
2. **Name the sentinel.** Replace the magic `86400` with an exported
   `OPEN_CUE_END_SENTINEL = Number.MAX_SAFE_INTEGER` and document that it marks
   only the single currently-open cue whose end is unknown.

The existing neighbor-derivation, the `MAX_CUES = 200` rolling window, and the
pause handler stay unchanged (pause handling is a tertiary concern, out of
scope).

## Components

### A. `lib/subtitleTiming.ts` — pure timing adaptation (new file)

Pure data and pure functions. No side effects, no I/O, no DOM.

```ts
// Reading-speed constants for the bilingual overlay.
export const CPS_ORIG = 20;        // chars/sec — native scan of the original line
export const CPS_TRANS = 12;       // chars/sec — learner studying the translation
export const READ_MARGIN_S = 0.3;  // breathing room beyond computed read time

// Extension caps.
export const MAX_EXT_RATIO = 0.5;  // never extend beyond +50% of (end - start)
export const MAX_EXT_ABS = 4;      // never extend beyond +4s absolute
export const NEXT_CUE_GAP_S = 0.05;// never overlap the next cue — leave 50ms

/**
 * Characters-per-second reading load the cue imposes on the viewer: the max of
 * the two texts' independent read rates. (A measure of the cue, independent of
 * its actual on-screen duration.)
 */
export function computeReadingSpeed(cue: { text: string; originalText?: string }): number;

/**
 * Minimum duration (seconds) a viewer needs to read this bilingual cue.
 * readTime = max(chars(orig)/CPS_ORIG, chars(trans)/CPS_TRANS) + margin.
 */
export function requiredReadDuration(cue: { text: string; originalText?: string }): number;

/**
 * Adapt the endTimes of a sorted, time-ordered cue array so each bilingual cue
 * is readable in its window, subject to the extend+cap policy.
 *
 * - Cues are never shortened (original endTime is a floor).
 * - Extensions are capped by +50% relative, +4s absolute, and (cue[i+1].start - GAP).
 * - The last cue has no neighbor cap.
 * - Pure, idempotent: safe to re-run on the merged array after each progressive chunk.
 *
 * @param cues  sorted by startTime; each carries text + originalText.
 * @returns new array; input is not mutated.
 */
export function adaptCueTimings<T extends { startTime: number; endTime: number; text: string; originalText?: string }>(
  cues: T[],
): T[];
```

The helper is generic over the cue shape so it works on `SubtitleCue` without
importing the type (keeps the module dependency-free and trivially testable).

### B. Max DOM fix — `inject/domCueSource.ts` (edit)

Two surgical edits inside `sampleCue` / `seekedHandler`:

- Replace the open-cue `endTime = t + 86400` assignment with
  `endTime = OPEN_CUE_END_SENTINEL` (exported constant).
- In `seekedHandler`, replace `openCue.endTime = openCue.startTime` with
  `openCue.endTime = Math.max(video.currentTime, openCue.startTime + 0.1)`, and
  document the intent (forward seek = honest span; backward seek = vanish).

### C. Coordinator wiring — `content/subtitleCoordinator.ts` (edit)

Run `adaptCueTimings` on the final bilingual cue array right before it reaches
the overlay, at the two points that already own the full sorted array:

1. **VTT delta-merge path** — `mergeTranslatedChunk(chunkStart, chunkCues)`:
   after splicing the translated chunk into `state.translatedCues` and before
   `updateCues`, call
   `state.translatedCues = adaptCueTimings(state.translatedCues)`.
2. **DOM rebuild path** — `rebuildTranslatedCues()`: after building
   `state.domTranslatedCues` from the translation map, call
   `state.domTranslatedCues = adaptCueTimings(state.domTranslatedCues)`.

Because adaptation is pure, idempotent, and only ever **extends** endTimes,
re-running it on the whole merged array after each progressive chunk is correct
and cheap (arithmetic over at most a few thousand cues). A cue currently on
screen that gets extended simply displays longer — no flicker, no desync.

The overlay (`content/subtitleOverlay.ts`) is **not edited**: it stays a dumb
renderer driven by `findActiveCue`, which already does the right thing with
extended endTimes (a cue with a later endTime stays the active match longer).

## Data flow

```
translated cues (original + translation, source timing, sorted)
       │
       └─ adaptCueTimings(cues)        ← pure, in coordinator, before updateCues
              │
              └─ cues with extended endTimes (capped, never shortened)
                     │
                     └─ overlay.findActiveCue(currentTime) → displays longer
```

Both the VTT path (YouTube/Udemy/Coursera — progressive chunks) and the DOM path
(Max/HBO — full rebuild per batch) funnel through the same `adaptCueTimings`
call, so all supported sites adapt uniformly.

The Max DOM scraper feeds correct input timing into this:

```
video.currentTime samples (inject/domCueSource.ts)
       │  (seek-collapse fixed; sentinel named)
       └─ cues with honest endTime
              │
              └─ translateChunk (background) → bilingual cues
                     │
                     └─ rebuildTranslatedCues → adaptCueTimings → overlay
```

## Scope boundaries (what this sub-project is NOT)

- ❌ No line-wrapping logic — CSS-only `max-width` wrapping stays. Wrapping is
  sub-project **5b**, which will reuse `computeReadingSpeed` from this module.
- ❌ No cue splitting.
- ❌ No user-facing UI / no new settings fields — constants are hardcoded and
  exported for easy future tuning. (Mirrors sub-project 1's discipline of
  shipping foundation with no UI; a tuning UI can ride the later knob-override
  surface, roadmap #4.)
- ❌ No cache-key changes (roadmap #6's job).
- ✅ Web-page translation path untouched.
- ✅ All subtitle sites benefit — adaptation runs on every path.

## Testing strategy

Grounded in the existing vitest setup.

1. **Unit — `lib/subtitleTiming.ts`** (new test file):
   - `computeReadingSpeed` returns max-based load for bilingual cues; handles
     `originalText` absence (translation-only cue).
   - `requiredReadDuration` includes the margin.
   - `adaptCueTimings`:
     - extends an over-fast cue to its required duration;
     - **never shortens** a cue whose original duration already suffices;
     - caps at `+50%` relative and `+4s` absolute (whichever binds);
     - caps at `nextCueStart - GAP` (no overlap);
     - last cue (no neighbor) is capped by absolute/ratio only;
     - is pure/idempotent (re-running is a no-op on already-adapted input; input
       not mutated).
2. **Unit — `inject/domCueSource.ts`** (extend existing test file):
   - forward seek finalizes the open cue at `currentTime` (non-zero duration);
   - backward seek produces a small/vanished cue (clamped), not a stale lingering
     cue;
   - open-cue endTime is `OPEN_CUE_END_SENTINEL`, not `86400`.
3. **Integration — coordinator** (extend `subtitleCoordinator.test.ts`):
   - VTT path: a bilingual cue whose translation is too long for its window
     reaches the overlay (`updateCues` / `state.translatedCues`) with an extended
     endTime.
   - DOM path: `rebuildTranslatedCues` output is adapted identically.
4. **Regression — web-page path**: the page translation path makes no call into
   the new module (asserted by the existing web-path tests staying green and the
   module being imported only by the coordinator).

## Files touched

| File | Change | New? |
|---|---|---|
| `lib/subtitleTiming.ts` | CPS/read-duration helpers, `adaptCueTimings`, timing constants | ✅ new |
| `lib/__tests__/subtitleTiming.test.ts` | CPS math, extend, cap-to-next, no-shorten, no-op-when-readable, idempotence | ✅ new |
| `inject/domCueSource.ts` | Seek-collapse fix; named `OPEN_CUE_END_SENTINEL` | edit |
| `content/subtitleCoordinator.ts` | Call `adaptCueTimings` in `mergeTranslatedChunk` + `rebuildTranslatedCues` before `updateCues` | edit |
| `inject/__tests__/domCueSource.test.ts` | Seek no longer collapses; sentinel named | edit |
| `content/__tests__/subtitleCoordinator.test.ts` | Adapted timings reach overlay on both paths | edit |

Net new production logic ≈ 80 lines (pure timing helper + two surgical DOM
fixes + two call sites).

## Success criteria

- A bilingual cue whose translation can't be read in its source window is
  extended (visible on YouTube / Udemy / Coursera / Max), capped so it never
  overlaps the next cue and never exceeds `+50%` / `+4s`.
- No cue is ever shortened.
- Max/HBO: seeking no longer erases the on-screen cue; backward seeks don't
  leave stale text; no `86400` magic number.
- Web-page translation byte-for-byte unaffected (regression guard green).
- Pure timing helper reused by a future wrapping sub-project (5b) without rework.

## Roadmap context

This is sub-project **5a** of the subtitle-quality pipeline. Siblings:
2. Context & continuity (merged).
3. Per-film proper-noun extraction (merged).
4. User-facing style override controls (merged).
**5a. Reading-speed & timing adaptation (this spec).**
5b. Line-wrapping (fast-follow — reuses `computeReadingSpeed`).
6. Context-aware cache & robustness.
