# Track Learnings: subtitles-ux-refactor_20260706

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

Read `conductor/patterns.md` for full project patterns. Key ones for this track:

- **Settings section shape:** Each section renders `<SectionHeader>` + a `space-y-4` stack of `<Card variant="bordered">` blocks, each wrapped in `<div className="animate-stagger" style={stagger(N)}>` for entrance cascade. Indices must be unique + ascending or the cascade breaks.
- **Shared UI primitives** live in `ui/*` (`Card`, `FieldGroup`, `Toggle`, `Slider`, `SegmentedControl`, `Select`, `Button`, `AdvancedDisclosure`). Reuse over reinventing. `SegmentedControl` is the canonical single-choice control; `AdvancedDisclosure` tucks infrequent controls behind a chevron.
- **Settings store:** `useSettingsStore((s) => s.subtitleSettings)` + `updateSettings({ subtitleSettings: {...subtitleSettings, ...partial} })`. The `SubtitleSettings` shape (types/config.ts:187-223) is the contract — presentation refactors must not change it.
- **Translation-style knobs:** `subtitleSettings.knobOverrides` is a `Partial<ProfileKnobs>`. Setting a knob to `'auto'` **deletes** the override key (inherit from profile preset); any other value sets the key. Resolved at runtime via `resolveEffectiveKnobs(profile, globalOverride, perTabOverride)` in `lib/subtitleProfiles.ts`.
- **`translationTimeout`** is actively used: `content/subtitleCoordinator.ts:1943` → `translationTimeoutMs = translationTimeout * 1000` → passed to `inject/xhrInterceptor.ts` + `inject/fetchInterceptor.ts`. NOT dead config — just unexposed in UI.
- **Reduced motion:** `SubtitlesSection` has a local `usePrefersReducedMotion()` hook. Animations respect `(prefers-reduced-motion: reduce)`.
- **Test setup:** `vi.mock('@/stores/settingsStore')` with a `mockState` object; reset in `beforeEach`. Tests assert on text content + `document.getElementById(...)` for toggles/sliders. Adjust assertions only when DOM structure legitimately changes.

---

<!-- Learnings from implementation will be appended below -->

## [2026-07-06 11:28] - Phase 1 Task 1.1–1.3: Component extraction & DisabledDimmer
- **Implemented:** Extracted `SubtitlePreview.tsx` (AnimatedCue + ProgressBar + shell + helpers + `usePrefersReducedMotion`) into `entrypoints/options/components/`. Introduced `ui/DisabledDimmer.tsx` to DRY the 3 `${isDisabled ? 'opacity-50 pointer-events-none' : ''}` dimmer blocks. `SubtitlesSection.tsx` 627→422 lines (-205).
- **Files changed:** `entrypoints/options/components/SubtitlePreview.tsx` (new, 286), `ui/DisabledDimmer.tsx` (new, 35), `entrypoints/options/sections/SubtitlesSection.tsx`, `entrypoints/options/components/__tests__/SubtitlePreview.test.tsx` (new, 6 tests).
- **Commit:** 1403151
- **Learnings:**
  - **Gotcha:** `aria-hidden` on a dimmer wrapper removes inner controls from the a11y tree → `getByRole('radio', ...)` fails. The original inline dimmer did NOT set `aria-hidden`; the dim is purely visual + `pointer-events-none`, with each control individually `disabled`. `DisabledDimmer` must match (no `aria-hidden`) or NFR-3 breaks.
  - **Pattern:** Default cues live as `DEFAULT_CUES` constant inside the extracted preview and are overridable via a `cues` prop — preserves backward compat (Vietnamese fallback) while enabling FR-9 target-language-driven cues later.
  - **Pattern:** The `styleChip` prop on `SubtitlePreview` is forward-looking for FR-9 — hidden when disabled, rendered as a cyan chip top-left.
---

## [2026-07-06 11:33] - Phase 2 Task 2.1–2.4: Section structure (FR-1/2/7)
- **Implemented:** (1) Hero 'Enable Subtitles' strip above cards with a status line that reflects enabled state; toggle moved out of controls card. (2) 'Behavior' subgroup collapsed into the 'Appearance' card (now titled); Display Mode joins Position/Font/Opacity under one group with a `border-t` divider. (3) Stagger indices renumbered 0→1→2→3→4 (removed the duplicate `stagger(2)` on Language Discovery). Added 5 Phase-2 structure tests.
- **Files changed:** `entrypoints/options/sections/SubtitlesSection.tsx`, `entrypoints/options/sections/__tests__/SubtitlesSection.test.tsx`.
- **Commit:** bdb7e03
- **Learnings:**
  - **Pattern:** Semantic test queries (`getByText`, `closest('.space-y-5')`) survive DOM relocation, so existing assertions kept passing when the Enable toggle moved out of a card and Display Mode merged groups — only the *new* structure needed new tests.
  - **Gotcha:** When moving a control that has an explicit DOM id (`subtitle-enabled-toggle`), the test should query by id (not card position) so it's robust to card reordering.
  - **Context:** The hero strip uses `border-cyan-500/30 bg-cyan-500/[0.04]` to thread the section's cyan accent (FR-9 prep) into the master control.
---

## [2026-07-06 11:37] - Phase 3 Task 3.1–3.4: Translation Style card (FR-3/4/5)
- **Implemented:** (1) `KNOB_SPEC` array drives the 4 knobs (Register/Faithfulness/Brevity/Profanity) via a single `.map()`; deleted 4 copy-pasted option arrays + blocks. (2) Override-count badge (`{overrideCount} custom`) on the card title; per-knob `Custom` (cyan dot) vs `Profile default` indicator. (3) `translationTimeout` (10–120s, default 30) exposed inside an `AdvancedDisclosure` on the card. Re-enabled the timeout test (now expands the disclosure + asserts slider presence/value). Added 5 Phase-3 tests (33 total).
- **Files changed:** `entrypoints/options/sections/SubtitlesSection.tsx`, `entrypoints/options/sections/__tests__/SubtitlesSection.test.tsx`.
- **Commit:** c3868ed
- **Learnings:**
  - **Pattern:** `SegmentedControl` is generic `<T extends string>`; mapping over a spec whose `options` are `{value:string;label:string}[]` infers `T = string`, so `onChange={(v) => handleKnobChange(knob.key, v)}` typechecks without casts. Keep the spec typed `KnobSpec[]` with `key: KnobKey` for the settings write to stay type-safe.
  - **Pattern:** The `Card` component only accepts `title?: string`; to put a `Badge` inline in the title row, render the card untitled and emit a manual `<h3 className="text-sm font-semibold text-zinc-200">` + badge as the first child — matches the card title style exactly.
  - **Gotcha:** `AdvancedDisclosure` is collapsed by default, so content inside it is NOT in the DOM until expanded. Tests that assert presence of disclosed controls must first `fireEvent.click(screen.getByRole('button', { name: <label> }))`. The old `queryByText(/Translation Timeout/)` "absence" test was actually asserting the collapsed state — updated to expand + assert presence (FR-5).
  - **Pattern:** `overrideCount = KNOB_SPEC.filter(k => overrides[k.key] !== undefined).length` is the single source of truth for both the title badge and the reset-button `disabled` state — avoids the two drifting.
---

## [2026-07-06 11:45] - Phase 4 Task 4.1–4.4: Supported Sites redesign (FR-6)
- **Implemented:** (1) Added optional `monogram` / `accent` / `summary` fields to `SubtitleSiteInfo` (kept `methodHint` + `name` for backward compat); populated all 10 sites. (2) New `SiteRow` + `MonogramDot` components render friendly label + summary + a leading colored monogram dot, with the technical method hint demoted to a small `Info` affordance line. (3) Generic fallback pulled into a distinct labeled `Fallback` subsection. Added pure `monogramAccentClasses()` helper. Updated 2 generic-toggle tests to the new friendly label; added 4 redesign tests + 7 helper tests.
- **Files changed:** `lib/subtitleSites.ts`, `entrypoints/options/sections/SubtitlesSection.tsx`, `lib/__tests__/subtitleSites.test.ts`, `entrypoints/options/sections/__tests__/SubtitlesSection.test.tsx`.
- **Commit:** 2b5e55a
- **Learnings:**
  - **Pattern:** Keep new presentation-only fields on a shared data interface **optional** so legacy callers (e.g. `makePlatformSites` test factory, runtime coordinator) that construct `SubtitleSiteInfo` with only `platform/name/methodHint` keep typechecking — the redesign is additive, not breaking.
  - **Gotcha:** Reusing one row component (`SiteRow`) for both platform sites and the generic fallback means the toggle aria-label derives from `site.name`. When the friendly label changes ("Generic Subtitle Detection" → "Generic (Auto-detect)"), any test querying the switch by accessible name must update in lockstep (NFR-2 allows DOM-structure-driven test edits).
  - **Pattern:** Method hints that repeat across sites (e.g. "XHR interception" ×4) now appear once per site row — tests using `getByText` must switch to `getAllByText(...).length >= N` to stay robust.
---

## [2026-07-06 11:51] - Phase 5 Task 5.1–5.3: Accent & preview polish (FR-9)
- **Implemented:** (1) Accent decision: standardize the subtitle section's **identity** accents on cyan (SectionHeader accent, hero strip `border-cyan-500/30`, override Custom dots `bg-cyan-400`, ProgressBar gradient `from-cyan-500`, Style chip `bg-cyan-500/15 text-cyan-300`) while shared interactive primitives (`SegmentedControl`, `Toggle`) keep the library's blue — changing those would affect every other settings tab (out of scope). Added opt-in `accentClassName` prop to `Slider` so the section's own timeout slider threads cyan. (2) Preview reflects configured `targetLanguage` via new pure `lib/subtitlePreviewCues.ts` (sample cues for vi/ja/ko/zh/es/fr + neutral fallback) — no longer hardcoded Vietnamese. (3) Style chip ties the preview to the active translation-style override (`resolveStyleChipLabel`). Added `subtitlePreviewCues.test.ts` (10 tests) + 4 Phase-5 preview tests.
- **Files changed:** `ui/Slider.tsx`, `lib/subtitlePreviewCues.ts` (new), `entrypoints/options/sections/SubtitlesSection.tsx`, `lib/__tests__/subtitlePreviewCues.test.ts` (new), `entrypoints/options/sections/__tests__/SubtitlesSection.test.tsx`.
- **Commit:** e9286fd
- **Learnings:**
  - **Decision (FR-9):** When a section identity accent (cyan) diverges from the shared UI library's interactive accent (blue), thread the identity color into the section's **own** decorative + section-specific controls (hero strip, dots, chips, ProgressBar, opt-in slider accent) and leave shared primitives untouched. Touching `SegmentedControl`/`Toggle` global styling would violate "other settings tabs out of scope."
  - **Gotcha:** Querying a chip by `bg-cyan-500/15` collides with monogram dots (`monogramAccentClasses` uses the same /15 token). The Style chip's distinguishing class is `text-cyan-300` (monograms use `text-cyan-400`) — use that for a unique selector.
  - **Pattern:** Section tests that mock `useSettingsStore` must include **all** top-level keys the component reads (added `targetLanguage: 'vi'`), or `undefined` flows into helpers and produces surprising fallback output — same gotcha as the inherited "loadSettings mocks" pattern.
---
