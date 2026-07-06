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
