# Track Learnings: ux-power-features_20260422

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- **Architecture**: Message-passing (content ↔ background ↔ popup) via `chrome.runtime.sendMessage`
- **State**: Zustand + `chrome.storage.local` sync via `settingsStore.ts`
- **CSS Strategy**: Vanilla CSS with `data-anyllm-*` attributes for host page injection; Tailwind for extension UI only
- **Testing**: Vitest + Testing Library, AAA pattern, 522 existing tests
- **Content Script**: `defineContentScript` with SPA re-injection guard (`__anyllmTranslateInitialized`)
- **Site Rules**: `SiteRule` interface already has `alwaysTranslate` / `neverTranslate` fields in `types/config.ts`
- **DOM Walker**: `extractPieces(root)` accepts optional root element — can be used for section translation
- **Background Service**: Semaphore-based concurrency (max 3), fire-and-forget stats are safe pattern
- **Settings Update**: `updateSettings(partial)` in `lib/config.ts` for atomic partial updates

---

<!-- Learnings from implementation will be appended below -->
