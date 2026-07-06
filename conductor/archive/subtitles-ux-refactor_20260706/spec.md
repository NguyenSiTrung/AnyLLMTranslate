# Subtitles Settings — UX Refactor

## Overview
Refactor the Settings → Subtitles tab for better structure, clarity, and visual polish. The feature set stays identical (no behavior changes); this is a pure UI/UX + code-health pass driven by a 15-point deep analysis.

The current tab (`entrypoints/options/sections/SubtitlesSection.tsx`, 627 lines) has a solid foundation — a live mini-player preview, a profile/override translation-style model, accessibility, and reduced-motion handling — but suffers from information-architecture, visual-hierarchy, and repetition problems.

## Functional Requirements

**FR-1 — Master Enable header strip**
A full-width hero strip above the cards holding the 'Enable Subtitles' toggle + status line. The most important control on the page sits above all configuration. All downstream cards dim when off (existing behavior preserved).

**FR-2 — Merge Appearance + Behavior**
Collapse the single-control 'Behavior' subgroup into 'Appearance'. Display Mode joins Position / Font Family / Font Size / Opacity under one group. Removes an overweight labeled subgroup for one control.

**FR-3 — Data-driven translation knobs**
Replace the 4 copy-pasted knob blocks (Register / Faithfulness / Brevity / Profanity) with a single mapped render over a `KNOB_SPEC` array. Identical output, ~100 fewer lines, no drift risk.

**FR-4 — Override-state visibility**
- Count badge on the Translation Style card title: e.g. 'Translation Style · 2 custom'.
- Per-knob indicator: a knob whose value differs from 'auto' (i.e. has an override) shows a small 'Custom' dot/badge; 'auto' knobs show 'Profile default'.
- The existing 'Reset to profile defaults' link stays (enabled only when overrides exist).

**FR-5 — Translation Timeout exposed**
Expose the currently-orphan `translationTimeout` (10–120s, default 30) inside an `AdvancedDisclosure` on the Translation Style card. It's actively used at runtime — `content/subtitleCoordinator.ts:1943` passes `translationTimeout * 1000` to the XHR/Fetch interceptors (`inject/xhrInterceptor.ts`, `inject/fetchInterceptor.ts`) — but is currently untunable from the UI. Re-enable the test asserting its presence.

**FR-6 — Supported Sites redesign**
- Friendly primary labels; technical method hint moved into a tooltip/info affordance (technical string preserved for power users + debugging).
- Per-platform leading icon/monogram dot for scannability.
- Visually separate the Generic fallback: a labeled sub-section ('Fallback') distinct from the platform list.

**FR-7 — Fix stagger indices**
Renumber stagger 0→1→2→3→4 so cards cascade in entrance (the duplicate `stagger(2)` at lines 410 and 520 is removed).

**FR-8 — Component extraction & DRY**
- Extract `AnimatedCue` + `ProgressBar` + the preview shell into `entrypoints/options/components/SubtitlePreview.tsx`.
- Extract a small `DisabledDimmer` wrapper (or accept dim on the card) to DRY the 3 repeated `${isDisabled ? 'opacity-50 pointer-events-none' : ''}` blocks.

**FR-9 — Accent + preview polish**
- Thread the section's cyan accent into active control states (or accept blue everywhere) for consistency.
- Preview reflects the user's configured target language (currently hardcoded Vietnamese cues) and shows a small 'Style' chip tying preview to the translation-style knobs.

## Non-Functional Requirements
- NFR-1: No behavior/setting model changes — `SubtitleSettings` shape unchanged. Pure presentation refactor.
- NFR-2: All existing tests continue to pass; tests adjusted only where DOM structure legitimately changes (e.g. Enable toggle moves out of a card, merged subgroup).
- NFR-3: Accessibility preserved — `role=switch`/`role=radio`, aria-labels, focus-visible rings, reduced-motion handling all retained.
- NFR-4: No host page style pollution (extension CSS stays scoped).
- NFR-5: `pnpm test`, `pnpm lint`, `tsc --noEmit` all green at each phase.

## Acceptance Criteria
1. Enable Subtitles toggle lives in a hero header strip above the cards.
2. 'Behavior' subgroup no longer exists; Display Mode is under Appearance.
3. The 4 knob controls are rendered from a single data array; file is meaningfully shorter.
4. Translation Style card shows an override count; each overridden knob is marked.
5. Translation Timeout is tunable via an Advanced disclosure (10–120s).
6. Supported Sites shows friendly labels + per-platform icons; Generic fallback is a separate labeled section.
7. Stagger indices are unique and ascending.
8. Preview subcomponents live in their own file.
9. All tests pass, lint clean, tsc clean.

## Out of Scope
- Changing the subtitle translation engine, profiles, or runtime behavior.
- New subtitle settings/fields beyond surfacing the existing translationTimeout.
- i18n of label strings (i18n-ready only — no hardcoded user-facing logic change).
- Other settings tabs (Providers, General, etc.).
