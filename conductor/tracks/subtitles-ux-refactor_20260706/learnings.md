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
