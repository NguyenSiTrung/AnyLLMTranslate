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
