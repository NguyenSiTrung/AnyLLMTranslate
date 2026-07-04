# Plan: Providers Tab UX Refactor

**Track:** providers-ux-refactor_20260704
**Methodology:** TDD (test → implement → refine), commit per task
**Execution:** Sequential (UI coherence > wall-clock; Phases 2/3/6 share `ProviderCard.tsx`)

---

## Phase 1: Structural Foundation — File Split (FR-1)
<!-- execution: sequential -->
<!-- depends: -->

- [x] Task 1: Extract `useConnectionTest` hook → `hooks/useConnectionTest.ts`
  <!-- files: entrypoints/options/hooks/useConnectionTest.ts -->
- [x] Task 2: Extract `ProviderTestResult` shared component (dedupes failure/success UI from KeyRow + ProviderConnectionTest)
  <!-- files: entrypoints/options/components/ProviderTestResult.tsx -->
- [x] Task 3: Extract `ProviderConnectionTest` → `components/ProviderConnectionTest.tsx` (uses ProviderTestResult + useConnectionTest)
  <!-- files: entrypoints/options/components/ProviderConnectionTest.tsx -->
- [x] Task 4: Extract `ProviderKeyRow` → `components/ProviderKeyRow.tsx` (uses ProviderTestResult + useConnectionTest)
  <!-- files: entrypoints/options/components/ProviderKeyRow.tsx -->
- [x] Task 5: Extract `ProviderCard` → `components/ProviderCard.tsx` (header + body shell; orchestrates KeyRow, ModelPicker, picker, connection test)
  <!-- files: entrypoints/options/components/ProviderCard.tsx -->
- [x] Task 6: Extract `AddProviderModal` (mechanical move; full rebuild in Phase 4)
  <!-- files: entrypoints/options/components/AddProviderModal.tsx -->
- [x] Task 7: Slim `ProvidersSection.tsx` to orchestrator (banner + list + modals); re-export `countEnabledKeys`, `getPoolReadiness` for popup backward-compat
  <!-- files: entrypoints/options/sections/ProvidersSection.tsx -->
- [x] Task 8: Update existing tests for new import paths; verify all pass with zero behavioral change
  <!-- files: entrypoints/options/__tests__/ProvidersSection.test.tsx -->
- [x] Task: Conductor - User Manual Verification 'Structural Foundation' (Protocol in workflow.md)

## Phase 2: Provider Identity & Header Redesign (FR-2, FR-3, FR-4)
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [x] Task 1: Extend `OpenAiCompatibleCatalogEntry` with optional `accent` + `monogram`; populate all 9 entries per spec table
  <!-- files: lib/openAiCompatibleCatalog.ts, lib/__tests__/openAiCompatibleCatalog.test.ts -->
- [x] Task 2: Create `ProviderIdentityBadge` component (monogram + accent tokens; zinc fallback for custom)
  <!-- files: entrypoints/options/components/ProviderIdentityBadge.tsx, entrypoints/options/components/__tests__/ProviderIdentityBadge.test.tsx -->
- [x] Task 3: Promote test status — replace `w-2 h-2` dot with Badge (CheckCircle2/XCircle + label + age) in `ProviderCard` header
  <!-- files: entrypoints/options/components/ProviderCard.tsx -->
- [x] Task 4: Two-zone header re-layout (identity left, meta+chevron right); drop redundant on/off Badge from header
  <!-- files: entrypoints/options/components/ProviderCard.tsx -->
- [x] Task 5: Update existing tests for new header DOM; add tests for badge color/label/age fallback
  <!-- files: entrypoints/options/__tests__/ProvidersSection.test.tsx -->
- [x] Task: Conductor - User Manual Verification 'Provider Identity & Header' (Protocol in workflow.md)

## Phase 3: Body UX — Advanced Disclosure + Collapse Picker (FR-5, FR-6)
<!-- execution: sequential -->
<!-- depends: phase2 -->

- [x] Task 1: Add `AdvancedDisclosure` primitive to shared UI (chevron button + `aria-expanded` + `role="region"` + collapsible)
  <!-- files: ui/AdvancedDisclosure.tsx, ui/__tests__/AdvancedDisclosure.test.tsx -->
- [x] Task 2: Move Temperature + MaxTokens behind disclosure in `ProviderCard`; default collapsed
  <!-- files: entrypoints/options/components/ProviderCard.tsx -->
- [x] Task 3: Collapse catalog picker behind "Change template" button when `catalogId !== 'custom'`; reveal on click, re-collapse on select
  <!-- files: entrypoints/options/components/ProviderCard.tsx -->
- [x] Task 4: Tests — disclosure default collapsed, expand reveals sliders, picker collapse/expand for configured vs custom provider
  <!-- files: entrypoints/options/__tests__/ProvidersSection.test.tsx -->
- [x] Task: Conductor - User Manual Verification 'Body UX' (Protocol in workflow.md)

## Phase 4: AddProviderModal Rebuild (FR-7)
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [x] Task 1: Add `category: 'cloud' | 'local' | 'custom'` field to catalog entries; `groupByCategory()` helper
  <!-- files: lib/openAiCompatibleCatalog.ts, lib/__tests__/openAiCompatibleCatalog.test.ts -->
- [x] Task 2: Rebuild `AddProviderModal` — search input + grouped list (Cloud/Local/Custom dividers) + identity badges + proper Modal children slot (not `message` prop)
  <!-- files: entrypoints/options/components/AddProviderModal.tsx -->
- [x] Task 3: Tests — search filtering by name/keyword, category grouping renders dividers, selection fires `onPick(catalogId)`, identity badge per row
  <!-- files: entrypoints/options/__tests__/AddProviderModal.test.tsx -->
- [x] Task: Conductor - User Manual Verification 'AddProvider Modal' (Protocol in workflow.md)

## Phase 5: Parallel Bulk Test (FR-8)
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [x] Task 1: Add pure `runWithConcurrency<T>(items, worker, cap)` helper with fake-timer-friendly `delay()`
  <!-- files: lib/concurrency.ts, lib/__tests__/concurrency.test.ts -->
- [x] Task 2: Rewrite `handleTestAll` to run slots in parallel (cap 4) via helper; update each key's `lastTestResult` live as each resolves
  <!-- files: entrypoints/options/sections/ProvidersSection.tsx -->
- [x] Task 3: Add live N/M counter to banner button while bulk testing
  <!-- files: entrypoints/options/sections/ProvidersSection.tsx -->
- [x] Task 4: Tests — concurrency cap respected (max 4 in-flight), per-row live updates, N/M counter increments, aggregate toast on completion
  <!-- files: entrypoints/options/__tests__/ProvidersSection.test.tsx -->
- [x] Task: Conductor - User Manual Verification 'Parallel Bulk Test' (Protocol in workflow.md)

## Phase 6: Input Debouncing — Commit-on-Blur (FR-10)
<!-- execution: sequential -->
<!-- depends: phase3 -->

- [x] Task 1: Add `useDeferredCommit(initial, onCommit)` hook (local state + commit on blur, sync when prop changes externally e.g. reset)
  <!-- files: entrypoints/options/hooks/useDeferredCommit.ts, entrypoints/options/hooks/__tests__/useDeferredCommit.test.ts -->
- [x] Task 2: Apply to API key (KeyRow), display name + base URL (Card), label (KeyRow); immediate visible update, deferred store write
  <!-- files: entrypoints/options/components/ProviderKeyRow.tsx, entrypoints/options/components/ProviderCard.tsx -->
- [x] Task 3: Test — store write fires once on blur (not per keystroke); external reset propagates; maxRpm unchanged
  <!-- files: entrypoints/options/__tests__/ProvidersSection.test.tsx -->
- [x] Task: Conductor - User Manual Verification 'Input Debouncing' (Protocol in workflow.md)

## Phase 7: System Prompt Relocation (FR-9)
<!-- execution: sequential -->
<!-- depends: phase5 -->

- [x] Task 1: Add "Translation System Prompt" card to `AdvancedSection` (same FieldGroup + textarea + validation + Reset to Default)
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->
- [x] Task 2: Remove System Prompt card from `ProvidersSection`; add `onNavigateToAdvanced` prop + "Edit system prompt →" link in readiness banner
  <!-- files: entrypoints/options/sections/ProvidersSection.tsx -->
- [x] Task 3: Wire `App.tsx` — pass `onNavigateToAdvanced={() => setActiveTab('advanced')}`
  <!-- files: entrypoints/options/App.tsx -->
- [x] Task 4: Move/rewrite tests; verify prompt still persists + validates + Reset works from new location
  <!-- files: entrypoints/options/__tests__/ProvidersSection.test.tsx, entrypoints/options/__tests__/AdvancedSection.test.tsx -->
- [x] Task: Conductor - User Manual Verification 'System Prompt Relocation' (Protocol in workflow.md)

## Phase 8: Final Verification & Build Gate
<!-- execution: sequential -->
<!-- depends: phase6, phase7 -->

- [x] Task 1: Full `pnpm test --run` — 0 failures (existing assertions updated where labels changed)
- [x] Task 2: `tsc --noEmit` clean; `pnpm lint` — no new errors beyond 2 pre-existing
- [x] Task 3: `wxt build` — verify success and bundle delta < +2 KB
- [x] Task 4: Manual smoke test of Providers tab end-to-end (add provider, edit fields, test single key, bulk test with N/M counter, advanced disclosure, change-template flow, system prompt nav to Advanced)
- [x] Task: Conductor - User Manual Verification 'Final Verification' (Protocol in workflow.md)
