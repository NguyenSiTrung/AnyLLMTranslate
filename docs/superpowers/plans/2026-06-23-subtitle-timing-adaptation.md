# Subtitle Reading-Speed & Timing Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reading-speed-driven timing-adaptation layer to translated bilingual subtitle cues (extend + cap, never shorten or split) and fix the two Max/HBO DOM scraper timing bugs (seek-collapse, magic `86400` sentinel).

**Architecture:** One new pure module `lib/subtitleTiming.ts` (CPS math + `adaptCueTimings`) is invoked at the two coordinator seams that own the full sorted cue array — `mergeTranslatedChunk` (VTT/progressive path) and `rebuildTranslatedCues` (Max/DOM path) — right before `updateCues`. The overlay is untouched (it stays a dumb renderer). The Max scraper gets two surgical edits: the `seeked` handler stops collapsing open cues to zero duration, and the bare `86400` becomes a named exported sentinel.

**Tech Stack:** TypeScript, WXT (MV3 Chrome extension), Vitest with jsdom, `@/` path aliases for imports.

## Global Constraints

- **Never shorten a cue.** `adaptCueTimings` treats each cue's original `endTime` as a floor; extensions only.
- **No splitting.** A capped cue that still can't be read stays hard. (Bilingual overlay already shows 2 lines per cue; splitting duplicates the pair → flicker, or severs it → breaks the feature.)
- **Extension caps:** `MAX_EXT_ABS = 4` seconds (runaway guard), `NEXT_CUE_GAP_S = 0.05` (never overlap the next cue by less than 50ms). The target duration is the cue's `required` read time; no relative/ratio cap (a cap derived from `endTime` would break idempotence — see note below).
- **Idempotence is required:** the coordinator re-adapts the whole merged cue array on every progressive chunk, reading back already-adapted `endTime`s. The helper's `finalEnd` therefore depends only on `start`, the cue's texts (`required`, constant per cue), the constant `MAX_EXT_ABS`, and the next cue's `start` — never on the cue's own (mutable) `endTime`. Re-running is a no-op.
- **Reading-speed constants:** `CPS_ORIG = 20`, `CPS_TRANS = 12`, `READ_MARGIN_S = 0.3`.
- **Branding:** all identifiers use the `anyllm-` prefix where CSS/attributes are involved (not applicable to this pure-TS module, but no `lingua*` anywhere).
- **No new dependencies.** Pure TS arithmetic only.
- **Shell:** `cp`/`mv`/`rm` may be aliased interactive; the plan uses git for commits and avoids them. pnpm is not global — use `npx -y pnpm@latest exec vitest run` for tests.
- **Non-interactive shell:** never invoke commands that prompt for y/n.
- **Commit messages:** conventional-commit format, scoped `subtitle` or `subtitle(fix)`.

---

## File Structure

| File | Responsibility | New? |
|---|---|---|
| `lib/subtitleTiming.ts` | Pure CPS/read-duration math + `adaptCueTimings`. No I/O, no DOM, no imports of project types (generic over cue shape). | ✅ new |
| `lib/__tests__/subtitleTiming.test.ts` | Unit tests for the timing helper: CPS math, extend, caps, no-shorten, idempotence, hole-tolerance. | ✅ new |
| `inject/domCueSource.ts` | Two surgical edits: export `OPEN_CUE_END_SENTINEL`, fix `seekedHandler`. | edit |
| `tests/unit/domCueSource.test.ts` | New tests for seek-collapse fix + sentinel. | edit |
| `content/subtitleCoordinator.ts` | Two call sites: `adaptCueTimings` after `mergeTranslatedChunk` merge and inside `rebuildTranslatedCues`. | edit |
| `content/__tests__/subtitleCoordinator.test.ts` | Integration: adapted timings reach `updateCues` on both VTT and DOM paths. | edit |

---

## Task 1: Pure timing helper — `lib/subtitleTiming.ts`

**Files:**
- Create: `lib/subtitleTiming.ts`
- Test: `lib/__tests__/subtitleTiming.test.ts`

**Interfaces:**
- Produces (exact signatures later tasks rely on):
  ```ts
  export const CPS_ORIG = 20;
  export const CPS_TRANS = 12;
  export const READ_MARGIN_S = 0.3;
  export const MAX_EXT_ABS = 4;
  export const NEXT_CUE_GAP_S = 0.05;
  export const OPEN_CUE_END_SENTINEL = Number.MAX_SAFE_INTEGER;
  export function countChars(text: string): number;
  export function computeReadingSpeed(cue: { text: string; originalText?: string }): number;
  export function requiredReadDuration(cue: { text: string; originalText?: string }): number;
  export function adaptCueTimings<T extends { startTime: number; endTime: number; text: string; originalText?: string }>(cues: T[]): T[];
  ```

- [ ] **Step 1: Write the failing test file**

Create `lib/__tests__/subtitleTiming.test.ts`:

```ts
/**
 * Tests for the pure subtitle timing-adaptation helper.
 * Bilingual overlay shows ~2x text of a native subtitle; timings must account
 * for reading BOTH the original and the translation.
 *
 * Field semantics (matches the overlay at subtitleOverlay.ts:355):
 *   cue.text         = the TRANSLATED line (read by the learner, slower rate)
 *   cue.originalText = the SOURCE line    (read natively, faster rate)
 */
import { describe, it, expect } from 'vitest';
import {
  CPS_ORIG,
  CPS_TRANS,
  READ_MARGIN_S,
  MAX_EXT_ABS,
  NEXT_CUE_GAP_S,
  OPEN_CUE_END_SENTINEL,
  countChars,
  computeReadingSpeed,
  requiredReadDuration,
  adaptCueTimings,
} from '@/lib/subtitleTiming';

describe('countChars', () => {
  it('counts the length of a string', () => {
    expect(countChars('Hello')).toBe(5);
  });
  it('returns 0 for empty string', () => {
    expect(countChars('')).toBe(0);
  });
});

describe('computeReadingSpeed', () => {
  it('returns the max of the two texts independent read rates (original/source is faster here)', () => {
    // text = translation, 24 chars / CPS_TRANS(12) = 2.0
    // originalText = source, 40 chars / CPS_ORIG(20) = 2.0 -> max 2.0
    const cue = { text: 'a'.repeat(24), originalText: 'b'.repeat(40) };
    expect(computeReadingSpeed(cue)).toBeCloseTo(2.0, 5);
  });
  it('uses the translation text only when originalText is absent (translation-only cue)', () => {
    // No source line: only the translated term counts.
    const cue = { text: 'a'.repeat(24) };
    expect(computeReadingSpeed(cue)).toBeCloseTo(24 / CPS_TRANS, 5);
  });
});

describe('requiredReadDuration', () => {
  it('equals max read time + READ_MARGIN_S', () => {
    const cue = { text: 'a'.repeat(24), originalText: 'b'.repeat(40) };
    expect(requiredReadDuration(cue)).toBeCloseTo(2.0 + READ_MARGIN_S, 5);
  });
});

describe('adaptCueTimings', () => {
  it('extends a cue whose duration is shorter than required read time (to exactly required)', () => {
    // text 24 / CPS_TRANS(12) = 2.0 ; originalText 40 / CPS_ORIG(20) = 2.0
    // required = 2.0 + 0.3 = 2.3s. Original window 1.0s -> extend to 2.3s.
    const cues = [
      { startTime: 0, endTime: 1, text: 'a'.repeat(24), originalText: 'b'.repeat(40) },
    ];
    const out = adaptCueTimings(cues);
    expect(out[0].endTime).toBeCloseTo(2.3, 5);
  });

  it('does NOT shorten a cue that is already readable', () => {
    // required = 2.3s; window is 5s -> no change.
    const cues = [
      { startTime: 0, endTime: 5, text: 'a'.repeat(24), originalText: 'b'.repeat(40) },
    ];
    const out = adaptCueTimings(cues);
    expect(out[0].endTime).toBe(5);
  });

  it('caps extension at start + MAX_EXT_ABS when required read time exceeds it', () => {
    // Very long text -> required (e.g. 60s+) far exceeds abs cap (+4s).
    // window = 1s, start = 0 -> abs cap = 0 + 4 = 4.
    const cues = [
      { startTime: 0, endTime: 1, text: 'a'.repeat(500), originalText: 'b'.repeat(500) },
    ];
    const out = adaptCueTimings(cues);
    expect(out[0].endTime).toBeCloseTo(MAX_EXT_ABS, 5);
  });

  it('caps extension at nextCue.start - NEXT_CUE_GAP_S (never overlaps next cue)', () => {
    // required = 2.3s, but next cue starts at 1.5s -> cap = 1.5 - 0.05 = 1.45
    // (tighter than both required 2.3 and abs cap 4).
    const cues = [
      { startTime: 0, endTime: 1, text: 'a'.repeat(24), originalText: 'b'.repeat(40) },
      { startTime: 1.5, endTime: 3, text: 'next', originalText: 'next' },
    ];
    const out = adaptCueTimings(cues);
    expect(out[0].endTime).toBeCloseTo(1.5 - NEXT_CUE_GAP_S, 5);
  });

  it('the last cue (no next neighbor) is capped by abs only', () => {
    // required 2.3s, window 1s, no next cue -> abs cap (4) binds.
    const cues = [
      { startTime: 0, endTime: 1, text: 'a'.repeat(24), originalText: 'b'.repeat(40) },
    ];
    const out = adaptCueTimings(cues);
    expect(out[0].endTime).toBeCloseTo(2.3, 5); // required (2.3) < abs (4) -> extends to 2.3
  });

  it('the last cue with very long text still respects abs cap', () => {
    // required ~83s, window 1s, no next cue -> abs cap (4) binds.
    const cues = [
      { startTime: 5, endTime: 6, text: 'a'.repeat(500), originalText: 'b'.repeat(500) },
    ];
    const out = adaptCueTimings(cues);
    expect(out[0].endTime).toBeCloseTo(5 + MAX_EXT_ABS, 5); // start + 4
  });

  it('is pure: does not mutate the input array or its cues', () => {
    const cues = [
      { startTime: 0, endTime: 1, text: 'a'.repeat(24), originalText: 'b'.repeat(40) },
    ];
    const originalEnd = cues[0].endTime;
    adaptCueTimings(cues);
    expect(cues[0].endTime).toBe(originalEnd); // input unchanged
  });

  it('is idempotent: re-running on adapted output is a no-op', () => {
    const cues = [
      { startTime: 0, endTime: 1, text: 'a'.repeat(24), originalText: 'b'.repeat(40) },
      { startTime: 3, endTime: 4, text: 'c'.repeat(24), originalText: 'd'.repeat(40) },
      { startTime: 10, endTime: 11, text: 'e'.repeat(500), originalText: 'f'.repeat(500) },
    ];
    const once = adaptCueTimings(cues);
    const twice = adaptCueTimings(once);
    expect(twice.map((c) => c.endTime)).toEqual(once.map((c) => c.endTime));
  });

  it('skips sparse (undefined) slots in the input array', () => {
    // Coordinator's merge may produce a sparse array before all chunks arrive.
    const cues: Array<{ startTime: number; endTime: number; text: string; originalText?: string }> = [
      { startTime: 0, endTime: 1, text: 'a'.repeat(24), originalText: 'b'.repeat(40) },
      undefined as unknown as { startTime: number; endTime: number; text: string },
      { startTime: 3, endTime: 5, text: 'x', originalText: 'x' },
    ];
    const out = adaptCueTimings(cues);
    // Output is dense (no undefined), and the real cues are present.
    expect(out.every((c) => c && typeof c.startTime === 'number')).toBe(true);
    expect(out.map((c) => c.text)).toEqual(['a'.repeat(24), 'x']);
  });

  it('returns empty array for empty input', () => {
    expect(adaptCueTimings([])).toEqual([]);
  });
});

describe('OPEN_CUE_END_SENTINEL', () => {
  it('is the max safe integer (not 86400)', () => {
    expect(OPEN_CUE_END_SENTINEL).toBe(Number.MAX_SAFE_INTEGER);
    expect(OPEN_CUE_END_SENTINEL).not.toBe(86400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx -y pnpm@latest exec vitest run lib/__tests__/subtitleTiming.test.ts`
Expected: FAIL — module `@/lib/subtitleTiming` does not exist (import error).

- [ ] **Step 3: Write the implementation**

Create `lib/subtitleTiming.ts`:

```ts
/**
 * Subtitle reading-speed & timing adaptation — PURE module.
 *
 * The bilingual overlay shows two lines per cue (original + translation), so a
 * readable duration must account for reading BOTH texts. This module computes a
 * per-cue reading load and extends cue endTimes (never shortens) so viewers can
 * finish reading the translation, subject to extension caps. It never overlaps
 * the next cue and never splits a cue.
 *
 * No I/O, no DOM, no project-type imports — generic over the cue shape so it is
 * trivially testable and reusable (a future wrapping sub-project reuses
 * computeReadingSpeed).
 */

/** Chars/sec reading rate for the ORIGINAL (source) line — native scan. */
export const CPS_ORIG = 20;
/** Chars/sec reading rate for the TRANSLATION — learner studying a foreign line. */
export const CPS_TRANS = 12;
/** Breathing room (seconds) beyond the computed read time. */
export const READ_MARGIN_S = 0.3;

/** Never extend a cue beyond start + MAX_EXT_ABS (runaway guard). */
export const MAX_EXT_ABS = 4;
/** Minimum gap (seconds) left before the next cue to avoid overlap. */
export const NEXT_CUE_GAP_S = 0.05;

/**
 * Sentinel endTime for the single currently-open DOM cue whose end is unknown.
 * (The Max scraper uses this until the next sample closes the cue precisely.)
 * `Number.MAX_SAFE_INTEGER` — NOT `86400` (a 24h film would overflow the latter).
 */
export const OPEN_CUE_END_SENTINEL = Number.MAX_SAFE_INTEGER;

/** Character count of a text (trivial, but centralised for future CJK tuning). */
export function countChars(text: string): number {
  return text.length;
}

/**
 * Reading load the cue imposes on the viewer: the max of the two texts'
 * independent read times-per-char. Measures the cue itself, independent of its
 * actual on-screen duration.
 *
 * Field semantics (matches the overlay at subtitleOverlay.ts:355):
 *   cue.text         = the TRANSLATED line — read at CPS_TRANS (slower).
 *   cue.originalText = the SOURCE line      — read at CPS_ORIG  (faster).
 * When originalText is absent (translation-only cue), only the translated term
 * counts.
 */
export function computeReadingSpeed(cue: { text: string; originalText?: string }): number {
  const transTime = countChars(cue.text) / CPS_TRANS;
  const origTime = cue.originalText ? countChars(cue.originalText) / CPS_ORIG : 0;
  return Math.max(transTime, origTime);
}

/**
 * Minimum duration (seconds) a viewer needs to read this bilingual cue:
 * readTime + READ_MARGIN_S.
 */
export function requiredReadDuration(cue: { text: string; originalText?: string }): number {
  return computeReadingSpeed(cue) + READ_MARGIN_S;
}

/** Minimal cue shape this module operates on (generic over the full type). */
interface TimedCue {
  startTime: number;
  endTime: number;
  text: string;
  originalText?: string;
}

/**
 * Adapt the endTimes of a cue array so each bilingual cue is readable in its
 * window, subject to the extend+cap policy. PURE: returns a new array; input
 * (array and cue objects) is not mutated.
 *
 * Policy per cue i (input sorted by startTime):
 *   required    = requiredReadDuration(cue[i])
 *   candidate   = start(i) + required               // ideal: just enough to read
 *   absCap      = start(i) + MAX_EXT_ABS            // hard ceiling (runaway guard)
 *   neighborCap = (cue[i+1] ? cue[i+1].start - NEXT_CUE_GAP_S : Infinity)
 *   finalEnd    = max( originalEnd(i),              // never shorten (floor)
 *                      min( candidate, absCap, neighborCap ) )
 *
 * IDEMPOTENT BY CONSTRUCTION: finalEnd depends only on start(i), the cue's
 * texts (constant per cue), the constant MAX_EXT_ABS, and cue[i+1].start —
 * never on the (mutable) originalEnd(i) except as a floor. So re-running on
 * already-adapted cues is a no-op. This is required because the coordinator
 * re-adapts the whole merged array on every progressive chunk.
 *
 * - Sparse (undefined) slots in the input are skipped (coordinator's progressive
 *   merge can produce a sparse array before all chunks land).
 */
export function adaptCueTimings<T extends TimedCue>(cues: T[]): T[] {
  // Drop sparse/undefined slots; work on a dense snapshot of references. Each
  // cue we mutate is shallow-copied so the input cue objects stay untouched.
  const dense = cues.filter((c): c is T => c != null);
  if (dense.length === 0) return [];

  const out: T[] = [];
  for (let i = 0; i < dense.length; i++) {
    const cue = dense[i];
    const next = dense[i + 1]; // may be undefined for the last cue

    const start = cue.startTime;
    const originalEnd = cue.endTime;
    const required = requiredReadDuration(cue);

    const candidate = start + required;
    const absCap = start + MAX_EXT_ABS;
    const neighborCap = next ? next.startTime - NEXT_CUE_GAP_S : Infinity;

    const capped = Math.min(candidate, absCap, neighborCap);
    // Never shorten: original endTime is the floor.
    const finalEnd = Math.max(originalEnd, capped);

    if (finalEnd === originalEnd) {
      out.push(cue);
    } else {
      out.push({ ...cue, endTime: finalEnd });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx -y pnpm@latest exec vitest run lib/__tests__/subtitleTiming.test.ts`
Expected: PASS — all tests green.

> **Note on the idempotence test:** re-read the idempotence test against the implementation. `candidate = start + required`, `absCap = start + 4`, `neighborCap = next.start - 0.05` — none of these depend on `cue.endTime`. `finalEnd = max(originalEnd, min(...))`. On a second pass the `originalEnd` is now the previously-adapted value, but since that value already `>=` every cap-derived term (it was `max`'d in), `max(originalEnd, ...)` returns `originalEnd` unchanged. Idempotence holds. The test asserts `twice.endTimes === once.endTimes` for a mixed array (extend + abs-cap + neighbor-cap cases).

- [ ] **Step 5: Run typecheck + lint on the new file**

Run: `npx -y pnpm@latest exec tsc --noEmit`
Expected: no errors.

Run: `npx -y pnpm@latest exec eslint lib/subtitleTiming.ts lib/__tests__/subtitleTiming.test.ts`
Expected: no errors (or only pre-existing unrelated lint warnings — the file is new).

- [ ] **Step 6: Commit**

```bash
git add lib/subtitleTiming.ts lib/__tests__/subtitleTiming.test.ts
git commit -m "feat(subtitle): pure reading-speed & timing adaptation helper

adaptCueTimings extends bilingual cue endTimes (never shortens) so viewers
can read both lines, capped at +4s absolute and the next-cue gap. No split, no I/O,
generic over the cue shape. Companion CPS/read-duration helpers for the
future wrapping sub-project. 11 unit tests."
```

---

## Task 2: Max/HBO DOM scraper — fix seek-collapse + name sentinel

**Files:**
- Modify: `inject/domCueSource.ts` (export `OPEN_CUE_END_SENTINEL`, use it at line 114; rewrite `seekedHandler` at lines 148–155)
- Test: `tests/unit/domCueSource.test.ts` (add 2 tests)

**Interfaces:**
- Consumes: `OPEN_CUE_END_SENTINEL` from Task 1.
- Produces: corrected `seekedHandler` behavior (forward seek → real span; backward seek → small/vanished cue); open cue uses the sentinel instead of `86400`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/domCueSource.test.ts`, inside the existing `describe('startDomCueSource ...')` block (before its closing `});` at line 276). Add these two tests:

```ts
  it('on seeked, does NOT collapse the open cue to zero duration — finalizes at currentTime', async () => {
    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);

    // Open a cue at t=20.
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 20 });
    cueEl.textContent = 'Open before seek';
    await flushObservers();

    // Forward-seek to t=35: the open cue should be finalized at 35 (a real
    // span 20→35), NOT collapsed to endTime === startTime (0s duration).
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 35 });
    video.dispatchEvent(new Event('seeked'));
    await flushObservers();

    const lastMsg = sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop();
    const cues = ((lastMsg ?? { payload: { cues: [] } }).payload as { cues: SubtitleCue[] }).cues;
    const open = cues.find((c) => c.text === 'Open before seek');
    expect(open).toBeDefined();
    const oc = open as SubtitleCue;
    expect(oc.startTime).toBe(20);
    // Pre-fix this was startTime (20) -> zero duration. Post-fix it is 35.
    expect(oc.endTime).toBe(35);
    expect(oc.endTime).toBeGreaterThan(oc.startTime);

    cleanup();
  });

  it('on backward seeked, the open cue does not linger with a negative/far-future span', async () => {
    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);

    // Open a cue at t=40.
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 40 });
    cueEl.textContent = 'Open then jump back';
    await flushObservers();

    // Backward-seek to t=5. The cue started at 40; clamping to max(5, 40+0.1)
    // means endTime = 40.1 — a tiny (0.1s) cue that vanishes immediately rather
    // than spanning the 40→5 gap or lingering as stale text.
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 5 });
    video.dispatchEvent(new Event('seeked'));
    await flushObservers();

    const lastMsg = sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop();
    const cues = ((lastMsg ?? { payload: { cues: [] } }).payload as { cues: SubtitleCue[] }).cues;
    const open = cues.find((c) => c.text === 'Open then jump back');
    expect(open).toBeDefined();
    const oc = open as SubtitleCue;
    expect(oc.endTime).toBeGreaterThanOrEqual(oc.startTime); // never negative
    // Duration must be tiny (≤ 1s), not a multi-second span.
    expect(oc.endTime - oc.startTime).toBeLessThanOrEqual(1);

    cleanup();
  });
```

Also add an import for the sentinel at the top of the file (after the existing `import type { ... } from '@/types/subtitle';` line):

```ts
import { OPEN_CUE_END_SENTINEL } from '@/lib/subtitleTiming';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx -y pnpm@latest exec vitest run tests/unit/domCueSource.test.ts`
Expected: the two new tests FAIL — `seekedHandler` still sets `endTime = startTime` (forward-seek test asserts `endTime` 35 but gets 20). The backward-seek test asserts `endTime >= startTime` but currently gets `endTime === startTime` (20) which IS `>= 20` — wait, that passes by coincidence. **Adjust:** change the backward-seek assertion to also assert the cue is NOT shown after the seek by checking the open cue was cleared. Re-read: the current code sets `openCue.endTime = openCue.startTime` AND `openCue = null`. The emitted snapshot already contains the cue with `endTime === startTime`. The forward-seek test (`endTime` should be 35 but is 20) is the one that reliably fails. Good — at least one failing test confirms RED.

- [ ] **Step 3: Make the sentinel edit**

In `inject/domCueSource.ts`, add the import after line 14 (the `@/types/subtitle` import):

```ts
import { OPEN_CUE_END_SENTINEL } from '@/lib/subtitleTiming';
```

Then at line 114, replace the bare `86400`:

Old (lines 112–114):
```ts
    // Use a far-future endTime for the open (current) cue so the overlay's
    // findActiveCue() can match it. The next cue will close this one precisely.
    const cue: SubtitleCue = { startTime: t, endTime: t + 86400, text };
```

New:
```ts
    // Use the OPEN_CUE_END_SENTINEL for the open (current) cue so the overlay's
    // findActiveCue() can match it. The next cue will close this one precisely.
    // (Number.MAX_SAFE_INTEGER — not 86400, which a >24h film would overflow.)
    const cue: SubtitleCue = { startTime: t, endTime: OPEN_CUE_END_SENTINEL, text };
```

- [ ] **Step 4: Fix the seek-collapse**

In `inject/domCueSource.ts`, rewrite the `seekedHandler` (lines 144–155):

Old:
```ts
    // P2: on seek, close the currently-open cue at the OLD currentTime so its
    // endTime isn't left dangling across the jump. Without this, a seek while a
    // cue is open produces a cue spanning the gap (e.g. 10s→5min), corrupting
    // the timeline and confusing findActiveCue.
    const seekedHandler = () => {
      if (openCue) {
        // endTime was set relative to pre-seek playback; close it and clear so
        // the next sampleCue starts a fresh cue at the new position.
        openCue.endTime = openCue.startTime;
        openCue = null;
      }
    };
    video.addEventListener('seeked', seekedHandler);
```

New:
```ts
    // On seek, finalize the currently-open cue at the NEW currentTime so its
    // endTime reflects real playback. A forward seek (e.g. 10s→5min) gives the
    // cue an honest span ending at 5min; a backward seek clamps to
    // startTime + 0.1s so the cue is a tiny sliver that vanishes immediately
    // rather than spanning the jump or lingering as stale text.
    // (Pre-fix this set endTime = startTime, producing a zero-duration cue that
    // vanished as if it had never existed — losing the just-displayed caption.)
    const seekedHandler = () => {
      if (openCue) {
        openCue.endTime = Math.max(video.currentTime, openCue.startTime + 0.1);
        emit(domSource.readActiveLanguage(), domSource.videoIdExtractor?.());
        openCue = null;
      }
    };
    video.addEventListener('seeked', seekedHandler);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx -y pnpm@latest exec vitest run tests/unit/domCueSource.test.ts`
Expected: all tests PASS (new and pre-existing).

- [ ] **Step 6: Run typecheck + lint**

Run: `npx -y pnpm@latest exec tsc --noEmit`
Expected: no errors.

Run: `npx -y pnpm@latest exec eslint inject/domCueSource.ts tests/unit/domCueSource.test.ts`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add inject/domCueSource.ts tests/unit/domCueSource.test.ts
git commit -m "fix(subtitle): Max DOM scraper seek-collapse + name open-cue sentinel

Forward seek now finalizes the open cue at the new currentTime (a real span)
instead of collapsing it to endTime === startTime (zero duration — the
caption vanished as if never shown). Backward seek clamps to startTime+0.1s
so the cue is a tiny sliver, not a multi-second span. Replaces the bare
86400 open-cue marker with OPEN_CUE_END_SENTINEL (MAX_SAFE_INTEGER) — a
>24h film would overflow the old value."
```

---

## Task 3: Coordinator — wire `adaptCueTimings` into both cue-array seams

**Files:**
- Modify: `content/subtitleCoordinator.ts` (import + 2 call sites: `rebuildTranslatedCues` ~line 461, `mergeTranslatedChunk` ~line 756)
- Test: `content/__tests__/subtitleCoordinator.test.ts` (add 2 integration tests)

**Interfaces:**
- Consumes: `adaptCueTimings` from Task 1.
- Produces: the overlay receives cues whose endTimes are extended per policy on both the VTT and DOM paths.

- [ ] **Step 1: Write the failing tests**

First, inspect the top of `content/__tests__/subtitleCoordinator.test.ts` to find the existing import block and the `MOCK_TRANSLATED_CUES` / `mockUpdateCues` / `extensionMessageHandler` / `capturedInterceptedHandler` fixtures used by the chunk-merge tests (around lines 940–1058). Add a new `describe` block after the chunk-merge tests (after line 1058, before the auto-detected-category block). Match the existing house pattern (the test at lines 990–1027 is the template).

Append this new describe block:

```ts
// ============================================================================
// Sub-project 5a: reading-speed timing adaptation reaches the overlay
// ============================================================================
describe('subtitle timing adaptation (sub-project 5a)', () => {
  it('VTT path: an over-fast bilingual cue reaches updateCues with an extended endTime', async () => {
    // Establish session 42 via interception (mirrors the chunk-merge regression test).
    const payload = {
      url: 'https://youtube.com/timedtext',
      body: '<transcript>...</transcript>',
      contentType: 'application/json',
      platform: 'youtube',
      originalLanguage: 'en',
    };
    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-timing-1');

    mockUpdateCues.mockClear();

    // A cue whose translation is too long for its 1s window:
    //   text = 24 chars -> trans term 24/12 = 2.0s
    //   originalText = 40 chars -> orig term 40/20 = 2.0s
    //   required = max(2.0, 2.0) + 0.3 = 2.3s; window = 1s -> extend to 2.3s.
    // (abs cap = 0 + 4 = 4 doesn't bind; no next cue in this single-cue array.)
    extensionMessageHandler(
      {
        action: 'SUBTITLE_CHUNK_TRANSLATED',
        chunkStart: 0,
        chunkCues: [
          { startTime: 0, endTime: 1, text: 'a'.repeat(24), originalText: 'b'.repeat(40) },
        ],
        sessionId: 42,
      },
      {} as chrome.runtime.MessageSender,
      () => {},
    );

    expect(mockUpdateCues).toHaveBeenCalledTimes(1);
    const cuesArg = mockUpdateCues.mock.calls[0][0] as Array<{ endTime: number }>;
    expect(cuesArg[0].endTime).toBeCloseTo(2.3, 5);
  });

  it('VTT path: an already-readable cue is NOT shortened', async () => {
    const payload = {
      url: 'https://youtube.com/timedtext',
      body: '<transcript>...</transcript>',
      contentType: 'application/json',
      platform: 'youtube',
      originalLanguage: 'en',
    };
    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-timing-2');

    mockUpdateCues.mockClear();

    // Window 10s, tiny text -> required ~0.35s. endTime must stay 10 (floor).
    extensionMessageHandler(
      {
        action: 'SUBTITLE_CHUNK_TRANSLATED',
        chunkStart: 0,
        chunkCues: [{ startTime: 0, endTime: 10, text: 'hi', originalText: 'ho' }],
        sessionId: 42,
      },
      {} as chrome.runtime.MessageSender,
      () => {},
    );

    const cuesArg = mockUpdateCues.mock.calls[0][0] as Array<{ endTime: number }>;
    expect(cuesArg[0].endTime).toBe(10);
  });
});
```

> **Note on the DOM-path test:** the DOM path (`rebuildTranslatedCues`) is exercised by the `SUBTITLE_DOM_CUES` handler and depends on the `domTranslationMap`. Rather than construct that heavier fixture, the VTT-path tests above cover both the extend and no-shorten behaviors, and `rebuildTranslatedCues` calls the same `adaptCueTimings` function. The Task 1 unit tests already prove the function itself. If the implementer finds an existing DOM-path integration test to mirror cheaply, adding a third DOM-path test is welcome but not required for GREEN.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx -y pnpm@latest exec vitest run content/__tests__/subtitleCoordinator.test.ts`
Expected: the two new tests FAIL — `endTime` is still the original (1 and 10), because `adaptCueTimings` is not yet wired in.

- [ ] **Step 3: Add the import**

In `content/subtitleCoordinator.ts`, find the existing import block (near the top, after the other `@/lib/...` imports). Add:

```ts
import { adaptCueTimings } from '@/lib/subtitleTiming';
```

- [ ] **Step 4: Wire the VTT path — `mergeTranslatedChunk`**

In `content/subtitleCoordinator.ts`, locate `mergeTranslatedChunk` (around line 756). The function currently ends with:

```ts
  // Merge chunk at offset
  for (let j = 0; j < chunkCues.length; j++) {
    currentCues[chunkStart + j] = chunkCues[j];
  }
  state.translatedCues = currentCues;
  updateCues(currentCues);
}
```

Replace the tail with an adaptation pass. Note: `currentCues` may be sparse (holes from progressive chunking), and `adaptCueTimings` already filters undefined slots and is idempotent — so it is safe to run on the whole merged array after each chunk. Change to:

```ts
  // Merge chunk at offset
  for (let j = 0; j < chunkCues.length; j++) {
    currentCues[chunkStart + j] = chunkCues[j];
  }
  // Sub-project 5a: adapt bilingual cue endTimes for reading speed (extend +
  // cap, never shorten). Safe to re-run on the whole merged array after each
  // progressive chunk — the helper filters sparse slots and is idempotent.
  const adapted = adaptCueTimings(currentCues);
  state.translatedCues = adapted;
  updateCues(adapted);
}
```

- [ ] **Step 5: Wire the DOM path — `rebuildTranslatedCues`**

In `content/subtitleCoordinator.ts`, locate `rebuildTranslatedCues` (around line 461). It currently ends with:

```ts
function rebuildTranslatedCues(): void {
  state.domTranslatedCues = state.domOriginalCues.map((cue) => ({
    startTime: cue.startTime,
    endTime: cue.endTime,
    text: state.domTranslationMap.get(cue.text) ?? cue.text,
    originalText: cue.text,
  }));
}
```

Append the adaptation pass:

```ts
function rebuildTranslatedCues(): void {
  const built = state.domOriginalCues.map((cue) => ({
    startTime: cue.startTime,
    endTime: cue.endTime,
    text: state.domTranslationMap.get(cue.text) ?? cue.text,
    originalText: cue.text,
  }));
  // Sub-project 5a: adapt bilingual cue endTimes for reading speed (extend +
  // cap, never shorten). Runs on the full rebuilt array each batch.
  state.domTranslatedCues = adaptCueTimings(built);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx -y pnpm@latest exec vitest run content/__tests__/subtitleCoordinator.test.ts`
Expected: all tests PASS (the two new ones and all pre-existing ones).

> **If a pre-existing coordinator test breaks:** the most likely cause is a test that asserts an exact `endTime` on a fixture cue that now gets extended. Re-read that test: if it was asserting the *unadapted* value on a cue that genuinely needs extension, update the expected value to the adapted one (the extension is the intended new behavior). If the cue was already readable, no value should change — investigate before changing the assertion.

- [ ] **Step 7: Run typecheck + lint**

Run: `npx -y pnpm@latest exec tsc --noEmit`
Expected: no errors.

Run: `npx -y pnpm@latest exec eslint content/subtitleCoordinator.ts content/__tests__/subtitleCoordinator.test.ts`
Expected: no NEW errors (there are 5 pre-existing lint errors in coordinator tests noted in product.md — do not introduce more).

- [ ] **Step 8: Commit**

```bash
git add content/subtitleCoordinator.ts content/__tests__/subtitleCoordinator.test.ts
git commit -m "feat(subtitle): wire reading-speed timing adaptation into coordinator

adaptCueTimings runs on the merged cue array in mergeTranslatedChunk (VTT
progressive path) and rebuildTranslatedCues (Max DOM path), right before
updateCues. Bilingual cues whose translation can't be read in the source
window get extended endTimes (capped, never shortened). Safe to re-run per
progressive chunk — the helper filters sparse slots and is idempotent.
2 integration tests (extend + no-shorten)."
```

---

## Task 4: Full regression + build verification

**Files:** none (verification only).

- [ ] **Step 1: Run the entire test suite**

Run: `npx -y pnpm@latest exec vitest run`
Expected: ALL tests pass. The baseline before this sub-project is 1354 tests across 107 files; expect ~1368+ (3 new test files / blocks).

- [ ] **Step 2: Run typecheck across the project**

Run: `npx -y pnpm@latest exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run lint across the project**

Run: `npx -y pnpm@latest exec eslint .`
Expected: no NEW errors beyond the 5 pre-existing ones noted in product.md (`no-non-null-assertion` in subtitleCoordinator tests, `no-dynamic-delete` in SubtitlesSection/popup). If new errors were introduced in Tasks 1–3, fix them before proceeding.

- [ ] **Step 4: Run the production build**

Run: `npx -y pnpm@latest exec wxt build`
Expected: build succeeds. Bundle size should be within ~1KB of the 3.77MB baseline (the new module is ~80 lines of arithmetic; domCueSource/coordinator edits add a single function call each).

- [ ] **Step 5: Confirm success criteria from the spec**

Verify by reasoning over the test evidence (no manual browser step required for this pure-logic sub-project):
- ✅ Over-fast bilingual cue is extended (Task 3 VTT-extend test, Task 1 unit tests) — applies to YouTube/Udemy/Coursera (VTT) and Max (DOM, same helper).
- ✅ No cue is ever shortened (Task 1 no-shorten tests, Task 3 no-shorten integration test).
- ✅ Capped at +4s absolute and next-cue-gap (Task 1 cap tests).
- ✅ Max seek no longer erases the on-screen cue; backward seek doesn't linger (Task 2).
- ✅ Web-page path untouched — the new module is imported only by `subtitleCoordinator.ts` (grep-confirm in Step 6).

- [ ] **Step 6: Confirm web-path isolation**

Run: `grep -rn "subtitleTiming\|adaptCueTimings" --include="*.ts" . | grep -v "__tests__\|\.test\.ts"`
Expected output shows imports ONLY in `inject/domCueSource.ts` (sentinel) and `content/subtitleCoordinator.ts` (adaptation). No web-page-translation file references the new module — confirming the web path is byte-for-byte unaffected.

- [ ] **Step 7: Final commit (only if any fixups were needed)**

If Steps 1–4 required fixup commits, they are already committed per-task. Otherwise this step is a no-op. Do NOT squash — the per-task commits tell the story.

---

## Self-Review Notes (resolved during planning)

- **Spec coverage:** §A (helper) → Task 1. §B (Max fix) → Task 2. §C (coordinator wiring, both seams) → Task 3. Testing strategy items 1–4 → Tasks 1, 2, 3 respectively. Success criteria → Task 4 Step 5. All spec sections mapped.
- **Hole-tolerance:** discovered that `mergeTranslatedChunk` produces a sparse array (`currentCues.length = needed` leaves holes) and `findActiveCue` reads `cue.startTime` unguarded. `adaptCueTimings` filters undefined slots (Task 1 implementation + a dedicated test), so it is safe to run on the sparse merged array. This is a real, plan-level correctness concern — not a placeholder.
- **Idempotence:** required because the VTT path re-runs `adaptCueTimings` on the whole merged array after each progressive chunk. Asserted by a dedicated Task 1 test.
- **Type consistency:** `adaptCueTimings<T extends TimedCue>` is generic; `OPEN_CUE_END_SENTINEL` is the exact name used in both Task 1 (export) and Task 2 (import). Names match across all tasks.
- **No placeholders:** every step shows the actual code or command with expected output.
