# Plan: Subtitles Settings — UX Refactor

**Execution mode:** Sequential. Nearly every task edits `entrypoints/options/sections/SubtitlesSection.tsx`, so file-level parallelism would conflict. Only Phase 4's `lib/subtitleSites.ts` data work is independent, but its UI render still lands in the shared section file.

**Workflow:** TDD encouraged (write/adjust test → implement → refine). Commit after each task with a task reference. Run `pnpm test`, `pnpm lint`, `tsc --noEmit` at each phase boundary (see workflow.md Definition of Done).

---

## Phase 1: Scaffolding & Component Extraction (FR-8)
<!-- execution: sequential -->

- [x] Task 1.1: Extract `SubtitlePreview.tsx` (AnimatedCue + ProgressBar + preview shell) into `entrypoints/options/components/`
  <!-- files: entrypoints/options/components/SubtitlePreview.tsx, entrypoints/options/sections/SubtitlesSection.tsx -->
  Commit: 1403151

- [x] Task 1.2: Introduce `DisabledDimmer` wrapper; replace the 3 repeated `${isDisabled ? 'opacity-50 pointer-events-none' : ''}` blocks
  <!-- files: ui/DisabledDimmer.tsx, entrypoints/options/sections/SubtitlesSection.tsx -->
  Commit: 1403151

- [x] Task 1.3: Update tests for moved preview; verify full suite green
  <!-- files: entrypoints/options/sections/__tests__/SubtitlesSection.test.tsx, entrypoints/options/components/__tests__/SubtitlePreview.test.tsx -->
  Commit: 1403151

- [ ] Task: Conductor - User Manual Verification 'Scaffolding & Component Extraction' (Protocol in workflow.md)

---

## Phase 2: Section Structure (FR-1, FR-2, FR-7)
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [x] Task 2.1: Add hero 'Enable Subtitles' header strip above cards; move toggle out of the controls card
  <!-- files: entrypoints/options/sections/SubtitlesSection.tsx -->
  Commit: bdb7e03

- [x] Task 2.2: Merge 'Behavior' subgroup into 'Appearance' (Display Mode joins the group); remove the now-redundant subgroup label
  <!-- files: entrypoints/options/sections/SubtitlesSection.tsx -->
  Commit: bdb7e03

- [x] Task 2.3: Renumber stagger indices 0→4 (remove duplicate `stagger(2)`)
  <!-- files: entrypoints/options/sections/SubtitlesSection.tsx -->
  Commit: bdb7e03

- [x] Task 2.4: Adjust tests for relocated Enable toggle + merged subgroup
  <!-- files: entrypoints/options/sections/__tests__/SubtitlesSection.test.tsx -->
  Commit: bdb7e03

- [ ] Task: Conductor - User Manual Verification 'Section Structure' (Protocol in workflow.md)

---

## Phase 3: Translation Style Card (FR-3, FR-4, FR-5)
<!-- execution: sequential -->
<!-- depends: phase2 -->

- [ ] Task 3.1: Data-drive the 4 knob controls via a `KNOB_SPEC` array (Register/Faithfulness/Brevity/Profanity); delete the copy-pasted blocks
  <!-- files: entrypoints/options/sections/SubtitlesSection.tsx -->

- [ ] Task 3.2: Add override-count badge to card title + per-knob 'Custom'/'Profile default' indicator
  <!-- files: entrypoints/options/sections/SubtitlesSection.tsx -->

- [ ] Task 3.3: Expose `translationTimeout` (10–120s) inside an `AdvancedDisclosure` on this card
  <!-- files: entrypoints/options/sections/SubtitlesSection.tsx -->

- [ ] Task 3.4: Add/adjust tests: knob rendering from spec, override badge count, advanced disclosure, timeout slider
  <!-- files: entrypoints/options/sections/__tests__/SubtitlesSection.test.tsx -->

- [ ] Task: Conductor - User Manual Verification 'Translation Style Card' (Protocol in workflow.md)

---

## Phase 4: Supported Sites Redesign (FR-6)
<!-- execution: sequential -->
<!-- depends: phase3 -->

- [ ] Task 4.1: Add friendly label + per-platform icon/monogram data to `SubtitleSiteInfo` (preserve technical method hint)
  <!-- files: lib/subtitleSites.ts -->

- [ ] Task 4.2: Render friendly primary labels + per-platform leading icon; move method hint into a tooltip/info affordance
  <!-- files: entrypoints/options/sections/SubtitlesSection.tsx -->

- [ ] Task 4.3: Separate the Generic fallback into a distinct labeled 'Fallback' subsection
  <!-- files: entrypoints/options/sections/SubtitlesSection.tsx -->

- [ ] Task 4.4: Update tests for friendly labels, icon rendering, and fallback separation
  <!-- files: entrypoints/options/sections/__tests__/SubtitlesSection.test.tsx -->

- [ ] Task: Conductor - User Manual Verification 'Supported Sites Redesign' (Protocol in workflow.md)

---

## Phase 5: Accent & Preview Polish (FR-9)
<!-- execution: sequential -->
<!-- depends: phase4 -->

- [ ] Task 5.1: Resolve accent inconsistency (thread cyan into active states, or standardize on blue) across the section
  <!-- files: entrypoints/options/sections/SubtitlesSection.tsx, entrypoints/options/components/SubtitlePreview.tsx -->

- [ ] Task 5.2: Make preview reflect configured target language (replace hardcoded Vietnamese cues) + add a 'Style' chip tying preview to translation-style knobs
  <!-- files: entrypoints/options/components/SubtitlePreview.tsx -->

- [ ] Task 5.3: Add tests for target-language-driven preview + style chip
  <!-- files: entrypoints/options/components/__tests__/SubtitlePreview.test.tsx -->

- [ ] Task: Conductor - User Manual Verification 'Accent & Preview Polish' (Protocol in workflow.md)
