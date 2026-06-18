# Track Learnings: pdf-download_20260618

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- **PDF viewer is a WXT extension page** (`entrypoints/pdf-viewer/`), not a content script — uses `chrome.runtime.sendMessage` for background communication
- **Classification belongs inside `translateParagraphs`** — atomic failure handling, unified cache, leaves `extractPageText` pure
- **Propagate paragraph `kind` end-to-end** — `TranslationResultItem.kind` → `paragraphKinds` on `PageTranslations` → renderer; math/figure become transparent spacers
- **Orthogonal view modes need orthogonal types + storage keys** — `PdfViewMode` is distinct from web-page `PageState`
- **`useVisiblePages` container-ref switch invariant** — when left pane unmounts, observer re-targets to right pane
- **Null-ref guards make conditional pane mounting safe** — `useSynchronizedScroll` early-returns when refs are null
- **Rule-based vs LLM classification split** — pure-math is deterministic/client-side; figure detection is LLM with fail-open
- **In-memory cache layered on IndexedDB** — `getMemoryCachedPage`/`setMemoryCachedPage` for instant re-render
- **pnpm not installed globally** — use `npx -y pnpm@latest exec` or `npx -y pnpm@latest install`

---

<!-- Learnings from implementation will be appended below -->
