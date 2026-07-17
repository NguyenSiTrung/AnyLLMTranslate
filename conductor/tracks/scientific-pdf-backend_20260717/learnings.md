# Track Learnings: scientific-pdf-backend_20260717

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

From `conductor/patterns.md` and archived PDF tracks (`pdf-babeldoc-parity_20260717`, `pdf-composition_20260717`, `pdf-download_20260618`):

- **Fast PDF path stays browser-side** — pdfjs + overlay + pdf-lib; Scientific mode is additive, never replaces Fast when offline.
- **PdfSettings merge** — Options shallow-merges via `...(settings.pdfSettings ?? defaultPdfSettings)`; new Scientific settings should follow the same default/merge discipline (prefer top-level `scientificPdf` or nested consistently with config tests).
- **Provider pool is the single credential source** — inject baseUrl/apiKey/model at job time; do not create a second credential UI (multi-provider-pool patterns).
- **Dual export concept** — dual = original + translated layout; Scientific dual comes from pdf2zh bridge, not from re-implementing dual assembly in-browser for this mode.
- **Privacy / BYOK** — extension does not operate a proxy; Scientific still sends PDF + short-lived keys only to **user-controlled** `serverUrl` (default loopback).
- **AGPL boundary** — depend on pdf2zh at runtime (Docker/pip); do not vendor/embed PDFMathTranslate source into the extension bundle.
- **TDD + AAA** — pure helpers and HTTP clients tested with mocks first; `vi.waitFor` inside `act(async)` can deadlock under React 19 — use bounded poll loops for React tests.
- **Optional interface / fail-open** — new capabilities must not break existing paths when bridge is absent.

Similar archived tracks (reference only, not auto-seeded full learnings):
- `pdf-babeldoc-parity_20260717`
- `pdf-composition_20260717`
- `pdf-download_20260618`
- `pdf-translation_20260612`

---

<!-- Learnings from implementation will be appended below -->

## [2026-07-17] - Phase 1 Task 1.1–1.4: Settings, contract, helpers
- **Implemented:** Top-level `scientificPdf` settings (no credentials); API contract docs; pure URL/loopback/status helpers + Docker one-liner.
- **Files changed:** `types/config.ts`, `types/__tests__/config.test.ts`, `stores/settingsStore.ts`, `docs/scientific-pdf-bridge-api.md`, `services/scientific-pdf-bridge/README.md`, `lib/scientificPdf.ts`, `lib/__tests__/scientificPdf.test.ts`
- **Commit:** `88e7605` (+ follow-up for 1.2/1.3)
- **Learnings:**
  - Patterns: Keep Scientific credentials **out** of settings — inject from pool at job time only (same as multi-provider-pool).
  - Patterns: Default port `17890` (avoid Gradio 7860 clash); shared via `DEFAULT_SCIENTIFIC_PDF_PORT`.
  - Gotchas: `settingsStore` toSettings snapshot must list new top-level keys or export/persist paths drop them.
  - Context: Spec FR-6 top-level `scientificPdf` (not nested under `pdfSettings`).
---

## [2026-07-17] - Phase 3 Task 3.1–3.4: HTTP client + background orchestration
- **Implemented:** `scientificPdfClient` (health/createJob/getJob/downloadMono|Dual/cancelJob), message actions, background handlers that inject pool credentials, loopback `host_permissions`.
- **Files changed:** `lib/scientificPdfClient.ts`, `lib/__tests__/scientificPdfClient.test.ts`, `types/messages.ts`, `services/background.ts`, `services/__tests__/background.scientificPdf.test.ts`, `wxt.config.ts`
- **Commit:** `ee825bb`
- **Learnings:**
  - Patterns: Prefer **base64** for PDF bytes over `chrome.runtime` messaging (structured-clone ArrayBuffer is fragile across contexts; base64 is boring and reliable).
  - Patterns: Resolve first `resolveSlots()` entry after `getPoolReadinessStatus().canTranslate` — same pool source of truth as page translate; never store bridge-side keys on `scientificPdf` settings.
  - Patterns: Map network/abort to stable codes (`offline`, `timeout`, `parse`, `llm_auth`, …) via `ScientificPdfClientError` so UI can CTA without parsing English strings.
  - Patterns: Loopback-only host permissions (`http://127.0.0.1/*`, `http://localhost/*`); custom non-loopback URLs deferred (user grant / optional_host_permissions later). CSP already has `connect-src http: https:`.
  - Gotchas: Background handler tests must **not** `vi.unstubAllGlobals()` if `chrome` was stubbed at module scope — it drops the chrome mock and `loadSettings` falls back to empty-pool defaults (`pool-empty`).
  - Gotchas: `Response.ok` is true for 202/204 (create/cancel); treat non-ok via bridge error JSON body when present.
  - Context: Phase 4 wizard + Phase 5 viewer will call these message actions; client stays free of chrome APIs for unit-testability.
---
