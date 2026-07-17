# Spec: Scientific PDF Backend (Layout-Preserving)

**Track type:** Feature  
**Working title:** Optional Scientific PDF mode via local PDFMathTranslate bridge  
**Track ID:** `scientific-pdf-backend_20260717`

## Overview

Add an **optional “Scientific layout”** PDF path that uses a **local Docker bridge** wrapping [PDFMathTranslate / pdf2zh](https://github.com/PDFMathTranslate/PDFMathTranslate) for layout-preserving scientific document translation, while:

- Reusing the **same provider pool** as the main extension (baseUrl / apiKey / model per job)
- Keeping the existing **in-browser Fast PDF** path as the default and always-available fallback
- Guiding install with an **in-extension setup wizard** (Docker one-liner + health poll + connection test)
- **Not** cloning or vendoring the full PDFMathTranslate monorepo into AnyLLMTranslate

Privacy model: PDFs and API keys leave the browser **only** when the user opts into Scientific mode and sends a job to a server URL they control (default `http://127.0.0.1:<port>`).

## Decisions (from track intake)

| Topic | Choice |
|-------|--------|
| Scope | Full path: bridge + client + wizard + same provider + viewer mode |
| Credentials | Per-job from extension active pool (no second credential store) |
| Setup | Docker one-liner + health poll |
| Viewer UX | Explicit Fast vs Scientific; offline fallback to Fast |
| Output | Dual + mono download; open dual in extension viewer |

## Functional Requirements

### FR-1 — Thin local orchestrator (bridge)

1. Ship a small bridge (Docker image + optional compose) that depends on **pdf2zh as a package/image**, not a git submodule of PDFMathTranslate source.
2. Expose a minimal HTTP API (suggested):
   - `GET /health` → readiness (process up; optionally report pdf2zh/model status)
   - `POST /v1/jobs` → multipart PDF + JSON job config → job id
   - `GET /v1/jobs/:id` → state + progress
   - `GET /v1/jobs/:id/mono` → monolingual translated PDF
   - `GET /v1/jobs/:id/dual` → bilingual dual PDF
   - Optional: `DELETE /v1/jobs/:id` cancel/cleanup
3. Job config **must** accept per-request LLM credentials from the extension:
   - `baseUrl` (OpenAI-compatible, ends with `/v1`)
   - `apiKey` (optional for keyless local providers)
   - `model`
   - `lang_in`, `lang_out` (from extension language settings)
4. Bridge maps credentials to pdf2zh OpenAI / openailiked envs for that job only; **does not** require user to edit `config.json` or shell env for keys.
5. Document port default, one-liner `docker run`, and first-run model download expectations.

### FR-2 — Same provider as main flow

1. Scientific jobs use the **currently selected active pool provider + key** (same resolution path as other translate paths).
2. No second provider/credential UI for Scientific mode.
3. If the pool is not ready (no provider / invalid key), block Scientific translate with the same readiness messaging used elsewhere.
4. Languages for the job come from extension General language settings (source/target).

### FR-3 — Extension client

1. Pure TypeScript client for health, create job, poll progress, download mono/dual.
2. Default server URL `http://127.0.0.1:<port>`; configurable in settings.
3. Timeouts, cancel, and clear error mapping (server offline, job failed, auth to LLM failed).
4. Progress UI (modal or panel) during long jobs.

### FR-4 — Setup wizard (low friction)

1. Entry points: Options (PDF / Scientific PDF card) and PDF viewer when Scientific is unavailable.
2. Steps: Intro → Install (Docker one-liner, copy/open) → Start & health poll → Test connection (optional sample or health-only) → Done.
3. Persist `setupCompletedAt` / enabled flag; status badge: Not installed | Offline | Ready.
4. **Out of wizard:** auto-start Docker, native messaging helper, cloning GitHub, manual OPENAI_* setup.

### FR-5 — PDF viewer UX

1. Explicit mode: **Fast (browser)** vs **Scientific (layout)**.
2. Scientific control enabled only when `GET /health` succeeds (or last-known healthy within a short TTL + retry).
3. If offline: disable Scientific with CTA “Set up / Start server” → wizard.
4. On success: offer **download mono + dual**; **open dual** in the extension PDF viewer (fallback open mono if dual missing).
5. Fast path remains unchanged and is always available.

### FR-6 — Settings

```ts
scientificPdf: {
  enabled: boolean;
  serverUrl: string;          // default loopback
  preferScientific: boolean;  // UI preference only; does not force when offline
  setupCompletedAt?: string;
}
// No apiKey / baseUrl / model here — always from active provider pool
```

Surface under Options → Advanced → PDF Translator (or adjacent card), consistent with existing PDF settings UX.

### FR-7 — Privacy & security

1. Document that Scientific mode sends the full PDF + short-lived credentials to `serverUrl`.
2. Default and recommended URL is loopback only.
3. Warn (or soft-block with confirm) if `serverUrl` is non-loopback (remote key/PDF risk).
4. Bridge should not log full API keys; job artifacts cleaned up after TTL or download.

## Non-Functional Requirements

- **NFR-1:** Do not increase extension bundle with Python/ONNX; bridge is optional external process.
- **NFR-2:** AGPL: do not embed/modify pdf2zh source into the extension bundle; depend via Docker/pip at runtime; our bridge code is a thin wrapper that shells/calls pdf2zh APIs (do not vendor full PDFMathTranslate tree).
- **NFR-3:** TDD for extension client, settings, wizard state machine, readiness mapping; bridge unit tests for job mapping / health where practical.
- **NFR-4:** Fail-open to Fast path; never break existing PDF viewer when bridge is absent.
- **NFR-5:** Host permissions: request only what is needed for user-configured server URL (loopback-friendly; document any host_permissions / optional_host_permissions strategy for MV3).

## Acceptance Criteria

- [ ] User with Docker can complete wizard using only the in-extension flow + one `docker run` (or compose) command and reach **Ready**.
- [ ] Scientific job uses the **same** active provider credentials as a normal page/PDF Fast translate without re-entering keys.
- [ ] Successful job yields downloadable **mono** and **dual** PDFs; dual opens in the extension viewer.
- [ ] With bridge stopped, Fast path still works; Scientific is disabled with a clear recovery path.
- [ ] No PDFMathTranslate full source tree is cloned into this monorepo as a submodule.
- [ ] Privacy copy documents PDF + credential handling for Scientific mode.
- [ ] Unit tests cover client parsing, settings defaults/migration, and wizard/status helpers; `pnpm test` / lint gates for extension code pass.

## Out of Scope

- Vendoring or forking the full PDFMathTranslate / BabelDOC codebase into the extension
- Auto-installing Docker Desktop / starting containers without user action
- Native Messaging helper (possible follow-up)
- Remote multi-tenant public Scientific SaaS operated by AnyLLMTranslate
- Replacing the in-browser Fast PDF pipeline
- Glossary / term-memory parity with browser PDF (nice-to-have follow-up)
- Non-Docker install scripts as primary path (docs-only optional mention OK)
