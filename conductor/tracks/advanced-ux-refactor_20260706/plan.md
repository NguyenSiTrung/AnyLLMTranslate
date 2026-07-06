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

- [ ] Task 6.1: Swap raw `<textarea>` for `ui/Textarea`; add `Customized` badge
  - Replace the hand-styled `<textarea>` with `<Textarea id="advanced-system-prompt" ... />` (Task 1.1). Add a `Badge` ("Customized") on the card title row when `settings.customSystemPrompt !== null` (render the card untitled + a manual `<h3>` + badge, per the Subtitles FR-4 pattern since `Card` only accepts a string title).
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->

- [ ] Task 6.2: Variable-insertion chips + supported-variables list
  - Add a row of small chips for `{{targetLanguage}}` and `{{glossary}}` that insert at the cursor position into the `Textarea` (use a ref + `setRangeText`/selection). Fallback: a static "Supported variables: {{targetLanguage}}, {{glossary}}" line if cursor insertion is fragile. Wire `aria-describedby` from the textarea to the warnings region.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->

- [ ] Task 6.3: Render all validation warnings
  - Replace `{promptValidation.warnings[0]}` with `promptValidation.warnings.map(w => <li ...>)` (up to 3 warnings). Keep the amber `AlertTriangle` styling per item.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->

- [ ] Task 6.4: Tests — badge presence, variable chips, all warnings render
  <!-- files: entrypoints/options/__tests__/AdvancedSection.test.tsx -->

- [ ] Task 6.5: Verify Phase 6 green; commit
  <!-- verify: pnpm test AdvancedSection; tsc --noEmit; pnpm lint -->

- [ ] Task: Conductor - User Manual Verification 'System Prompt Editor Polish' (Protocol in workflow.md)

---

## Phase 7: Data Portability Safety + Export Derivation (FR-10, FR-11)
<!-- execution: sequential -->
<!-- depends: phase6 -->

- [ ] Task 7.1: Pre-export API-key-cleartext callout
  - Add an amber callout under the Export button: "Export includes your API key in cleartext — keep the file private." Keep the post-click toast (success vs error-on-apikey-present). Callout uses the NFR-5 token pattern (`bg-amber-500/10 text-amber-400` + `AlertTriangle`).
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->

- [ ] Task 7.2: Derive export payload from `DEFAULT_SETTINGS` keys
  - Replace the hand-listed 28-key export object with an allowlisted derivation: `const PORTABLE_KEYS = [...]; const exportData = Object.fromEntries(PORTABLE_KEYS.map(k => [k, settings[k]]))` (or `pick(settings, PORTABLE_KEYS)`). Keep the exact same key set as today to preserve byte-identical output for existing keys (NFR-1). Add a comment that this list is the portable allowlist.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->

- [ ] Task 7.3: Report unknown/ignored keys after import
  - In `handleImportSettings`, after sanitizing, compute `const known = new Set(Object.keys(DEFAULT_SETTINGS)); const ignored = Object.keys(sanitized).filter(k => !known.has(k));`. Toast: `Imported ${applied} settings${ignored.length ? `, ignored ${ignored.length} unknown key(s)` : ''}`. Keep the prototype-pollution guard.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->

- [ ] Task 7.4: Tests — callout renders; export derives correct keys; import reports ignored keys
  <!-- files: entrypoints/options/__tests__/AdvancedSection.test.tsx -->

- [ ] Task 7.5: Verify Phase 7 green; commit
  <!-- verify: pnpm test AdvancedSection; tsc --noEmit; pnpm lint -->

- [ ] Task: Conductor - User Manual Verification 'Data Portability Safety + Export Derivation' (Protocol in workflow.md)

---

## Phase 8: PDF Card Polish + Micro-Polish + Final Verification (FR-6, FR-12)
<!-- execution: sequential -->
<!-- depends: phase7 -->

- [ ] Task 8.1: Animate + announce the conditional "Never auto-open" field; add parsed-hosts preview
  - Wrap the conditional field in a div with `animate-fade-in` and `aria-live="polite"`. Below the `Input`, render the parsed list (`value.split(',').map(s => s.trim()).filter(Boolean)`) as muted chips/text so the user sees how input is interpreted.
  - Tests: field appears after selecting auto/prompt; preview reflects typed hosts.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx, entrypoints/options/__tests__/AdvancedSection.test.tsx -->

- [ ] Task 8.2: Micro-polish across the section
  - Distinct icons per card (audit: no duplicate `FileText` — PDF keeps `FileText`, System Prompt uses `Braces` from Task 3.4).
  - Number inputs: add a trailing unit adornment (`days`/`MB`/`chars`) — either an `Input` right-slot extension or a sibling `<span>`; add inline range hints (`1–365`, `10–1000`, `500–10000`, `0–600`) under each.
  - "(unlimited)" → inline status chip under Max RPM (replaces the orphan `<p>`).
  - Confirm Clear Cache is in Danger Zone (Task 3.3) and no longer loose in Performance.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx, ui/Input.tsx (if adding right-slot) -->

- [ ] Task 8.3: Final verification — full suite, lint, tsc, build
  - Run `pnpm test --run` (0 failures), `tsc --noEmit` (clean), `pnpm lint` (no new errors), `wxt build` (succeeds, bundle delta < +1 KB vs pre-track). Capture learnings in `conductor/tracks/advanced-ux-refactor_20260706/learnings.md`.
  <!-- verify: pnpm test --run; tsc --noEmit; pnpm lint; wxt build -->

- [ ] Task: Conductor - User Manual Verification 'PDF Card Polish + Micro-Polish' (Protocol in workflow.md)

---

## Notes / Decisions to Confirm During Implementation

- **FR-3 hero shape:** status strip (not a master toggle) — Advanced has no single enable. Confirm during Phase 4 that the chips read clearly.
- **FR-5 variable insertion:** cursor-insert via `setRangeText` is the target; fall back to a static supported-variables list if cross-browser cursor math proves fragile.
- **FR-1 Developer card:** standalone small card vs `AdvancedDisclosure` on the Data card — pick whichever reads cleaner after Phase 3 layout lands.
- **FR-11 allowlist:** must equal today's 28 keys exactly to keep export byte-identical (NFR-1). Diff the derived object against the old hand-listed one in a test.
