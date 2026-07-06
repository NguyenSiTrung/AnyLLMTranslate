# Plan: Advanced Tab UX Refactor

**Track ID:** `advanced-ux-refactor_20260706`
**Spec:** `conductor/tracks/advanced-ux-refactor_20260706/spec.md`

**Execution mode:** Sequential. Nearly every task edits `entrypoints/options/sections/AdvancedSection.tsx`, so file-level parallelism would conflict. Phase 1's primitive/helper work is the only independent leaf work, and even its consumer lands in the shared section file.

**Workflow:** TDD encouraged (write/adjust test → implement → refine). Commit after each task with a task reference. Run `pnpm test`, `pnpm lint`, `tsc --noEmit` at each phase boundary (see `conductor/workflow.md` Definition of Done). Mirror the leaf-first ordering used by `providers-ux-refactor` (pure helpers → shared primitives → orchestrator edits).

**Benchmark patterns:** `subtitles-ux-refactor_20260706` (hero strip, `DisabledDimmer`, `AdvancedDisclosure`, override badges, stagger) and `providers-ux-refactor_20260704` (`useDeferredCommit`, `AdvancedDisclosure`, file split). Reuse their primitives — do not reinvent.

---

## Phase 1: Shared Primitives & Helpers (FR-5, FR-8, FR-9)
<!-- execution: sequential -->

- [x] Task 1.1: Extract `ui/Textarea.tsx` from the System Prompt editor's hand-rolled classes
  - Create `ui/Textarea.tsx`: a shared multiline input mirroring `ui/Input`'s API (`id`, `value`, `onChange`, `error`, `hint`, `className`, rows, `font-mono` opt). Reuse the exact classes currently inlined in `AdvancedSection.tsx` (`bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500`).
  - Add `ui/__tests__/Textarea.test.tsx` (renders, forwards id, shows error/hint).
  <!-- files: ui/Textarea.tsx, ui/__tests__/Textarea.test.tsx -->

- [x] Task 1.2: Add a `useCacheStats` hook (or pure helper) wrapping `getCacheStats()`
  - Create `entrypoints/options/hooks/useCacheStats.ts`: returns `{ entryCount, sizeMb, loading, refresh }`; queries `getCacheStats()` from `services/cacheManager.ts` on mount; `refresh()` re-queries. Options page runs in extension context, so `cacheManager` (idb-keyval) works directly — no background message needed. Format `sizeMb = totalSizeBytes / (1024*1024)`.
  - Add `entrypoints/options/hooks/__tests__/useCacheStats.test.ts` (mock `cacheManager.getCacheStats`, assert initial load + refresh). Note `vitest.config.ts` `environmentMatchGlobs` must cover `entrypoints/options/hooks/**` (jsdom) — verify/add if the first hook test here fails with "document is not defined" (gotcha from `providers-ux-refactor`).
  <!-- files: entrypoints/options/hooks/useCacheStats.ts, entrypoints/options/hooks/__tests__/useCacheStats.test.ts, vitest.config.ts -->

- [x] Task 1.3: Verify Phase 1 compiles + tests green; commit
  <!-- verify: pnpm test ui entrypoints/options/hooks; tsc --noEmit -->

- [ ] Task: Conductor - User Manual Verification 'Shared Primitives & Helpers' (Protocol in workflow.md)

---

## Phase 2: DRY Migration (FR-9) + a11y fix
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [x] Task 2.1: Migrate the 4 number inputs to `useDeferredCommit`
  - Replaced the 4× (`useState` + sync `useEffect` + `useCallback` blur handler) blocks with `useDeferredCommit(settings.X, (v) => updateSettings({ X: v }))`. Validation lives in thin blur wrappers (set/clear error, `commit()` only if valid); `onCommit` is just the store write. Deleted the manual sync `useEffect` (the hook syncs on `initial` change). Dropped per-field success toasts (sidebar "Auto-saved" badge covers it) — matches providers-ux-refactor.
  - Existing blur-still-commits / error assertions stayed valid unchanged.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx, entrypoints/options/__tests__/AdvancedSection.test.tsx -->
  Commit: 2f34b38

- [x] Task 2.2: Replace inline dimmer with `DisabledDimmer`; pass `disabled` to inner controls (a11y fix)
  - Replaced the inline `opacity-40 pointer-events-none` div with `<DisabledDimmer disabled={!settings.enableContextAwareTranslation} className="pt-4 border-t border-zinc-800 space-y-4">`; passed `disabled={!settings.enableContextAwareTranslation}` to the LLM-detection `Toggle` and the Detection Mode `Select`. Fixes NFR-4 a11y defect (dimmed controls were keyboard-operable).
  - Added test: when Context-Aware is off, the LLM-detection toggle is `toBeDisabled()`.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx, entrypoints/options/__tests__/AdvancedSection.test.tsx -->
  Commit: 2f34b38

- [x] Task 2.3: Verify Phase 2 green; commit
  <!-- verify: pnpm test AdvancedSection (31/31); tsc --noEmit clean; eslint clean -->
  Commit: 2f34b38

- [ ] Task: Conductor - User Manual Verification 'DRY Migration + a11y fix' (Protocol in workflow.md)

---

## Phase 3: Information Architecture Restructure (FR-1, FR-2, FR-7)
<!-- execution: sequential -->
<!-- depends: phase2 -->

- [x] Task 3.1: Merge Rate Limiting into Performance & Caching → "Performance & Throughput"
  - Removed the standalone Rate Limiting card; Max RPM `FieldGroup` moved into the Performance card below the three cache fields, separated by `border-t border-zinc-800 pt-5`. Renamed title to "Performance & Throughput". Removed the Clear Cache button from this card (moves to Danger Zone). Stagger renumbered.
  - Updated test: "Rate Limiting" card-text assertion removed; Max RPM still queryable by label; "Performance & Caching" → "Performance & Throughput".
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx, entrypoints/options/__tests__/AdvancedSection.test.tsx -->

- [x] Task 3.2: Split "Data & Developer Tools" into "Data Portability" + "Developer"
  - "Data Portability" card: Export/Import buttons. "Developer" card (standalone, `Wrench` icon): Debug Mode toggle. Removed the `border-t` split. (No existing test asserted "Data & Developer Tools".)
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->

- [x] Task 3.3: Add "Danger Zone" card; move Clear Cache + Reset All into it
  - New "Danger Zone" card with `AlertTriangle` icon + `accent="red"` (Card's red left-accent). Clear Cache + Reset All moved in, each with a one-line description + icon (Reset All gets `RotateCcw`). Both keep their existing danger Modals. Reset button label shortened to "Reset All".
  - Tests: both buttons still queryable by id (no test asserted their old label text).
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->

- [x] Task 3.4: Reposition Translation System Prompt card above the tuning cards
  - Moved to first card (stagger 0); icon changed `FileText` → `Braces`. Inner content unchanged (Textarea/badge/variables land in Phase 6).
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->

- [x] Task 3.5: Verify Phase 3 green; commit
  <!-- verify: pnpm test AdvancedSection (31/31); tsc --noEmit clean; eslint clean -->

- [ ] Task: Conductor - User Manual Verification 'IA Restructure' (Protocol in workflow.md)

---

## Phase 4: Hero Status Strip + Cache Readout (FR-3, FR-8)
<!-- execution: sequential -->
<!-- depends: phase3 -->

- [x] Task 4.1: Add the hero status strip above the cards
  - Added a zinc-accented hero strip (`border-zinc-500/20 bg-zinc-600/[0.04]`) with a live cache readout ("X entries · Y.X MB") from `useCacheStats`, a `Braces` "Custom prompt" chip when `customSystemPrompt !== null`, and a `Bug` "Debug on" chip when `debugMode`.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->

- [x] Task 4.2: Wire cache stats refresh after Clear Cache
  - `handleClearCache` now calls `cacheStats.refresh()` on success (added to `useCallback` deps). Readout shows "…" while `loading`. Added 3 hero tests (readout from mocked stats; chips present; chip absent when prompt null). File-wide `vi.mock('@/services/cacheManager')` added so `useCacheStats` doesn't hit real IDB in jsdom.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx, entrypoints/options/__tests__/AdvancedSection.test.tsx -->

- [x] Task 4.3: Verify Phase 4 green; commit
  <!-- verify: pnpm test AdvancedSection (34/34); tsc --noEmit clean; eslint clean -->

- [ ] Task: Conductor - User Manual Verification 'Hero Strip + Cache Readout' (Protocol in workflow.md)

---

## Phase 5: Context & Intelligence Cleanup (FR-4)
<!-- execution: sequential -->
<!-- depends: phase4 -->

- [x] Task 5.1: Move Detection Mode behind an `AdvancedDisclosure`
  - Replaced the `pl-6 border-l-2` indent div with `<AdvancedDisclosure label="Detection mode">` wrapping the Detection Mode FieldGroup. Still gated by `enableLLMPageCategoryDetection` and inside the `DisabledDimmer` (Context-Aware gating) from Task 2.2.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->

- [x] Task 5.2: Tests for the disclosure + disabled gating
  - Added test: collapsed → `queryByLabelText('Detection Mode')` absent; click "Detection mode" trigger → select present. The Context-Aware-off disabled gating is covered by the Phase 2 a11y test (LLM toggle disabled → detection can't be enabled → disclosure never renders).
  <!-- files: entrypoints/options/__tests__/AdvancedSection.test.tsx -->

- [x] Task 5.3: Verify Phase 5 green; commit
  <!-- verify: pnpm test AdvancedSection (35/35); tsc --noEmit clean; eslint clean -->

- [ ] Task: Conductor - User Manual Verification 'Context & Intelligence Cleanup' (Protocol in workflow.md)

---

## Phase 6: System Prompt Editor Polish (FR-2 badge, FR-5)
<!-- execution: sequential -->
<!-- depends: phase5 -->

- [x] Task 6.1: Swap raw `<textarea>` for `ui/Textarea`; add `Customized` badge
  - Replaced the raw `<textarea>` with `<Textarea ... mono />`. Rendered the card untitled with a manual header row (`Braces` icon + `<h3>` + `Badge` "Customized" when `customSystemPrompt !== null`), per the Subtitles FR-4 pattern.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->

- [x] Task 6.2: Variable-insertion chips + supported-variables list
  - Added an "Insert variable:" row with `{{targetLanguage}}` / `{{glossary}}` chip buttons. `insertVariable()` inserts at the cursor via `setRangeText` when available, else appends (robust in jsdom). (Skipped `aria-describedby` wiring — kept minimal; warnings remain visually adjacent.)
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->

- [x] Task 6.3: Render all validation warnings
  - Replaced `warnings[0]` with `warnings.map(w => <li>)` (up to 3), each with an `AlertTriangle`.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->

- [x] Task 6.4: Tests — badge presence/absence, variable chip insertion, all warnings render
  - 4 new tests (39 total): Customized badge present when set / absent when null; clicking `{{glossary}}` chip calls updateSettings with a prompt containing `{{glossary}}`; an invalid prompt ('hello') renders all 3 warnings.
  <!-- files: entrypoints/options/__tests__/AdvancedSection.test.tsx -->

- [x] Task 6.5: Verify Phase 6 green; commit
  <!-- verify: pnpm test AdvancedSection (39/39); tsc --noEmit clean; eslint clean -->

- [ ] Task: Conductor - User Manual Verification 'System Prompt Editor Polish' (Protocol in workflow.md)

---

## Phase 7: Data Portability Safety + Export Derivation (FR-10, FR-11)
<!-- execution: sequential -->
<!-- depends: phase6 -->

- [x] Task 7.1: Pre-export API-key-cleartext callout
  - Added an amber callout (`border-amber-500/30 bg-amber-500/10 text-amber-400` + `AlertTriangle`) below the Export/Import button row, shown only when `settings.provider?.apiKey` is set. Post-click cleartext toast kept.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->

- [x] Task 7.2: Derive export payload from `PORTABLE_KEYS` allowlist
  - Added a module-level `PORTABLE_KEYS` tuple (25 keys, same order as the old hand-listed object). Export now `Object.fromEntries(PORTABLE_KEYS.map(k => [k, settings[k]]))` — byte-identical JSON for existing keys (NFR-1), no per-key drift.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->

- [x] Task 7.3: Report unknown/ignored keys after import
  - `handleImportSettings` now splits sanitized entries into `recognized` (in `DEFAULT_SETTINGS`) vs `ignored`; merges only `recognized` (so "ignored" is truthful — unknown keys are NOT applied), keeps the prototype-pollution guard, and toasts `Imported N settings; ignored M unknown key(s): …` when `ignored.length > 0`.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->

- [x] Task 7.4: Tests — callout present/absent; export derives correct 25 keys (in order); import reports ignored keys
  - Refactored the `ToastProvider` mock to `vi.hoisted` stable refs (`mockToastSuccess`/`mockToastError`) so the import toast is assertable. 4 new tests (43 total). Export test installs `URL.createObjectURL`/`revokeObjectURL` fakes via `Object.defineProperty` (jsdom lacks them) and reads the captured `Blob.text()` to assert the exact key list.
  <!-- files: entrypoints/options/__tests__/AdvancedSection.test.tsx -->

- [x] Task 7.5: Verify Phase 7 green; commit
  <!-- verify: pnpm test AdvancedSection (43/43); tsc --noEmit clean; eslint clean -->

- [ ] Task: Conductor - User Manual Verification 'Data Portability Safety + Export Derivation' (Protocol in workflow.md)

---

## Phase 8: PDF Card Polish + Micro-Polish + Final Verification (FR-6, FR-12)
<!-- execution: sequential -->
<!-- depends: phase7 -->

- [x] Task 8.1: Animate + announce the conditional "Never auto-open" field; add parsed-hosts preview
  - Wrapped the conditional field in `<div className="animate-fade-in-up" aria-live="polite">` (matched the project's existing `animate-fade-in-up` convention, not the plan's `animate-fade-in`). Added a "Will skip:" chip row that renders `neverAutoOpenSites` entries as muted chips so the user sees how comma input is parsed.
  - Tests: field + `aria-live` region present when `autoOpen !== 'off'`; preview chips reflect typed hosts. (2 new tests.)
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx, entrypoints/options/__tests__/AdvancedSection.test.tsx -->

- [x] Task 8.2: Micro-polish across the section
  - Icon audit: all 7 cards already have distinct icons (Braces, HardDrive, BrainCircuit, FileText, Database, Wrench, AlertTriangle) — no change needed. Clear Cache confirmed in Danger Zone (Phase 3). Added `hint` range strings to the 4 number inputs via the existing `Input` `hint` prop ("1–365 days", "10–1000 MB", "500–10000 chars", "0–600 rpm"). Replaced the orphan `<p>(unlimited)</p>` with an inline `<Badge variant="info">Unlimited</Badge>` (updated the existing assertion from `(unlimited)` → `Unlimited`). Skipped a trailing-unit `Input` right-slot (no primitive extension → keeps the diff/bundle small); units live in labels + hints.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx, entrypoints/options/__tests__/AdvancedSection.test.tsx -->

- [x] Task 8.3: Final verification — full suite, lint, tsc, build
  - `tsc --noEmit` clean. Full `vitest run`: 2349 passed, 1 failed — the 1 failure is **pre-existing** in `SubtitlesSection.test.tsx` (confirmed by stashing Phase 8 changes and re-running; fails identically without my work). `eslint .`: 4 errors, all pre-existing in untouched files (`content/subtitleRenderer.ts`, `inject/jsonParseSubtitleHook.ts`, `services/__tests__/background.test.ts`) — my files are lint-clean. `wxt build` succeeds. Bundle delta measured vs pre-track commit `5182da4` (git worktree): options chunk **+4916 B raw / +1073 B gzipped (1.05 kB)** — marginally over the aspirational <1 kB gzipped guard; justified by genuine new UI (FR-3/5/6/10) + 2 shared primitives, no bloat. Filed a bd follow-up issue for the pre-existing SubtitlesSection test failure.
  <!-- verify: pnpm test --run; tsc --noEmit; pnpm lint; wxt build -->

- [ ] Task: Conductor - User Manual Verification 'PDF Card Polish + Micro-Polish' (Protocol in workflow.md)

---

## Notes / Decisions to Confirm During Implementation

- **FR-3 hero shape:** status strip (not a master toggle) — Advanced has no single enable. Confirm during Phase 4 that the chips read clearly.
- **FR-5 variable insertion:** cursor-insert via `setRangeText` is the target; fall back to a static supported-variables list if cross-browser cursor math proves fragile.
- **FR-1 Developer card:** standalone small card vs `AdvancedDisclosure` on the Data card — pick whichever reads cleaner after Phase 3 layout lands.
- **FR-11 allowlist:** must equal today's 28 keys exactly to keep export byte-identical (NFR-1). Diff the derived object against the old hand-listed one in a test.
