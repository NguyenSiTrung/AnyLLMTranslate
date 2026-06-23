# Track Learnings: openai-provider-catalog_20260623

## Codebase Patterns (Inherited)

- providerTester GET {baseUrl}/models — reuse for on-demand picker.
- Single preset custom; catalog IDs not new enum values.
- updateProvider + connectionStatus unknown on URL/model changes.

---

## [2026-06-23] — Implementation complete

- **Implemented:** `OPENAI_COMPATIBLE_CATALOG`, `filterCatalog`, `listProviderModels`, `ProviderCatalogPicker`, `ModelPicker`; wired into ProviderSection and SetupWizard.
- **Files changed:** `lib/openAiCompatibleCatalog.ts`, `services/providerTester.ts`, `entrypoints/options/components/*`, section/wizard tests.
- **Learnings:**
  - Patterns: `resolveCatalogSelection` preserves API key; catalog placeholder replaces `PROVIDER_PRESETS` lookup for custom flow.
  - Gotchas: Vitest may surface pre-existing `usePdfDownload` teardown error after full suite.
