# Subtitle Style Presets — Design Spec

> **Date:** 2026-08-05
> **Status:** Approved (brainstorming)
> **Approach:** Preset enum + override knobs, pure resolver (Approach A)
> **Related:**
> - [Subtitle Studio](./2026-07-10-subtitle-studio-design.md) — parent spec; Appearance card controls and `SubtitlePreview` defined there
> - [Player Subtitle Chrome (In-Player Mini Studio)](./2026-07-31-player-subtitle-chrome-design.md) — mini-studio control set and `prefs.ts` write paths
> - [Mini Studio Glass Redesign](./2026-08-04-mini-studio-glass-redesign-design.md) — current mini-studio presentation

---

## 1. Context

The overlay subtitle style is hardcoded: white text (`rgba(255,255,255,1)` translated / `rgba(255,255,255,0.6)` original), black box at the opacity slider, fixed `8px` radius, fixed text-shadow `0 1px 3px rgba(0,0,0,0.5)`, three font options. This reproduces YouTube's classic caption look, not Netflix's.

Verified Netflix behavior (help.netflix.com/en/node/100267 + 2023–2025 coverage): users can change **font, size, shadow, and background color**; the default is white text with a soft drop shadow and **no background box**; presets include white-on-black, yellow-on-black, and black-on-white. Netflix Sans is proprietary, so system stacks are the practical equivalent.

The request: add named subtitle styles (Netflix's set), let users choose between them, keep the current look as the default.

### Problem summary

| Gap | Detail |
|-----|--------|
| No style choice | Text color, background presence/color, and shadow are hardcoded in `styles/subtitle.css` |
| No presets | Users cannot pick a look (Netflix default, high-contrast, etc.) |
| No custom colors | No text/background color or shadow controls anywhere (options or in-player) |
| Options changes are not live | `settingsChangeListener` refreshes cached settings but never re-styles an attached overlay |
| Duplicated font mapping | `resolveSubtitleFontFamily` (coordinator) and `resolveFontFamily` (preview) duplicate the same 3-value map |

## 2. Goals

1. Five named style presets — `classic` (default, byte-identical to today's look), `netflix`, `white-on-black`, `yellow-on-black`, `black-on-white` — backed by one pure, testable resolver.
2. Customize mode: text color, background style (none / black box / white box), shadow strength; any tweak shows a "Custom" badge (existing override-badge pattern).
3. Style picker in the options Appearance card **and** in the in-player mini studio; both live-apply.
4. Bilingual hierarchy preserved: the original line renders a dimmer shade of the chosen text color (derived at 60% alpha) unless the preset defines it explicitly.
5. Options-page style changes apply live to an attached overlay (close the `settingsChangeListener` gap).
6. `SubtitlePreview` consumes the same resolver so the preview always matches the overlay; font-family mapping centralized.

## 3. Non-Goals

- No per-cue inline styling, no WebVTT `::cue` support (native track rendering stays disabled per `subtitleRenderer.ts`).
- No font loading from the network (Netflix Sans is proprietary; system stacks only).
- No changes to font size / position / display-mode / font-family semantics or their storage keys.
- No animation changes (fade/slide motion stays as-is).
- No per-platform style overrides.

## 4. Product decisions (locked this brainstorm)

| Decision | Choice |
|----------|--------|
| Customization model | **Presets + custom overrides** (Approach A): `stylePreset` enum + optional `styleOverrides`; resolver merges them |
| UI placement | **Options Appearance card + in-player mini studio** |
| Bilingual styling | **Derived dimmer original** — preset may define explicitly; otherwise textColor at 60% alpha |
| Override signaling | Any override write → "Custom" badge; picking a preset clears overrides (repo's existing override-badge pattern) |
| Background opacity | Stays a global knob (box alpha); does NOT flip to custom; dimmed when background style is `none` |
| Default | `classic` — reproduces today's rendering exactly |

## 5. Design details

### 5.1 Settings model — `types/config.ts`

```ts
export type SubtitleStylePresetId =
  | 'classic' | 'netflix' | 'white-on-black' | 'yellow-on-black' | 'black-on-white';

export interface SubtitleStyleOverrides {
  textColor?: string;          // hex, e.g. '#f5c518'
  backgroundStyle?: 'none' | 'black-box' | 'white-box';
  shadowStrength?: number;     // 0–1
}
```

`SubtitleSettings` gains:
- `stylePreset: SubtitleStylePresetId` — default `'classic'`
- `styleOverrides: Partial<SubtitleStyleOverrides>` — default `{}`

`backgroundOpacity`, `fontFamily`, `fontSize`, `fontSizeMode`, `position`, `displayMode` are unchanged.

### 5.2 Preset table — `lib/subtitleStylePresets.ts` (new, pure)

| Preset | textColor | original (explicit or derived) | backgroundStyle | shadowStrength | borderRadius |
|--------|-----------|-------------------------------|-----------------|----------------|--------------|
| `classic` | `#ffffff` | `rgba(255,255,255,0.6)` (explicit) | `black-box` | 0.5 | 8 |
| `netflix` | `#ffffff` | derived | `none` | 0.8 | 8 |
| `white-on-black` | `#ffffff` | derived | `black-box` | 0.3 | 4 |
| `yellow-on-black` | `#f5c518` | derived | `black-box` | 0.3 | 4 |
| `black-on-white` | `#000000` | derived | `white-box` | 0 | 4 |

Public API:

```ts
export interface ResolvedSubtitleStyle {
  textColor: string;            // full CSS color, e.g. 'rgba(255,255,255,1)'
  originalTextColor: string;    // explicit or derived, e.g. 'rgba(255,255,255,0.6)'
  backgroundColor: string;      // rgb triplet '0,0,0' | '255,255,255' (box color; always used, see opacity)
  backgroundOpacity: number;    // 0 when style is 'none', else the global slider value
  borderRadius: number;         // px
  textShadow: string;           // CSS value, 'none' when strength is 0
}

export function resolveSubtitleStyle(
  presetId: SubtitleStylePresetId,
  overrides: Partial<SubtitleStyleOverrides>,
  backgroundOpacity: number,
): ResolvedSubtitleStyle;

export function resolveSubtitleFontFamily(
  fontFamily: SubtitleFontFamily,
): string;  // moved from coordinator/preview; single source of truth

export function withAlpha(color: string, alpha: number): string;  // hex → rgba
```

Derivation rules:
- `backgroundStyle` = `overrides.backgroundStyle ?? preset.backgroundStyle`; `backgroundOpacity` = `backgroundStyle === 'none' ? 0 : backgroundOpacity`.
- `textColor` = `overrides.textColor ?? preset.textColor`; `originalTextColor` = preset explicit value, else `withAlpha(textColor, 0.6)`.
- `shadowStrength` = `overrides.shadowStrength ?? preset.shadowStrength`; `textShadow` = `0 1px 3px rgba(0,0,0,${strength})` when strength > 0, else `'none'` (alpha equals strength so classic 0.5 reproduces the historic `rgba(0,0,0,0.5)`).
- `borderRadius` is preset-only (not overridable).

### 5.3 Overlay rendering — `content/subtitleOverlay.ts` + `styles/subtitle.css`

`OverlayConfig` gains `textColor`, `originalTextColor`, `backgroundColor` (rgb triplet), `borderRadius`, `textShadow`. `DEFAULT_CONFIG` keeps the current look:
`textColor: 'rgba(255,255,255,1)'`, `originalTextColor: 'rgba(255,255,255,0.6)'`, `backgroundColor: '0,0,0'`, `borderRadius: 8`, `textShadow: '0 1px 3px rgba(0,0,0,0.5)'`.

`updateOverlayStyle` additionally sets CSS vars (existing `--anyllm-subtitle-bg-opacity` unchanged):

```
--anyllm-subtitle-text-color       → config.textColor
--anyllm-subtitle-original-color   → config.originalTextColor
--anyllm-subtitle-bg-color         → config.backgroundColor
--anyllm-subtitle-border-radius    → `${config.borderRadius}px`
--anyllm-subtitle-text-shadow      → config.textShadow
```

`styles/subtitle.css` swaps hardcoded values for vars (fallbacks = current look, so pre-var injection order is harmless):

```css
.anyllm-translate-subtitle-text {
  background-color: rgba(var(--anyllm-subtitle-bg-color, 0,0,0),
                     var(--anyllm-subtitle-bg-opacity, 0.75));
  border-radius: var(--anyllm-subtitle-border-radius, 8px);
}
.anyllm-translate-subtitle-original {
  color: var(--anyllm-subtitle-original-color, rgba(255,255,255,0.6));
}
.anyllm-translate-subtitle-translated {
  color: var(--anyllm-subtitle-text-color, rgba(255,255,255,1));
  text-shadow: var(--anyllm-subtitle-text-shadow, 0 1px 3px rgba(0,0,0,0.5));
}
```

The `@media (prefers-color-scheme: dark)` block and fullscreen/popover overrides keep working (they only touch opacity/position).

### 5.4 Coordinator wiring — `content/subtitleCoordinator.ts`

- `buildSubtitleOverlayConfig` calls `resolveSubtitleStyle(settings.stylePreset, settings.styleOverrides, settings.backgroundOpacity)` and maps the result onto the new `OverlayConfig` fields; `fontFamily` via the centralized `resolveSubtitleFontFamily`.
- **Live apply (closes the gap):** `settingsChangeListener` gains a debounced (~100ms) branch: when an overlay is attached (`isOverlayActive()`), rebuild the config from the refreshed settings + saved prefs and call `updateConfig`. `updateConfig` already repositions, so no other state changes.

### 5.5 Options UI — `entrypoints/options/sections/subtitles/AppearanceCard.tsx`

- New "Style" `SettingsGroup` at the top of the card: five preset chip buttons in a wrapable row (labels "Classic", "Netflix", "White on black", "Yellow on black", "Black on white"; 5 options are too many for a single `SegmentedControl`). Selecting a preset → `onUpdate({ stylePreset, styleOverrides: {} })`.
- "Custom" badge next to the group label when `styleOverrides` is non-empty (repo's override-badge pattern).
- "Customize" disclosure (`AdvancedDisclosure` pattern) with:
  - Text color — `<input type="color">` + hex readout.
  - Background style — segmented `None / Black box / White box`.
  - Shadow strength — `Slider` 0–1 step 0.05.
  - Any write → `onUpdate({ styleOverrides: { ...current, field } })`.
- Background opacity slider is dimmed (`DisabledDimmer`) when the effective background style is `none`.

### 5.6 In-player mini studio — `content/playerChrome`

- `prefs.ts`: `setStylePreset(presetId)` → `updateSettings` + `updateConfig` with resolver output (same live path as the existing controls). Pass `styleOverrides`/`backgroundOpacity` through unchanged.
- `content/playerChrome/miniStudio.ts`: a preset chip row in the Appearance section; existing opacity/size/position controls unchanged.

### 5.7 Preview sync — `entrypoints/options/components/SubtitlePreview.tsx`

- Accept `stylePreset` + `styleOverrides` props; resolve through `resolveSubtitleStyle` (with the same `backgroundOpacity`), replacing the hardcoded `rgba(0,0,0,…)` and white text colors.
- `resolveFontFamily` local function deleted; import the centralized `resolveSubtitleFontFamily`.
- Summary chips gain the active preset label (or "Custom").

### 5.8 Migration

None. `stylePreset: 'classic'` + empty overrides reproduces today's rendering exactly (same colors, box, opacity slider semantics, radius, shadow); existing stored settings keep working.

## 6. Validation

- Classic preset output matches today's constants (white/60% white, black box @ slider, 8px, `0 1px 3px rgba(0,0,0,0.5)`).
- Netflix preset produces no visible box (opacity 0) with white text + soft shadow.
- Any single override changes the resolved output for that field only and leaves the rest of the preset intact.
- `black-on-white` → black text, white box, no shadow; `yellow-on-black` → `#f5c518` text, black box.
- Overlay DOM reflects new vars after `updateConfig` (extended overlay tests).
- Options style change re-styles an attached overlay without reload (live-apply test).
- Picking a preset in either UI clears overrides; editing a customize knob sets them and shows the badge.

## 7. Testing plan

- New `lib/__tests__/subtitleStylePresets.test.ts`: preset table completeness (5 presets, distinct field values), override merge, `withAlpha` (hex → rgba, 1.0 → unchanged), `none` → opacity 0, shadow scaling (0 → `'none'`, 1 → alpha 1.0), classic = current look constants.
- Extend `content/__tests__/subtitleOverlay.test.ts`: `updateConfig` sets the five new CSS vars.
- Extend coordinator tests: `buildSubtitleOverlayConfig` resolves style fields; live-apply listener calls `updateConfig` with resolved values when attached.
- Extend `AppearanceCard.test.tsx`: preset pick → `onUpdate({ stylePreset, styleOverrides: {} })`; customize write → overrides set + badge; opacity dimmed when style is `none`.
- Settings default test: `stylePreset: 'classic'`, `styleOverrides: {}`.
- Full quality gate: `npx vitest run`, `npx tsc --noEmit`, `npx eslint .`.
