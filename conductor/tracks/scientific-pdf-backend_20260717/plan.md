# Plan: Scientific PDF Backend (Layout-Preserving)

**Track:** `scientific-pdf-backend_20260717`  
**Spec:** [spec.md](./spec.md)  
**Methodology:** TDD — tests with or before implementation; commit per task when practical.  
**Execution:** Phase 1 sequential; **Phase 2 ∥ Phase 3** after Phase 1; then 4 → 5 → 6 sequential  
**Predecessors:** `pdf-babeldoc-parity_20260717`, `pdf-composition_20260717` (Fast path stays)

---

## Phase 1: Settings, types, and API contract
<!-- execution: sequential -->
<!-- depends: -->

- [x] **Task 1.1: Define Scientific PDF settings + defaults + migration tests**
  <!-- files: types/config.ts, types/__tests__/config.test.ts -->
  - [x] Extend settings with `scientificPdf: { enabled, serverUrl, preferScientific, setupCompletedAt? }`
  - [x] Defaults: enabled false, loopback server URL, preferScientific false
  - [x] Merge/migration: missing field → defaults; no credentials stored here
  - [x] Tests for defaults and partial load
  - Commit: `88e7605`

- [x] **Task 1.2: Document bridge HTTP API contract (OpenAPI-ish markdown)**
  <!-- files: docs/scientific-pdf-bridge-api.md, services/scientific-pdf-bridge/README.md -->
  - [x] `GET /health`, `POST /v1/jobs`, `GET /v1/jobs/:id`, mono/dual download, optional DELETE
  - [x] Job payload: file + baseUrl, apiKey?, model, lang_in, lang_out
  - [x] Error shape + progress fields

- [x] **Task 1.3: Shared pure helpers (URL validation, loopback check, readiness)**
  <!-- files: lib/scientificPdf.ts, lib/__tests__/scientificPdf.test.ts -->
  - [x] Normalize server URL; isLoopback; soft-warn non-loopback
  - [x] Status enum: not_configured | offline | ready
  - [x] Default port constant shared with Docker docs

- [x] **Task 1.4: Phase 1 verification**
  - [x] Config + helper unit tests green
  - [x] Capture learnings

---

## Phase 2: Thin Docker bridge (pdf2zh orchestrator)
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [x] **Task 2.1: Scaffold bridge service (not full PDFMathTranslate clone)**
  <!-- files: services/scientific-pdf-bridge/** -->
  - [x] Minimal HTTP app matching contract (e.g. FastAPI/Flask)
  - [x] Depend on `pdf2zh` package / call `translate_stream` with per-job OPENAI_* env
  - [x] Job store (in-memory + disk temp) with TTL cleanup
  - [x] No git submodule of PDFMathTranslate source
  - Commit: `c70b416`

- [x] **Task 2.2: Health + job lifecycle + mono/dual artifacts**
  <!-- files: services/scientific-pdf-bridge/** -->
  - [x] Map active provider fields → openai/openailiked service
  - [x] Progress reporting if pdf2zh exposes it; else coarse states
  - [x] Return mono + dual paths; fail with clear error if LLM rejects

- [x] **Task 2.3: Dockerfile + one-liner + compose example**
  <!-- files: services/scientific-pdf-bridge/Dockerfile, docker-compose.scientific-pdf.yml -->
  - [x] `docker run -d -p <port>:<port> …` documented
  - [x] First-run model download note
  - [x] Bridge unit/smoke tests where practical (mock pdf2zh)

- [x] **Task 2.4: Phase 2 verification**
  - [x] Local smoke: health + mock/fake translate path if full model too heavy in CI
  - [x] Capture learnings (AGPL boundary: call package, don’t vendor source)

---

## Phase 3: Extension HTTP client + background wiring
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [x] **Task 3.1: TDD — Scientific PDF client**
  <!-- files: lib/scientificPdfClient.ts, lib/__tests__/scientificPdfClient.test.ts -->
  - [x] health(), createJob(), getJob(), downloadMono/Dual with fetch mocks
  - [x] Timeout / abort / parse errors
  - Commit: `ee825bb`

- [x] **Task 3.2: Resolve active provider for jobs**
  <!-- files: entrypoints/background.ts, types/messages.ts (as needed) -->
  - [x] Background message(s) for scientific PDF job orchestration
  - [x] Inject pool baseUrl/apiKey/model + langs from settings
  - [x] Never persist bridge-side credentials beyond existing pool

- [x] **Task 3.3: MV3 host permission strategy**
  <!-- files: wxt.config.ts -->
  - [x] Support default loopback; optional_host_permissions or documented strategy for custom URL
  - [x] Tests or checklist for localhost fetch from extension context

- [x] **Task 3.4: Phase 3 verification**
  - [x] Client + message handler tests
  - [x] Capture learnings

---

## Phase 4: Setup wizard + Options UI
<!-- execution: sequential -->
<!-- depends: phase3 -->

- [x] **Task 4.1: TDD — wizard state machine**
  <!-- files: lib/scientificPdfWizard.ts, lib/__tests__/scientificPdfWizard.test.ts -->
  - [x] Steps: intro → install → poll → test → done
  - [x] Transitions on health success/fail; reset
  - Commit: `f606572`

- [x] **Task 4.2: Options — Scientific PDF card**
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->
  - [x] Status badge, enable toggle, serverUrl, “Set up…” opens wizard
  - [x] Non-loopback warning; copy Docker one-liner
  - [x] Privacy note (PDF + credentials to serverUrl)

- [x] **Task 4.3: Wizard UI component**
  <!-- files: entrypoints/options/ (wizard modal/components) -->
  - [x] Poll /health; Test connection; mark setupCompletedAt
  - [x] Accessible, consistent with setup wizard patterns

- [x] **Task 4.4: Phase 4 verification**
  - [x] Component + pure wizard tests
  - [x] Capture learnings

---

## Phase 5: PDF viewer Scientific mode
<!-- execution: sequential -->
<!-- depends: phase3, phase4 -->

- [x] **Task 5.1: Mode toggle Fast vs Scientific**
  <!-- files: entrypoints/pdf-viewer/App.tsx -->
  - [x] Explicit control; Scientific disabled when offline with CTA to wizard/setup
  - [x] preferScientific only pre-selects when Ready

- [x] **Task 5.2: Job progress UX + downloads**
  <!-- files: entrypoints/pdf-viewer/hooks/useScientificPdfJob.ts, entrypoints/pdf-viewer/components/ -->
  - [x] Progress modal; cancel if supported
  - [x] Download mono + dual; open dual in viewer (mono fallback)

- [x] **Task 5.3: Wire current PDF bytes + languages + pool via background**
  <!-- files: entrypoints/pdf-viewer/, entrypoints/background.ts -->
  - [x] End-to-end path with mocked client in unit tests
  - [x] Fail-open messaging if job fails

- [x] **Task 5.4: Phase 5 verification**
  - [x] Viewer-related unit tests
  - [x] Capture learnings

---

## Phase 6: Privacy docs, README, hardening, ship gate
<!-- execution: sequential -->
<!-- depends: phase2, phase5 -->

- [x] **Task 6.1: Privacy + README user docs**
  <!-- files: PRIVACY.md, README.md, services/scientific-pdf-bridge/README.md -->
  - [x] Scientific mode data flow; loopback recommendation
  - [x] One-liner install; troubleshooting offline / first model download

- [x] **Task 6.2: Hardening**
  - [x] No API keys in bridge logs; job TTL cleanup
  - [x] Soft-block/confirm non-loopback serverUrl
  - [x] Ensure Fast path untouched when bridge absent

- [x] **Task 6.3: Full quality gate**
  - [x] `pnpm test` / `pnpm lint` / compile for extension
  - [x] Bridge smoke as documented
  - [x] Elevate learnings to patterns.md if reusable

- [x] **Task 6.4: Track completion checklist**
  - [x] All acceptance criteria checked against spec
