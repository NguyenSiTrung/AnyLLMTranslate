# Track Learnings: web-bilingual-quality_20260707

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

From `conductor/patterns.md` — read full file for detail. Key inherited patterns for this track:

- **No `innerHTML` with dynamic text** — use `document.createElement` + `textContent` (hardening-fixes_20260421). Critical for FR-1 rich translate decode.
- **`getCachedTranslation` returns `null` on miss** — guard with `!== null`, not falsy (cache-hardening_20260415). Relevant to FR-4 negative cache.
- **Cache key uses piece `text`** while LLM uses piece `id` (Map key) — retain both (cache-hardening_20260415). Relevant to FR-2 dedup.
- **`chrome.alarms` persist across MV3 service worker restarts** — use for periodic tasks, not `setInterval` (cache-hardening_20260415). Relevant to FR-7 resume eviction.
- **Monotonic session id (captured at issue, re-checked at response)** drops stale async writes (bilingual-display-ux_20260505). Relevant to FR-6 streaming + FR-7 resume restore.
- **String union types (not enums)** for new settings (phase3-ux-polish_20260410).
- **`extractSettings()` + `DEFAULT_SETTINGS` updated together** when adding fields (theme-context_20260422, llm-category-detection_20260504). FR-1 Task 1.1.
- **Attribute scoping** `[data-anyllm-theme]` on `<html>`; CSS custom properties with `!important` overrides for translation-only display (display-mode-fix_20260416).
- **In-place DOM update pattern** for spinner→text swap: find by pieceId → swap class + set textContent → force reflow (para-progress-indicator_20260410). FR-6 streaming reuses this.
- **Pure libs live in `lib/`, tested in `lib/__tests__/`**; TDD encouraged (write test → implement → refine).
- **Bundle-size budget tracking** via `wxt build` before/after (PDF track precedent: streaming added ~documented delta).
- **`vi.waitFor` inside `act(async ...)` deadlocks under React 19** — use manual bounded poll loop (pdf-perf-ux_20260703). Relevant to any new UI tests in Phase 7.

## Analysis Context (from pre-track deep dive)

- **Immersive reference location:** `ImmersiveTransalteExtensionCode/1.30.3_0/content_main.js` (minified) + `default_config.content.json` (readable config) + `styles/inject.css`. Cite attributes/config keys, not minified function names.
- **Immersive rich translate:** inline tags encoded as `<tag id="N">` placeholders; decoders `aR`/`oR` rebuild via regex `<\/?([a-zA-Z0-9-]+)\s*([^<]*?)>` + variable map. Per-service `enableRichTranslate` gate.
- **Immersive batching:** `maxTextGroupLengthPerRequest` (LLMs = 4) + `maxTextLengthPerRequest` (1800); service-specific `translationTextSeparator`.
- **Immersive cache:** IndexedDB, `[text, hostState, isProd, env].join("_")` key, `failureCacheTtlMinutes=120`, `cacheMaxAgeDay=30`, daily eviction.
- **Immersive concurrency:** per-service `concurrencyLimit` (paid 50-100, free 10-20) + throttle `interval` (1000-1350ms) + queue backpressure (`backlogSize`, `retryIntervalMs`).
- **Verified gaps in our code:** `TranslationBatcher` is dead code (grep confirms zero prod imports); `domWalker.ts:167` joins to plain text; `translationDisplay.ts:338,463` inject via `textContent`.

---

<!-- Learnings from implementation will be appended below -->

## [2026-07-07 16:46] - Phase 1 Task 1.1: Foundation settings
- **Implemented:** Added 8 new ExtensionSettings fields + PoolKey.concurrencyLimit/interval; updated DEFAULT_SETTINGS, extractSettings(), migration, factories.
- **Files changed:** types/config.ts, stores/settingsStore.ts, lib/config.ts, entrypoints/options/sections/ProvidersSection.tsx, 11 test fixtures.
- **Commit:** f4a2b29
- **Learnings:**
  - **Pattern confirmed (3-place settings change):** any new ExtensionSettings field MUST be added to (1) interface, (2) DEFAULT_SETTINGS, (3) extractSettings() in settingsStore.ts — else useSettings() silently drops it. SettingsState extends ExtensionSettings so the store type auto-inherits.
  - **PoolKey field addition is viral:** adding required fields to PoolKey forces updating ~30 test-fixture literals across 11 test files. Used a Python script with the `maxRpm: N, enabled:` (PoolKey-unique, since ProviderConfig has no `enabled` and PoolProvider has no `maxRpm`) + `apiKey`-nearby heuristics. The multiline `apiKey` heuristic wrongly hit one ProviderConfig literal (which also has apiKey) — must verify no ProviderConfig gained the fields.
  - **deepMerge(DEFAULT_SETTINGS, loaded)** in loadSettings gives legacy-storage migration for free for the new top-level boolean/number fields — no explicit migration code needed.
  - **Pre-existing tsc errors exist on clean master:** `services/__tests__/subtitlePrompt.test.ts` (8 errors: subtitle knob type mismatches) — left from the test-trim track ALT-t0w. Must exclude these from "clean" assertions.
  - **Real test count is 1403**, not the 2319 in product.md (test suite was trimmed in ALT-t0w; product.md figure stale). Baseline for this track = 1403.

## [2026-07-07 17:03] - Phase 2 (FR-1 Rich translate)
- **Implemented:** New lib/richTranslate.ts (encode/decode inline markup); wired into domWalker/translationDisplay/base prompt/content.ts.
- **Files changed:** lib/richTranslate.ts, lib/__tests__/richTranslate.test.ts, types/translation.ts, content/domWalker.ts, content/translationDisplay.ts, services/base.ts, entrypoints/content.ts, content/__tests__/translationDisplay.test.ts.
- **Commit:** 4a0020f
- **Learnings:**
  - **Rich translate integration is subtle re: the anchor scope:** the piece's `anchorElement.innerHTML` may be larger than the piece's text-node span (multi-piece splits share an anchor). Solution: only attach variables when there's a single piece per anchor (no sentence split), so placeholder ids stay aligned. Long pieces degrade to plain text — safe.
  - **`inlineEl.title` must stay the RAW translatedText, NOT the formatted displayText.** `getInlineTranslationText()` (clone logic) prefers the `title` attribute and relies on it being the clean unwrapped text to strip parens. Setting title to `formatInlineText(...)` broke the inline-clone test (got `(Văn bản ngắn)` instead of `Văn bản ngắn`).
  - **`existing.replaceChildren(node)` is the modern API** for swapping a child node (vs `textContent=`) when injecting a DocumentFragment or element. Use `cloneNode(true)` if reusing the same fragment across the in-place + create paths.
  - **DOM-using lib tests need `@vitest-environment jsdom` docblock** (per-file) since `lib/__tests__` defaults to node env. Pattern matches `services/__tests__/background.urlAllowlist.test.ts`.
  - **Manual HTML tokenizer over DOMParser** for encodeInlineHtml: a regex TAG scanner with a stack handles nested inline elements + attribute preservation reliably and deterministically; avoids DOMParser quirks. Decode uses a recursive `<z id="N">…</z>` scanner that builds safe elements via createElement.
