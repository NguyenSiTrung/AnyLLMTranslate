# Spec: Paragraph Translation Progress Indicators

**Track ID:** `para-progress-indicator_20260410`
**Type:** Feature
**Status:** New

---

## Overview

Add per-paragraph translation progress indicators to LinguaLens. While each paragraph
is being translated, a small animated CSS spinner is shown inline — below the original
paragraph, in the exact DOM position where the translated text will appear. When the
translation completes, the spinner transitions seamlessly into the translated text with
a smooth fade-in. This matches the UX pattern of Immersive Translate.

## Functional Requirements

1. When a paragraph enters the viewport and its translation is requested, immediately
   insert a placeholder element (with a CSS spinner animation) below the original
   paragraph — in the same DOM slot as the eventual translation element.
2. The placeholder element must occupy exactly the same DOM slot as the eventual
   translation (`parentElement.after()` insertion pattern).
3. The placeholder must be idempotent — calling it twice for the same piece does nothing.
4. When translation completes successfully, update the placeholder element **in-place**
   (swap class + set text content) — do not remove and re-insert.
5. When translation fails, update the placeholder in-place with the error state — same
   slot, same element.
6. The `setLoadingState()` function in `translationDisplay.ts` is removed/replaced by
   the new placeholder-based approach (it was unused).
7. Wired in `content.ts`'s `translatePieces()`: show spinner before `await`, handle
   both success and failure paths.
8. The spinner must be a **pure CSS animation** — no external assets, no SVG files,
   no JS animation loops.
9. The spinner must use `var(--lingua-accent)` so it respects the active theme color.

## Non-Functional Requirements

- Zero layout shift on spinner → translation swap (same element, in-place update)
- CSS spinner only (`transform` + `opacity` — GPU-accelerated, no layout properties)
- Spinner respects `@media (prefers-reduced-motion: reduce)` — shows static dot instead
- No interference with host page styles (all styles scoped under `.lingua-lens-translation`)

## Acceptance Criteria

- [ ] Translating a page shows a spinning icon below each paragraph that is pending
- [ ] Spinner disappears and is replaced by translated text when API returns
- [ ] Spinner transitions to error state on failure (retryable)
- [ ] No visual jank or layout shift when spinner → text transition occurs
- [ ] Spinner uses `var(--lingua-accent)` color (theme-consistent)
- [ ] Works correctly with batch translation (many paragraphs loading simultaneously)
- [ ] Spinner stops if `prefers-reduced-motion` is active (static fallback)

## Out of Scope

- Global page-level progress bar showing overall % translated
- Subtitle translation loading states
- Hover/selection translate loading states
- Custom spinner size settings
