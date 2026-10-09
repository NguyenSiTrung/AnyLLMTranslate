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
