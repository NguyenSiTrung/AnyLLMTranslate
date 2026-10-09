# Track Learnings: page-translation-hardening_20261009

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

From `conductor/patterns.md` — "Page translation — shadow roots, lifecycle, per-piece failure":
- Centralize root discovery (`content/shadowDomRoots.ts`) — extraction, retirement and teardown must agree on one root set.
- Retire pieces when the page edits its own source; never append a sibling translation.
- Stop means abort, not just clear — in-flight stream AND fallback requests (FR-12 closes the non-stream gap).
- Never mark a deduplicated piece translated when its canonical batch failed.
- Streaming and non-streaming paths share cache and batch budgets.

From Beads memory `subtitle-chunk-retry-classification`:
- `lib/translationErrors.ts` `isTransientTranslationError` is for the NEGATIVE CACHE only and deliberately treats auth/quota as transient — do not use it for retry decisions (FR-10).

## Analysis evidence (2026-10-09 probe)
- Plain: `Plain<br>break` → `Plainbreak`.
- Rich: `Tom &amp; Jerry<br>x <a>link</a>` → `Tom &amp; Jerry<br>x <z id="0">link</z>`; decode round-trip shows literal `&amp;` and `<br>`.
- Rich: nested `<li>` content duplicated as raw `<ul><li>…` in the parent piece.

---

<!-- Learnings from implementation will be appended below -->

## [2026-10-09] - Phase 1 Task 1.1: `<br>` → `\n` in plain piece text (FR-3)
- **Implemented:** `content/pieceText.ts` `joinGroupText()` / `groupSeparator()` — one `\n` per `<br>` between adjacent group text nodes (capped at 2), found by a bounded document-order scan. Used by `extractPieces` and by `isPieceSourceUnchanged` in `entrypoints/content.ts`.
- **Files changed:** content/pieceText.ts (new), content/domWalker.ts, entrypoints/content.ts, content/__tests__/domWalker.hardening.test.ts (new)
- **Learnings:**
  - Gotchas: `webTranslateLifecycle.test.ts` `vi.doMock`s `@/content/domWalker` as `{ extractPieces }` only — any new helper content.ts needs from the walker must live in a separate module (hence `pieceText.ts`).
  - Patterns: the extraction baseline (`sourceText`) and the sm7n live recompute must use one shared join function, or every `<br>` paragraph invalidates on the first mutation.
---

## [2026-10-09] - Phase 1 Task 1.2: Group-scoped rich encoding (FR-1)
- **Implemented:** `encodeInlineNodes(textNodes, anchor, separator)` in `lib/richTranslate.ts` replaces the regex `encodeInlineHtml(anchor.innerHTML)`. It walks the group's own text nodes, diffs each node's whitelisted inline-ancestor chain against the open stack, and emits `<z id>` / `</z>` transitions; `openHtml` is serialized from `el.attributes`. `encodeInlineHtml` removed (only tests used it); the rich test keeps its assertions through a small snippet→nodes helper.
- **Files changed:** lib/richTranslate.ts, content/domWalker.ts, lib/__tests__/richTranslate.test.ts, content/__tests__/domWalker.hardening.test.ts
- **Learnings:**
  - Patterns: encode from the walker's accepted nodes, never from serialized HTML — the walker's accept/reject decisions (exclude selectors, `translate="no"`, SKIP_ELEMENTS, block splits) are then automatically honored by the rich text.
  - Gotchas: `lib/` must not import `content/`; the `<br>` separator is injected as a callback (`groupSeparator`).
---

## [2026-10-09] - Phase 1 Task 1.3: Entities and void tags (FR-2)
- **Implemented:** Text/`<br>`/void handling came with the node encoder (Text.data, `groupSeparator`, voids are never text nodes). New here: `decodeAttrEntities()` in `parseOpenTag`, so `href="/q?a=1&amp;b=2"` decodes to `a=1&b=2` (it was a pre-existing bug in the innerHTML path too). `img alt` is not carried (spec "may").
- **Files changed:** lib/richTranslate.ts, lib/__tests__/richTranslate.test.ts, content/__tests__/domWalker.hardening.test.ts
- **Learnings:**
  - Gotchas: decode attribute entities BEFORE the `isSafeUrl` check — `&#106;avascript:` must be judged as `javascript:`.
---
