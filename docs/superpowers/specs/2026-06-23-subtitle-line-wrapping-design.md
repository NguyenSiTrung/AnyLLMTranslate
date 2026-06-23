# Subtitle Line-Wrapping — Design

Date: 2026-06-23
Status: Approved (pending user spec review)
Roadmap: Sub-project 5b of the subtitle-quality pipeline (fast-follow to 5a,
spec `2026-06-23-subtitle-timing-adaptation-design.md`).

## Problem

The bilingual subtitle overlay renders each cue as two stacked blocks — the
original line and the translation — via wholesale `textContent` assignment
(`content/subtitleOverlay.ts:347`). Wrapping is pure browser flow with
`max-width: 80%` (`styles/subtitle.css:40`). Two consequences:

- **Uncontrolled break points.** The browser wraps at whatever pixel width the
  host page's font produces, often mid-phrase, and the break can land awkwardly.
- **Unbounded line count.** Nothing caps how many lines a long translation wraps
  to. A verbose target language (Vietnamese, German) against a short source
  window easily produces 3–4 translation lines, stacked under a 2-line original
  — 5+ lines covering the video.

This compounds the bilingual nature of the overlay: each cue already costs two
blocks, so bad wrapping doubles its visual cost.

## Goal

Wrap each bilingual subtitle line into a **bounded, word-broken,
line-balanced** set of lines, so long translations stop covering the video and
breaks land at word boundaries. The characters-per-line budget is **dynamic**,
derived from the cue's available reading time via `requiredReadDuration` from
sub-project 5a (`lib/subtitleTiming.ts`). This is the reason wrapping was
deferred to 5b: it shares 5a's readability vocabulary.

## Approach

Wrapping is a **data-layer concern**, not CSS. A pure helper wraps each cue's
text into explicit lines at word boundaries, capped at a line budget, with the
char-per-line budget flexing with the cue's on-screen time. The overlay renders
those explicit lines.

### Why not CSS-only

A CSS-only approach (`-webkit-line-clamp` + `overflow-wrap`) either truncates
the translation with an ellipsis (unacceptable — a truncated translation is
worse than no translation, it drops meaning) or fails to cap line count at all
(letting long runs hit 4+ lines). Neither solves the stated problem. The data
layer gives guaranteed line counts with word-boundary breaks.

### Why not "both" (CSS + data layer)

Once the data layer guarantees ≤ N lines per block by construction, a CSS
line-clamp on top is dead weight that can only fight the intentional breaks.
YAGNI.

### Line budget — 2+2, dynamic width

- **Hard cap:** 2 lines for the original + 2 lines for the translation = 4 lines
  max per cue (never more than today's worst case, usually less). Matches
  industry norms (Netflix / BBC iPlayer cap subtitle blocks at ~2 lines).
- **Dynamic char-per-line:** `maxCharsPerLine = BASE_CPL × clamp(duration / requiredRead, FLOOR, CEIL)`
  with `BASE_CPL = 42` (industry-typical Latin-script subtitle width),
  `FLOOR = 0.8`, `CEIL = 1.4`. A cue 5a gave a long window gets wider lines →
  fewer breaks → reads better. A tight cue gets narrower lines → safer fit.
- **Overflow beyond the cap:** the last line absorbs the remainder and
  `truncated = true` is returned. Truncation is the rare, explicit failure mode
  — never a silent line-clamp that drops meaning.

Why dynamic over static 2+2: a 6-second cue wrapped identically to a
1.5-second cue is a wasted opportunity. Dynamic tying to `requiredReadTime`
(which 5a already computes) is what makes the 5a→5b deferral worth it, and the
complexity delta is one formula.

## Components

### A. `lib/subtitleWrap.ts` — pure wrap helper (new file)

Pure functions, no I/O, no DOM. Mirrors the `subtitleTiming.ts` pattern.

```ts
/** Base characters-per-line for a comfortably-timed cue (Latin-script norm). */
export const BASE_CPL = 42;
/** Dynamic-CPL clamp floor/ceiling as a multiplier of BASE_CPL. */
export const CPL_FLOOR = 0.8;
export const CPL_CEIL = 1.4;
/** Hard line caps per block. */
export const MAX_LINES_ORIG = 2;
export const MAX_LINES_TRANS = 2;

export interface LineBudget {
  maxCharsPerLine: number;
  origMaxLines: number;
  transMaxLines: number;
}

/**
 * Compute the line budget for a cue from its available reading time.
 * maxCharsPerLine flexes with duration / requiredRead (clamped FLOOR..CEIL);
 * line caps are the fixed 2+2 hard limit.
 * When requiredRead <= 0 (degenerate/empty cue), ratio is treated as 1.0 so
 * maxCharsPerLine = BASE_CPL (no divide-by-zero).
 */
export function lineBudgetForCue(duration: number, requiredRead: number): LineBudget;

export interface WrapResult {
  lines: string[];     // 1..maxLines entries; never empty for non-empty input
  truncated: boolean;  // true if text overflowed maxLines (last line absorbed remainder)
}

/**
 * Greedy-fill words into lines up to maxCharsPerLine, capped at maxLines.
 * - Breaks only at word boundaries (single spaces). A single word longer than
 *   maxCharsPerLine occupies its own line (it cannot be split).
 * - On overflow past maxLines, the last line absorbs the remaining words
 *   (joined by single spaces) and truncated = true.
 * - Empty/whitespace input returns { lines: [''], truncated: false }.
 */
export function wrapSubtitleText(text: string, maxCharsPerLine: number, maxLines: number): WrapResult;
```

### B. Overlay render change — `content/subtitleOverlay.ts` (edit)

In `updateDisplayedText` (`subtitleOverlay.ts:347`), replace the wholesale
`textContent` assignment with explicit per-line rendering:

1. Import `requiredReadDuration` from `@/lib/subtitleTiming` and
   `lineBudgetForCue`, `wrapSubtitleText` from `@/lib/subtitleWrap`.
2. For the active cue, compute `duration = endTime - startTime` and
   `requiredRead = requiredReadDuration(cue)`, then
   `budget = lineBudgetForCue(duration, requiredRead)`.
3. Wrap `originalText` with `(budget.maxCharsPerLine, budget.origMaxLines)` and
   `text` with `(budget.maxCharsPerLine, budget.transMaxLines)`.
4. Render each line as a child `<div>` inside the existing
   `.subtitle-original` / `.subtitle-translated` blocks, using `textContent`
   per line (XSS-safe — no `innerHTML`). Clear the blocks and append line divs.

The existing two-block DOM structure (`.subtitle-original` + `.subtitle-translated`
inside `.subtitle-text`) is preserved; only the *contents* of each block change
from one text node to N line divs.

### C. CSS — `styles/subtitle.css` (minor edit)

- Keep `max-width: 80%` on `.subtitle-text` as the **safety net** for
  unbreakable runs (long URLs/IDs that exceed `maxCharsPerLine`). Document that
  the data layer now owns intentional breaks.
- No `-webkit-line-clamp` (would truncate; the data layer owns the line cap).
- No new rules required — line divs inherit the block's existing font/size.

## Data flow

```
active cue (text, originalText, startTime, endTime)
   │
   ├─ requiredReadDuration(cue)          ← from 5a (lib/subtitleTiming.ts)
   ├─ duration = endTime - startTime
   │
   └─ lineBudgetForCue(duration, requiredRead) → { maxCharsPerLine, origMaxLines, transMaxLines }
          │
          ├─ wrapSubtitleText(originalText, maxCharsPerLine, origMaxLines) → lines[]
          └─ wrapSubtitleText(text,         maxCharsPerLine, transMaxLines) → lines[]
                 │
                 └─ overlay renders each line as a <div> (textContent, XSS-safe)
```

All subtitle sites benefit — the overlay is shared across YouTube, Udemy,
Coursera, and Max.

## Scope boundaries (what this sub-project is NOT)

- ❌ No new settings / UI — constants in the module (mirrors 5a's discipline; a
  tuning UI can ride the later knob-override surface).
- ❌ No timing changes — 5a owns cue duration; 5b only **reads** it.
- ❌ No translation / caching / chunking changes.
- ❌ No `-webkit-line-clamp` / text truncation under normal operation.
- ✅ All subtitle sites benefit (overlay is shared).
- ✅ Web-page translation path untouched (overlay is subtitle-only).

## Testing strategy

1. **Unit — `lib/subtitleWrap.ts`** (new test file):
   - `wrapSubtitleText`: greedy fill respects `maxCharsPerLine`; caps at
     `maxLines`; overflow sets `truncated` and absorbs remainder into last line;
     word boundaries preserved (no mid-word split); a single over-long word gets
     its own line; empty input returns `{ lines: [''], truncated: false }`.
   - `lineBudgetForCue`: `maxCharsPerLine` flexes with `duration / requiredRead`
     and clamps to `[CPL_FLOOR, CPL_CEIL] × BASE_CPL`; line caps are always
     `2`/`2`; zero/near-zero `requiredRead` does not divide by zero.
2. **Unit — overlay** (`content/__tests__/subtitleOverlay.test.ts`):
   - A long translation renders as exactly 2 line `<div>`s (not one wrapping
     block); a short cue renders 1 line; the 2+2 cap never exceeded (≤ 4 line
     divs total across both blocks); `textContent` used per line (no
     `innerHTML`).
3. **Regression**: short cues still render correctly (1 line when text fits);
   the bilingual block never exceeds 4 lines even for very long inputs.

## Files touched

| File | Change | New? |
|---|---|---|
| `lib/subtitleWrap.ts` | `wrapSubtitleText`, `lineBudgetForCue`, constants | ✅ new |
| `lib/__tests__/subtitleWrap.test.ts` | wrap math, balance, overflow, dynamic CPL | ✅ new |
| `content/subtitleOverlay.ts` | `updateDisplayedText` wraps + renders explicit line divs | edit |
| `styles/subtitle.css` | document `max-width` as safety net (no behavioral change) | minor edit |
| `content/__tests__/subtitleOverlay.test.ts` | wrapped lines reach DOM; 2+2 cap holds | edit |

Net new production logic ≈ 70 lines (pure helper + render change).

## Success criteria

- A long translation no longer wraps to 3+ uncontrolled lines; breaks land at
  word boundaries.
- Per-cue line cap of 2 (original) + 2 (translation) holds — the bilingual block
  never exceeds 4 lines.
- Wide-timed cues get fewer breaks (dynamic CPL); tight cues wrap more.
- No text silently truncated under normal operation; overflow is explicit and
  rare.
- Web-page translation path untouched (regression guard green).

## Roadmap context

This is sub-project **5b** of the subtitle-quality pipeline. Siblings:
2. Context & continuity (merged).
3. Per-film proper-noun extraction (merged).
4. User-facing style override controls (merged).
5a. Reading-speed & timing adaptation (merged) — **5b reuses its
    `requiredReadDuration`**.
**5b. Line-wrapping (this spec).**
6. Context-aware cache & robustness (next).
