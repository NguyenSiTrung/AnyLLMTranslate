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

- [ ] Task 1.3: Verify Phase 1 compiles + tests green; commit
  <!-- verify: pnpm test ui entrypoints/options/hooks; tsc --noEmit -->

- [ ] Task: Conductor - User Manual Verification 'Shared Primitives & Helpers' (Protocol in workflow.md)

---

## Phase 2: DRY Migration (FR-9) + a11y fix
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [ ] Task 2.1: Migrate the 4 number inputs to `useDeferredCommit`
  - Replace the 4× (`useState` + sync `useEffect` + blur handler) blocks for `cacheTTLDays`, `maxCacheSizeMB`, `maxBatchChars`, `maxRpm` with `useDeferredCommit<number>(settings.X, (v) => commitWithValidation(v))`. Keep range validation inside the commit callback (set error + skip `updateSettings` if out of range). Delete the manual sync `useEffect` (the hook syncs on `initial` change — covers reset/import per the `cache-settings-ui` pattern).
  - Adjust `AdvancedSection.test.tsx`: blur-still-commits assertions stay valid; remove any assertion on the removed sync effect.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx, entrypoints/options/__tests__/AdvancedSection.test.tsx -->

- [ ] Task 2.2: Replace inline dimmer with `DisabledDimmer`; pass `disabled` to inner controls (a11y fix)
  - In the Context & Intelligence card, replace `<div className={... 'opacity-40 pointer-events-none' ...}>` with `<DisabledDimmer disabled={!settings.enableContextAwareTranslation}>`. Pass `disabled={!settings.enableContextAwareTranslation}` to the LLM-detection `Toggle` and the Detection Mode `Select`. This fixes the a11y defect (NFR-4): today the dimmed controls remain keyboard-operable.
  - Add a test: when Context-Aware is off, the LLM-detection toggle is `disabled` (query by role + assert `disabled`/`aria-disabled`), not merely visually dimmed.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx, entrypoints/options/__tests__/AdvancedSection.test.tsx -->

- [ ] Task 2.3: Verify Phase 2 green; commit
  <!-- verify: pnpm test AdvancedSection; tsc --noEmit; pnpm lint -->

- [ ] Task: Conductor - User Manual Verification 'DRY Migration + a11y fix' (Protocol in workflow.md)

---

## Phase 3: Information Architecture Restructure (FR-1, FR-2, FR-7)
<!-- execution: sequential -->
<!-- depends: phase2 -->

- [ ] Task 3.1: Merge Rate Limiting into Performance & Caching → "Performance & Throughput"
  - Remove the standalone Rate Limiting card; move the Max RPM `FieldGroup` into the Performance card below the three cache fields, separated by `<div className="border-t border-zinc-800 pt-5 mt-5" />`. Rename the card title to "Performance & Throughput". Renumber stagger indices 0→N unique ascending.
  - Update tests: the "Rate Limiting" card-text assertion is removed; Max RPM input still queryable by label.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx, entrypoints/options/__tests__/AdvancedSection.test.tsx -->

- [ ] Task 3.2: Split "Data & Developer Tools" into "Data Portability" + "Developer"
  - "Data Portability" card: Export/Import buttons. "Developer" card: Debug Mode toggle (optionally behind an `AdvancedDisclosure` on the Data card — choose standalone small card for clarity). Remove the `border-t` split that previously divided them inside one card.
  - Update tests for the two new card titles.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx, entrypoints/options/__tests__/AdvancedSection.test.tsx -->

- [ ] Task 3.3: Add "Danger Zone" card; move Clear Cache + Reset All into it
  - New card (red-accented surface: `border-red-500/20 bg-red-500/[0.04]` per NFR-5 token pattern) titled "Danger Zone" with an `AlertTriangle` icon. Move the Clear Cache button (out of Performance) + the Reset All button (out of the bare full-width spot) into it. Reset gains an `AlertTriangle` icon + a one-line description ("Restores all settings to defaults — custom dictionary, site rules, and provider configuration will be lost"). Both keep their existing danger `Modal` confirmations.
  - Update tests: both buttons still queryable by id (`clear-cache-btn`, `reset-all-settings-btn`); assert they live in the Danger Zone card.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx, entrypoints/options/__tests__/AdvancedSection.test.tsx -->

- [ ] Task 3.4: Reposition Translation System Prompt card above the tuning cards
  - Move the System Prompt card render block above the Performance & Throughput card (after the hero strip, which lands in Phase 4 — for now place it first). Change its icon from `FileText` to `Braces`. Renumber stagger.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->

- [ ] Task 3.5: Verify Phase 3 green; commit
  <!-- verify: pnpm test AdvancedSection; tsc --noEmit; pnpm lint -->

- [ ] Task: Conductor - User Manual Verification 'IA Restructure' (Protocol in workflow.md)

---

## Phase 4: Hero Status Strip + Cache Readout (FR-3, FR-8)
<!-- execution: sequential -->
<!-- depends: phase3 -->

- [ ] Task 4.1: Add the hero status strip above the cards
  - A full-width strip (`border-zinc-500/20 bg-zinc-600/[0.04]`, zinc accent per `SectionHeader`) holding: a live cache-usage readout ("X entries · Y MB") from `useCacheStats` (Task 1.2), a "Custom prompt" chip when `customSystemPrompt !== null`, and a "Debug on" chip when `debugMode`. Mirror Subtitles FR-1 hero styling.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->

- [ ] Task 4.2: Wire cache stats refresh after Clear Cache
  - After `handleClearCache` succeeds, call `refresh()` from `useCacheStats` so the readout updates. Confirm the readout renders `entryCount`/`sizeMb` and shows a loading state while `loading`.
  - Add tests: hero renders usage; refresh called after clear (mock the hook or `getCacheStats`).
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx, entrypoints/options/__tests__/AdvancedSection.test.tsx -->

- [ ] Task 4.3: Verify Phase 4 green; commit
  <!-- verify: pnpm test AdvancedSection useCacheStats; tsc --noEmit; pnpm lint -->

- [ ] Task: Conductor - User Manual Verification 'Hero Strip + Cache Readout' (Protocol in workflow.md)

---

## Phase 5: Context & Intelligence Cleanup (FR-4)
<!-- execution: sequential -->
<!-- depends: phase4 -->

- [ ] Task 5.1: Move Detection Mode behind an `AdvancedDisclosure`
  - Wrap the Detection Mode `FieldGroup` in `<AdvancedDisclosure label="Detection mode">` (default collapsed). It only renders when LLM detection is enabled. Keeps the `DisabledDimmer` from Task 2.2 around the whole LLM-detection sub-block.
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->

- [ ] Task 5.2: Tests for the disclosure + disabled gating
  - Expand disclosure (click the "Detection mode" button) → assert the Select is present; collapse → absent. When Context-Aware is off, the disclosure/Select are disabled (NFR-4).
  <!-- files: entrypoints/options/__tests__/AdvancedSection.test.tsx -->

- [ ] Task 5.3: Verify Phase 5 green; commit
  <!-- verify: pnpm test AdvancedSection; tsc --noEmit; pnpm lint -->

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
