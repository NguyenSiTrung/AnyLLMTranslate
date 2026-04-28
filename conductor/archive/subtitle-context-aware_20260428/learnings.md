# Track Learnings: subtitle-context-aware_20260428

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

### Context-Aware Translation (from: theme-context_20260422)
- `PageContext` extraction should be <10ms: only DOM queries (title, meta, hostname), zero network calls.
- Domain-to-category heuristic map for ~30 top domains — no LLM call needed for detection.
- `buildSystemPrompt()` signature extension with optional `pageContext` preserves backward compatibility for all existing callers (subtitle translation, selection translation).
- Only append the context block when at least one field is non-empty to avoid adding noise to the prompt.

### Category Override & Two-Layer Resolution (from: category-override_20260423)
- Tab-scoped in-memory store: `Map<tabId, string>` with `chrome.tabs.onRemoved` cleanup for per-tab override state that doesn't persist across service worker restarts.
- Nullish coalescing for priority chains: `tabOverride ?? siteRuleCategory ?? autoDetected` is O(1) and readable for N-level fallback hierarchies.
- Popup -> Background -> Content forwarding: popup sends `setCategoryOverride` to background, background stores + forwards `categoryChanged` to content tab for immediate effect.
- Export shared data maps for cross-component reuse: `DOMAIN_CATEGORY_MAP` exported from `pageContext.ts` for auto-suggest in SiteRule editor — avoid duplicating domain knowledge.

### Subtitle & Interception (from: phase2-subtitles_20260409)
- postMessage bridge uses channel identifier ('anyllm-translate') with origin validation and requestId correlation for MAIN <-> ISOLATED world communication.
- Fetch interceptor must call `response.clone()` before `.text()` — Response body can only be read once.

### Testing
- Coordinator test pattern: call `vi.resetModules()` BEFORE import in `beforeEach`, then call `startCoordinator()` explicitly after import.
- ESLint: `no-non-null-assertion` forbids `handler!()`. `no-unused-expressions` forbids `&&`-chained awaits. Always use an `if`.
- PostMessage Bridge Correlation: Any 'response' message (e.g., `SUBTITLE_TRANSLATED`) MUST carry the same `requestId` as its corresponding 'request' message. Never auto-generate a new `requestId`.

---

## Implementation Learnings (2026-04-28)

### Subtitle Context-Aware Wiring
- The subtitle coordinator (`content/subtitleCoordinator.ts`) runs in the ISOLATED content script world, same as the page text translation pipeline. It can reuse the same `extractPageContext()` and `resolveCategory()` helpers.
- Tab-scoped category overrides are maintained locally in the coordinator's state (not fetched from background on every translation) — the background forwards `categoryChanged` messages to the content script, which updates the coordinator's internal state.
- Site rules are resolved locally by calling `findMatchingRule(hostname, settings.siteRules)` — `settings.siteRules` is available via `loadSettings()` in the content script.
- `pageContext` is built once per translation request (both `handleIntercepted` and `activateOverlayMode` paths) and sent with the `translateSubtitle` message. The background handler simply forwards it to `service.translate()`.

### Backward Compatibility
- Adding `pageContext?: PageContext` to `TranslateSubtitleMessage` is fully backward compatible — all existing callers without the field continue to work, and the background handler treats it as `undefined`.
- No changes needed to `buildSystemPrompt()` or `openaiCompatible.ts` — they already accept `pageContext` from the `TranslationRequest` interface.

### Testing Patterns
- Coordinator tests use `vi.resetModules()` + dynamic `import()` to reset singleton state between test blocks.
- Mocking `extractPageContext` and `resolveCategory` via `vi.mock('@/content/utils/pageContext')` requires hoisting the mock variables to module level.
- Background subtitle tests verify `pageContext` forwarding by inspecting the LLM request body via `fetchMock.mock.calls[0][1].body`.

## Gotchas
- `PageContext.description` is required by the type, so test fixtures must include it even when empty string.
- The `activateOverlayMode` path calls `buildSubtitlePageContext()` independently — both interception and overlay paths must include context.
- `chrome.runtime.sendMessage` mock must return a resolved Promise for the coordinator's `await` to work.

## Test Coverage
- 703 tests passing across 55 files (up from 697/55 at track start).
- New tests added: 6 (3 coordinator context tests + 2 background forwarding tests).
- Zero regressions in existing subtitle tests.

## Build Health
- `pnpm test`: 703/703 passing
- `pnpm lint`: 0 errors, 0 warnings
