# Spec: Advanced Tab UX Refactor

**Track ID:** `advanced-ux-refactor_20260706`
**Type:** Feature (UI/UX refactor + code health)
**Priority:** 🟠 High
**Created:** 2026-07-06
**Predecessors:** `settings-ux-audit_20260506` + `settings-ux-polish_20260418` (both explicitly deferred "card layout restructuring" as out of scope — this track repays that deferred debt for the Advanced tab only). Sibling/benchmark tracks: `subtitles-ux-refactor_20260706` and `providers-ux-refactor_20260704` (established the FR/NFR patterns and shared primitives this track reuses).

---

## Overview

The Settings → Advanced tab is the **last un-refactored section** in the options page. Every other section has had an IA/UX pass (General merged to 2 cards; Subtitles got a hero strip + data-driven knobs + override badges; Providers got split into focused units + identity badges + commit-on-blur). Advanced still uses the pre-refactor inline patterns those tracks eliminated: it hand-rolls commit-on-blur 4× instead of `useDeferredCommit`, inlines `opacity-40 pointer-events-none` instead of `DisabledDimmer`, uses a raw `<textarea>` instead of a shared primitive, buries a primary control (System Prompt) as the 6th of 7 flat cards, and frames the most destructive action in the app (Reset All) as a lone bare button.

A deep analysis surfaced 21 concrete findings across information architecture, visual hierarchy, per-card UX, DRY/maintainability, accessibility, and micro-polish. This track resolves all of them as a pure presentation + code-health pass — **no behavior or setting-model changes** (`ExtensionSettings` shape stays identical), matching the NFR-1 contract of the Subtitles/Providers refactors.

The outcome: a tab users can scan in one glance, where the primary control (System Prompt) is elevated, cache state is visible live, dependent controls gate correctly (and accessibly), destructive actions live in a clearly-marked Danger Zone, and the file uses the shared primitives the rest of the app already standardized on.

## Functional Requirements

### FR-1 — Restructure card information architecture
The current 7 flat cards (Performance & Caching, Rate Limiting, Context & Intelligence, PDF Translator, Data & Developer Tools, Translation System Prompt) + a bare Reset button collapse into a clearer grouped structure:
- **"Performance & Throughput"** — merge Rate Limiting's single field into Performance & Caching (eliminates the overweight 1-field card, mirroring Subtitles FR-2 which collapsed a 1-control subgroup). The Max RPM field joins Cache TTL / Max Cache Size / Max Batch under one card, separated by a `border-t border-zinc-800` divider.
- **"Data Portability"** — Export/Import Settings only (split out of the mixed Data & Developer Tools card).
- **"Developer"** — Debug Mode toggle only, in its own small card (or behind an `AdvancedDisclosure` on the Data card — decision in plan).
- **"Danger Zone"** — see FR-7.
- Stagger indices renumbered 0→N, unique and ascending (currently correct at 0–6; preserved or tightened).

### FR-2 — Elevate Translation System Prompt
The System Prompt editor is a **primary** translation behavior control (moved here from Providers in `providers-ux-refactor` FR-9 because it's "unrelated to any provider"), yet it sits as the 6th card behind 5 tuning cards. It is repositioned **above** the tuning cards (first or second card, after the hero strip). The card icon changes from `FileText` (duplicated on the PDF card) to a distinct prompt/code icon (`Braces` or `Code`). A `Customized` `Badge` appears on the card title when `customSystemPrompt !== null`, mirroring Subtitles FR-4 (override-state visibility).

### FR-3 — Section status hero strip
Add a hero strip above the cards (zinc accent, matching `SectionHeader` accentColor) that anchors the section and surfaces live advanced-state at a glance, mirroring Subtitles FR-1's hero pattern. Unlike Subtitles (whose hero is a master-enable toggle), Advanced has no single master switch, so the hero is a **status strip**: a compact row of state chips — live cache usage (size + entry count, from FR-8), "Custom prompt" indicator, "Debug on" indicator. This gives the tab a visual anchor + real information density instead of a tuning wall.

### FR-4 — Clean up Context & Intelligence nesting
The current 3-level structure (Toggle → divider → inline-dimmed sub-block → Toggle → conditionally indented `pl-6 border-l-2` Select) is replaced with the shared primitives:
- The LLM-detection sub-block is wrapped in `DisabledDimmer` (disabled when `!enableContextAwareTranslation`), **and** the inner `Toggle` + `Select` are passed `disabled` (fixes the a11y defect in FR-9/NFR-4).
- Detection Mode moves behind an `AdvancedDisclosure` (chevron + collapsible region), matching its use in Subtitles (translation timeout) and Providers (Temp/MaxTokens) for "tuck infrequent controls behind a chevron."

### FR-5 — System Prompt editor polish
- Replace the raw hand-styled `<textarea>` with a new shared `ui/Textarea.tsx` primitive (extracted from the prompt editor's classes — the only hand-styled form control left in the section).
- Add **variable-insertion help**: a row of clickable chips for supported variables (`{{targetLanguage}}`, `{{glossary}}`) that insert at the cursor, plus a one-line "Supported variables" list. (Clickable insertion is the target; a static listed set is the fallback if cursor-insertion proves fragile cross-browser.)
- Render **all** `promptValidation.warnings` (currently only `warnings[0]` is shown — up to 3 can fire: missing `{{targetLanguage}}`, missing JSON format instruction, missing `translations` key).

### FR-6 — PDF Translator card polish
- The conditional "Never auto-open these sites" field (shown only when `autoOpen !== 'off'`) animates its reveal (`animate-fade-in`) and is wrapped in an `aria-live="polite"` region so its appearance is announced to assistive tech (currently it appears with no animation and no announcement, causing layout shift + silent insertion).
- The comma-separated hostnames `Input` gains a **parsed-hosts live preview** below it (the split + trimmed list rendered as muted chips/text) so the user sees how their input is interpreted. A full tag/chip-input component is out of scope (see Out of Scope); the preview + validation is the scoped improvement.

### FR-7 — Danger Zone card
Introduce a "Danger Zone" card (red-accented, `border-red-500/20`) holding the two destructive actions:
- **Clear Cache** (moved out of the Performance card; keeps its existing danger `Modal` confirmation).
- **Reset All Settings** (currently a bare full-width red button with no icon, no card, no descriptive text — the most destructive action in the app with the least framing). It gains an `AlertTriangle` icon, a one-line description of what is lost, and keeps its existing danger `Modal` confirmation.

### FR-8 — Live cache usage readout
The Performance card (and the hero strip, FR-3) shows live cache state by calling the **existing** `getCacheStats()` (`services/cacheManager.ts` → `{ entryCount, totalSizeBytes }`). Display as "X entries · Y MB" (Y = `totalSizeBytes` formatted). Query on mount; refresh after Clear Cache succeeds. This makes the "Max Cache Size" tuning genuinely useful — today users tune it blind with zero indication of current usage.

### FR-9 — DRY: shared primitives (useDeferredCommit, DisabledDimmer, Textarea)
- Migrate the 4 number inputs (`cacheTTLDays`, `maxCacheSizeMB`, `maxBatchChars`, `maxRpm`) from hand-rolled `useState` + sync `useEffect` + per-field blur handler to the existing `useDeferredCommit` hook (`entrypoints/options/hooks/useDeferredCommit.ts`, built in `providers-ux-refactor` FR-10). Deletes the manual sync effect + ~60 lines of per-field boilerplate. Validation logic stays (range checks before commit).
- Replace the inline `opacity-40 pointer-events-none` dimmer with `DisabledDimmer` (created in `subtitles-ux-refactor` FR-8 for exactly this), and pass `disabled` to inner controls (fixes NFR-4 a11y defect: today the dimmed `Toggle`/`Select` remain keyboard-operable because `pointer-events-none` only blocks the mouse).
- Extract `ui/Textarea.tsx` (FR-5) as the shared multiline primitive.

### FR-10 — Data portability safety
- Surface the **API-key-in-cleartext** risk **before** export. Today the warning fires only *after* Export clicks, as a toast (`showError('Exported file contains your API key in cleartext...')`). Add a small amber callout under the Export button ("Export includes your API key in cleartext — keep the file private") so the user is warned before acting. The post-click toast stays as confirmation.
- After import, report any **unknown/ignored keys**: today `handleImportSettings` silently merges via `{ ...DEFAULT_SETTINGS, ...sanitized }`, keeping unknown keys that are never used. Add a toast/report of the form "Imported N settings, ignored M unknown keys."

### FR-11 — Export payload derivation
Derive the export payload from `DEFAULT_SETTINGS` keys (with an explicit allowlist of portable keys) instead of hand-listing 28 keys in `handleExportSettings`. The current hand-listed object will silently drift from the store shape as new settings land (it already omits some nested subfields). Derivation from the schema prevents drift. The exported JSON content for currently-existing keys stays byte-identical (NFR-1).

### FR-12 — Micro-polish
- **Distinct icons per card** — no duplicate `FileText` (PDF keeps `FileText`; System Prompt takes `Braces`/`Code` per FR-2).
- **Unit suffix adornment** on number inputs — show `days` / `MB` / `chars` as a trailing adornment so `30` reads as `30 days` (the `Input` component supports a left `icon`; a right-side unit slot is added or rendered alongside).
- **Inline range hints** under number inputs (`1–365`, `10–1000`, `500–10000`, `0–600`) visible before the user types an invalid value, mirroring how `Slider` shows min/max labels.
- **"(unlimited)" as an inline status chip** under Max RPM (currently an orphan `<p>`).
- **Clear Cache button placement** — as a Danger Zone action (FR-7) rather than loose inside the Performance card.

## Non-Functional Requirements

- **NFR-1 (No behavior/model changes):** The `ExtensionSettings` shape (`types/config.ts`) is unchanged. No new settings, no new persisted fields, no runtime behavior changes. FR-11 changes how the export payload is *composed* (derived vs hand-listed) but the JSON content for existing keys stays identical. FR-8 reads cache state that already exists (`getCacheStats`); it adds no writes.
- **NFR-2 (No new deps / bundle):** No new runtime dependencies. `Textarea` is a trivial shared primitive. Net bundle delta < +1 KB.
- **NFR-3 (No regressions):** All existing tests in `entrypoints/options/__tests__/AdvancedSection.test.tsx` keep passing (with assertion updates where DOM structure legitimately changes — card merges, button relocation, badge additions). New tests added per FR.
- **NFR-4 (Accessibility — net improvement):** The dimmed-controls-must-be-`disabled` fix (FR-9) is a concrete a11y bug fix: today the LLM-detection `Toggle`/`Select` are visually greyed (`opacity-40 pointer-events-none`) but remain keyboard-focusable and operable. After this track they carry `disabled`. The `AdvancedDisclosure` (FR-4) and animated conditional field (FR-6) use proper ARIA (`aria-expanded`/`aria-controls`/`role="region"`/`aria-live`). Focus-visible rings retained throughout.
- **NFR-5 (Visual consistency):** Reuse the existing `bg-X-600/15 border-X-500/20 text-X-400` token pattern (from `SectionHeader`/readiness banner) for any new colored surfaces (Danger Zone, status chips). `DisabledDimmer` uses the app-standard `opacity-50` (replaces the off-pattern `opacity-40`). No new ad-hoc opacity values.
- **NFR-6 (Quality gates):** `pnpm test`, `pnpm lint`, `tsc --noEmit`, and `wxt build` all green at each phase boundary (per `conductor/workflow.md` Definition of Done).

## Acceptance Criteria

- [ ] **AC-1:** The Advanced tab no longer has a standalone "Rate Limiting" card; Max RPM lives inside "Performance & Throughput". "Data & Developer Tools" is split into "Data Portability" + "Developer".
- [ ] **AC-2:** The Translation System Prompt card appears above the tuning cards (not 6th of 7), uses a distinct icon (not `FileText`), and shows a `Customized` badge when `customSystemPrompt !== null`.
- [ ] **AC-3:** A hero status strip at the top of the tab shows live cache usage (entries + MB) and state chips (custom prompt, debug on).
- [ ] **AC-4:** The LLM-detection sub-block is wrapped in `DisabledDimmer` with inner controls `disabled` when Context-Aware is off; Detection Mode is behind an `AdvancedDisclosure`.
- [ ] **AC-5:** The System Prompt editor uses `ui/Textarea.tsx`; supported variables are listed (chips insert at cursor, or static list as fallback); all `promptValidation.warnings` render (not just the first).
- [ ] **AC-6:** The "Never auto-open" field animates in + is `aria-live`; a parsed-hosts preview appears below the comma input.
- [ ] **AC-7:** A "Danger Zone" card holds Clear Cache + Reset All Settings; Reset has an `AlertTriangle` icon + description; both keep their danger Modal confirmations.
- [ ] **AC-8:** The Performance card / hero shows "X entries · Y MB" from `getCacheStats()`, refreshed after Clear Cache.
- [ ] **AC-9:** The 4 number inputs use `useDeferredCommit` (no manual sync `useEffect`); the inline dimmer is replaced by `DisabledDimmer`; `ui/Textarea.tsx` exists and is used.
- [ ] **AC-10:** An amber pre-export callout warns about API-key cleartext before clicking Export; import reports ignored unknown keys.
- [ ] **AC-11:** The export payload is derived from `DEFAULT_SETTINGS` keys (allowlisted), not hand-listed; exported JSON for existing keys is byte-identical.
- [ ] **AC-12:** Every card has a distinct icon; number inputs show unit suffix + range hint; "(unlimited)" is an inline chip; Clear Cache lives in Danger Zone.
- [ ] **AC-13:** `pnpm test --run` passes with 0 failures (existing assertions updated where DOM changed; new tests added per FR). `tsc --noEmit` clean. `pnpm lint` no new errors. `wxt build` succeeds, bundle delta < +1 KB.

## Out of Scope

- **Promoting PDF Translator to its own nav tab** (an `App.tsx` `TAB_GROUPS` change) — this track keeps PDF in Advanced and only polishes its card. A nav-level IA change is a separate track.
- **Moving Translation System Prompt out of Advanced** into its own tab — alternative to FR-2; kept in Advanced (elevated, not extracted) to bound scope.
- **Full tag/chip-input component** for never-open sites — FR-6 ships a parsed-hosts preview + validation instead; a reusable chip-input primitive is a separate app-wide track.
- **App-wide `<Surface>`/token primitives** — same defer as `providers-ux-refactor`; touches every section.
- **Resolved-prompt live preview** (rendering the prompt with `{{targetLanguage}}`/`{{glossary}}` substituted) — considered for FR-5 but deferred (glossary injection is runtime-shaped); the variable list + insertion chips is the scoped deliverable.
- **i18n of label strings** — i18n-ready only; no hardcoded user-facing logic change.
- **Popup, background service, content script, or PDF viewer changes.**
- **New settings/fields** beyond surfacing existing state (`getCacheStats`).
