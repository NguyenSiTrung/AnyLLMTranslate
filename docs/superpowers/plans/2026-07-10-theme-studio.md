# Theme Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Settings → Themes into a Theme Studio: article-mock canvas, real-CSS gallery, categories, soft-preview, and polished custom editor — without new storage keys or new theme IDs.

**Architecture:** Expand `lib/themes.ts` into a single exhaustive registry. Build focused presentational pieces (`ThemeMiniPreview`, `ThemeCard`, `ThemeGallery`, `ThemeStudioCanvas`) wired by `ThemesSection`. Canvas and cards apply real `inject.css` via `data-anyllm-theme` / `anyllm-dark` / position / state attrs (already imported in options `main.tsx`). Ephemeral UI state stays local; committed theme remains `settings.theme` / `settings.customTheme`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Lucide React, Zustand (`useSettingsStore`), Vitest + Testing Library (jsdom for `entrypoints/**`), existing `ui/*` primitives, `styles/inject.css`.

**Spec:** `docs/superpowers/specs/2026-07-10-theme-studio-design.md`  
**Beads:** ALT-z84

## Global Constraints

- No new `chrome.storage` / settings schema keys — only `theme` and `customTheme` (existing).
- Do not add new `ThemeName` values beyond current 16 presets + `custom`.
- Do not change page-facing theme CSS rules in `styles/inject.css` unless a bug blocks studio fidelity (prefer scoping fixes in options components).
- Soft-preview (hover/focus) must **never** call `updateSettings` / write storage.
- Default canvas mode: `'match'` (Match page contrast).
- Sample states collapsed by default (`showSampleStates = false`).
- Section accent: `cyan` or `teal` (not `pink`); selected card ring: cyan/teal family (not blue/pink).
- Gallery a11y: `role="radiogroup"` + cards `role="radio"` + `aria-checked` on **committed** theme only.
- `prefers-reduced-motion`: no select bounce / interactive one-shot demos.
- General tab keeps summary + select + Browse themes; select continues to **exclude** `custom`.
- DRY: single registry in `lib/themes.ts`; remove inline `THEMES` array from `ThemesSection`.
- TDD where pure logic exists; component smoke tests for section behavior.
- Options already imports `@/styles/inject.css` in `entrypoints/options/main.tsx` — do not drop that import.
- Zinc dark chrome for settings chrome; article shell may be light or dark.

---

## File map

| File | Responsibility |
|------|----------------|
| Modify `lib/themes.ts` | Full registry: categories, tips, helpers; keep General select helpers |
| Modify `lib/__tests__/themes.test.ts` | Exhaustiveness, categories, tips, select excludes custom |
| Create `lib/customThemePresets.ts` | Map preset → approximate `CustomThemeConfig` for “Start from” |
| Create `lib/__tests__/customThemePresets.test.ts` | Mapping coverage for a few presets + unknown fallback |
| Create `entrypoints/options/components/ThemeMiniPreview.tsx` | Shared real-CSS bilingual snippet (cards + optional reuse) |
| Create `entrypoints/options/components/ThemeCard.tsx` | Visual card + a11y radio semantics |
| Create `entrypoints/options/components/ThemeGallery.tsx` | Category filter + radiogroup grid |
| Create `entrypoints/options/ThemeStudioCanvas.tsx` | Article mock + toolbar (evolves ThemePreview) |
| Delete or re-export `entrypoints/options/ThemePreview.tsx` | Avoid dual preview paths — re-export canvas or delete after migration |
| Modify `entrypoints/options/CustomThemeEditor.tsx` | No fill, Start from, shared Select, layout sections |
| Rewrite `entrypoints/options/sections/ThemesSection.tsx` | Theme Studio shell, split layout, ephemeral state |
| Create `entrypoints/options/sections/__tests__/ThemesSection.test.tsx` | Section smoke tests |
| Modify `entrypoints/options/App.tsx` | Optional: pass `onNavigateToGeneral` into ThemesSection |
| Touch `entrypoints/options/sections/GeneralSection.tsx` only if registry API renames require import updates |

**Do not modify:** content scripts, `stores/settingsStore` schema, theme CSS semantics on real pages (unless fidelity bug).

---

### Task 1: Exhaustive theme registry (C1 foundation)

**Files:**
- Modify: `lib/themes.ts`
- Modify: `lib/__tests__/themes.test.ts`

**Interfaces:**
- Consumes: `ThemeName` from `@/types/config`
- Produces:
  - `export type ThemeCategory = 'classic' | 'accent' | 'layout' | 'interactive' | 'custom'`
  - `export interface ThemeDefinition { id: ThemeName; label: string; description: string; category: ThemeCategory; tip?: string }`
  - `export const THEME_DEFINITIONS: ThemeDefinition[]` — length 17, includes `custom`
  - `export function getThemeDefinition(id: ThemeName): ThemeDefinition | undefined`
  - `export function getThemeOptionMeta(id: ThemeName): ThemeDefinition | undefined` — alias or same as getThemeDefinition for General
  - `export function themeOptionsForSelect(): { value: string; label: string }[]` — **excludes** `custom`
  - `export function themesByCategory(category: ThemeCategory | 'all'): ThemeDefinition[]`
  - `export const THEME_CATEGORY_ORDER: Array<ThemeCategory | 'all'>` optional helper for chips
  - Keep backward-compatible export: `GENERAL_THEME_OPTIONS` can be `THEME_DEFINITIONS.filter(t => t.id !== 'custom')` so existing imports keep working

- [ ] **Step 1: Write the failing tests**

Replace/extend `lib/__tests__/themes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { ThemeName } from '@/types/config';
import {
  THEME_DEFINITIONS,
  GENERAL_THEME_OPTIONS,
  getThemeDefinition,
  getThemeOptionMeta,
  themeOptionsForSelect,
  themesByCategory,
} from '@/lib/themes';

const ALL_THEME_NAMES: ThemeName[] = [
  'dividing-line',
  'blockquote',
  'paper',
  'underline',
  'dashed-underline',
  'highlight',
  'wavy-underline',
  'bubble',
  'side-by-side',
  'mask',
  'fade-in',
  'italic',
  'dotted-border',
  'shadow-card',
  'minimal',
  'gradient-accent',
  'custom',
];

describe('THEME_DEFINITIONS', () => {
  it('includes every ThemeName exactly once', () => {
    const ids = THEME_DEFINITIONS.map((t) => t.id);
    expect(ids.sort()).toEqual([...ALL_THEME_NAMES].sort());
    expect(new Set(ids).size).toBe(ALL_THEME_NAMES.length);
  });

  it('assigns categories per design spec', () => {
    const byId = Object.fromEntries(THEME_DEFINITIONS.map((t) => [t.id, t.category]));
    expect(byId['blockquote']).toBe('classic');
    expect(byId['highlight']).toBe('accent');
    expect(byId['side-by-side']).toBe('layout');
    expect(byId['mask']).toBe('interactive');
    expect(byId['custom']).toBe('custom');
  });

  it('provides tips for interactive and custom themes', () => {
    expect(getThemeDefinition('mask')?.tip).toMatch(/hover|focus/i);
    expect(getThemeDefinition('fade-in')?.tip).toBeTruthy();
    expect(getThemeDefinition('custom')?.tip).toBeTruthy();
  });
});

describe('GENERAL_THEME_OPTIONS / select', () => {
  it('excludes custom', () => {
    expect(GENERAL_THEME_OPTIONS.map((t) => t.id)).not.toContain('custom');
    expect(themeOptionsForSelect()).toHaveLength(16);
    expect(themeOptionsForSelect().some((o) => o.value === 'custom')).toBe(false);
  });

  it('getThemeOptionMeta still resolves bubble', () => {
    expect(getThemeOptionMeta('bubble')).toEqual(
      expect.objectContaining({ id: 'bubble', label: 'Speech Bubble' }),
    );
  });
});

describe('themesByCategory', () => {
  it('returns all for all', () => {
    expect(themesByCategory('all')).toHaveLength(17);
  });

  it('filters classic', () => {
    const ids = themesByCategory('classic').map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining(['dividing-line', 'blockquote', 'paper', 'underline', 'italic', 'minimal']),
    );
    expect(ids).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/__tests__/themes.test.ts`

Expected: FAIL (missing exports / incomplete definitions)

- [ ] **Step 3: Implement registry**

Rewrite `lib/themes.ts` to define full `THEME_DEFINITIONS` with labels/descriptions from current ThemesSection + General:

| id | label | description | category | tip |
|----|-------|-------------|----------|-----|
| dividing-line | Dividing Line | Classic separator | classic | — |
| blockquote | Blockquote | Left accent bar | classic | — |
| paper | Paper Note | Warm background | classic | — |
| underline | Underline | Bottom accent | classic | — |
| italic | Italic | Simple italic | classic | — |
| minimal | Minimal | Subtle text | classic | — |
| dashed-underline | Dashed Underline | Dashed bottom | accent | — |
| highlight | Highlight | Marker effect | accent | — |
| wavy-underline | Wavy Underline | Wavy decoration | accent | — |
| dotted-border | Dotted Border | Dotted frame | accent | — |
| gradient-accent | Gradient Accent | Gradient bg | accent | — |
| side-by-side | Side by Side | Column layout | layout | Original and translation share a row when space allows. |
| bubble | Speech Bubble | Tooltip style | layout | Translation appears in a speech-bubble style callout. |
| shadow-card | Shadow Card | Elevated card | layout | — |
| mask | Blur Mask | Hover to reveal | interactive | Hover or focus the translation to reveal it. |
| fade-in | Fade In | Delayed appear | interactive | Translation eases in after a short delay. |
| custom | Custom | Design your own | custom | Tune colors, border, and type below. Other presets may use effects custom cannot fully copy. |

Implementation sketch:

```typescript
import type { ThemeName } from '@/types/config';

export type ThemeCategory = 'classic' | 'accent' | 'layout' | 'interactive' | 'custom';

export interface ThemeDefinition {
  id: ThemeName;
  label: string;
  description: string;
  category: ThemeCategory;
  tip?: string;
}

export const THEME_DEFINITIONS: ThemeDefinition[] = [
  // …all 17 rows…
];

/** General quick-select — excludes custom */
export const GENERAL_THEME_OPTIONS: ThemeDefinition[] = THEME_DEFINITIONS.filter(
  (t) => t.id !== 'custom',
);

export function getThemeDefinition(id: ThemeName): ThemeDefinition | undefined {
  return THEME_DEFINITIONS.find((t) => t.id === id);
}

export function getThemeOptionMeta(id: ThemeName): ThemeDefinition | undefined {
  return getThemeDefinition(id);
}

export function themeOptionsForSelect(): { value: string; label: string }[] {
  return GENERAL_THEME_OPTIONS.map((t) => ({ value: t.id, label: t.label }));
}

export function themesByCategory(category: ThemeCategory | 'all'): ThemeDefinition[] {
  if (category === 'all') return THEME_DEFINITIONS;
  return THEME_DEFINITIONS.filter((t) => t.category === category);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/__tests__/themes.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/themes.ts lib/__tests__/themes.test.ts
git commit -m "feat(themes): expand shared theme registry with categories and tips"
```

---

### Task 2: Custom “Start from preset” mapper (C4 pure logic early)

**Files:**
- Create: `lib/customThemePresets.ts`
- Create: `lib/__tests__/customThemePresets.test.ts`

**Interfaces:**
- Consumes: `ThemeName`, `CustomThemeConfig`, `DEFAULT_CUSTOM_THEME` from `@/types/config`
- Produces: `export function customThemeFromPreset(preset: ThemeName): CustomThemeConfig`

Mapping rules (honest approximations only):

```typescript
import type { CustomThemeConfig, ThemeName } from '@/types/config';
import { DEFAULT_CUSTOM_THEME } from '@/types/config';

/**
 * Approximate custom knobs inspired by a preset.
 * Cannot reproduce bubble tails, gradients, blur, etc.
 */
export function customThemeFromPreset(preset: ThemeName): CustomThemeConfig {
  if (preset === 'custom') return { ...DEFAULT_CUSTOM_THEME };

  const base: CustomThemeConfig = { ...DEFAULT_CUSTOM_THEME };

  switch (preset) {
    case 'blockquote':
      return { ...base, textColor: '#6b7280', borderStyle: 'solid', borderColor: '#3b82f6', fontStyle: 'italic' };
    case 'paper':
      return {
        ...base,
        textColor: '#b45309',
        backgroundColor: '#fffbeb',
        borderStyle: 'solid',
        borderColor: '#f59e0b',
        fontStyle: 'normal',
      };
    case 'highlight':
      return {
        ...base,
        textColor: '#374151',
        backgroundColor: '#fef08a',
        borderStyle: 'none',
        borderColor: '#eab308',
      };
    case 'italic':
      return { ...base, fontStyle: 'italic', borderStyle: 'none' };
    case 'minimal':
      return {
        ...base,
        textColor: '#9ca3af',
        backgroundColor: 'transparent',
        borderStyle: 'none',
        fontSize: 'smaller',
      };
    case 'dotted-border':
      return { ...base, borderStyle: 'dotted', borderColor: '#6b7280' };
    case 'underline':
    case 'dashed-underline':
    case 'wavy-underline':
      return {
        ...base,
        borderStyle: preset === 'dashed-underline' ? 'dashed' : 'solid',
        borderColor: '#3b82f6',
        backgroundColor: 'transparent',
      };
    default:
      // dividing-line, bubble, side-by-side, mask, fade-in, shadow-card, gradient-accent
      return { ...base };
  }
}
```

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { customThemeFromPreset } from '@/lib/customThemePresets';
import { DEFAULT_CUSTOM_THEME } from '@/types/config';

describe('customThemeFromPreset', () => {
  it('returns defaults for custom id', () => {
    expect(customThemeFromPreset('custom')).toEqual(DEFAULT_CUSTOM_THEME);
  });

  it('maps paper to warm colors and solid border', () => {
    const c = customThemeFromPreset('paper');
    expect(c.backgroundColor).not.toBe('transparent');
    expect(c.borderStyle).toBe('solid');
  });

  it('maps italic fontStyle', () => {
    expect(customThemeFromPreset('italic').fontStyle).toBe('italic');
  });

  it('maps highlight to none border and yellow-ish bg', () => {
    const c = customThemeFromPreset('highlight');
    expect(c.borderStyle).toBe('none');
    expect(c.backgroundColor).toMatch(/#|rgb|yellow|fef0/i);
  });

  it('returns a full CustomThemeConfig for unknown-style presets', () => {
    const c = customThemeFromPreset('bubble');
    expect(c).toMatchObject({
      textColor: expect.any(String),
      backgroundColor: expect.any(String),
      borderStyle: expect.any(String),
      borderColor: expect.any(String),
      fontStyle: expect.any(String),
      fontSize: expect.any(String),
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- lib/__tests__/customThemePresets.test.ts`

- [ ] **Step 3: Implement file as above**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/customThemePresets.ts lib/__tests__/customThemePresets.test.ts
git commit -m "feat(themes): add customThemeFromPreset approximations for Start from"
```

---

### Task 3: ThemeMiniPreview (real CSS snippet)

**Files:**
- Create: `entrypoints/options/components/ThemeMiniPreview.tsx`

**Interfaces:**
- Consumes: `ThemeName`, optional `CustomThemeConfig`, `isDark?: boolean`
- Produces: `export function ThemeMiniPreview(props: ThemeMiniPreviewProps): JSX.Element`

- [ ] **Step 1: Implement component** (presentational; covered by section tests later)

```tsx
/**
 * Compact bilingual sample using real inject.css theme rules.
 */
import { useMemo } from 'react';
import type { ThemeName, CustomThemeConfig } from '@/types/config';
import { DEFAULT_CUSTOM_THEME } from '@/types/config';

const MINI_ORIGINAL = 'The quick brown fox jumps.';
const MINI_TRANSLATION = 'Con cáo nâu nhanh nhẹn nhảy.';

export interface ThemeMiniPreviewProps {
  theme: ThemeName;
  customTheme?: CustomThemeConfig;
  /** Dark host page simulation */
  isDark?: boolean;
  className?: string;
}

export function ThemeMiniPreview({
  theme,
  customTheme,
  isDark = true,
  className = '',
}: ThemeMiniPreviewProps) {
  const customStyle = useMemo(() => {
    if (theme !== 'custom') return undefined;
    const config = customTheme ?? DEFAULT_CUSTOM_THEME;
    const fontSizeMap = { smaller: '0.9em', same: 'inherit', larger: '1.1em' } as const;
    return {
      '--anyllm-custom-text-color': config.textColor,
      '--anyllm-custom-bg-color': config.backgroundColor,
      '--anyllm-custom-border-style': config.borderStyle,
      '--anyllm-custom-border-color': config.borderColor,
      '--anyllm-custom-font-style': config.fontStyle,
      '--anyllm-custom-font-size': fontSizeMap[config.fontSize],
    } as React.CSSProperties;
  }, [theme, customTheme]);

  return (
    <div
      className={`theme-preview-container rounded-md p-2 border border-zinc-700/40 text-[11px] leading-snug overflow-hidden ${
        isDark ? 'anyllm-dark bg-zinc-950' : 'bg-white'
      } ${className}`}
      data-anyllm-theme={theme}
      data-anyllm-state="dual"
      data-anyllm-position="below"
      style={customStyle}
      aria-hidden="true"
    >
      <div
        data-anyllm-role="original"
        className={isDark ? 'text-zinc-300' : 'text-zinc-700'}
      >
        {MINI_ORIGINAL}
      </div>
      <div
        data-anyllm-role="translation"
        lang="vi"
        dir="auto"
        className="anyllm-translate-translation"
      >
        {MINI_TRANSLATION}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add entrypoints/options/components/ThemeMiniPreview.tsx
git commit -m "feat(themes): add ThemeMiniPreview with real inject.css attrs"
```

---

### Task 4: ThemeCard + ThemeGallery (C1 cards + C3 categories shell)

**Files:**
- Create: `entrypoints/options/components/ThemeCard.tsx`
- Create: `entrypoints/options/components/ThemeGallery.tsx`

**Interfaces:**
- `ThemeCard` props:
  - `definition: ThemeDefinition`
  - `committed: boolean`
  - `previewing: boolean` (soft-preview highlight without check)
  - `customTheme?: CustomThemeConfig` (for swatches when id is custom)
  - `onSelect: () => void`
  - `onPreviewStart: () => void`
  - `onPreviewEnd: () => void`
- `ThemeGallery` props:
  - `category: ThemeCategory | 'all'`
  - `onCategoryChange: (c: ThemeCategory | 'all') => void`
  - `committedTheme: ThemeName`
  - `previewTheme: ThemeName | null`
  - `customTheme?: CustomThemeConfig`
  - `onCommit: (id: ThemeName) => void`
  - `onPreviewStart: (id: ThemeName) => void`
  - `onPreviewEnd: () => void`

- [ ] **Step 1: Implement ThemeCard**

Key classes:
- Selected (committed): `border-cyan-500 bg-cyan-500/5 ring-1 ring-cyan-500/30`
- Soft-previewing (not committed): `border-cyan-500/40 ring-1 ring-cyan-500/15`
- Idle: `border-zinc-800 bg-zinc-900 hover:border-zinc-700`
- Structure: mini preview on top; label (`text-sm font-medium`); description on **own line** (`text-xs text-zinc-500`); Custom shows three color dots from `customTheme`
- Role: `role="radio"`, `aria-checked={committed}`, `aria-label={`${definition.label}. ${definition.description}`}`
- Events: `onClick` → onSelect; `onMouseEnter` / `onFocus` → onPreviewStart; `onMouseLeave` / `onBlur` → onPreviewEnd (blur carefully: only clear if focus leaves card — acceptable simplification: mouse leave + parent handles focus within gallery)
- Keyboard: parent radiogroup; card is `type="button"` with role radio

```tsx
// ThemeCard.tsx — essential structure
<button
  type="button"
  role="radio"
  aria-checked={committed}
  aria-label={`${definition.label}. ${definition.description}`}
  id={`theme-${definition.id}`}
  onClick={onSelect}
  onMouseEnter={onPreviewStart}
  onMouseLeave={onPreviewEnd}
  onFocus={onPreviewStart}
  className={/* see above */}
>
  {committed && (
    <span className="absolute top-2 right-2 w-5 h-5 bg-cyan-500 rounded-full flex items-center justify-center">
      <Check className="w-3 h-3 text-white" />
    </span>
  )}
  <ThemeMiniPreview theme={definition.id} customTheme={customTheme} isDark />
  <div className="mt-2">
    <div className="text-sm font-medium text-zinc-200">{definition.label}</div>
    <div className="text-xs text-zinc-500 mt-0.5">{definition.description}</div>
    {definition.id === 'custom' && customTheme && (
      <div className="flex gap-1 mt-2" aria-hidden>
        <span className="w-3 h-3 rounded-full border border-zinc-600" style={{ background: customTheme.textColor }} />
        <span className="w-3 h-3 rounded-full border border-zinc-600" style={{ background: customTheme.backgroundColor === 'transparent' ? 'transparent' : customTheme.backgroundColor }} />
        <span className="w-3 h-3 rounded-full border border-zinc-600" style={{ background: customTheme.borderColor }} />
      </div>
    )}
  </div>
</button>
```

- [ ] **Step 2: Implement ThemeGallery**

```tsx
const CATEGORY_CHIPS: { id: ThemeCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'classic', label: 'Classic' },
  { id: 'accent', label: 'Accent' },
  { id: 'layout', label: 'Layout' },
  { id: 'interactive', label: 'Interactive' },
  { id: 'custom', label: 'Custom' },
];

export function ThemeGallery({ category, onCategoryChange, committedTheme, previewTheme, customTheme, onCommit, onPreviewStart, onPreviewEnd }: Props) {
  const items = themesByCategory(category);

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Theme categories" className="flex flex-wrap gap-1.5">
        {CATEGORY_CHIPS.map((chip) => {
          const active = category === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onCategoryChange(chip.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                active
                  ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <div
        role="radiogroup"
        aria-label="Display themes"
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        onMouseLeave={onPreviewEnd}
      >
        {items.map((def) => (
          <ThemeCard
            key={def.id}
            definition={def}
            committed={committedTheme === def.id}
            previewing={previewTheme === def.id && committedTheme !== def.id}
            customTheme={customTheme}
            onSelect={() => onCommit(def.id)}
            onPreviewStart={() => onPreviewStart(def.id)}
            onPreviewEnd={onPreviewEnd}
          />
        ))}
      </div>

      {items.length === 0 && (
        <p className="text-sm text-zinc-500">No themes in this category.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add entrypoints/options/components/ThemeCard.tsx entrypoints/options/components/ThemeGallery.tsx
git commit -m "feat(themes): add ThemeCard and ThemeGallery with real previews"
```

---

### Task 5: ThemeStudioCanvas — article mock (C2)

**Files:**
- Create: `entrypoints/options/ThemeStudioCanvas.tsx`
- Modify or delete: `entrypoints/options/ThemePreview.tsx` (re-export `ThemeStudioCanvas` as `ThemePreview` temporarily if anything still imports it, then remove dead code)

**Interfaces:**
```typescript
export type CanvasPageMode = 'light' | 'dark' | 'match';

export interface ThemeStudioCanvasProps {
  /** Effective theme for rendering (committed or soft-preview) */
  theme: ThemeName;
  /** When soft-preview differs from store theme */
  isPreviewing?: boolean;
  committedThemeLabel?: string;
  previewThemeLabel?: string;
  tip?: string;
  displayMode: DisplayMode; // from settings
  translationPosition: TranslationPosition;
  darkModeSetting: DarkMode; // settings.darkMode for match
  customTheme?: CustomThemeConfig;
  showSampleStates: boolean;
  onShowSampleStatesChange: (v: boolean) => void;
  canvasMode: CanvasPageMode;
  onCanvasModeChange: (m: CanvasPageMode) => void;
}
```

- [ ] **Step 1: Implement resolveIsDark helper (inline or small function in file)**

```typescript
function resolveCanvasDark(
  canvasMode: CanvasPageMode,
  darkModeSetting: DarkMode,
): boolean {
  if (canvasMode === 'light') return false;
  if (canvasMode === 'dark') return true;
  // match
  if (darkModeSetting === 'light') return false;
  if (darkModeSetting === 'dark') return true;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return false;
}
```

- [ ] **Step 2: Implement article shell**

Structure:

```tsx
export function ThemeStudioCanvas(props: ThemeStudioCanvasProps) {
  const isDark = resolveCanvasDark(props.canvasMode, props.darkModeSetting);
  const pageState = props.displayMode === 'translation-only' ? 'translation-only' : 'dual';
  // custom CSS vars same as old ThemePreview

  return (
    <Card title="Live preview" icon={<Eye className="w-3.5 h-3.5" />} variant="bordered">
      {/* Toolbar: SegmentedControl Light | Dark | Match page contrast */}
      <SegmentedControl
        id="theme-studio-canvas-mode"
        label="Canvas page mode"
        size="sm"
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
          { value: 'match', label: 'Match' },
        ]}
        value={props.canvasMode}
        onChange={props.onCanvasModeChange}
      />

      {/* Readout */}
      <div className="mt-3 mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-zinc-200">
          {props.isPreviewing ? props.previewThemeLabel : props.committedThemeLabel}
        </span>
        {props.isPreviewing && (
          <span className="text-[10px] uppercase tracking-wider text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5">
            Previewing
          </span>
        )}
      </div>
      {props.tip && <p className="text-xs text-zinc-500 mb-3">{props.tip}</p>}

      {/* Site chrome + article */}
      <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-zinc-700' : 'border-zinc-200'}`}>
        <div className={`px-3 py-1.5 text-[10px] flex items-center gap-2 ${isDark ? 'bg-zinc-900 text-zinc-500' : 'bg-zinc-100 text-zinc-500'}`}>
          <span className="w-2 h-2 rounded-full bg-zinc-600" />
          <span>example.com</span>
          <span className="opacity-50">·</span>
          <span>Article</span>
        </div>

        <div
          className={`theme-preview-container p-5 ${isDark ? 'anyllm-dark bg-zinc-950' : 'bg-[#fafafa]'}`}
          data-anyllm-theme={props.theme}
          data-anyllm-state={pageState}
          data-anyllm-position={props.translationPosition}
          style={customPreviewStyle}
        >
          <h1 className={`text-lg font-semibold mb-1 ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
            How AI reshapes language
          </h1>
          <p className={`text-[11px] mb-4 ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
            Demo article · not a real page
          </p>

          {/* Lead bilingual block — reuse ThemePreview position logic */}
          {/* List item bilingual */}
          {/* Inline Settings label sample */}
        </div>
      </div>

      {/* Sample states disclosure */}
      <button
        type="button"
        className="mt-3 text-xs text-zinc-500 hover:text-zinc-300"
        onClick={() => props.onShowSampleStatesChange(!props.showSampleStates)}
        aria-expanded={props.showSampleStates}
      >
        {props.showSampleStates ? 'Hide sample states' : 'Show sample states'}
      </button>
      {props.showSampleStates && (
        <div className="mt-2" data-anyllm-preview-section="states">
          {/* loading + error samples from ThemePreview */}
        </div>
      )}
    </Card>
  );
}
```

Copy sample strings from `ThemePreview.tsx` for lead paragraph. Add a second shorter block for list:

```tsx
<ul className="mt-4 list-disc pl-5 space-y-2">
  <li>
    {/* original + translation roles inside li */}
  </li>
</ul>
```

- [ ] **Step 3: Migrate ThemePreview**

Option A (preferred): Delete body of `ThemePreview.tsx` and export:

```typescript
export { ThemeStudioCanvas as ThemePreview } from './ThemeStudioCanvas';
```

Only if App/tests still need the old name. Otherwise delete file and update imports to `ThemeStudioCanvas`.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/options/ThemeStudioCanvas.tsx entrypoints/options/ThemePreview.tsx
git commit -m "feat(themes): add ThemeStudioCanvas article mock preview"
```

---

### Task 6: Wire ThemesSection split layout (C1+C2+C3)

**Files:**
- Rewrite: `entrypoints/options/sections/ThemesSection.tsx`
- Modify: `entrypoints/options/App.tsx` (optional navigate-to-general)

**Interfaces:**
- `ThemesSectionProps { onNavigateToGeneral?: () => void }`

- [ ] **Step 1: Rewrite ThemesSection**

```tsx
export function ThemesSection({ onNavigateToGeneral }: ThemesSectionProps = {}) {
  const theme = useSettingsStore((s) => s.theme);
  const customTheme = useSettingsStore((s) => s.customTheme);
  const displayMode = useSettingsStore((s) => s.displayMode);
  const translationPosition = useSettingsStore((s) => s.translationPosition);
  const darkMode = useSettingsStore((s) => s.darkMode);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [category, setCategory] = useState<ThemeCategory | 'all'>('all');
  const [previewTheme, setPreviewTheme] = useState<ThemeName | null>(null);
  const [canvasMode, setCanvasMode] = useState<CanvasPageMode>('match');
  const [showSampleStates, setShowSampleStates] = useState(false);

  const effectiveTheme = previewTheme ?? theme;
  const def = getThemeDefinition(effectiveTheme);
  const committedDef = getThemeDefinition(theme);

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Theme Studio"
        description="See how translations look on a real page, then pick a style."
        icon={<Palette className="w-4 h-4" />}
        accentColor="cyan"
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        {/* Gallery first in DOM for narrow? Spec: canvas first on narrow.
            Use order utilities: canvas order-1 lg:order-2, gallery order-2 lg:order-1 */}
        <div className="lg:col-span-2 order-2 lg:order-1">
          <ThemeGallery
            category={category}
            onCategoryChange={setCategory}
            committedTheme={theme}
            previewTheme={previewTheme}
            customTheme={customTheme}
            onCommit={(id) => updateSettings({ theme: id })}
            onPreviewStart={setPreviewTheme}
            onPreviewEnd={() => setPreviewTheme(null)}
          />
        </div>

        <div className="lg:col-span-3 order-1 lg:order-2 lg:sticky lg:top-14 space-y-4">
          <ThemeStudioCanvas
            theme={effectiveTheme}
            isPreviewing={previewTheme != null && previewTheme !== theme}
            committedThemeLabel={committedDef?.label}
            previewThemeLabel={def?.label}
            tip={def?.tip}
            displayMode={displayMode}
            translationPosition={translationPosition}
            darkModeSetting={darkMode}
            customTheme={customTheme}
            showSampleStates={showSampleStates}
            onShowSampleStatesChange={setShowSampleStates}
            canvasMode={canvasMode}
            onCanvasModeChange={setCanvasMode}
          />

          {(theme === 'custom' || previewTheme === 'custom') && (
            <CustomThemeEditor />
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-zinc-500">
        Translation position and display mode are set in General.
        {onNavigateToGeneral && (
          <>
            {' '}
            <button
              type="button"
              className="text-cyan-400 hover:text-cyan-300 underline-offset-2 hover:underline"
              onClick={onNavigateToGeneral}
            >
              Open General
            </button>
          </>
        )}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: App.tsx**

```tsx
case 'themes':
  return <ThemesSection onNavigateToGeneral={() => setActiveTab('general')} />;
```

- [ ] **Step 3: Remove dead Tailwind THEMES array and old ThemePreview-only layout**

- [ ] **Step 4: Manual sanity** — `npm run dev` options page if available; else rely on tests in Task 8

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/sections/ThemesSection.tsx entrypoints/options/App.tsx
git commit -m "feat(themes): wire Theme Studio split layout and soft-preview"
```

---

### Task 7: CustomThemeEditor polish (C4)

**Files:**
- Modify: `entrypoints/options/CustomThemeEditor.tsx`

**Requirements from spec:**
- Shared `Select` for border/font/size
- **No fill** toggle for background → `backgroundColor: 'transparent'`; when fill on and was transparent, default to `#ffffff` or last non-transparent
- Border color control visually dimmed / disabled when `borderStyle === 'none'`
- **Start from preset** `<Select>` of non-custom themes → `updateSettings({ customTheme: customThemeFromPreset(id) })` (does not change `theme` away from custom)
- Microcopy under Start from: `Custom themes support colors, border, and type — not full preset effects (e.g. bubble tails).`
- Reset keeps existing behavior
- Group fields: Colors | Border | Type (simple headings, not over-engineered)

- [ ] **Step 1: Implement No fill + Start from**

Sketch:

```tsx
const noFill = customTheme.backgroundColor === 'transparent';

// Toggle
<Toggle
  checked={!noFill}
  onChange={(filled) =>
    updateCustomTheme({
      backgroundColor: filled ? '#ffffff' : 'transparent',
    })
  }
  label="Background fill"
  description="Turn off for transparent translation background"
/>

// Start from
<FieldGroup label="Start from preset" htmlFor="custom-start-from">
  <Select
    id="custom-start-from"
    value=""
    onChange={(e) => {
      const v = e.target.value as ThemeName;
      if (!v) return;
      updateSettings({ customTheme: customThemeFromPreset(v) });
      e.target.value = '';
    }}
    options={[
      { value: '', label: 'Choose a preset…' },
      ...GENERAL_THEME_OPTIONS.map((t) => ({ value: t.id, label: t.label })),
    ]}
  />
</FieldGroup>
<p className="text-[11px] text-zinc-500 mt-1">
  Custom themes support colors, border, and type — not full preset effects (e.g. bubble tails).
</p>
```

Note: controlled Select with empty value may need local state `startFrom` reset after apply — use local `useState` for the select value.

Replace raw `<select>` with `@/ui/Select`.

- [ ] **Step 2: Commit**

```bash
git add entrypoints/options/CustomThemeEditor.tsx
git commit -m "feat(themes): polish CustomThemeEditor with No fill and Start from"
```

---

### Task 8: Section tests + General regression (acceptance)

**Files:**
- Create: `entrypoints/options/sections/__tests__/ThemesSection.test.tsx`
- Verify: `entrypoints/options/sections/__tests__/GeneralSection.test.tsx` still passes

- [ ] **Step 1: Write ThemesSection tests**

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ThemesSection } from '../ThemesSection';
import { useSettingsStore } from '@/stores/settingsStore';

// Mirror GeneralSection test setup: reset store, mock chrome.storage if needed

describe('ThemesSection', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      // minimal defaults — copy pattern from GeneralSection.test.tsx
      theme: 'blockquote',
      customTheme: undefined,
      displayMode: 'bilingual-below',
      translationPosition: 'below',
      darkMode: 'auto',
      isLoaded: true,
    } as never);
  });

  it('renders Theme Studio header', () => {
    render(<ThemesSection />);
    expect(screen.getByRole('heading', { name: /Theme Studio/i })).toBeInTheDocument();
  });

  it('commits theme on card click', () => {
    render(<ThemesSection />);
    fireEvent.click(screen.getByRole('radio', { name: /Speech Bubble/i }));
    expect(useSettingsStore.getState().theme).toBe('bubble');
  });

  it('soft-preview on hover does not commit', () => {
    render(<ThemesSection />);
    const card = screen.getByRole('radio', { name: /Speech Bubble/i });
    fireEvent.mouseEnter(card);
    expect(useSettingsStore.getState().theme).toBe('blockquote');
    expect(screen.getByText(/Previewing/i)).toBeInTheDocument();
  });

  it('filters by category Classic', () => {
    render(<ThemesSection />);
    fireEvent.click(screen.getByRole('tab', { name: /Classic/i }));
    expect(screen.getByRole('radio', { name: /Blockquote/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Speech Bubble/i })).not.toBeInTheDocument();
  });

  it('shows custom editor when custom selected', () => {
    useSettingsStore.setState({ theme: 'custom' } as never);
    render(<ThemesSection />);
    expect(screen.getByText(/Custom Theme Editor|Start from preset|Translation Text Color/i)).toBeInTheDocument();
  });

  it('sample states hidden by default', () => {
    render(<ThemesSection />);
    expect(screen.queryByText(/Translation failed/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show sample states/i }));
    expect(screen.getByText(/Translation failed/i)).toBeInTheDocument();
  });

  it('calls onNavigateToGeneral from footer', () => {
    const nav = vi.fn();
    render(<ThemesSection onNavigateToGeneral={nav} />);
    fireEvent.click(screen.getByRole('button', { name: /Open General/i }));
    expect(nav).toHaveBeenCalled();
  });
});
```

Adapt store setup by **copying the working bootstrap** from `GeneralSection.test.tsx` (do not invent a half store).

- [ ] **Step 2: Run ThemesSection tests**

Run: `npm test -- entrypoints/options/sections/__tests__/ThemesSection.test.tsx`

Expected: PASS (fix/adjust selectors to match final copy)

- [ ] **Step 3: Run General + themes unit tests**

Run: `npm test -- lib/__tests__/themes.test.ts lib/__tests__/customThemePresets.test.ts entrypoints/options/sections/__tests__/GeneralSection.test.tsx entrypoints/options/sections/__tests__/ThemesSection.test.tsx`

Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add entrypoints/options/sections/__tests__/ThemesSection.test.tsx
git commit -m "test(themes): add Theme Studio section smoke tests"
```

---

### Task 9: Quality gate, beads, push

- [ ] **Step 1: Full related suite + lint if project uses it**

```bash
npm test -- lib/__tests__/themes.test.ts lib/__tests__/customThemePresets.test.ts entrypoints/options/sections/__tests__/
npx tsc --noEmit
```

Expected: clean for touched surface

- [ ] **Step 2: Close bead**

```bash
bd close ALT-z84 --reason="Theme Studio C1–C4 implemented per 2026-07-10-theme-studio-design.md"
```

- [ ] **Step 3: Push**

```bash
git pull --rebase
bd dolt push
git push
git status
```

Expected: `up to date with origin`

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Single registry + categories + tips | T1 |
| Real CSS mini-previews | T3, T4 |
| Brand cyan/teal selection | T4, T6 |
| Article mock canvas | T5 |
| Light / Dark / Match (default match) | T5, T6 |
| Sample states collapsed | T5, T8 |
| Soft-preview no storage write | T4, T6, T8 |
| Category chips | T4, T6, T8 |
| Custom under canvas + No fill + Start from | T2, T6, T7 |
| General exclude custom + Browse themes | T1, existing General |
| Open General footer | T6, T8 |
| A11y radiogroup | T4, T8 |
| Phases C1–C4 | T1–T7 map to phases |
| No new settings keys | Global + all tasks |
| Acceptance tests | T8–T9 |

## Placeholder / consistency self-review

- No TBD steps; signatures use `ThemeDefinition`, `CanvasPageMode`, `customThemeFromPreset`.
- `GENERAL_THEME_OPTIONS` kept as filtered view for General compatibility.
- Soft-preview state name: `previewTheme` everywhere.
- Accent: `cyan` on SectionHeader and selection rings.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-10-theme-studio.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session with executing-plans and checkpoints  

**Which approach?**
