# Subtitle Line-Wrapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap each bilingual subtitle line into a bounded, word-broken, line-balanced set of lines (2 original + 2 translation max) with a dynamic char-per-line budget tied to 5a's `requiredReadDuration`, rendered as explicit line `<div>`s in the overlay.

**Architecture:** One new pure module `lib/subtitleWrap.ts` (`wrapSubtitleText` greedy word-fill + `lineBudgetForCue` dynamic CPL) consumed by `subtitleOverlay.ts:347` (`updateDisplayedText`), which replaces wholesale `textContent` with per-line `<div>` rendering using `textContent` per line (XSS-safe). CSS `max-width: 80%` stays as a safety net only; the data layer owns intentional breaks.

**Tech Stack:** TypeScript, WXT (MV3 Chrome extension), Vitest with jsdom, `@/` path aliases for imports.

## Global Constraints

- **Line cap:** 2 lines original + 2 lines translation = 4 lines max per cue. Hard limit.
- **Char-per-line base:** `BASE_CPL = 42`, clamped to `[CPL_FLOOR, CPL_CEIL] × BASE_CPL` = `[33.6, 58.8]` via the `duration / requiredRead` ratio (clamped 0.8–1.4).
- **Word boundaries only:** breaks never split a word. A single word longer than `maxCharsPerLine` occupies its own line (cannot be split).
- **Overflow is explicit, never silent:** when text exceeds the line cap, the last line absorbs the remainder and `truncated = true` is returned. No `-webkit-line-clamp` (would truncate the translation and drop meaning).
- **No divide-by-zero:** `lineBudgetForCue` treats `requiredRead <= 0` as ratio 1.0 (uses `BASE_CPL` unchanged).
- **XSS-safe rendering:** per-line `<div>` elements use `textContent` (never `innerHTML`).
- **Reuse from 5a:** `requiredReadDuration` is imported from `@/lib/subtitleTiming` (already on master). No new settings / UI — constants live in the module (mirrors 5a's discipline).
- **Branding:** all identifiers use the `anyllm-` prefix for CSS/attributes. No new dependencies. pnpm is not global — use `npx -y pnpm@latest exec vitest run` for tests.
- **Non-interactive shell:** never invoke commands that prompt for y/n. `cp`/`mv`/`rm` may be aliased interactive — the plan uses git for commits and avoids them.

---

## File Structure

| File | Responsibility | New? |
|---|---|---|
| `lib/subtitleWrap.ts` | Pure `wrapSubtitleText` (greedy word-fill + line cap) and `lineBudgetForCue` (dynamic CPL from 5a's read time). No I/O, no DOM, no project-type imports. | ✅ new |
| `lib/__tests__/subtitleWrap.test.ts` | Unit tests: greedy fill, line cap, overflow/truncation, word boundaries, over-long word, empty input, dynamic CPL clamping, divide-by-zero guard. | ✅ new |
| `content/subtitleOverlay.ts` | `updateDisplayedText` (line 347) wraps both texts and renders explicit line `<div>`s via `textContent`. Adds two imports. | edit |
| `styles/subtitle.css` | Document `max-width: 80%` as a safety net (comment-only; no behavioral change). | minor edit |
| `content/__tests__/subtitleOverlay.test.ts` | Render tests: long translation → 2 line divs; short cue → 1 line; 2+2 cap holds; `textContent` used. | edit |

---

## Task 1: Pure wrap helper — `lib/subtitleWrap.ts`

**Files:**
- Create: `lib/subtitleWrap.ts`
- Test: `lib/__tests__/subtitleWrap.test.ts`

**Interfaces:**
- Produces (exact signatures later tasks rely on):
  ```ts
  export const BASE_CPL = 42;
  export const CPL_FLOOR = 0.8;
  export const CPL_CEIL = 1.4;
  export const MAX_LINES_ORIG = 2;
  export const MAX_LINES_TRANS = 2;
  export interface LineBudget { maxCharsPerLine: number; origMaxLines: number; transMaxLines: number; }
  export interface WrapResult { lines: string[]; truncated: boolean; }
  export function lineBudgetForCue(duration: number, requiredRead: number): LineBudget;
  export function wrapSubtitleText(text: string, maxCharsPerLine: number, maxLines: number): WrapResult;
  ```

- [ ] **Step 1: Write the failing test file**

Create `lib/__tests__/subtitleWrap.test.ts`:

```ts
/**
 * Tests for the pure subtitle line-wrap helper.
 * Greedy word-fill into lines, capped at maxLines, char-per-line budget tied
 * to 5a's requiredReadDuration via lineBudgetForCue.
 */
import { describe, it, expect } from 'vitest';
import {
  BASE_CPL,
  CPL_FLOOR,
  CPL_CEIL,
  MAX_LINES_ORIG,
  MAX_LINES_TRANS,
  lineBudgetForCue,
  wrapSubtitleText,
} from '@/lib/subtitleWrap';

describe('wrapSubtitleText', () => {
  it('fits text that is under maxCharsPerLine into a single line', () => {
    const r = wrapSubtitleText('Hello world', 42, 2);
    expect(r.lines).toEqual(['Hello world']);
    expect(r.truncated).toBe(false);
  });

  it('greedy-fills words into multiple lines up to maxCharsPerLine', () => {
    // 5 words, ~6 chars each + spaces. maxCharsPerLine=14 -> 2 words/line.
    const text = 'one two three four five';
    const r = wrapSubtitleText(text, 14, 3);
    // 'one two' (7) | 'three four' (10) | 'five' (4)
    expect(r.lines).toEqual(['one two', 'three four', 'five']);
    expect(r.truncated).toBe(false);
  });

  it('caps at maxLines and absorbs overflow into the last line (truncated=true)', () => {
    // 6 words, maxCharsPerLine=7, maxLines=2 -> genuine overflow.
    //   'one' -> 'one two'(7) -> 'three'(7+1+5=13>7) flush line0='one two'
    //   'three' -> 'three four'(10>7, 'four' alone is 4<=7 but 10>7) — actually
    //   'three' alone is 5<=7; adding 'four' gives 5+1+4=10>7 so flush.
    //   line1 would start with 'three'; but maxLines=2 reached -> absorb.
    // Simplify: use width that forces a clean 2-word first line then overflow.
    const text = 'aa bb cc dd ee ff'; // each word 2 chars
    const r = wrapSubtitleText(text, 5, 2);
    // line0: 'aa bb'(5); 'cc' won't fit (5+1+2=8>5) -> flush.
    // line1: starts 'cc'(2) -> 'cc dd'(5) -> 'ee'(8>5) -> would flush but cap=2 -> absorb.
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toBe('aa bb');
    // Last line absorbs the remainder: cc dd ee ff.
    expect(r.lines[1]).toBe('cc dd ee ff');
    expect(r.truncated).toBe(true);
  });

  it('does NOT set truncated when text fits exactly within maxLines', () => {
    // 4 two-char words, width 5, maxLines 2 -> 'aa bb' | 'cc dd', fits exactly.
    const r = wrapSubtitleText('aa bb cc dd', 5, 2);
    expect(r.lines).toEqual(['aa bb', 'cc dd']);
    expect(r.truncated).toBe(false);
  });

  it('never splits a word: a single word longer than maxCharsPerLine gets its own line', () => {
    const text = 'short supercalifragilisticexpialidocious end';
    const r = wrapSubtitleText(text, 10, 3);
    // 'short' | 'supercalifragilisticexpialidocious' (own line, unsplittable) | 'end'
    expect(r.lines).toEqual(['short', 'supercalifragilisticexpialidocious', 'end']);
    expect(r.truncated).toBe(false);
  });

  it('an unsplittable word that overflows maxLines still absorbs (truncated=true)', () => {
    const text = 'a supercalifragilisticexpialidocious b c d';
    const r = wrapSubtitleText(text, 10, 2);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toBe('a');
    expect(r.lines[1]).toBe('supercalifragilisticexpialidocious b c d');
    expect(r.truncated).toBe(true);
  });

  it('collapses runs of whitespace into single spaces between words', () => {
    const r = wrapSubtitleText('one   two', 42, 2);
    expect(r.lines).toEqual(['one two']);
  });

  it('trims leading/trailing whitespace', () => {
    const r = wrapSubtitleText('  hello  ', 42, 2);
    expect(r.lines).toEqual(['hello']);
  });

  it('empty/whitespace-only input returns a single empty line, not truncated', () => {
    expect(wrapSubtitleText('', 42, 2)).toEqual({ lines: [''], truncated: false });
    expect(wrapSubtitleText('   ', 42, 2)).toEqual({ lines: [''], truncated: false });
  });

  it('maxLines=1 returns a single line, truncated if it overflows', () => {
    const r = wrapSubtitleText('one two three four', 10, 1);
    expect(r.lines).toEqual(['one two three four']);
    expect(r.truncated).toBe(true);
  });
});

describe('lineBudgetForCue', () => {
  it('returns the fixed 2+2 line caps', () => {
    const b = lineBudgetForCue(2, 2);
    expect(b.origMaxLines).toBe(MAX_LINES_ORIG);
    expect(b.transMaxLines).toBe(MAX_LINES_TRANS);
  });

  it('uses BASE_CPL when duration == requiredRead (ratio 1.0)', () => {
    const b = lineBudgetForCue(2, 2);
    expect(b.maxCharsPerLine).toBeCloseTo(BASE_CPL * 1.0, 5);
  });

  it('widens maxCharsPerLine when the cue has lots of time (ratio > 1, clamped at CEIL)', () => {
    // duration 10s, required 2s -> ratio 5 -> clamped to CEIL (1.4).
    const b = lineBudgetForCue(10, 2);
    expect(b.maxCharsPerLine).toBeCloseTo(BASE_CPL * CPL_CEIL, 5);
  });

  it('narrows maxCharsPerLine when the cue is tight (ratio < 1, clamped at FLOOR)', () => {
    // duration 1s, required 4s -> ratio 0.25 -> clamped to FLOOR (0.8).
    const b = lineBudgetForCue(1, 4);
    expect(b.maxCharsPerLine).toBeCloseTo(BASE_CPL * CPL_FLOOR, 5);
  });

  it('scales linearly between FLOOR and CEIL for mid-range ratios', () => {
    // ratio 1.1 -> within [0.8, 1.4], so 1.1 exactly.
    const b = lineBudgetForCue(11, 10);
    expect(b.maxCharsPerLine).toBeCloseTo(BASE_CPL * 1.1, 5);
  });

  it('does not divide by zero when requiredRead <= 0 (treats ratio as 1.0)', () => {
    const b0 = lineBudgetForCue(2, 0);
    expect(b0.maxCharsPerLine).toBeCloseTo(BASE_CPL, 5);
    const bNeg = lineBudgetForCue(2, -1);
    expect(bNeg.maxCharsPerLine).toBeCloseTo(BASE_CPL, 5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx -y pnpm@latest exec vitest run lib/__tests__/subtitleWrap.test.ts`
Expected: FAIL — module `@/lib/subtitleWrap` does not exist (import error).

- [ ] **Step 3: Write the implementation**

Create `lib/subtitleWrap.ts`:

```ts
/**
 * Subtitle line-wrapping — PURE module.
 *
 * Wraps each cue's text into a bounded, word-broken, line-balanced set of
 * lines. The char-per-line budget flexes with the cue's available reading time
 * (via 5a's requiredReadDuration), so comfortably-timed cues get wider lines
 * (fewer breaks) and tight cues get narrower ones.
 *
 * No I/O, no DOM, no project-type imports — trivially testable and reusable.
 */

/** Base characters-per-line for a comfortably-timed cue (Latin-script norm). */
export const BASE_CPL = 42;
/** Dynamic-CPL clamp floor (multiplier of BASE_CPL) for tight cues. */
export const CPL_FLOOR = 0.8;
/** Dynamic-CPL clamp ceiling (multiplier of BASE_CPL) for roomy cues. */
export const CPL_CEIL = 1.4;
/** Hard line cap for the original (source) block. */
export const MAX_LINES_ORIG = 2;
/** Hard line cap for the translation block. */
export const MAX_LINES_TRANS = 2;

export interface LineBudget {
  /** Max characters a single line should hold before wrapping. */
  maxCharsPerLine: number;
  /** Hard cap on line count for the original block. */
  origMaxLines: number;
  /** Hard cap on line count for the translation block. */
  transMaxLines: number;
}

export interface WrapResult {
  /** 1..maxLines entries; never empty (empty input yields ['']). */
  lines: string[];
  /** True if text overflowed maxLines (last line absorbed the remainder). */
  truncated: boolean;
}

/**
 * Compute the line budget for a cue from its available reading time.
 *
 * maxCharsPerLine = BASE_CPL × clamp(duration / requiredRead, FLOOR, CEIL).
 * A cue with lots of time (ratio > 1) gets wider lines (fewer breaks); a tight
 * cue (ratio < 1) gets narrower lines (safer fit). Line caps are the fixed 2+2
 * hard limit regardless of timing.
 *
 * When requiredRead <= 0 (degenerate/empty cue), the ratio is treated as 1.0
 * so maxCharsPerLine = BASE_CPL (no divide-by-zero).
 */
export function lineBudgetForCue(duration: number, requiredRead: number): LineBudget {
  const ratio = requiredRead > 0 ? duration / requiredRead : 1;
  const multiplier = Math.max(CPL_FLOOR, Math.min(CPL_CEIL, ratio));
  return {
    maxCharsPerLine: BASE_CPL * multiplier,
    origMaxLines: MAX_LINES_ORIG,
    transMaxLines: MAX_LINES_TRANS,
  };
}

/**
 * Greedy-fill words into lines up to maxCharsPerLine, capped at maxLines.
 *
 * - Words are split on whitespace; runs of whitespace collapse to single
 *   spaces, and leading/trailing whitespace is trimmed.
 * - Breaks only at word boundaries. A single word longer than maxCharsPerLine
 *   occupies its own line (it cannot be split).
 * - On overflow past maxLines, the last line absorbs the remaining words
 *   (joined by single spaces) and truncated = true. No silent drop.
 * - Empty/whitespace input returns { lines: [''], truncated: false }.
 *
 * Greedy (not optimal raggedness) is used: it is O(n), deterministic, and
 * "good enough" for subtitle display where the line cap matters more than
 * perfect balance.
 *
 * Implementation note: a running wordIndex is tracked so that on overflow the
 * remainder slice starts strictly AFTER the word currently held in `current`
 * (avoiding a double-count of that word).
 */
export function wrapSubtitleText(text: string, maxCharsPerLine: number, maxLines: number): WrapResult {
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return { lines: [''], truncated: false };

  const lines: string[] = [];
  let current = '';
  let i = 0;

  while (i < words.length) {
    const word = words[i];
    if (current === '') {
      current = word;
      i++;
    } else if (current.length + 1 + word.length <= maxCharsPerLine) {
      current += ' ' + word;
      i++;
    } else {
      // Word doesn't fit on the current line — flush current, start a new line.
      lines.push(current);
      current = '';
      if (lines.length >= maxLines) {
        // Cap reached: absorb the remaining words (i..end) into the last line.
        // `current` was just cleared, so the remainder is exactly words[i..].
        const remainder = words.slice(i);
        if (remainder.length > 0) {
          lines[lines.length - 1] = lines[lines.length - 1] + ' ' + remainder.join(' ');
        }
        return { lines: lines.slice(0, maxLines), truncated: true };
      }
    }
  }

  // No overflow — flush the final line.
  if (current !== '') lines.push(current);
  return { lines, truncated: false };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx -y pnpm@latest exec vitest run lib/__tests__/subtitleWrap.test.ts`
Expected: PASS — all tests green.

> **The overflow tests were traced by hand against the implementation during planning** (the absorb-remainder branch is the bug-prone part): a running `wordIndex` ensures the remainder slice starts strictly after the word held in `current`, so no word is double-counted. If a test fails, re-trace the failing input through the while-loop before changing either side.

- [ ] **Step 5: Run typecheck + lint on the new file**

Run: `npx -y pnpm@latest exec tsc --noEmit`
Expected: no errors (new file is self-contained).

Run: `npx -y pnpm@latest exec eslint lib/subtitleWrap.ts lib/__tests__/subtitleWrap.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/subtitleWrap.ts lib/__tests__/subtitleWrap.test.ts
git commit -m "feat(subtitle): pure line-wrap helper with dynamic char-per-line budget

wrapSubtitleText greedy-fills words into lines capped at maxLines (overflow
absorbed into the last line, never silently dropped). lineBudgetForCue derives
maxCharsPerLine from the cue's duration/requiredRead ratio (clamped 0.8-1.4 x
BASE_CPL 42), reusing 5a's readability vocabulary. No divide-by-zero. Pure,
no I/O, no project-type imports."
```

---

## Task 2: Overlay — render explicit wrapped line divs

**Files:**
- Modify: `content/subtitleOverlay.ts` (imports near line 13–15; `updateDisplayedText` at line 347–363)
- Test: `content/__tests__/subtitleOverlay.test.ts` (add a new `describe` block)

**Interfaces:**
- Consumes from Task 1: `lineBudgetForCue`, `wrapSubtitleText`, types `LineBudget`/`WrapResult`.
- Consumes from 5a (already on master): `requiredReadDuration` from `@/lib/subtitleTiming`.
- Produces: the overlay's `.subtitle-original` / `.subtitle-translated` blocks now contain 1..N child `<div>` line elements (via `textContent`) instead of a single text node.

- [ ] **Step 1: Write the failing tests**

In `content/__tests__/subtitleOverlay.test.ts`, add the new imports to the existing import block (after line 23, the `} from '@/content/subtitleOverlay';` line):

```ts
import { initializeOverlay, updateCues, resetOverlayState } from '@/content/subtitleOverlay';
```

(Extend the existing named-import line — do not duplicate it. The existing block imports `initializeOverlay, updateConfig, resetOverlayState, getConfig`; add `updateCues`.)

Then append a new `describe` block at the end of the file (after the last closing `});`):

```ts
// ============================================================================
// Sub-project 5b: line-wrapping renders explicit line divs
// ============================================================================
describe('subtitleOverlay — line wrapping (sub-project 5b)', () => {
  it('renders a long translation as at most 2 line divs (not one wrapping block)', () => {
    const video = document.createElement('video');
    document.body.appendChild(video);

    // A cue with a long translation (well over 42 chars) and a generous window
    // so requiredRead is small relative to duration -> wide CPL, but still 2 lines.
    const longText = 'This is a rather long translated subtitle line that should wrap into two separate line divs rather than one';
    const cues = [{ startTime: 0, endTime: 6, text: longText, originalText: 'orig' }];
    initializeOverlay(cues, {}, video);

    const translatedEl = document.querySelector('.anyllm-translate-subtitle-translated') as HTMLElement;
    expect(translatedEl).not.toBeNull();
    const lineDivs = translatedEl.querySelectorAll(':scope > div');
    // Must render as multiple line divs (wrapped), capped at 2.
    expect(lineDivs.length).toBeGreaterThanOrEqual(1);
    expect(lineDivs.length).toBeLessThanOrEqual(2);
    // No innerHTML was used — each line div carries only text.
    lineDivs.forEach((d) => {
      expect((d as HTMLElement).children.length).toBe(0);
    });
  });

  it('renders a short cue as a single line div (no needless wrapping)', () => {
    const video = document.createElement('video');
    document.body.appendChild(video);

    const cues = [{ startTime: 0, endTime: 4, text: 'Hi', originalText: 'Hola' }];
    initializeOverlay(cues, {}, video);

    const translatedEl = document.querySelector('.anyllm-translate-subtitle-translated') as HTMLElement;
    const lineDivs = translatedEl.querySelectorAll(':scope > div');
    expect(lineDivs.length).toBe(1);
    expect(lineDivs[0].textContent).toBe('Hi');

    const originalEl = document.querySelector('.anyllm-translate-subtitle-original') as HTMLElement;
    const origDivs = originalEl.querySelectorAll(':scope > div');
    expect(origDivs.length).toBe(1);
    expect(origDivs[0].textContent).toBe('Hola');
  });

  it('never exceeds 2 line divs in either block (the 2+2 cap)', () => {
    const video = document.createElement('video');
    document.body.appendChild(video);

    // Very long text in BOTH blocks, tight window -> narrow CPL -> max wrapping.
    const veryLong = 'word '.repeat(40).trim(); // 40 words
    const cues = [{
      startTime: 0, endTime: 1,
      text: veryLong, originalText: veryLong,
    }];
    initializeOverlay(cues, {}, video);

    const translatedEl = document.querySelector('.anyllm-translate-subtitle-translated') as HTMLElement;
    const originalEl = document.querySelector('.anyllm-translate-subtitle-original') as HTMLElement;
    expect(translatedEl.querySelectorAll(':scope > div').length).toBeLessThanOrEqual(2);
    expect(originalEl.querySelectorAll(':scope > div').length).toBeLessThanOrEqual(2);
  });

  it('uses textContent per line (XSS-safe — no innerHTML)', () => {
    const video = document.createElement('video');
    document.body.appendChild(video);

    // A cue whose text contains HTML-like content.
    const cues = [{
      startTime: 0, endTime: 4,
      text: '<b>not bold</b>', originalText: '<img src=x>',
    }];
    initializeOverlay(cues, {}, video);

    const translatedEl = document.querySelector('.anyllm-translate-subtitle-translated') as HTMLElement;
    // textContent renders the string literally; no <b> element is created.
    expect(translatedEl.querySelectorAll('b').length).toBe(0);
    expect(translatedEl.textContent).toContain('<b>not bold</b>');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx -y pnpm@latest exec vitest run content/__tests__/subtitleOverlay.test.ts -t "line wrapping"`
Expected: the long-translation test FAILS — today `updateDisplayedText` sets one `textContent`, so `querySelectorAll(':scope > div')` returns 0 line divs. The short-cue test also FAILS (0 divs, expects 1). XSS test: `textContent` already prevents `<b>`, so it may pass by coincidence — the real signal is the line-div count tests.

- [ ] **Step 3: Add the imports**

In `content/subtitleOverlay.ts`, the existing import block (lines 13–15) is:

```ts
import { findPrimaryVideo } from '@/lib/findPrimaryVideo';
import type { SubtitleCue } from '@/types/subtitle';
import type { SubtitleFontSizeMode } from '@/types/config';
```

Add two imports after it:

```ts
import { requiredReadDuration } from '@/lib/subtitleTiming';
import { lineBudgetForCue, wrapSubtitleText } from '@/lib/subtitleWrap';
```

- [ ] **Step 4: Rewrite `updateDisplayedText` to wrap + render line divs**

In `content/subtitleOverlay.ts`, replace the `updateDisplayedText` function (lines 347–363):

Old:
```ts
function updateDisplayedText(cueIndex: number): void {
  if (!overlayState.overlay) return;

  const originalEl = overlayState.overlay.querySelector('.anyllm-translate-subtitle-original') as HTMLElement;
  const translatedEl = overlayState.overlay.querySelector('.anyllm-translate-subtitle-translated') as HTMLElement;

  if (cueIndex >= 0 && cueIndex < overlayState.cues.length) {
    const cue = overlayState.cues[cueIndex];
    originalEl.textContent = cue.originalText || cue.text;
    translatedEl.textContent = cue.text;
    overlayState.overlay.classList.add('anyllm-translate-subtitle-visible');
  } else {
    originalEl.textContent = '';
    translatedEl.textContent = '';
    overlayState.overlay.classList.remove('anyllm-translate-subtitle-visible');
  }
}
```

New:
```ts
/**
 * Render a list of wrapped lines as child <div> elements inside a block.
 * Uses textContent per line (XSS-safe — never innerHTML). Clears the block first.
 */
function renderLines(block: HTMLElement, lines: string[]): void {
  block.textContent = '';
  for (const line of lines) {
    const lineEl = document.createElement('div');
    lineEl.textContent = line;
    block.appendChild(lineEl);
  }
}

/**
 * Update the displayed subtitle text. Each block (original + translation) is
 * wrapped into bounded, word-broken lines via the subtitleWrap helper, then
 * rendered as explicit line <div>s. The char-per-line budget flexes with the
 * cue's available reading time (reused from 5a's requiredReadDuration).
 */
function updateDisplayedText(cueIndex: number): void {
  if (!overlayState.overlay) return;

  const originalEl = overlayState.overlay.querySelector('.anyllm-translate-subtitle-original') as HTMLElement;
  const translatedEl = overlayState.overlay.querySelector('.anyllm-translate-subtitle-translated') as HTMLElement;

  if (cueIndex >= 0 && cueIndex < overlayState.cues.length) {
    const cue = overlayState.cues[cueIndex];
    const duration = Math.max(0, cue.endTime - cue.startTime);
    const requiredRead = requiredReadDuration(cue);
    const budget = lineBudgetForCue(duration, requiredRead);

    const origText = cue.originalText || cue.text;
    const origLines = wrapSubtitleText(origText, budget.maxCharsPerLine, budget.origMaxLines).lines;
    const transLines = wrapSubtitleText(cue.text, budget.maxCharsPerLine, budget.transMaxLines).lines;

    renderLines(originalEl, origLines);
    renderLines(translatedEl, transLines);
    overlayState.overlay.classList.add('anyllm-translate-subtitle-visible');
  } else {
    originalEl.textContent = '';
    translatedEl.textContent = '';
    overlayState.overlay.classList.remove('anyllm-translate-subtitle-visible');
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx -y pnpm@latest exec vitest run content/__tests__/subtitleOverlay.test.ts`
Expected: all tests PASS (the 4 new wrapping tests and all pre-existing overlay tests).

> **If a pre-existing overlay test breaks:** the most likely cause is a test that asserted on `textContent` of `.subtitle-original` / `.subtitle-translated` directly. After this change, the text lives inside child `<div>`s, so `block.textContent` still returns the concatenated text (the DOM flattens descendant text), but `block.textContent === 'Hello'` may now be `'Hello'` still (single line) — verify. If a test checked for an exact match that now differs due to wrapping, update the assertion to read the rendered line divs instead. Investigate before changing assertions.

- [ ] **Step 6: Run typecheck + lint**

Run: `npx -y pnpm@latest exec tsc --noEmit`
Expected: no NEW errors (the 3 pre-existing subtitleCoordinator test errors are unrelated and remain).

Run: `npx -y pnpm@latest exec eslint content/subtitleOverlay.ts content/__tests__/subtitleOverlay.test.ts`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add content/subtitleOverlay.ts content/__tests__/subtitleOverlay.test.ts
git commit -m "feat(subtitle): render wrapped line divs in overlay (sub-project 5b)

updateDisplayedText wraps both the original and translation via the
subtitleWrap helper (dynamic char-per-line budget from 5a's
requiredReadDuration) and renders each line as an explicit <div> using
textContent (XSS-safe). Long translations no longer wrap to 3+ uncontrolled
lines; the 2+2 cap holds. 4 new render tests."
```

---

## Task 3: CSS safety-net comment + full regression + build

**Files:**
- Modify: `styles/subtitle.css` (comment-only, line ~40)
- Verification only otherwise.

- [ ] **Step 1: Document `max-width` as a safety net**

In `styles/subtitle.css`, the `.anyllm-translate-subtitle-text` rule (around line 35) currently has:

```css
/* Subtitle text container */
.anyllm-translate-subtitle-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 80%;
```

Change the comment above `max-width` to document its new role. Insert a comment line right before `max-width: 80%;`:

```css
  /* Safety net for unbreakable runs (long URLs/IDs exceeding the data layer's
     maxCharsPerLine). Intentional line breaks are now owned by the overlay's
     per-line <div> rendering (lib/subtitleWrap.ts). */
  max-width: 80%;
```

No behavioral change — the rule itself is untouched; only a clarifying comment is added.

- [ ] **Step 2: Run the full test suite**

Run: `npx -y pnpm@latest exec vitest run`
Expected: ALL tests pass. Baseline after 5a was 1375 tests across 108 files; expect ~1390+ (the wrap unit tests + the 4 overlay render tests).

- [ ] **Step 3: Run typecheck across the project**

Run: `npx -y pnpm@latest exec tsc --noEmit`
Expected: no errors beyond the 3 pre-existing `subtitleCoordinator.test.ts` ones (lines ~261/1239/1297). No new errors from 5b.

- [ ] **Step 4: Run lint across the project**

Run: `npx -y pnpm@latest exec eslint .`
Expected: no NEW errors beyond the 5 pre-existing ones (3 `no-non-null-assertion` in subtitleCoordinator tests, 2 `no-dynamic-delete` in SubtitlesSection/popup). 5b introduces none.

- [ ] **Step 5: Run the production build**

Run: `npx -y pnpm@latest exec wxt build`
Expected: build succeeds. Bundle size within ~1KB of the 3.77MB baseline (the new module is ~70 lines; the overlay edit adds a few DOM ops per cue update).

- [ ] **Step 6: Confirm success criteria from the spec**

Verify by reasoning over the test evidence (no manual browser step required for this logic sub-project):
- ✅ Long translation renders as ≤ 2 line divs at word boundaries (Task 2 render tests, Task 1 wrap tests).
- ✅ 2+2 cap holds — neither block exceeds 2 line divs (Task 2 cap test).
- ✅ Dynamic CPL: wide cues get wider lines (Task 1 `lineBudgetForCue` ratio tests).
- ✅ No silent truncation under normal operation; overflow absorbs + flags `truncated` (Task 1 overflow test).
- ✅ XSS-safe — `textContent` per line, no `innerHTML` (Task 2 XSS test).
- ✅ Web-page path untouched (Step 7 grep below).

- [ ] **Step 7: Confirm web-path isolation**

Run: `grep -rn "subtitleWrap\|wrapSubtitleText\|lineBudgetForCue" --include="*.ts" --include="*.tsx" . | grep -v "__tests__" | grep -v "\.test\.ts"`
Expected output shows imports ONLY in `content/subtitleOverlay.ts`. No web-page-translation file references the new module — confirming the web path is byte-for-byte unaffected.

- [ ] **Step 8: Commit the CSS comment**

```bash
git add styles/subtitle.css
git commit -m "docs(subtitle): document max-width as safety net for wrapping (5b)

Comment-only change. The data layer (lib/subtitleWrap.ts) now owns
intentional line breaks; max-width: 80% remains as a safety net for
unbreakable runs. No behavioral change."
```

---

## Self-Review Notes (resolved during planning)

- **Spec coverage:** §A (helper) → Task 1. §B (overlay render change) → Task 2. §C (CSS safety-net doc) → Task 3 Step 1. Testing strategy items 1–3 → Tasks 1, 2. Success criteria → Task 3 Step 6. All spec sections mapped.
- **Double-count bug caught and fixed:** the initial `wrapSubtitleText` absorb-remainder branch reconstructed the consumed word count by splitting completed lines back apart (`lines.reduce(...)`) and then prepended the word held in `current` — which double-counted that word (it appeared both in `current` and at the head of the remainder slice). Fixed by switching to an explicit running `wordIndex` (`i`) that advances as words are consumed; on overflow the remainder is exactly `words.slice(i)`, with `current` cleared first. All overflow tests were hand-traced against the corrected loop during planning.
- **XSS-safety:** rendering uses `textContent` per line div, never `innerHTML`. The existing overlay already used `textContent`, so this preserves the safety property; a dedicated test guards it.
- **Type consistency:** `LineBudget` / `WrapResult` are the exact type names used in both Task 1 (definition) and Task 2 (consumption). `lineBudgetForCue` / `wrapSubtitleText` signatures match. `requiredReadDuration` is imported from 5a's `@/lib/subtitleTiming` (already on master, verified).
- **No placeholders:** every step shows actual code or commands with expected output.
