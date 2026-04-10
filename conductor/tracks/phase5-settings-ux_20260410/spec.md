# Spec: Phase 5 — Settings UI/UX Overhaul

## Overview

Complete redesign of the LinguaLens Options page (`entrypoints/options/`) to transform it from a generic developer admin panel into a polished, branded, consumer-grade settings experience. This track addresses 30+ identified UI/UX issues across visual identity, information architecture, component consistency, interaction design, accessibility, and polish.

**Source Analysis**: [Settings UI/UX Analysis & Redesign Plan](../../.gemini/antigravity/brain/6423de17-840f-47e3-933a-754b4303c18d/artifacts/settings-ui-ux-analysis.md)

## Functional Requirements

### FR-1: Shared Component Library (`ui/`)

Extract duplicated UI patterns across 8 section components into a reusable component library:

| Component | Purpose | Replaces |
|-----------|---------|----------|
| `FieldGroup` | Label + description + children + error + hint | 3 duplicated definitions (General, Provider, Subtitles) |
| `Toggle` | Accessible toggle switch with focus ring | Inline custom HTML in Subtitles + Advanced |
| `Button` | primary / secondary / danger / ghost variants | Repeated Tailwind strings across all sections |
| `Input` | text / url / password with icon support | 100+ char duplicated className strings |
| `Select` | Styled select with custom ChevronDown icon | Native `<select>` with no visual indicator |
| `Slider` | Range with value label + min/max labels | Plain `<input type="range">` |
| `Card` | default / bordered / elevated variants | Inconsistent card patterns across sections |
| `Toast` | success / error / info notifications | `alert()` and `confirm()` browser dialogs |
| `Badge` | Status badges (Built-in, Active, etc.) | Inline badge markup |
| `EmptyState` | Icon + message + action for empty lists | Repeated empty state patterns |
| `Modal` | Confirmation dialog for destructive actions | `confirm()` browser dialog |

### FR-2: Grouped Sidebar Navigation

Reorganize the flat 8-tab sidebar into 4 logical groups:

- **DISPLAY**: General, Themes
- **TRANSLATION**: Provider, Dictionary, Site Rules
- **MEDIA**: Subtitles
- **SYSTEM**: Shortcuts, Advanced

Each group has a small uppercase label. Active tab has an animated slide indicator.

### FR-3: Save Feedback System (Dual-mode)

- **Sidebar footer badge**: Persistent "✓ Auto-saved" text that fades in after any setting change, always visible
- **Floating toast**: Bottom-right corner toast for bulk/destructive actions only (import, export, reset, clear cache, connection test result)
- Replace all `alert()` calls with Toast component
- Replace all `confirm()` calls with Modal component

### FR-4: Tab Switch & Content Animations (CSS-only)

- Fade-in + `translateY(4px → 0)` on content area when switching tabs
- Sidebar hover: `translateX(2px)` + subtle background change
- Theme card selection: `scale(1.02 → 1)` bounce + checkmark animation
- List items (Site Rules, Dictionary): stagger animation on mount (`animationDelay: index * 30ms`)
- Animated sidebar active indicator sliding between tabs

### FR-5: Provider Section Reorganization

- Group essential fields (Preset, Base URL, API Key, Model, Test Connection) at top
- Collapse advanced fields (Temperature, Max Tokens, System Prompt) into an accordion, default closed
- Provider preset as visual cards with provider logos/icons instead of `<select>`

### FR-6: Enhanced Theme Preview

- In ThemesSection: improve theme card previews with better visual fidelity
- Theme card selection animation with satisfying feedback
- Connection test progress bar (horizontal, 3 steps) above the step list

### FR-7: Accessibility Improvements

- Focus-visible rings on all toggle switches and interactive elements
- `aria-live="polite"` on connection test progress area
- `aria-labelledby` linking range inputs to their labels
- Skip navigation link at top of page
- `prefers-reduced-motion` media query to disable animations

### FR-8: Content Grouping in Sections

- Wrap related fields in labeled Card containers (e.g., "Language", "Display", "Appearance" groups in General)
- Section headers with icon + description in subtle card with accent border

### FR-9: Polish Features

- Glossary inline editing (click row to edit in-place)
- Cache usage visualization (actual cache size bar chart)
- Connection test success celebration (checkmark animation)
- Keyboard navigation (Arrow keys for sidebar tabs, Enter to activate)

## Non-Functional Requirements

- **Bundle size**: CSS-only animations, no new runtime dependencies (no framer-motion)
- **Performance**: No layout shifts during animations. Use `transform` and `opacity` only for GPU-composited animations
- **Compatibility**: Chrome 120+, Manifest V3
- **Maintainability**: All shared components in `ui/` directory with consistent API patterns

## Acceptance Criteria

1. All 3 duplicated `FieldGroup` components replaced by single shared `ui/FieldGroup.tsx`
2. Sidebar shows 4 grouped sections with uppercase labels
3. Settings changes show "✓ Auto-saved" badge in sidebar footer
4. Bulk actions (import, reset, cache clear) show Toast notification instead of `alert()`
5. Tab switching has visible fade animation
6. Provider section has collapsible "Advanced" accordion
7. All toggle switches have visible focus rings
8. `prefers-reduced-motion` disables all animations
9. All existing tests remain passing
10. Build size stays under 400KB

## Out of Scope

- Settings search (VS Code-style) — deferred to future track due to complexity
- First-time onboarding wizard — deferred to separate onboarding track
- Keyboard shortcut recording (VS Code-style key capture) — deferred, Chrome manages shortcuts
- Light mode for settings page — keeping pure dark theme
- Merging Themes tab into General — keeping as separate tab for cleaner organization
