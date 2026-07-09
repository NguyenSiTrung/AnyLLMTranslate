# General Tab Full Restructure (IA C) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure Settings → General into four single-concern cards (Language, Layout, Style, Advanced display) with language swap, icon segments, real position disable, theme summary + Browse CTA, and shared theme metadata — no new settings keys.

**Architecture:** Extract theme option metadata into `lib/themes.ts`. Rewrite `GeneralSection.tsx` to four bordered `Card`s using existing primitives (`SectionHeader`, `SegmentedControl`, `Select`, `Toggle`, `Button`, `FieldGroup`). Keep store keys and stable DOM ids. Tests use real Zustand store + jsdom Testing Library (no component tests exist yet for this section).

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Lucide React, Zustand, Vitest + Testing Library (jsdom for `entrypoints/**`).

**Spec:** `docs/superpowers/specs/2026-07-09-general-tab-restructure-design.md`  
**Beads:** ALT-6l9

## Global Constraints

- No new settings schema keys — only presentation/IA.
- Preserve control ids: `general-source-language`, `general-target-language`, `general-display-mode`, `general-theme`, `general-translation-position`, `general-host-page-mode`, `general-compact-inline-toggle`.
- Visible label for host mode: **Page contrast** (key still `darkMode`).
- Theme quick-select list = current General `THEME_OPTIONS` ids (no `custom` unless already listed — today General does **not** include `custom`).
- No full `ThemePreview` on General.
- Advanced display card always expanded.
- Zinc dark chrome + blue active segments; no purple-first styling.
- Swap disabled when `sourceLanguage === 'auto'`.
- Position uses `SegmentedControl` `disabled={true}` when `displayMode === 'translation-only'`.

---

## File map

| File | Responsibility |
|------|----------------|
| Create `lib/themes.ts` | `GENERAL_THEME_OPTIONS`, `getThemeOptionMeta`, Select-ready mapping |
| Create `lib/__tests__/themes.test.ts` | Metadata unit tests |
| Create `entrypoints/options/sections/__tests__/GeneralSection.test.tsx` | Section behavior tests |
| Rewrite `entrypoints/options/sections/GeneralSection.tsx` | Four-card UI |
| Touch `ui/SegmentedControl.tsx` only if disabled a11y/styles insufficient |
| Optional: `ThemesSection.tsx` label import — skip unless trivial |

---

### Task 1: Shared theme metadata module

**Files:**
- Create: `lib/themes.ts`
- Create: `lib/__tests__/themes.test.ts`

**Interfaces:**
- Consumes: `ThemeName` from `@/types/config`
- Produces:
  - `export type ThemeOptionMeta = { id: ThemeName; label: string; description?: string }`
  - `export const GENERAL_THEME_OPTIONS: ThemeOptionMeta[]`
  - `export function getThemeOptionMeta(id: ThemeName): ThemeOptionMeta | undefined`
  - `export function themeOptionsForSelect(): { value: string; label: string }[]`

- [ ] **Step 1: Write the failing unit test**

Create `lib/__tests__/themes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  GENERAL_THEME_OPTIONS,
  getThemeOptionMeta,
  themeOptionsForSelect,
} from '@/lib/themes';

describe('GENERAL_THEME_OPTIONS', () => {
  it('includes the 16 General-tab theme ids (no custom)', () => {
    const ids = GENERAL_THEME_OPTIONS.map((t) => t.id);
    expect(ids).toEqual([
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
    ]);
    expect(ids).not.toContain('custom');
  });

  it('has unique labels for every option', () => {
    const labels = GENERAL_THEME_OPTIONS.map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('getThemeOptionMeta returns metadata for known ids', () => {
    expect(getThemeOptionMeta('bubble')).toEqual(
      expect.objectContaining({ id: 'bubble', label: 'Speech Bubble' }),
    );
  });

  it('themeOptionsForSelect maps to Select-compatible shape', () => {
    const opts = themeOptionsForSelect();
    expect(opts[0]).toEqual({ value: 'dividing-line', label: 'Dividing Line' });
    expect(opts).toHaveLength(16);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- lib/__tests__/themes.test.ts
```

Expected: FAIL — cannot resolve `@/lib/themes` or module not found.

- [ ] **Step 3: Implement `lib/themes.ts`**

```typescript
/**
 * Shared display-theme option metadata for Settings UI.
 * General quick-select uses GENERAL_THEME_OPTIONS (excludes custom gallery-only entry).
 */

import type { ThemeName } from '@/types/config';

export type ThemeOptionMeta = {
  id: ThemeName;
  label: string;
  description?: string;
};

/** Theme options shown on General tab quick-select (matches historical THEME_OPTIONS). */
export const GENERAL_THEME_OPTIONS: ThemeOptionMeta[] = [
  { id: 'dividing-line', label: 'Dividing Line', description: 'Classic separator' },
  { id: 'blockquote', label: 'Blockquote', description: 'Left accent bar' },
  { id: 'paper', label: 'Paper Note', description: 'Warm background' },
  { id: 'underline', label: 'Underline', description: 'Bottom accent' },
  { id: 'dashed-underline', label: 'Dashed Underline', description: 'Dashed bottom' },
  { id: 'highlight', label: 'Highlight', description: 'Marker effect' },
  { id: 'wavy-underline', label: 'Wavy Underline', description: 'Wavy decoration' },
  { id: 'bubble', label: 'Speech Bubble', description: 'Tooltip style' },
  { id: 'side-by-side', label: 'Side by Side', description: 'Column layout' },
  { id: 'mask', label: 'Blur Mask', description: 'Hover to reveal' },
  { id: 'fade-in', label: 'Fade In', description: 'Delayed appear' },
  { id: 'italic', label: 'Italic', description: 'Simple italic' },
  { id: 'dotted-border', label: 'Dotted Border', description: 'Dotted frame' },
  { id: 'shadow-card', label: 'Shadow Card', description: 'Elevated card' },
  { id: 'minimal', label: 'Minimal', description: 'Subtle text' },
  { id: 'gradient-accent', label: 'Gradient Accent', description: 'Gradient bg' },
];

export function getThemeOptionMeta(id: ThemeName): ThemeOptionMeta | undefined {
  return GENERAL_THEME_OPTIONS.find((t) => t.id === id);
}

export function themeOptionsForSelect(): { value: string; label: string }[] {
  return GENERAL_THEME_OPTIONS.map((t) => ({ value: t.id, label: t.label }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- lib/__tests__/themes.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/themes.ts lib/__tests__/themes.test.ts
git commit -m "feat(lib): add shared GENERAL_THEME_OPTIONS metadata"
```

---

### Task 2: GeneralSection tests (TDD — write first, expect fail)

**Files:**
- Create: `entrypoints/options/sections/__tests__/GeneralSection.test.tsx`

**Interfaces:**
- Consumes: `GeneralSection` from `../GeneralSection`, `useSettingsStore` from `@/stores/settingsStore`, `DEFAULT_SETTINGS` from `@/types/config`
- Produces: failing tests that encode the approved IA and behaviors

- [ ] **Step 1: Write the test file**

Create `entrypoints/options/sections/__tests__/GeneralSection.test.tsx` with this **complete** file (11 tests):

```tsx
/**
 * GeneralSection — four-card IA, swap, disabled position, browse themes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@/types/config';

const mockStorageData: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorageData[key] })),
      set: vi.fn(async (data: Record<string, unknown>) => {
        Object.assign(mockStorageData, data);
      }),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
});

// Import after chrome stub
import { useSettingsStore } from '@/stores/settingsStore';
import { GeneralSection } from '../GeneralSection';

describe('GeneralSection', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      displayMode: 'bilingual-below',
      translationPosition: 'below',
      theme: 'blockquote',
      darkMode: 'auto',
      enableCompactInlineForShortText: false,
    });
    for (const k of Object.keys(mockStorageData)) {
      Reflect.deleteProperty(mockStorageData, k);
    }
    vi.clearAllMocks();
  });

  it('renders four card titles', () => {
    render(<GeneralSection />);
    expect(screen.getByRole('heading', { name: 'Language', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Layout', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Style', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Advanced display', level: 3 })).toBeInTheDocument();
  });

  it('does not render the old merged Display & Appearance card title', () => {
    render(<GeneralSection />);
    expect(screen.queryByRole('heading', { name: 'Display & Appearance' })).not.toBeInTheDocument();
  });

  it('swaps source and target languages when source is not auto', () => {
    render(<GeneralSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Swap languages' }));
    const state = useSettingsStore.getState();
    expect(state.sourceLanguage).toBe('vi');
    expect(state.targetLanguage).toBe('en');
  });

  it('disables swap when source is auto', () => {
    useSettingsStore.setState({ sourceLanguage: 'auto', targetLanguage: 'vi' });
    render(<GeneralSection />);
    expect(screen.getByRole('button', { name: 'Swap languages' })).toBeDisabled();
  });

  it('disables translation position control in translation-only mode', () => {
    useSettingsStore.setState({ displayMode: 'translation-only' });
    render(<GeneralSection />);
    const positionGroup = document.getElementById('general-translation-position');
    expect(positionGroup).not.toBeNull();
    expect(positionGroup).toHaveAttribute('aria-disabled', 'true');
    const radios = within(positionGroup as HTMLElement).getAllByRole('radio');
    for (const radio of radios) {
      expect(radio).toBeDisabled();
    }
  });

  it('calls onNavigateToThemes when Browse themes is clicked', () => {
    const onNavigate = vi.fn();
    render(<GeneralSection onNavigateToThemes={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /Browse themes/i }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('hides Browse themes when callback is omitted', () => {
    render(<GeneralSection />);
    expect(screen.queryByRole('button', { name: /Browse themes/i })).not.toBeInTheDocument();
  });

  it('shows Page contrast label (not Host Page Mode)', () => {
    render(<GeneralSection />);
    expect(screen.getByText('Page contrast')).toBeInTheDocument();
    expect(screen.queryByText('Host Page Mode')).not.toBeInTheDocument();
  });

  it('updates theme via quick select', () => {
    render(<GeneralSection />);
    const select = document.getElementById('general-theme') as HTMLSelectElement;
    expect(select).toBeTruthy();
    fireEvent.change(select, { target: { value: 'bubble' } });
    expect(useSettingsStore.getState().theme).toBe('bubble');
  });

  it('updates darkMode (page contrast) via segmented control', () => {
    render(<GeneralSection />);
    const group = document.getElementById('general-host-page-mode') as HTMLElement;
    const darkBtn = within(group).getByRole('radio', { name: /Dark/i });
    fireEvent.click(darkBtn);
    expect(useSettingsStore.getState().darkMode).toBe('dark');
  });

  it('toggles compact inline setting', () => {
    render(<GeneralSection />);
    fireEvent.click(screen.getByRole('switch', { name: /Compact inline for short text/i }));
    expect(useSettingsStore.getState().enableCompactInlineForShortText).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- entrypoints/options/sections/__tests__/GeneralSection.test.tsx
```

Expected: FAIL (old 2-card UI: missing Layout/Style/Advanced headings, no Swap, still “Host Page Mode”, text link not “Browse themes”, position may lack `aria-disabled`).

Do **not** implement the UI yet if you want strict TDD — proceed to Task 3.

- [ ] **Step 3: Commit failing tests (optional red commit) or hold until green**

Preferred for this repo: commit tests together with implementation in Task 3 Step 5 if red commits are noisy. If you prefer red-first:

```bash
git add entrypoints/options/sections/__tests__/GeneralSection.test.tsx
git commit -m "test(options): add GeneralSection four-card IA specs (red)"
```

---

### Task 3: Rewrite GeneralSection (four-card IA)

**Files:**
- Modify: `entrypoints/options/sections/GeneralSection.tsx` (full rewrite)
- Test: `entrypoints/options/sections/__tests__/GeneralSection.test.tsx`

**Interfaces:**
- Consumes: `GENERAL_THEME_OPTIONS` / `getThemeOptionMeta` / `themeOptionsForSelect` from `@/lib/themes`; store + UI primitives
- Produces: `export function GeneralSection({ onNavigateToThemes?: () => void })`

- [ ] **Step 1: Replace `GeneralSection.tsx` with the following implementation**

```tsx
/**
 * General Settings Section — language, layout, style, advanced display.
 *
 * Four-card IA (2026-07-09):
 * 1. Language — source/target + swap
 * 2. Layout — display mode + translation position
 * 3. Style — theme summary/select/browse + page contrast
 * 4. Advanced display — compact inline toggle
 */

import {
  Globe,
  SlidersHorizontal,
  Columns2,
  Palette,
  Sparkles,
  Languages,
  Type,
  ArrowDown,
  ArrowUp,
  ArrowRight,
  ArrowLeftRight,
  Monitor,
  Sun,
  Moon,
  ExternalLink,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { LANGUAGES } from '@/lib/languages';
import { getThemeOptionMeta, themeOptionsForSelect } from '@/lib/themes';
import { FieldGroup } from '@/ui/FieldGroup';
import { Select } from '@/ui/Select';
import { Card } from '@/ui/Card';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Toggle } from '@/ui/Toggle';
import { SectionHeader } from '@/ui/SectionHeader';
import { Button } from '@/ui/Button';
import { stagger } from '@/lib/styleUtils';
import type { ThemeName, TranslationPosition, DarkMode, DisplayMode } from '@/types/config';

const DISPLAY_MODE_OPTIONS: { value: DisplayMode; label: string; icon: React.ReactNode }[] = [
  {
    value: 'bilingual-below',
    label: 'Bilingual',
    icon: <Languages className="w-3.5 h-3.5" />,
  },
  {
    value: 'translation-only',
    label: 'Translation only',
    icon: <Type className="w-3.5 h-3.5" />,
  },
];

const POSITION_OPTIONS: { value: TranslationPosition; label: string; icon: React.ReactNode }[] = [
  { value: 'below', label: 'Below', icon: <ArrowDown className="w-3.5 h-3.5" /> },
  { value: 'above', label: 'Above', icon: <ArrowUp className="w-3.5 h-3.5" /> },
  { value: 'side', label: 'Side', icon: <ArrowRight className="w-3.5 h-3.5" /> },
];

const PAGE_CONTRAST_OPTIONS: { value: DarkMode; label: string; icon: React.ReactNode }[] = [
  { value: 'auto', label: 'Auto', icon: <Monitor className="w-3.5 h-3.5" /> },
  { value: 'light', label: 'Light', icon: <Sun className="w-3.5 h-3.5" /> },
  { value: 'dark', label: 'Dark', icon: <Moon className="w-3.5 h-3.5" /> },
];

interface GeneralSectionProps {
  onNavigateToThemes?: () => void;
}

export function GeneralSection({ onNavigateToThemes }: GeneralSectionProps) {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const targetLanguages = LANGUAGES.filter((l) => l.code !== 'auto');
  const sourceLanguages = LANGUAGES;

  const isTranslationOnly = settings.displayMode === 'translation-only';
  const canSwap = settings.sourceLanguage !== 'auto';
  const themeMeta =
    getThemeOptionMeta(settings.theme) ??
    ({ id: settings.theme, label: settings.theme, description: undefined } as const);

  const handleSwap = () => {
    if (!canSwap) return;
    updateSettings({
      sourceLanguage: settings.targetLanguage,
      targetLanguage: settings.sourceLanguage,
    });
  };

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="General"
        description="Language, layout, and how translations look."
        icon={<SlidersHorizontal className="w-4 h-4" />}
        accentColor="blue"
      />

      <div className="space-y-4">
        {/* 1. Language */}
        <div className="animate-stagger" style={stagger(0)}>
          <Card
            title="Language"
            description="Languages for page translation."
            icon={<Globe className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <FieldGroup label="Source language" htmlFor="general-source-language">
                  <Select
                    id="general-source-language"
                    value={settings.sourceLanguage}
                    onChange={(e) => updateSettings({ sourceLanguage: e.target.value })}
                    options={sourceLanguages.map((lang) => ({
                      value: lang.code,
                      label:
                        lang.code === 'auto'
                          ? `🌐 ${lang.nativeName} (${lang.name})`
                          : `${lang.nativeName} (${lang.name})`,
                    }))}
                  />
                </FieldGroup>
              </div>

              <div className="flex shrink-0 justify-center pb-0.5 sm:px-1">
                <button
                  type="button"
                  aria-label="Swap languages"
                  title={
                    canSwap
                      ? 'Swap source and target'
                      : 'Cannot swap while source is Auto-detect'
                  }
                  disabled={!canSwap}
                  onClick={handleSwap}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/80 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-zinc-800/80 disabled:hover:text-zinc-300"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <FieldGroup label="Target language" htmlFor="general-target-language">
                  <Select
                    id="general-target-language"
                    value={settings.targetLanguage}
                    onChange={(e) => updateSettings({ targetLanguage: e.target.value })}
                    options={targetLanguages.map((lang) => ({
                      value: lang.code,
                      label: `${lang.nativeName} (${lang.name})`,
                    }))}
                  />
                </FieldGroup>
              </div>
            </div>
          </Card>
        </div>

        {/* 2. Layout */}
        <div className="animate-stagger" style={stagger(1)}>
          <Card
            title="Layout"
            description="How original and translated text are arranged on the page."
            icon={<Columns2 className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <div className="space-y-5">
              <FieldGroup
                label="Display mode"
                description="Bilingual keeps the original visible. Translation only replaces it."
              >
                <SegmentedControl
                  id="general-display-mode"
                  label="Display mode"
                  options={DISPLAY_MODE_OPTIONS}
                  value={settings.displayMode}
                  onChange={(val) => updateSettings({ displayMode: val })}
                />
              </FieldGroup>

              <div
                className={`transition-opacity duration-200 ${
                  isTranslationOnly ? 'opacity-40' : ''
                }`}
              >
                <FieldGroup
                  label="Translation position"
                  description="Where the translation appears relative to the original text."
                  hint={
                    isTranslationOnly
                      ? 'Position only applies in Bilingual mode.'
                      : undefined
                  }
                >
                  <SegmentedControl
                    id="general-translation-position"
                    label="Translation position"
                    options={POSITION_OPTIONS}
                    value={settings.translationPosition}
                    onChange={(val) => updateSettings({ translationPosition: val })}
                    disabled={isTranslationOnly}
                  />
                </FieldGroup>
              </div>
            </div>
          </Card>
        </div>

        {/* 3. Style */}
        <div className="animate-stagger" style={stagger(2)}>
          <Card
            title="Style"
            description="Visual style and contrast for injected translations."
            icon={<Palette className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <div className="space-y-5">
              <div>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Current theme
                    </p>
                    <p className="mt-1 text-sm font-medium text-zinc-100">{themeMeta.label}</p>
                    {themeMeta.description ? (
                      <p className="mt-0.5 text-xs text-zinc-500">{themeMeta.description}</p>
                    ) : null}
                  </div>
                  {onNavigateToThemes ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={<ExternalLink className="h-3.5 w-3.5" />}
                      onClick={onNavigateToThemes}
                    >
                      Browse themes
                    </Button>
                  ) : null}
                </div>

                <FieldGroup label="Theme" htmlFor="general-theme">
                  <Select
                    id="general-theme"
                    value={settings.theme}
                    onChange={(e) =>
                      updateSettings({ theme: e.target.value as ThemeName })
                    }
                    options={themeOptionsForSelect()}
                  />
                </FieldGroup>
              </div>

              <FieldGroup
                label="Page contrast"
                description="Match translation contrast to the host page. Auto detects the site theme."
              >
                <SegmentedControl
                  id="general-host-page-mode"
                  label="Page contrast"
                  options={PAGE_CONTRAST_OPTIONS}
                  value={settings.darkMode}
                  onChange={(val) => updateSettings({ darkMode: val })}
                />
              </FieldGroup>
            </div>
          </Card>
        </div>

        {/* 4. Advanced display */}
        <div className="animate-stagger" style={stagger(3)}>
          <Card
            title="Advanced display"
            description="Optional behavior for short phrases."
            icon={<Sparkles className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <Toggle
              id="general-compact-inline-toggle"
              checked={settings.enableCompactInlineForShortText}
              onChange={(checked) =>
                updateSettings({ enableCompactInlineForShortText: checked })
              }
              label="Compact inline for short text"
              description="Show short translations inline in parentheses. Turn off for uniform block display that always matches your theme."
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
```

**Note on React types:** If the project does not have a global `React` namespace for `React.ReactNode` in option arrays, import type:

```ts
import type { ReactNode } from 'react';
// then use icon: ReactNode
```

and type the option arrays with `icon: ReactNode` instead of `React.ReactNode`.

- [ ] **Step 2: Confirm SegmentedControl already supports `disabled`**

Open `ui/SegmentedControl.tsx`. It must already pass `disabled` to buttons and set `aria-disabled` on the radiogroup. Current code does this — **no change required** if present.

If `aria-disabled` is missing on the group when `disabled` is true, add:

```tsx
aria-disabled={disabled}
```

on the radiogroup `div` (already present in current file — verify only).

- [ ] **Step 3: Run GeneralSection tests**

```bash
npm test -- entrypoints/options/sections/__tests__/GeneralSection.test.tsx
```

Expected: all PASS.

If `getByRole('heading', { name: 'Language', level: 3 })` fails because Card renders non-heading text: check `ui/Card.tsx` — title is `<h3>`. If tests still fail on role, fall back to:

```tsx
expect(screen.getByText('Language', { selector: 'h3' })).toBeInTheDocument();
```

If radio name for Dark fails (icon-only accessible name issues): SegmentedControl includes label text next to icon, so name should be `Dark`.

- [ ] **Step 4: Run theme unit tests + typecheck**

```bash
npm test -- lib/__tests__/themes.test.ts entrypoints/options/sections/__tests__/GeneralSection.test.tsx
npm run compile
```

Expected: tests PASS; `tsc --noEmit` clean for touched files (project-wide may have pre-existing errors — ensure no new ones in our files).

- [ ] **Step 5: Commit**

```bash
git add \
  entrypoints/options/sections/GeneralSection.tsx \
  entrypoints/options/sections/__tests__/GeneralSection.test.tsx \
  ui/SegmentedControl.tsx
git commit -m "feat(options): restructure General tab into four single-concern cards"
```

(Only include `SegmentedControl.tsx` if you changed it.)

---

### Task 4: Manual QA checklist + close issue

**Files:** none (verification only)

- [ ] **Step 1: Manual check in options UI** (`npm run dev`, open extension options)

1. General shows four cards in order: Language → Layout → Style → Advanced display.
2. Swap works en↔vi; disabled with title when source is Auto.
3. Translation-only disables position segments (cannot click/keyboard activate).
4. Theme summary updates when changing quick select.
5. Browse themes jumps to Themes tab.
6. Page contrast Auto/Light/Dark persists (auto-save badge).
7. Compact inline toggle persists.
8. Section description reads “Language, layout, and how translations look.”

- [ ] **Step 2: Close beads issue**

```bash
bd close ALT-6l9 --reason="General tab four-card IA shipped with tests"
```

- [ ] **Step 3: Push (session completion)**

```bash
git pull --rebase
bd dolt push
git push
git status
```

Expected: branch up to date with origin; no stranded local commits.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Four cards Language / Layout / Style / Advanced display | Task 3 |
| Language side-by-side + swap; auto disables swap | Task 3 + tests Task 2 |
| Layout display mode + position; real disabled | Task 3 + tests Task 2 |
| Style theme summary + select + Browse themes | Task 3 + tests Task 2 |
| Page contrast label; darkMode key; icons | Task 3 + tests Task 2 |
| Advanced compact inline always expanded | Task 3 |
| Shared `lib/themes.ts` | Task 1 |
| Preserve control ids | Task 3 |
| No ThemePreview on General | Task 3 (omitted) |
| No new settings keys | All tasks |
| Tests listed in §10 | Task 2 |

## Placeholder scan

No TBD/TODO steps. Full file contents included.

## Type consistency

- `themeOptionsForSelect()` → Select `options` prop
- `getThemeOptionMeta(settings.theme)` → summary label/description
- `onNavigateToThemes?: () => void` unchanged from App.tsx
- `disabled={isTranslationOnly}` on position `SegmentedControl`
