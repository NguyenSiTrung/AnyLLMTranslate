# Track Learnings: Phase 3 — UX Polish & LLM Provider

## Inherited Learnings
- From Phase 1: Browser APIs (chrome.storage, chrome.tabs) work reliably for state sync.
- From Phase 2: Subtitle interceptor design scales well with registry pattern.

## Phase 3 Learnings

### Type System Architecture
- **Discriminated Unions**: `ThemeName` and `ProviderPreset` as string unions (not enums) keep bundle small and enable exhaustive matching.
- **Default Constants**: Exporting `DEFAULT_SETTINGS` alongside types ensures single source of truth for initial values.
- **Provider Presets Array**: `PROVIDER_PRESETS` with `requiresApiKey`, `placeholder`, `baseUrl`, `defaultModel` enables preset selection UX without hardcoding.

### Zustand + chrome.storage
- **Bidirectional Sync**: Zustand store writes to `chrome.storage.local` on mutation, and listens via `chrome.storage.onChanged` for cross-context updates (popup ↔ options ↔ content).
- **Deep Merge**: Settings merge must handle nested objects (provider, subtitleSettings) separately to avoid losing fields when partial updates come from storage.
- **Init Pattern**: `isLoaded` flag prevents rendering before storage load completes — critical for avoiding flash of defaults.

### CSS Theme System
- **Attribute Scoping**: `[data-lingua-theme="name"]` on `<html>` cleanly scopes themes without class conflicts.
- **Dark Mode Strategy**: Dual approach — `@media (prefers-color-scheme: dark)` for auto mode, `.lingua-dark` class for manual override.
- **Page State Management**: `data-lingua-state` attribute (dual/translation-only/off) controls visibility via CSS only, avoiding JS DOM manipulation.
- **Loading/Error States**: CSS-driven shimmer and error indicators via data attributes keep content script lightweight.

### Options Page Architecture
- **WXT Auto-Discovery**: WXT automatically registers `entrypoints/options/` as the options page — no manifest config needed.
- **Vertical Tabbed Layout**: Sidebar + content area pattern works well at 8+ sections. ARIA `role="tablist"` ensures accessibility.
- **Section Components**: Each section is self-contained, importing from the shared Zustand store. No prop drilling.
- **Provider Test Connection**: 3-step validation (ping → models → translation) with progress callback enables real-time UI updates.

### System Prompt Template
- **Variable Injection**: `{{targetLanguage}}` and `{{glossary}}` template variables via regex replace. Backward compatible — existing `buildSystemPrompt(lang)` calls still work.
- **Validation**: `validatePromptTemplate()` warns about missing critical instructions (JSON format, translations key) without blocking.

### Build Metrics
- Total bundle: 354.66 KB (popup: 7.74KB JS, options: 49.7KB JS)
- 283 tests across 24 test files
- Build time: ~750ms
