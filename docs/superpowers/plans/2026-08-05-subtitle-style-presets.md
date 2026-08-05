# Subtitle Style Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five named subtitle style presets (classic = current look as default, netflix, white-on-black, yellow-on-black, black-on-white) with a customize mode (text color, background style, shadow strength), selectable in the options Appearance card and the in-player mini studio, applied live to the overlay.

**Architecture:** A pure resolver `lib/subtitleStylePresets.ts` maps a preset id + optional overrides + the global background-opacity knob into a resolved style bundle (text color, dimmer original color, background triplet, opacity, radius, shadow CSS). The coordinator and mini-studio prefs bridge resolve settings → `OverlayConfig` fields; `updateOverlayStyle` writes them as CSS custom properties; `styles/subtitle.css` consumes the vars with current-look fallbacks. Options-page changes live-apply via the existing `chrome.storage.onChanged` listener (new debounced branch), closing the current "reload required" gap.

**Tech Stack:** TypeScript, WXT/MV3, Vitest + jsdom, Zustand settings store, vanilla shadow-DOM mini studio (no React).

**Spec:** `docs/superpowers/specs/2026-08-05-subtitle-style-presets-design.md`
**bd issue:** `AnyLLMTranslate-8l8`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `types/config.ts` | Settings model | Add `SubtitleStylePresetId`, `SubtitleStyleOverrides`, 2 new `SubtitleSettings` fields + defaults |
| `lib/subtitleStylePresets.ts` | NEW pure resolver | Preset table, `resolveSubtitleStyle`, `withAlpha`, `resolveSubtitleFontFamily` (moved here) |
| `lib/__tests__/subtitleStylePresets.test.ts` | NEW resolver tests | Preset integrity, merge rules, alpha derivation, shadow scaling, defaults |
| `content/subtitleOverlay.ts` | Overlay renderer | `OverlayConfig` + `DEFAULT_CONFIG` gain 5 fields; `updateOverlayStyle` sets 5 new CSS vars |
| `content/__tests__/subtitleOverlay.test.ts` | Overlay tests | New-var assertions |
| `styles/subtitle.css` | Overlay CSS | Hardcoded colors/radius/shadow → vars with current-look fallbacks |
| `content/subtitleCoordinator.ts` | Coordinator | Import resolver; `buildSubtitleOverlayConfig` resolves style; `refreshAttachedOverlayConfig` + debounced live-apply; local font map deleted |
| `content/__tests__/subtitleCoordinator.test.ts` | Coordinator tests | Mock additions, config assertions, live-apply test |
| `content/playerChrome/prefs.ts` | Mini-studio bridge | Snapshot fields, `setStylePreset`, `setAppearance` resolves style |
| `content/__tests__/playerChrome/prefs.test.ts` | Bridge tests | New coverage |
| `content/playerChrome/miniStudioView.ts` | Mini-studio DOM | Style select widget + row, `fillStyleSelect`, `updatePreview` style args |
| `content/playerChrome/miniStudioCss.ts` | Mini-studio CSS | Preview cue uses `--preview-bg-color` var |
| `content/playerChrome/miniStudio.ts` | Mini-studio wiring | Style select events, `lastStyle` for preview |
| `content/__tests__/playerChrome/miniStudio.test.ts` | Mini-studio tests | Style select behavior |
| `content/__tests__/playerChrome/lifecycle.test.ts` | Lifecycle test mock | Add `setStylePreset` to prefs mock |
| `entrypoints/options/sections/subtitles/AppearanceCard.tsx` | Options UI | Style preset chips, Custom badge, Customize disclosure, dim backdrop when none |
| `entrypoints/options/sections/subtitles/__tests__/AppearanceCard.test.tsx` | NEW options UI tests | Chip/badge/customize/dim behavior |
| `entrypoints/options/components/SubtitlePreview.tsx` | Options preview | Consume resolver; style chip; local font map deleted |
| `entrypoints/options/sections/SubtitlesSection.tsx` | Options section | Pass new props to preview |
| `docs/superpowers/specs/2026-08-05-subtitle-style-presets-design.md` | Spec | Correct shadow mapping (alpha = strength, not 0.5×strength) |

---

## Task 1: Settings model — types/config.ts

**Files:**
- Modify: `types/config.ts`

- [ ] **Step 1: Add the preset id and overrides types**

Insert after the `SubtitleFontFamily` type (currently around line 417):

```ts
/** Named subtitle style presets. 'classic' reproduces the pre-preset look. */
export type SubtitleStylePresetId =
  | 'classic'
  | 'netflix'
  | 'white-on-black'
  | 'yellow-on-black'
  | 'black-on-white';

/** Manual style overrides; any non-empty field switches the effective style to Custom. */
export interface SubtitleStyleOverrides {
  /** Text color as a hex string, e.g. '#f5c518'. */
  textColor?: string;
  /** Caption box background; 'none' renders shadow-only text. */
  backgroundStyle?: 'none' | 'black-box' | 'white-box';
  /** Text shadow strength 0–1; 0 disables the shadow. */
  shadowStrength?: number;
}
```

- [ ] **Step 2: Add the two fields to `SubtitleSettings`**

Insert after the `fontFamily` line (currently ~line 458):

```ts
  /** Named style preset; 'classic' = pre-preset look (default). */
  stylePreset: SubtitleStylePresetId;
  /** Manual style overrides; non-empty means the effective style is Custom. */
  styleOverrides: Partial<SubtitleStyleOverrides>;
```

- [ ] **Step 3: Add defaults**

In `DEFAULT_SUBTITLE_SETTINGS` (currently ~line 769), insert after `fontFamily: 'system',`:

```ts
  stylePreset: 'classic',
  styleOverrides: {},
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. `DEFAULT_SUBTITLE_SETTINGS` is the only full `SubtitleSettings` literal; all other writes spread an existing object, so no other file needs changes. If a typed literal elsewhere errors, add the two fields there.

- [ ] **Step 5: Commit**

```bash
git add types/config.ts
git commit -m "feat(subtitles): add style preset and overrides to settings model"
```

---

## Task 2: Pure resolver — lib/subtitleStylePresets.ts (test-first)

**Files:**
- Create: `lib/__tests__/subtitleStylePresets.test.ts`
- Create: `lib/subtitleStylePresets.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/subtitleStylePresets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  SUBTITLE_STYLE_PRESETS,
  resolveSubtitleStyle,
  resolveSubtitleFontFamily,
  withAlpha,
} from '@/lib/subtitleStylePresets';
import { DEFAULT_SUBTITLE_SETTINGS } from '@/types/config';

describe('subtitleStylePresets — preset table', () => {
  it('defines exactly the five approved presets with distinct signatures', () => {
    const ids = Object.keys(SUBTITLE_STYLE_PRESETS).sort();
    expect(ids).toEqual(
      ['classic', 'netflix', 'white-on-black', 'yellow-on-black', 'black-on-white'].sort(),
    );
    expect(SUBTITLE_STYLE_PRESETS.classic).toMatchObject({
      textColor: '#ffffff',
      originalTextColor: 'rgba(255,255,255,0.6)',
      backgroundStyle: 'black-box',
      shadowStrength: 0.5,
      borderRadius: 8,
    });
    expect(SUBTITLE_STYLE_PRESETS.netflix.backgroundStyle).toBe('none');
    expect(SUBTITLE_STYLE_PRESETS['yellow-on-black'].textColor).toBe('#f5c518');
    expect(SUBTITLE_STYLE_PRESETS['black-on-white']).toMatchObject({
      textColor: '#000000',
      backgroundStyle: 'white-box',
      shadowStrength: 0,
    });
  });

  it('DEFAULT_SUBTITLE_SETTINGS defaults to classic with no overrides', () => {
    expect(DEFAULT_SUBTITLE_SETTINGS.stylePreset).toBe('classic');
    expect(DEFAULT_SUBTITLE_SETTINGS.styleOverrides).toEqual({});
  });
});

describe('withAlpha', () => {
  it('converts hex to rgba at the given alpha and passes non-hex through', () => {
    expect(withAlpha('#ffffff', 1)).toBe('rgba(255,255,255,1)');
    expect(withAlpha('#f5c518', 0.6)).toBe('rgba(245,197,24,0.6)');
    expect(withAlpha('#000', 0.3)).toBe('rgba(0,0,0,0.3)');
    expect(withAlpha('rgba(1,2,3,0.5)', 0.9)).toBe('rgba(1,2,3,0.5)');
  });
});

describe('resolveSubtitleStyle', () => {
  it('classic preset reproduces the current look at the given opacity', () => {
    expect(resolveSubtitleStyle('classic', undefined, 0.7)).toEqual({
      textColor: 'rgba(255,255,255,1)',
      originalTextColor: 'rgba(255,255,255,0.6)',
      backgroundColor: '0,0,0',
      backgroundOpacity: 0.7,
      borderRadius: 8,
      textShadow: '0 1px 3px rgba(0,0,0,0.5)',
    });
  });

  it('netflix preset has no box (opacity forced to 0) and a stronger shadow', () => {
    expect(resolveSubtitleStyle('netflix', undefined, 0.7)).toMatchObject({
      backgroundColor: '0,0,0',
      backgroundOpacity: 0,
      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
    });
  });

  it('black-on-white renders black text on a white box with no shadow', () => {
    expect(resolveSubtitleStyle('black-on-white', undefined, 1)).toMatchObject({
      textColor: 'rgba(0,0,0,1)',
      originalTextColor: 'rgba(0,0,0,0.6)',
      backgroundColor: '255,255,255',
      backgroundOpacity: 1,
      textShadow: 'none',
    });
  });

  it('overrides merge per-field and derive the original color at 60% alpha', () => {
    const result = resolveSubtitleStyle(
      'netflix',
      { textColor: '#f5c518', shadowStrength: 0.2 },
      0.7,
    );
    expect(result.textColor).toBe('rgba(245,197,24,1)');
    expect(result.originalTextColor).toBe('rgba(245,197,24,0.6)');
    expect(result.textShadow).toBe('0 1px 3px rgba(0,0,0,0.2)');
    expect(result.backgroundOpacity).toBe(0); // netflix backgroundStyle still none
  });

  it('backgroundStyle override switches the box and opacity handling', () => {
    const result = resolveSubtitleStyle('netflix', { backgroundStyle: 'black-box' }, 0.5);
    expect(result.backgroundOpacity).toBe(0.5);
    expect(result.backgroundColor).toBe('0,0,0');
  });

  it('unknown preset id falls back to classic', () => {
    // @ts-expect-error unknown id
    expect(resolveSubtitleStyle('nope', undefined, 0.7).textColor).toBe('rgba(255,255,255,1)');
  });
});

describe('resolveSubtitleFontFamily', () => {
  it('maps the three settings values to CSS stacks with system fallback', () => {
    expect(resolveSubtitleFontFamily('serif')).toBe('Georgia, serif');
    expect(resolveSubtitleFontFamily('monospace')).toBe('monospace');
    expect(resolveSubtitleFontFamily('system')).toBe('system-ui, sans-serif');
    expect(resolveSubtitleFontFamily(undefined)).toBe('system-ui, sans-serif');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/subtitleStylePresets.test.ts`
Expected: FAIL — module `@/lib/subtitleStylePresets` not found.

- [ ] **Step 3: Implement the resolver**

Create `lib/subtitleStylePresets.ts`:

```ts
/**
 * Subtitle style presets — named looks for the on-player subtitle overlay.
 * Pure module: no DOM, no chrome APIs, trivially unit-testable.
 *
 * A preset defines the base look; optional user overrides merge per-field and
 * any non-empty override switches the effective style to "Custom" (the UI
 * derives this from Object.keys(styleOverrides).length). The global
 * background-opacity knob is the box alpha for box styles and is forced to 0
 * for shadow-only ('none') styles.
 */

import type {
  SubtitleFontFamily,
  SubtitleStyleOverrides,
  SubtitleStylePresetId,
} from '@/types/config';

/** Fully resolved style bundle consumed by the overlay and previews. */
export interface ResolvedSubtitleStyle {
  /** Full CSS color for the translated line, e.g. 'rgba(255,255,255,1)'. */
  textColor: string;
  /** Full CSS color for the original line (preset-defined or derived at 60% alpha). */
  originalTextColor: string;
  /** Box background as an rgb triplet, e.g. '0,0,0'. */
  backgroundColor: string;
  /** Box alpha 0–1; 0 when the style has no box. */
  backgroundOpacity: number;
  /** Box corner radius in px. */
  borderRadius: number;
  /** CSS text-shadow value; 'none' disables the shadow. */
  textShadow: string;
}

interface SubtitleStylePreset {
  label: string;
  textColor: string;
  /** Explicit original-line color; absent = derived at 60% alpha of textColor. */
  originalTextColor?: string;
  backgroundStyle: 'none' | 'black-box' | 'white-box';
  shadowStrength: number;
  borderRadius: number;
}

/** The five approved presets. 'classic' reproduces the pre-preset look exactly. */
export const SUBTITLE_STYLE_PRESETS: Record<SubtitleStylePresetId, SubtitleStylePreset> = {
  classic: {
    label: 'Classic',
    textColor: '#ffffff',
    originalTextColor: 'rgba(255,255,255,0.6)',
    backgroundStyle: 'black-box',
    shadowStrength: 0.5,
    borderRadius: 8,
  },
  netflix: {
    label: 'Netflix',
    textColor: '#ffffff',
    backgroundStyle: 'none',
    shadowStrength: 0.8,
    borderRadius: 8,
  },
  'white-on-black': {
    label: 'White on black',
    textColor: '#ffffff',
    backgroundStyle: 'black-box',
    shadowStrength: 0.3,
    borderRadius: 4,
  },
  'yellow-on-black': {
    label: 'Yellow on black',
    textColor: '#f5c518',
    backgroundStyle: 'black-box',
    shadowStrength: 0.3,
    borderRadius: 4,
  },
  'black-on-white': {
    label: 'Black on white',
    textColor: '#000000',
    backgroundStyle: 'white-box',
    shadowStrength: 0,
    borderRadius: 4,
  },
};

/** Convert a hex color to rgba at the given alpha. Non-hex input passes through. */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  if (full.length !== 6) return color;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return color;
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Resolve a preset + overrides + the global background-opacity knob into the
 * concrete style bundle the overlay renders. Unknown preset ids fall back to
 * classic. Shadow alpha equals shadowStrength (classic 0.5 → the historic
 * '0 1px 3px rgba(0,0,0,0.5)' value).
 */
export function resolveSubtitleStyle(
  presetId: SubtitleStylePresetId,
  overrides: Partial<SubtitleStyleOverrides> | undefined,
  backgroundOpacity: number,
): ResolvedSubtitleStyle {
  const preset = SUBTITLE_STYLE_PRESETS[presetId] ?? SUBTITLE_STYLE_PRESETS.classic;
  const backgroundStyle = overrides?.backgroundStyle ?? preset.backgroundStyle;
  const textColor = overrides?.textColor ?? preset.textColor;
  const shadowStrength = overrides?.shadowStrength ?? preset.shadowStrength;
  return {
    textColor: withAlpha(textColor, 1),
    originalTextColor: preset.originalTextColor ?? withAlpha(textColor, 0.6),
    backgroundColor: backgroundStyle === 'white-box' ? '255,255,255' : '0,0,0',
    backgroundOpacity: backgroundStyle === 'none' ? 0 : backgroundOpacity,
    borderRadius: preset.borderRadius,
    textShadow:
      shadowStrength > 0
        ? `0 1px 3px rgba(0,0,0,${(shadowStrength).toFixed(2)})`
        : 'none',
  };
}

/** Single source of truth for the subtitle font-family setting → CSS stack. */
export function resolveSubtitleFontFamily(fontFamily: SubtitleFontFamily | undefined): string {
  const map: Record<SubtitleFontFamily, string> = {
    serif: 'Georgia, serif',
    monospace: 'monospace',
    system: 'system-ui, sans-serif',
  };
  return map[fontFamily ?? 'system'] ?? 'system-ui, sans-serif';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/subtitleStylePresets.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Correct the spec's shadow mapping**

The spec said `0.5 × strength`; classic 0.5 must produce the historic alpha 0.5, so alpha = strength. Edit `docs/superpowers/specs/2026-08-05-subtitle-style-presets-design.md`:

- In §5.2 derivation rules, change:
  `textShadow = 0 1px 3px rgba(0,0,0,${0.5 × strength})` → `textShadow = 0 1px 3px rgba(0,0,0,${strength})`
- In §6 Validation, change `(0 → 'none', 1 → alpha 0.5)` → `(0 → 'none', 1 → alpha 1.0)`

- [ ] **Step 6: Commit**

```bash
git add lib/subtitleStylePresets.ts lib/__tests__/subtitleStylePresets.test.ts docs/superpowers/specs/2026-08-05-subtitle-style-presets-design.md
git commit -m "feat(subtitles): add pure subtitle style preset resolver"
```

---

## Task 3: Overlay rendering — OverlayConfig + CSS vars

**Files:**
- Modify: `content/subtitleOverlay.ts`
- Modify: `content/__tests__/subtitleOverlay.test.ts`
- Modify: `styles/subtitle.css`

- [ ] **Step 1: Write the failing tests**

In `content/__tests__/subtitleOverlay.test.ts`, extend the first `it` block ("applies and updates font-family CSS var…") after the existing `updateConfig({ displayMode: 'translation-only' })` assertion:

```ts
    updateConfig({
      textColor: 'rgba(255,255,255,1)',
      originalTextColor: 'rgba(255,255,255,0.6)',
      backgroundColor: '0,0,0',
      borderRadius: 8,
      textShadow: '0 1px 3px rgba(0,0,0,0.5)',
    });
    expect(overlay.style.getPropertyValue('--anyllm-subtitle-text-color')).toBe(
      'rgba(255,255,255,1)',
    );
    expect(overlay.style.getPropertyValue('--anyllm-subtitle-original-color')).toBe(
      'rgba(255,255,255,0.6)',
    );
    expect(overlay.style.getPropertyValue('--anyllm-subtitle-bg-color')).toBe('0,0,0');
    expect(overlay.style.getPropertyValue('--anyllm-subtitle-border-radius')).toBe('8px');
    expect(overlay.style.getPropertyValue('--anyllm-subtitle-text-shadow')).toBe(
      '0 1px 3px rgba(0,0,0,0.5)',
    );
```

Add a new `it` block right after that first describe block (inside `describe('subtitleOverlay — fontFamily / displayMode wiring')`):

```ts
  it('defaults the style fields to the classic look', () => {
    const video = document.querySelector('video') as HTMLVideoElement;
    vi.spyOn(video, 'getBoundingClientRect').mockReturnValue({
      top: 0, left: 0, width: 800, height: 600, bottom: 600, right: 800, x: 0, y: 0, toJSON: () => {},
    });
    initializeOverlay(MOCK_CUES);
    expect(getConfig()).toMatchObject({
      textColor: 'rgba(255,255,255,1)',
      originalTextColor: 'rgba(255,255,255,0.6)',
      backgroundColor: '0,0,0',
      borderRadius: 8,
      textShadow: '0 1px 3px rgba(0,0,0,0.5)',
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run content/__tests__/subtitleOverlay.test.ts`
Expected: FAIL — `getConfig()`/vars don't include the new fields.

- [ ] **Step 3: Implement — OverlayConfig interface**

In `content/subtitleOverlay.ts`, extend the `OverlayConfig` interface (after the `fontFamily` line):

```ts
  /** Text color for the translated line (full CSS color). */
  textColor: string;
  /** Text color for the original line (full CSS color). */
  originalTextColor: string;
  /** Box background as an rgb triplet, e.g. '0,0,0'. */
  backgroundColor: string;
  /** Box corner radius in px. */
  borderRadius: number;
  /** CSS text-shadow value ('none' disables). */
  textShadow: string;
```

Extend `DEFAULT_CONFIG` (after the `displayMode` line):

```ts
  textColor: 'rgba(255,255,255,1)',
  originalTextColor: 'rgba(255,255,255,0.6)',
  backgroundColor: '0,0,0',
  borderRadius: 8,
  textShadow: '0 1px 3px rgba(0,0,0,0.5)',
```

- [ ] **Step 4: Implement — updateOverlayStyle**

In `updateOverlayStyle`, after the font-family `setProperty` line:

```ts
  // Style preset fields
  overlay.style.setProperty('--anyllm-subtitle-text-color', config.textColor);
  overlay.style.setProperty('--anyllm-subtitle-original-color', config.originalTextColor);
  overlay.style.setProperty('--anyllm-subtitle-bg-color', config.backgroundColor);
  overlay.style.setProperty('--anyllm-subtitle-border-radius', `${config.borderRadius}px`);
  overlay.style.setProperty('--anyllm-subtitle-text-shadow', config.textShadow);
```

- [ ] **Step 5: Implement — styles/subtitle.css**

In `styles/subtitle.css`, replace hardcoded values with vars (fallbacks = current look). Both `.anyllm-translate-subtitle-text` blocks (the first, and the `all: revert` block later in the file):

```css
  background-color: rgba(var(--anyllm-subtitle-bg-color, 0,0,0), var(--anyllm-subtitle-bg-opacity, 0.75));
  border-radius: var(--anyllm-subtitle-border-radius, 8px);
```

Both `.anyllm-translate-subtitle-original` blocks:

```css
  color: var(--anyllm-subtitle-original-color, rgba(255,255,255,0.6));
```

Both `.anyllm-translate-subtitle-translated` blocks:

```css
  color: var(--anyllm-subtitle-text-color, rgba(255,255,255,1));
  text-shadow: var(--anyllm-subtitle-text-shadow, 0 1px 3px rgba(0,0,0,0.5));
```

Leave the `@media (prefers-color-scheme: dark)` block and fullscreen/popover overrides untouched.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run content/__tests__/subtitleOverlay.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add content/subtitleOverlay.ts content/__tests__/subtitleOverlay.test.ts styles/subtitle.css
git commit -m "feat(subtitles): render preset style fields as overlay CSS vars"
```

---

## Task 4: Coordinator wiring + live apply

**Files:**
- Modify: `content/subtitleCoordinator.ts`
- Modify: `content/__tests__/subtitleCoordinator.test.ts`

- [ ] **Step 1: Update the test mocks and fixtures**

In `content/__tests__/subtitleCoordinator.test.ts`:

(a) Add mocks next to `mockGetOverlayTextContainer` (around line 79):

```ts
const mockUpdateConfig = vi.fn();
const mockIsOverlayActive = vi.fn<(...args: unknown[]) => boolean>(() => false);
```

and extend the `vi.mock('@/content/subtitleOverlay', ...)` factory:

```ts
  updateConfig: (...args: unknown[]) => { mockUpdateConfig(...args); },
  isOverlayActive: () => mockIsOverlayActive(),
```

(b) In `MOCK_SETTINGS.subtitleSettings` (around line 140), after `fontFamily: 'system',`:

```ts
    stylePreset: 'classic',
    styleOverrides: {},
```

(c) No static import is needed — the test file loads the coordinator dynamically (`const mod = await import('@/content/subtitleCoordinator')`), so the new test uses `mod.refreshAttachedOverlayConfig(...)`.

- [ ] **Step 2: Write the failing tests**

In `content/__tests__/subtitleCoordinator.test.ts`, extend the existing renderer-config `expect.objectContaining(...)` (currently around line 1118, asserting `fontFamily: 'system-ui, sans-serif'` … `backgroundOpacity: 0.7`) with:

```ts
        textColor: 'rgba(255,255,255,1)',
        originalTextColor: 'rgba(255,255,255,0.6)',
        backgroundColor: '0,0,0',
        borderRadius: 8,
        textShadow: '0 1px 3px rgba(0,0,0,0.5)',
```

Add a new `it` block (place it near the other renderer-config tests, following the file's dynamic-import pattern):

```ts
  it('refreshAttachedOverlayConfig re-applies resolved settings and no-ops when detached', async () => {
    mockIsOverlayActive.mockReturnValue(true);
    const settings = {
      ...MOCK_SETTINGS,
      subtitleSettings: {
        ...MOCK_SETTINGS.subtitleSettings,
        stylePreset: 'netflix',
      },
    } as unknown as Awaited<ReturnType<typeof import('@/lib/config').loadSettings>>;
    const mod = await import('@/content/subtitleCoordinator');
    mod.refreshAttachedOverlayConfig(settings);
    expect(mockUpdateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundOpacity: 0,
        textColor: 'rgba(255,255,255,1)',
        originalTextColor: 'rgba(255,255,255,0.6)',
        backgroundColor: '0,0,0',
        borderRadius: 8,
        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
      }),
    );

    mockIsOverlayActive.mockReturnValue(false);
    mockUpdateConfig.mockClear();
    mod.refreshAttachedOverlayConfig(settings);
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run content/__tests__/subtitleCoordinator.test.ts`
Expected: FAIL — missing fields in config / `refreshAttachedOverlayConfig` not exported.

- [ ] **Step 4: Implement — imports and font-map deletion**

In `content/subtitleCoordinator.ts`:

(a) Change the import at line ~24:

```ts
import { getOverlayTextContainer, updateConfig, isOverlayActive } from '@/content/subtitleOverlay';
```

(b) Add after the `@/lib/constants` import (or alphabetically near the other lib imports):

```ts
import { resolveSubtitleFontFamily, resolveSubtitleStyle } from '@/lib/subtitleStylePresets';
```

(c) Delete the local `resolveSubtitleFontFamily` function (currently ~lines 443–450).

- [ ] **Step 5: Implement — buildSubtitleOverlayConfig**

Replace the body of `buildSubtitleOverlayConfig`:

```ts
function buildSubtitleOverlayConfig(
  subtitleSettings: SubtitleSettings,
  savedPrefs?: Partial<OverlayConfig>,
): Partial<OverlayConfig> {
  const style = resolveSubtitleStyle(
    subtitleSettings.stylePreset,
    subtitleSettings.styleOverrides,
    subtitleSettings.backgroundOpacity,
  );
  return {
    fontSize: subtitleSettings.fontSize,
    fontSizeMode: subtitleSettings.fontSizeMode,
    position: subtitleSettings.position,
    backgroundOpacity: style.backgroundOpacity,
    fontFamily: resolveSubtitleFontFamily(subtitleSettings.fontFamily),
    displayMode: subtitleSettings.displayMode,
    textColor: style.textColor,
    originalTextColor: style.originalTextColor,
    backgroundColor: style.backgroundColor,
    borderRadius: style.borderRadius,
    textShadow: style.textShadow,
    offsetX: savedPrefs?.offsetX ?? 0,
    offsetY: savedPrefs?.offsetY ?? 0,
  };
}
```

- [ ] **Step 6: Implement — live-apply**

Add a module-level timer near `proactiveCategoryDetectionTimer`:

```ts
/** Debounced timer for re-applying settings to an attached overlay. */
let styleApplyTimer: ReturnType<typeof setTimeout> | null = null;
```

Add an exported helper (place it directly above `startCoordinator`):

```ts
/**
 * Re-apply the latest settings to an attached overlay (style live-apply).
 * No-op when no renderer is attached. Called debounced from the storage
 * change listener; the renderer config carries the saved drag offsets.
 */
export function refreshAttachedOverlayConfig(
  settings: Awaited<ReturnType<typeof loadSettings>>,
): void {
  if (!isOverlayActive()) return;
  const config = buildSubtitleOverlayConfig(
    settings.subtitleSettings,
    state.rendererConfig ?? undefined,
  );
  updateConfig(config);
}
```

Replace the `settingsChangeListener` body in `startCoordinator`:

```ts
  const settingsChangeListener = () => {
    loadSettings().then((s) => {
      state.cachedSettings = s;
      pushSubtitleConfigToMainWorld(s);
      if (styleApplyTimer) clearTimeout(styleApplyTimer);
      styleApplyTimer = setTimeout(() => {
        styleApplyTimer = null;
        refreshAttachedOverlayConfig(s);
      }, 100);
    }).catch(() => {});
  };
```

In the coordinator stop/cleanup function (where the `settingsChangeListener` is removed, ~line 2698), add before the listener removal:

```ts
    if (styleApplyTimer) {
      clearTimeout(styleApplyTimer);
      styleApplyTimer = null;
    }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run content/__tests__/subtitleCoordinator.test.ts`
Expected: PASS.

- [ ] **Step 8: Typecheck + full content suite + commit**

Run: `npx tsc --noEmit && npx vitest run content`
Expected: clean, all pass.

```bash
git add content/subtitleCoordinator.ts content/__tests__/subtitleCoordinator.test.ts
git commit -m "feat(subtitles): resolve preset style in overlay config with live apply"
```

---

## Task 5: Mini-studio prefs bridge

**Files:**
- Modify: `content/playerChrome/prefs.ts`
- Modify: `content/__tests__/playerChrome/prefs.test.ts`

- [ ] **Step 1: Write the failing tests**

In `content/__tests__/playerChrome/prefs.test.ts`:

(a) Add `setStylePreset` to the import list from `'@/content/playerChrome/prefs'`.

(b) Add two new `it` blocks (after the existing `setSubtitlesEnabled…` block):

```ts
  it('loadMiniStudioSnapshot maps style preset, overrides, and custom state', async () => {
    loadSettings.mockResolvedValueOnce({
      subtitleSettings: {
        enabled: true,
        fontSize: 18,
        position: 'bottom',
        backgroundOpacity: 0.7,
        stylePreset: 'netflix',
        styleOverrides: { shadowStrength: 0.2 },
      },
    });
    const snap = await loadMiniStudioSnapshot();
    expect(snap.stylePreset).toBe('netflix');
    expect(snap.styleOverrides).toEqual({ shadowStrength: 0.2 });
    expect(snap.hasCustomStyle).toBe(true);
  });

  it('setStylePreset writes settings, clears overrides, and live-applies the resolved style', async () => {
    loadSettings.mockResolvedValueOnce({
      subtitleSettings: {
        enabled: true,
        fontSize: 18,
        position: 'bottom',
        backgroundOpacity: 0.7,
        stylePreset: 'classic',
        styleOverrides: {},
      },
    });
    await setStylePreset('netflix');
    expect(updateSettings).toHaveBeenCalledWith({
      subtitleSettings: expect.objectContaining({ stylePreset: 'netflix', styleOverrides: {} }),
    });
    expect(updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundOpacity: 0,
        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
        textColor: 'rgba(255,255,255,1)',
        borderRadius: 8,
      }),
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run content/__tests__/playerChrome/prefs.test.ts`
Expected: FAIL — snapshot has no `stylePreset`/`hasCustomStyle`; `setStylePreset` not exported.

- [ ] **Step 3: Implement — prefs.ts**

(a) Imports — extend the existing import from `'@/types/config'` with `SubtitleStyleOverrides, SubtitleStylePresetId` (keep `SubtitleDisplayMode`), and add:

```ts
import { resolveSubtitleStyle } from '@/lib/subtitleStylePresets';
```

(b) `MiniStudioSnapshot` — add:

```ts
  stylePreset: SubtitleStylePresetId;
  styleOverrides: Partial<SubtitleStyleOverrides>;
  hasCustomStyle: boolean;
```

(c) `loadMiniStudioSnapshot` — in the context-invalidated early-return object add:

```ts
      stylePreset: 'classic',
      styleOverrides: {},
      hasCustomStyle: false,
```

and in the main return object add:

```ts
    stylePreset: ss.stylePreset,
    styleOverrides: ss.styleOverrides ?? {},
    hasCustomStyle: Object.keys(ss.styleOverrides ?? {}).length > 0,
```

(d) `setAppearance` — replace the `updateConfig({...})` call with a resolved-style version (the settings write above stays):

```ts
  const style = resolveSubtitleStyle(next.stylePreset, next.styleOverrides, next.backgroundOpacity);
  updateConfig({
    fontSize: next.fontSize,
    position: next.position,
    backgroundOpacity: style.backgroundOpacity,
    displayMode: next.displayMode,
    textColor: style.textColor,
    originalTextColor: style.originalTextColor,
    backgroundColor: style.backgroundColor,
    borderRadius: style.borderRadius,
    textShadow: style.textShadow,
  });
```

(e) Add after `setAppearance`:

```ts
export async function setStylePreset(presetId: SubtitleStylePresetId): Promise<void> {
  if (isContextInvalidated()) return;
  const settings = await loadSettings();
  const next = { ...settings.subtitleSettings, stylePreset: presetId, styleOverrides: {} };
  await updateSettings({ subtitleSettings: next });
  const style = resolveSubtitleStyle(presetId, {}, next.backgroundOpacity);
  updateConfig({
    backgroundOpacity: style.backgroundOpacity,
    textColor: style.textColor,
    originalTextColor: style.originalTextColor,
    backgroundColor: style.backgroundColor,
    borderRadius: style.borderRadius,
    textShadow: style.textShadow,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run content/__tests__/playerChrome/prefs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add content/playerChrome/prefs.ts content/__tests__/playerChrome/prefs.test.ts
git commit -m "feat(subtitles): mini studio style preset bridge"
```

---

## Task 6: Mini-studio view + wiring

**Files:**
- Modify: `content/playerChrome/miniStudioView.ts`
- Modify: `content/playerChrome/miniStudioCss.ts`
- Modify: `content/playerChrome/miniStudio.ts`
- Modify: `content/__tests__/playerChrome/miniStudio.test.ts`
- Modify: `content/__tests__/playerChrome/lifecycle.test.ts`

- [ ] **Step 1: Update test mocks**

In `content/__tests__/playerChrome/lifecycle.test.ts`, the `vi.mock('@/content/playerChrome/prefs', ...)` factory — add `setStylePreset: vi.fn(async () => {}),`.

In `content/__tests__/playerChrome/miniStudio.test.ts`:
(a) The prefs mock factory — add `setStylePreset: vi.fn(async () => {}),` and to the base snapshot object add:

```ts
    stylePreset: 'classic',
    styleOverrides: {},
    hasCustomStyle: false,
```

(b) Add a new `it` block after the "applies snapshot to widgets…" test:

```ts
  it('style select reflects the snapshot and calls setStylePreset on change', async () => {
    vi.mocked(prefs.loadMiniStudioSnapshot).mockResolvedValueOnce({
      enabled: true,
      displayMode: 'bilingual',
      fontSize: 18,
      position: 'bottom',
      backgroundOpacity: 0.7,
      stylePreset: 'netflix',
      styleOverrides: {},
      hasCustomStyle: false,
      knobs: {},
      lists: [],
      activeListId: null,
      hostname: 'youtube.com',
      status: 'idle',
    });
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    const btn = document.createElement('button');
    shadow.appendChild(btn);
    const studio = attachMiniStudio({ shadow, anchorButton: btn, onOpenChange: vi.fn() });
    await studio.open();

    const panel = shadow.querySelector(`.${PLAYER_CHROME_PANEL_CLASS}`) as HTMLElement;
    const select = panel.querySelector('[data-action="stylePreset"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe('netflix');
    // All five preset options render
    expect(select.options.length).toBe(5);

    select.value = 'classic';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(prefs.setStylePreset).toHaveBeenCalledWith('classic');
    studio.destroy();
  });

  it('shows a Custom option when style overrides exist', async () => {
    vi.mocked(prefs.loadMiniStudioSnapshot).mockResolvedValueOnce({
      enabled: true,
      displayMode: 'bilingual',
      fontSize: 18,
      position: 'bottom',
      backgroundOpacity: 0.7,
      stylePreset: 'classic',
      styleOverrides: { textColor: '#ff0000' },
      hasCustomStyle: true,
      knobs: {},
      lists: [],
      activeListId: null,
      hostname: 'youtube.com',
      status: 'idle',
    });
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    const btn = document.createElement('button');
    shadow.appendChild(btn);
    const studio = attachMiniStudio({ shadow, anchorButton: btn, onOpenChange: vi.fn() });
    await studio.open();

    const panel = shadow.querySelector(`.${PLAYER_CHROME_PANEL_CLASS}`) as HTMLElement;
    const select = panel.querySelector('[data-action="stylePreset"]') as HTMLSelectElement;
    expect(select.options.length).toBe(6);
    expect(select.value).toBe('custom');
    expect(select.options[5].textContent).toBe('Custom');
    studio.destroy();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run content/__tests__/playerChrome/miniStudio.test.ts`
Expected: FAIL — no `[data-action="stylePreset"]` element; `setStylePreset` undefined in mock module.

- [ ] **Step 3: Implement — miniStudioView.ts**

(a) Imports — extend the `./widgets` import with `type SelectWidget`, add:

```ts
import { SUBTITLE_STYLE_PRESETS, type ResolvedSubtitleStyle } from '@/lib/subtitleStylePresets';
import type { SubtitleStylePresetId } from '@/types/config';
```

(b) `MiniStudioView` interface — add `styleSelect: SelectWidget;` (after `displayMode`).

(c) Template — in `panel.innerHTML`, inside the Appearance section, after the Display row add a Style row, and update the row-index comment:

```html
      <div class="row"><span class="row-label">Style</span></div>
```
and the comment below the `rows` querySelectorAll:
```ts
  // rows: 0=Display, 1=Style, 2=Font size, 3=Position, 4=Background, 5=Glossary list
```

(d) Widget construction — after the `displayMode` block insert:

```ts
  const styleSelect = buildSelect({ id: 'anyllm-ms-style', action: 'stylePreset' });
  rows[1]?.appendChild(styleSelect.root);
```

and shift the existing indices: `rows[2]` → fontSize, `rows[3]` → position, `rows[4]` → opacity, `rows[5]` → glossary.

(e) Return object — add `styleSelect,`.

(f) Add a fill helper after `fillSelect`:

```ts
/** Fill the style select with the five presets (+ Custom when overridden). */
export function fillStyleSelect(
  select: HTMLSelectElement,
  current: SubtitleStylePresetId,
  hasCustom: boolean,
): void {
  select.innerHTML = '';
  for (const id of Object.keys(SUBTITLE_STYLE_PRESETS) as SubtitleStylePresetId[]) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = SUBTITLE_STYLE_PRESETS[id].label;
    select.appendChild(opt);
  }
  if (hasCustom) {
    const opt = document.createElement('option');
    opt.value = 'custom';
    opt.textContent = 'Custom';
    select.appendChild(opt);
  }
  select.value = hasCustom ? 'custom' : current;
}
```

(g) `updatePreview` — extend args and body:

```ts
export function updatePreview(
  preview: PreviewElements,
  args: {
    fontSize: number;
    backgroundOpacity: number;
    position: 'top' | 'bottom';
    displayMode: string;
    style: ResolvedSubtitleStyle;
  },
): void {
  preview.cue.style.fontSize = `${Math.round(args.fontSize * PREVIEW_FONT_SCALE)}px`;
  const bgOpacity = args.style.backgroundOpacity === 0 ? 0 : args.backgroundOpacity;
  preview.cue.style.setProperty('--preview-bg', String(bgOpacity));
  preview.cue.style.setProperty('--preview-bg-color', args.style.backgroundColor);
  preview.cue.style.borderRadius = `${args.style.borderRadius}px`;
  preview.cue.style.textShadow = args.style.textShadow;
  preview.original.style.color = args.style.originalTextColor;
  preview.translated.style.color = args.style.textColor;
  preview.root.dataset.position = args.position;
  preview.root.dataset.display = args.displayMode;
}
```

- [ ] **Step 4: Implement — miniStudioCss.ts**

In `MINI_STUDIO_CSS`, change the `.preview-cue` background rule:

```css
  background: rgba(var(--preview-bg-color,0,0,0),var(--preview-bg,0.7));
```

- [ ] **Step 5: Implement — miniStudio.ts**

(a) Imports — add to the `./prefs` import list `setStylePreset`; to the `./miniStudioView` import list add `fillStyleSelect`; add:

```ts
import { resolveSubtitleStyle, type ResolvedSubtitleStyle } from '@/lib/subtitleStylePresets';
import type { SubtitleStylePresetId } from '@/types/config';
```

(b) Module-level default preview style (above `attachMiniStudio`):

```ts
const DEFAULT_PREVIEW_STYLE: ResolvedSubtitleStyle = resolveSubtitleStyle('classic', undefined, 0.7);
```

(c) In `attachMiniStudio`, near `let closeTimer ...` add `let lastStyle: ResolvedSubtitleStyle = DEFAULT_PREVIEW_STYLE;`.

(d) `currentPreviewArgs()` — extend the return type with `style: ResolvedSubtitleStyle;` and add `style: lastStyle,` to the returned object.

(e) `applySnapshot` — after `view.position.setValue(snap.position);` add:

```ts
    lastStyle = resolveSubtitleStyle(snap.stylePreset, snap.styleOverrides, snap.backgroundOpacity);
    fillStyleSelect(view.styleSelect.select, snap.stylePreset, snap.hasCustomStyle);
```

and add `style: lastStyle,` to the `updatePreview(view.preview, {...})` call.

(f) Event wiring — after the opacity `change` listener add:

```ts
  view.styleSelect.select.addEventListener('change', () => {
    const value = view.styleSelect.select.value;
    if (value === 'custom') return;
    void setStylePreset(value as SubtitleStylePresetId).then(() => refresh());
  });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run content/__tests__/playerChrome`
Expected: PASS (miniStudio + lifecycle + prefs).

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add content/playerChrome/miniStudioView.ts content/playerChrome/miniStudioCss.ts content/playerChrome/miniStudio.ts content/__tests__/playerChrome/miniStudio.test.ts content/__tests__/playerChrome/lifecycle.test.ts
git commit -m "feat(subtitles): mini studio style preset select with live preview"
```

---

## Task 7: Options UI — AppearanceCard + preview sync

**Files:**
- Modify: `entrypoints/options/sections/subtitles/AppearanceCard.tsx`
- Create: `entrypoints/options/sections/subtitles/__tests__/AppearanceCard.test.tsx`
- Modify: `entrypoints/options/components/SubtitlePreview.tsx`
- Modify: `entrypoints/options/sections/SubtitlesSection.tsx`

- [ ] **Step 1: Write the failing tests**

Create `entrypoints/options/sections/subtitles/__tests__/AppearanceCard.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppearanceCard } from '@/entrypoints/options/sections/subtitles/AppearanceCard';
import { DEFAULT_SUBTITLE_SETTINGS } from '@/types/config';

function renderCard(overrides: Partial<typeof DEFAULT_SUBTITLE_SETTINGS> = {}) {
  const onUpdate = vi.fn();
  const utils = render(
    <AppearanceCard
      settings={{ ...DEFAULT_SUBTITLE_SETTINGS, ...overrides }}
      disabled={false}
      onUpdate={onUpdate}
    />,
  );
  return { onUpdate, ...utils };
}

describe('AppearanceCard — style presets', () => {
  it('renders five preset chips with Classic active by default', () => {
    renderCard();
    for (const label of ['Classic', 'Netflix', 'White on black', 'Yellow on black', 'Black on white']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Classic' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Netflix' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('picking a preset updates settings and clears overrides', () => {
    const { onUpdate } = renderCard({ styleOverrides: { textColor: '#ff0000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Netflix' }));
    expect(onUpdate).toHaveBeenCalledWith({ stylePreset: 'netflix', styleOverrides: {} });
  });

  it('shows a Custom badge when overrides exist and hides it after picking a preset', () => {
    const { onUpdate, rerender } = renderCard({ styleOverrides: { shadowStrength: 0.2 } });
    expect(screen.getByText('Custom')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yellow on black' }));
    expect(onUpdate).toHaveBeenCalledWith({ stylePreset: 'yellow-on-black', styleOverrides: {} });
    rerender(
      <AppearanceCard
        settings={{ ...DEFAULT_SUBTITLE_SETTINGS, stylePreset: 'yellow-on-black', styleOverrides: {} }}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );
    expect(screen.queryByText('Custom')).not.toBeInTheDocument();
  });

  it('customize controls write style overrides', () => {
    const { onUpdate } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Customize/i }));
    const color = screen.getByLabelText('Text color') as HTMLInputElement;
    fireEvent.change(color, { target: { value: '#f5c518' } });
    expect(onUpdate).toHaveBeenCalledWith({ styleOverrides: { textColor: '#f5c518' } });
  });

  it('dims the backdrop slider when the effective background style is none', () => {
    const { container } = renderCard({ stylePreset: 'netflix' });
    expect(container.querySelector('.opacity-50')).not.toBeNull();
  });

  it('keeps the backdrop slider enabled for box styles', () => {
    const { container } = renderCard({ stylePreset: 'classic' });
    expect(container.querySelector('.opacity-50')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run entrypoints/options/sections/subtitles/__tests__/AppearanceCard.test.tsx`
Expected: FAIL — no preset buttons in the card.

- [ ] **Step 3: Implement — AppearanceCard.tsx**

(a) Imports — add:

```tsx
import { Badge } from '@/ui/Badge';
import { AdvancedDisclosure } from '@/ui/AdvancedDisclosure';
import { SUBTITLE_STYLE_PRESETS } from '@/lib/subtitleStylePresets';
import type { SubtitleStyleOverrides, SubtitleStylePresetId } from '@/types/config';
```

(b) Module constants (after the existing `DISPLAY_MODE_OPTIONS`):

```tsx
const BACKGROUND_STYLE_OPTIONS = [
  { value: 'none' as const, label: 'None' },
  { value: 'black-box' as const, label: 'Black box' },
  { value: 'white-box' as const, label: 'White box' },
];

const STYLE_PRESET_IDS = Object.keys(SUBTITLE_STYLE_PRESETS) as SubtitleStylePresetId[];
```

(c) Inside `AppearanceCard`, before the return, derive:

```tsx
  const overrides = settings.styleOverrides ?? {};
  const hasCustom = Object.keys(overrides).length > 0;
  const preset = SUBTITLE_STYLE_PRESETS[settings.stylePreset] ?? SUBTITLE_STYLE_PRESETS.classic;
  const effectiveBackgroundStyle = overrides.backgroundStyle ?? preset.backgroundStyle;
  const setOverride = (partial: Partial<SubtitleStyleOverrides>) => {
    onUpdate({ styleOverrides: { ...overrides, ...partial } });
  };
```

(d) JSX — insert a new `SettingsGroup` as the first group inside the `<div className="space-y-5">`:

```tsx
          <SettingsGroup title="Style" description="Preset caption looks. Classic is the original look.">
            <div className="flex flex-wrap items-center gap-1.5">
              {STYLE_PRESET_IDS.map((id) => {
                const active = !hasCustom && settings.stylePreset === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onUpdate({ stylePreset: id, styleOverrides: {} })}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                      active
                        ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                        : 'bg-zinc-800/60 text-zinc-400 border-zinc-700/70 hover:text-zinc-200 hover:border-zinc-600'
                    }`}
                  >
                    {SUBTITLE_STYLE_PRESETS[id].label}
                  </button>
                );
              })}
              {hasCustom && <Badge>Custom</Badge>}
            </div>
            <AdvancedDisclosure label="Customize colors" idPrefix="subtitle-style-custom">
              <div className="space-y-4 pt-1">
                <div>
                  <label
                    htmlFor="subtitle-style-text-color"
                    className="text-xs text-zinc-400"
                  >
                    Text color
                  </label>
                  <input
                    id="subtitle-style-text-color"
                    type="color"
                    value={overrides.textColor ?? preset.textColor}
                    onChange={(e) => setOverride({ textColor: e.target.value })}
                    className="mt-1 h-8 w-14 rounded border border-zinc-700 bg-zinc-900 p-1"
                  />
                </div>
                <SegmentedControl
                  label="Background"
                  options={BACKGROUND_STYLE_OPTIONS}
                  value={overrides.backgroundStyle ?? preset.backgroundStyle}
                  onChange={(val) => setOverride({ backgroundStyle: val })}
                  disabled={disabled}
                  accent="cyan"
                />
                <Slider
                  id="subtitle-style-shadow"
                  label="Shadow Strength"
                  value={overrides.shadowStrength ?? preset.shadowStrength}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => setOverride({ shadowStrength: v })}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  minLabel="None"
                  maxLabel="Strong"
                  disabled={disabled}
                />
              </div>
            </AdvancedDisclosure>
          </SettingsGroup>
```

(e) Backdrop group — wrap the opacity slider:

```tsx
          <SettingsGroup title="Backdrop">
            <DisabledDimmer disabled={effectiveBackgroundStyle === 'none'}>
              <Slider
                id="subtitle-opacity"
                label="Background Opacity"
                value={settings.backgroundOpacity}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => onUpdate({ backgroundOpacity: v })}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                minLabel="0%"
                maxLabel="100%"
                disabled={disabled}
              />
            </DisabledDimmer>
          </SettingsGroup>
```

- [ ] **Step 4: Implement — SubtitlePreview.tsx**

(a) Imports — replace the local font map and type imports:

```ts
import {
  SUBTITLE_STYLE_PRESETS,
  resolveSubtitleFontFamily,
  resolveSubtitleStyle,
} from '@/lib/subtitleStylePresets';
import type {
  SubtitleDisplayMode,
  SubtitleFontFamily,
  SubtitleFontSizeMode,
  SubtitleStyleOverrides,
  SubtitleStylePresetId,
} from '@/types/config';
```

Delete the local `resolveFontFamily` function.

(b) `AnimatedCue` — add `stylePreset: SubtitleStylePresetId;` and `styleOverrides: Partial<SubtitleStyleOverrides>;` to the destructured props and the inline type; inside the component replace the font/color lines:

```ts
  const previewFontSize = scalePreviewFontSize(fontSize, fontSizeMode);
  const resolvedFont = resolveSubtitleFontFamily(fontFamily);
  const style = resolveSubtitleStyle(stylePreset, styleOverrides, backgroundOpacity);
  const isTop = position === 'top';
  const cue = cues[cueIndex] ?? cues[0];
```

and in the active-cue div style:

```ts
      style={{
        backgroundColor: `rgba(${style.backgroundColor},${style.backgroundOpacity})`,
        borderRadius: `${style.borderRadius}px`,
        textShadow: style.textShadow,
        opacity: phase === 'visible' ? 1 : 0,
        transition: 'opacity 0.5s ease-in-out',
        fontFamily: resolvedFont,
        fontSize: `${previewFontSize}px`,
        maxWidth: '90%',
      }}
```

and the two lines' colors:

```tsx
      {displayMode === 'bilingual' && (
        <div className="leading-tight" style={{ color: style.originalTextColor }}>
          {cue.original}
        </div>
      )}
      <div className="leading-tight font-medium" style={{ color: style.textColor }}>
        {cue.translated}
      </div>
```

(Remove the `text-zinc-300`/`text-white` classes so the inline colors win.)

(c) `SubtitlePreviewProps` — add:

```ts
  stylePreset: SubtitleStylePresetId;
  styleOverrides?: Partial<SubtitleStyleOverrides>;
```

(d) `SubtitlePreview` component — destructure `stylePreset, styleOverrides = {},`; compute the style chip and pass props to `AnimatedCue`:

```ts
  const styleChipLabel =
    Object.keys(styleOverrides).length > 0
      ? 'Custom'
      : SUBTITLE_STYLE_PRESETS[stylePreset]?.label ?? 'Classic';
```

and in the summary chips array:

```tsx
          {[styleChipLabel, chips.position, chips.display, chips.size, chips.opacity].map(
            (label) => (
              <span
                key={label}
                className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/50"
              >
                {label}
              </span>
            ),
          )}
```

and pass `stylePreset={stylePreset}` / `styleOverrides={styleOverrides}` to `<AnimatedCue … />`.

- [ ] **Step 5: Implement — SubtitlesSection.tsx**

Pass the new props to `SubtitlePreview` (next to the existing `backgroundOpacity={subtitleSettings.backgroundOpacity}` prop):

```tsx
          stylePreset={subtitleSettings.stylePreset}
          styleOverrides={subtitleSettings.styleOverrides}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run entrypoints/options/sections/subtitles/__tests__/AppearanceCard.test.tsx`
Expected: PASS.

- [ ] **Step 7: Full options suite + typecheck + commit**

Run: `npx vitest run entrypoints/options && npx tsc --noEmit`
Expected: all pass (existing SubtitlesSection tests only assert headings — unaffected).

```bash
git add entrypoints/options/sections/subtitles/AppearanceCard.tsx entrypoints/options/sections/subtitles/__tests__/AppearanceCard.test.tsx entrypoints/options/components/SubtitlePreview.tsx entrypoints/options/sections/SubtitlesSection.tsx
git commit -m "feat(subtitles): style preset picker in options with synced preview"
```

---

## Task 8: Quality gate + close

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: all pass, 0 failures.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Lint**

Run: `npx eslint .`
Expected: 0 errors in changed files (pre-existing errors in untouched files, if any, are out of scope — do not fix them).

- [ ] **Step 4: Manual smoke (optional, if a browser is available)**

Load the built extension, open a video page (e.g. YouTube), activate subtitles, then in Settings → Subtitles switch presets: Classic shows the box; Netflix shows shadow-only white text; Yellow on black shows `#f5c518` text; the in-player mini studio style select applies live without reload.

- [ ] **Step 5: Commit any remaining changes and close the bd issue**

```bash
git add -A
git commit -m "chore(subtitles): style presets quality gate"
bd close AnyLLMTranslate-8l8 --reason="Style presets implemented: 5 presets (classic default), custom overrides with badge, options + mini studio pickers, live apply, resolver tested; vitest/tsc/eslint clean."
```

---

## Self-Review Notes

- **Spec coverage:** presets table → Task 2; customize knobs + Custom badge → Task 7; options picker → Task 7; mini-studio picker → Task 6; derived dimmer original → resolver (Task 2, `withAlpha(textColor, 0.6)`); live apply → Task 4; preview sync + font-map dedup → Task 7 (resolver import in Task 2); migration-free default `classic` → Task 1 defaults + Task 2 test.
- **Type consistency:** `SubtitleStylePresetId` / `SubtitleStyleOverrides` / `ResolvedSubtitleStyle` names are used identically across Tasks 2–7. `resolveSubtitleFontFamily` is deleted from the coordinator (Task 4) and the preview (Task 7) only after the lib export exists (Task 2).
- **Shadow mapping:** spec corrected in Task 2 Step 5 — alpha equals strength so classic (0.5) reproduces the historic `rgba(0,0,0,0.5)`.
- **Known test-fixture touch points:** coordinator `MOCK_SETTINGS` (Task 4), miniStudio/lifecycle prefs mocks (Task 6) — both listed explicitly.
