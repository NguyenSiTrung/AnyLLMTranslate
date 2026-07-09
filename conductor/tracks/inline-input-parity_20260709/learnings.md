# Track Learnings: inline-input-parity_20260709

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

From `conductor/patterns.md` + archived `inline-translate_20260418`:

- Content modules export `init*()` returning cleanup (`initInlineTranslate`, `initTextSelection`, …).
- Inline translate uses `chrome.runtime.sendMessage({ action: 'translateSelection', text, sourceLanguage, targetLanguage })`.
- Nested settings (`inlineTranslate`) need **deepMerge** at `loadSettings`, `updateSettings`, and `chrome.storage.onChanged`.
- `document.execCommand('insertText')` preserves native undo on standard inputs; still dispatch synthetic `input`/`change` for frameworks.
- Capture-phase listeners needed so page handlers (e.g. Google Search) cannot swallow the gesture first; dual window+document + event dedup already used.
- `loadSettings` mocks in tests must include full nested `inlineTranslate` or property access fails.
- Global chrome.commands live in `wxt.config.ts` + `entrypoints/background.ts`; content handles page-local keydowns.
- Adding `ExtensionSettings` fields requires `extractSettings()` in Zustand store or export drops them.

## Seeded from archived track (inline-translate_20260418)

- `setTimeout(0)` after gesture lets the last trigger character land in the field before extract.
- Module-level state must reset in `beforeEach` for Vitest isolation.

## Immersive reference notes (analysis 2026-07-09)

- Listens `input` + `keyup` + `compositionend`, not keydown-only.
- Multi-strategy write with post-write verification.
- Snapshot cancel if field mutates mid-flight.
- Deep active: shadowRoot → iframe → contentEditable caret.
- Default blocklist includes Notion / Figma / Lark-class hosts.
- Prefix `/` + language aliases; trailing space×N still primary fire.

---

<!-- Learnings from implementation will be appended below -->
