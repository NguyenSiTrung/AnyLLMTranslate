# Learnings: Paragraph Translation Progress Indicators

## [2026-04-10 16:20] - Phase 1 Task 1: CSS Spinner
- **Implemented:** Pure CSS border-trick spinner in inject.css replacing old shimmer approach
- **Files changed:** `styles/inject.css`
- **Commit:** 765f46e
- **Learnings:**
  - Patterns: Use `.lingua-lens-loading::before` pseudo-element for spinner — keeps DOM clean, no extra child elements
  - Patterns: `animation: none !important; opacity: 1 !important` on spinner parent overrides the default `.lingua-lens-translation` fade-in, making spinner appear immediately
  - Gotchas: Error state CSS moved from `[data-lingua-error] .lingua-lens-translation` (parent-child) to `.lingua-lens-translation[data-lingua-error]` (same element) since error is now set on the translation element itself, not its parent
  - Context: `var(--lingua-accent, #3b82f6)` — always provide fallback for CSS custom properties in inject.css since the host page may not define them

---

## [2026-04-10 16:20] - Phase 2 Tasks 1-3: Loading Placeholder System
- **Implemented:** `showLoadingPlaceholder()`, updated `applyTranslation()` and `setErrorState()` for in-place updates
- **Files changed:** `content/translationDisplay.ts`
- **Commit:** 765f46e
- **Learnings:**
  - Patterns: In-place DOM update pattern: find existing element by pieceId → swap class + set textContent → force reflow to re-trigger CSS animation (`element.style.animation = 'none'; element.offsetHeight; element.style.animation = ''`)
  - Patterns: Idempotency check via `document.querySelector(\`[\${DATA_ATTRS.PIECE_ID}="${pieceId}"]\`)` before insertion is the canonical guard pattern in this codebase
  - Gotchas: `removeAllTranslations()` uses `querySelectorAll('[data-lingua-role="translation"]')` to remove all, which also removes loading placeholders — this is correct behavior since all are same-role elements
  - Context: `setLoadingState()` removed entirely — the function was for parent-attribute shimmer which is now replaced

---

## [2026-04-10 16:20] - Phase 3 Task 1: Wire Loading State in content.ts
- **Implemented:** `showLoadingPlaceholder()` called before `await`, error catch block for `setErrorState()`
- **Files changed:** `entrypoints/content.ts`
- **Commit:** 765f46e
- **Learnings:**
  - Patterns: For batch translation, show spinners for ALL pieces before the single batch `await` — this gives immediate visual feedback for all pending paragraphs simultaneously
  - Patterns: Wrap `chrome.runtime.sendMessage` in try/catch in content scripts — sendMessage can throw if the service worker is asleep on first load
  - Context: `translatePieces()` handles both batch success (iterate results) and batch failure (error for all pieces)

---

## [2026-04-10 16:20] - Phase 4: Tests
- **Implemented:** 24 tests in translationDisplay, themes.test.ts updated
- **Files changed:** `content/__tests__/translationDisplay.test.ts`, `styles/__tests__/themes.test.ts`
- **Commit:** 765f46e
- **Learnings:**
  - Gotchas: themes.test.ts checks CSS content as a string — when replacing CSS selectors/keyframe names, always update the themes test alongside the CSS file
  - Patterns: Test in-place update by calling showLoadingPlaceholder() first, then applyTranslation() — verify single element with updated content and class removed
