# Spec: Settings UI/UX Enhancement & Subtitle Configuration

## Overview

Expand the subtitle translation settings with user-configurable font family, display mode (bilingual vs translation-only for overlay), and translation timeout. Additionally, polish the Settings UI/UX across all 8 sections for consistency, better interactive previews, and refined visual hierarchy — maintaining the existing dark minimal aesthetic.

## Functional Requirements

### FR-1: Subtitle Font Family Setting
- Add a font family selector to Subtitle Settings with options: **System** (system-ui, sans-serif), **Serif** (Georgia, serif), **Monospace** (monospace)
- Apply selected font family to the custom subtitle overlay renderer (`subtitleOverlay.ts`)
- Apply to subtitle CSS (`subtitle.css`) via CSS custom property
- Default: `system` (matches current behavior)

### FR-2: Subtitle Display Mode for Overlay
- Add a display mode toggle: **Bilingual** (original + translated) vs **Translation Only** (translated only)
- Currently the overlay always shows bilingual; `displayMode` only affects the VTT interception path
- Wire the new setting to the overlay renderer to show/hide the original text line
- Default: `bilingual`

### FR-3: Configurable Translation Timeout
- Add a timeout slider (10s–120s, step 5s) to Subtitle Settings
- Replace the hardcoded `30000ms` in `subtitleCoordinator.ts` with the user-configured value
- Default: `30` seconds (preserves current behavior)

### FR-4: Enhanced Subtitle Preview
- Replace the current plain colored rectangle with a mini video player aesthetic:
  - Dark gradient background simulating a video frame
  - Play button icon overlay (decorative)
  - Animated subtitle cue that fades in/out
  - Reactive to font family, font size, position, opacity, and display mode settings
- Preview updates live as user changes any subtitle setting

### FR-5: Settings UI Visual Polish
- **Card consistency**: Ensure all 8 sections use the `title` + `icon` Card pattern consistently
- **Hover/focus states**: Improve interactive feedback on theme cards, provider cards, dictionary rows, site rule rows
- **Spacing**: Tighten and unify gap/padding across all sections for visual rhythm
- No new design paradigm — subtle refinement of existing dark minimal aesthetic

## Non-Functional Requirements

- No new runtime dependencies (CSS-only animations, existing Tailwind + Lucide)
- Bundle size impact < 2KB
- All new settings must sync via chrome.storage (existing Zustand bidirectional sync pattern)
- Accessibility: new controls must have proper ARIA labels and keyboard navigation

## Acceptance Criteria

1. Subtitle Settings tab shows font family selector, display mode toggle, and timeout slider
2. Subtitle preview renders as mini video player with live reactivity to all settings
3. Font family applies to overlay subtitles on video pages
4. Overlay respects display mode (bilingual vs translation-only)
5. Translation timeout is user-configurable and replaces hardcoded 30s
6. All 8 settings sections have consistent Card title+icon hierarchy
7. All tests pass, lint-clean, build succeeds
8. No regressions in existing subtitle interception or page translation

## Out of Scope

- Subtitle font color customization
- Per-platform subtitle toggle
- Settings search/filter
- Onboarding wizard
- Glassmorphism or major design paradigm change
