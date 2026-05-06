# General Tab UI/UX Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the General tab from 4 visual blocks to 2 clean cards, extract shared SectionHeader component, fix UX logic bugs, and polish accessibility.

**Architecture:** Extract shared patterns into reusable components (`SectionHeader`, `stagger` helper), then restructure GeneralSection with merged cards and conditional logic. Finally, migrate all 9 sections to use the new SectionHeader.

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide icons, WXT extension framework

---

## Task 1: Create Shared Utilities

**Files:**
- Create: `lib/styleUtils.ts`
- Create: `ui/SectionHeader.tsx`

- [ ] **Step 1: Create stagger helper utility**

Create `lib/styleUtils.ts`:

```typescript
/**
 * Shared style utilities for the options page.
 */

/**
 * Create CSS custom properties for stagger animation delay.
 * Usage: <div className="animate-stagger" style={stagger(1)}>
 */
export const stagger = (delay: number): React.CSSProperties =>
  ({ '--stagger-delay': String(delay) } as React.CSSProperties);
```

- [ ] **Step 2: Create SectionHeader component**

Create `ui/SectionHeader.tsx`:

```tsx
/**
 * Reusable section header for settings pages.
 * Sticky with backdrop blur, icon with accent color, title + description.
 */

import type { ReactNode } from 'react';

type AccentColor = 'blue' | 'pink' | 'emerald' | 'amber' | 'zinc' | 'teal' | 'cyan' | 'orange';

interface SectionHeaderProps {
  title: string;
  description: string;
  icon: ReactNode;
  accentColor: AccentColor;
}

const accentMap: Record<AccentColor, { bg: string; border: string; text: string }> = {
  blue:    { bg: 'bg-blue-600/15',    border: 'border-blue-500/20',    text: 'text-blue-400' },
  pink:    { bg: 'bg-pink-600/15',    border: 'border-pink-500/20',    text: 'text-pink-400' },
  emerald: { bg: 'bg-emerald-600/15', border: 'border-emerald-500/20', text: 'text-emerald-400' },
  amber:   { bg: 'bg-amber-600/15',   border: 'border-amber-500/20',   text: 'text-amber-400' },
  zinc:    { bg: 'bg-zinc-600/15',    border: 'border-zinc-500/20',    text: 'text-zinc-400' },
  teal:    { bg: 'bg-teal-600/15',    border: 'border-teal-500/20',    text: 'text-teal-400' },
  cyan:    { bg: 'bg-cyan-600/15',    border: 'border-cyan-500/20',    text: 'text-cyan-400' },
  orange:  { bg: 'bg-orange-600/15',  border: 'border-orange-500/20',  text: 'text-orange-400' },
};

export function SectionHeader({ title, description, icon, accentColor }: SectionHeaderProps) {
  const accent = accentMap[accentColor];

  return (
    <div className="sticky top-0 z-10 backdrop-blur-md bg-[#09090b]/95 pt-4 pb-4 mb-3 -mt-4 flex items-center gap-3">
      <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${accent.bg} border ${accent.border}`}>
        <span className={accent.text}>{icon}</span>
      </div>
      <div>
        <h2 className="text-base font-semibold text-zinc-100 leading-tight">{title}</h2>
        <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify files compile**

Run: `cd /Users/trungnguyen/Documents/AI/Project/AnyLLMTranslate && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to `styleUtils.ts` or `SectionHeader.tsx`

- [ ] **Step 4: Commit**

```bash
git add lib/styleUtils.ts ui/SectionHeader.tsx
git commit -m "feat(ui): add SectionHeader component and stagger helper utility"
```

---

## Task 2: Update SegmentedControl Accessibility & Animation Timing

**Files:**
- Modify: `ui/SegmentedControl.tsx`
- Modify: `entrypoints/options/animations.css`

- [ ] **Step 1: Add id prop to SegmentedControl**

In `ui/SegmentedControl.tsx`, add `id` to the interface and apply it to the radiogroup div:

```typescript
interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string; // aria-label for the group
  size?: 'sm' | 'md';
  id?: string;    // DOM id for testing and accessibility
}
```

In the component function, destructure `id` and apply it:

```tsx
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  id,
}: SegmentedControlProps<T>) {
```

On the `<div role="radiogroup">`:

```tsx
<div
  role="radiogroup"
  aria-label={label}
  id={id}
  className="inline-flex items-center gap-0.5 rounded-lg bg-zinc-900 border border-zinc-700/60 p-1 w-full"
>
```

- [ ] **Step 2: Adjust stagger animation timing**

In `entrypoints/options/animations.css`, change line 132:

From:
```css
  animation-delay: calc(var(--stagger-delay, 0) * 30ms);
```

To:
```css
  animation-delay: calc(var(--stagger-delay, 0) * 50ms);
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/trungnguyen/Documents/AI/Project/AnyLLMTranslate && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add ui/SegmentedControl.tsx entrypoints/options/animations.css
git commit -m "feat(ui): add id prop to SegmentedControl, adjust stagger timing to 50ms"
```

---

## Task 3: Add ThemePreview Error State Label

**Files:**
- Modify: `entrypoints/options/ThemePreview.tsx`

- [ ] **Step 1: Add "Sample states" label above loading/error section**

In `entrypoints/options/ThemePreview.tsx`, replace the loading/error section (lines 129-143):

From:
```tsx
        {/* Loading + error sample states */}
        <div className="mt-3 flex flex-col gap-1" data-anyllm-preview-section="states">
          <span
            className="anyllm-translate-translation anyllm-translate-loading text-sm"
            role="status"
            aria-label="Translating"
          />
          <span
            className="anyllm-translate-translation text-sm"
            data-anyllm-error=""
            role="alert"
          >
            ⚠ Translation failed: example error
          </span>
        </div>
```

To:
```tsx
        {/* Loading + error sample states */}
        <div className="mt-3" data-anyllm-preview-section="states">
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Sample states:</p>
          <div className="flex flex-col gap-1">
            <span
              className="anyllm-translate-translation anyllm-translate-loading text-sm"
              role="status"
              aria-label="Translating"
            />
            <span
              className="anyllm-translate-translation text-sm"
              data-anyllm-error=""
              role="alert"
            >
              ⚠ Translation failed: example error
            </span>
          </div>
        </div>
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/trungnguyen/Documents/AI/Project/AnyLLMTranslate && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Run existing ThemePreview tests**

Run: `cd /Users/trungnguyen/Documents/AI/Project/AnyLLMTranslate && npx vitest run entrypoints/options/__tests__/ThemePreview.test.tsx 2>&1 | tail -20`
Expected: All tests pass (the new `<p>` label doesn't affect existing test selectors)

- [ ] **Step 4: Commit**

```bash
git add entrypoints/options/ThemePreview.tsx
git commit -m "fix(ui): add 'Sample states' label to ThemePreview error section"
```

---

## Task 4: Restructure GeneralSection

**Files:**
- Modify: `entrypoints/options/sections/GeneralSection.tsx`
- Modify: `entrypoints/options/App.tsx`

This is the main task — merge cards, remove preview, add navigation link, disable position conditionally, rename Dark Mode, remove hints, add globe emoji.

- [ ] **Step 1: Add onNavigateToThemes callback in App.tsx**

In `entrypoints/options/App.tsx`, update the GeneralSection render (line 145):

From:
```tsx
      case 'general': return <GeneralSection />;
```

To:
```tsx
      case 'general': return <GeneralSection onNavigateToThemes={() => setActiveTab('themes')} />;
```

- [ ] **Step 2: Rewrite GeneralSection.tsx**

Replace the entire content of `entrypoints/options/sections/GeneralSection.tsx` with:

```tsx
/**
 * General Settings Section — target language, display mode, theme, position, host page mode.
 *
 * Refactored layout:
 * - 2 cards only: Language + Display & Appearance (merged)
 * - ThemePreview removed (lives in Themes tab)
 * - "Dark Mode" renamed to "Host Page Mode"
 * - Translation Position disabled in translation-only mode
 * - Uses SectionHeader component
 */

import { Globe, Monitor, SlidersHorizontal } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { LANGUAGES } from '@/lib/languages';
import { FieldGroup } from '@/ui/FieldGroup';
import { Select } from '@/ui/Select';
import { Card } from '@/ui/Card';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import type { ThemeName, TranslationPosition, DarkMode, DisplayMode } from '@/types/config';

const THEME_OPTIONS = [
  { value: 'dividing-line', label: 'Dividing Line' },
  { value: 'blockquote', label: 'Blockquote' },
  { value: 'paper', label: 'Paper Note' },
  { value: 'underline', label: 'Underline' },
  { value: 'dashed-underline', label: 'Dashed Underline' },
  { value: 'highlight', label: 'Highlight' },
  { value: 'wavy-underline', label: 'Wavy Underline' },
  { value: 'bubble', label: 'Speech Bubble' },
  { value: 'side-by-side', label: 'Side by Side' },
  { value: 'mask', label: 'Blur Mask' },
  { value: 'fade-in', label: 'Fade In' },
  { value: 'italic', label: 'Italic' },
  { value: 'dotted-border', label: 'Dotted Border' },
  { value: 'shadow-card', label: 'Shadow Card' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'gradient-accent', label: 'Gradient Accent' },
];

const DISPLAY_MODE_OPTIONS: { value: DisplayMode; label: string }[] = [
  { value: 'bilingual-below', label: 'Bilingual' },
  { value: 'translation-only', label: 'Translation only' },
];

const POSITION_OPTIONS: { value: TranslationPosition; label: string }[] = [
  { value: 'below', label: 'Below' },
  { value: 'above', label: 'Above' },
  { value: 'side', label: 'Side' },
];

const HOST_PAGE_MODE_OPTIONS: { value: DarkMode; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
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

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="General"
        description="Language, display, and appearance preferences."
        icon={<SlidersHorizontal className="w-4 h-4" />}
        accentColor="blue"
      />

      <div className="space-y-4">
        {/* Language card */}
        <div className="animate-stagger" style={stagger(0)}>
          <Card title="Language" icon={<Globe className="w-3.5 h-3.5" />} variant="bordered">
            <div className="space-y-5">
              <FieldGroup
                label="Source Language"
                description="The language of pages you want to translate from."
                htmlFor="general-source-language"
              >
                <Select
                  id="general-source-language"
                  value={settings.sourceLanguage}
                  onChange={(e) => updateSettings({ sourceLanguage: e.target.value })}
                  options={sourceLanguages.map((lang) => ({
                    value: lang.code,
                    label: lang.code === 'auto'
                      ? `🌐 ${lang.nativeName} (${lang.name})`
                      : `${lang.nativeName} (${lang.name})`,
                  }))}
                />
              </FieldGroup>

              <FieldGroup
                label="Target Language"
                description="The language to translate into."
                htmlFor="general-target-language"
              >
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
          </Card>
        </div>

        {/* Display & Appearance card (merged) */}
        <div className="animate-stagger" style={stagger(1)}>
          <Card title="Display & Appearance" icon={<Monitor className="w-3.5 h-3.5" />} variant="bordered">
            <div className="space-y-5">
              <FieldGroup
                label="Display Mode"
                description="How translations appear on the page."
              >
                <SegmentedControl
                  id="general-display-mode"
                  label="Display Mode"
                  options={DISPLAY_MODE_OPTIONS}
                  value={settings.displayMode}
                  onChange={(val) => updateSettings({ displayMode: val })}
                />
              </FieldGroup>

              <FieldGroup
                label="Translation Theme"
                description="Visual style for translated text."
                htmlFor="general-theme"
              >
                <Select
                  id="general-theme"
                  value={settings.theme}
                  onChange={(e) => updateSettings({ theme: e.target.value as ThemeName })}
                  options={THEME_OPTIONS}
                />
                {onNavigateToThemes && (
                  <button
                    onClick={onNavigateToThemes}
                    className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Preview all themes →
                  </button>
                )}
              </FieldGroup>

              {/* Separator between display and appearance groups */}
              <div className="border-t border-zinc-800 pt-4 mt-4" />

              {/* Translation Position — disabled in translation-only mode */}
              <div className={isTranslationOnly ? 'opacity-40 pointer-events-none' : ''}>
                <FieldGroup
                  label="Translation Position"
                  description="Where the translation appears relative to the original text."
                  hint={isTranslationOnly ? 'Position only applies in Bilingual mode.' : undefined}
                >
                  <SegmentedControl
                    id="general-translation-position"
                    label="Translation Position"
                    options={POSITION_OPTIONS}
                    value={settings.translationPosition}
                    onChange={(val) => updateSettings({ translationPosition: val })}
                  />
                </FieldGroup>
              </div>

              <FieldGroup
                label="Host Page Mode"
                description="Match how translations render on the page. Auto detects the site's theme."
              >
                <SegmentedControl
                  id="general-host-page-mode"
                  label="Host Page Mode"
                  options={HOST_PAGE_MODE_OPTIONS}
                  value={settings.darkMode}
                  onChange={(val) => updateSettings({ darkMode: val })}
                />
              </FieldGroup>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/trungnguyen/Documents/AI/Project/AnyLLMTranslate && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add entrypoints/options/sections/GeneralSection.tsx entrypoints/options/App.tsx
git commit -m "feat(general): restructure tab — merge cards, remove preview, rename Dark Mode, disable position conditionally"
```

---

## Task 5: Migrate All Sections to SectionHeader

**Files:**
- Modify: `entrypoints/options/sections/ThemesSection.tsx`
- Modify: `entrypoints/options/sections/ProviderSection.tsx`
- Modify: `entrypoints/options/sections/DictionarySection.tsx`
- Modify: `entrypoints/options/sections/SiteRulesSection.tsx`
- Modify: `entrypoints/options/sections/SubtitlesSection.tsx`
- Modify: `entrypoints/options/sections/StatisticsSection.tsx`
- Modify: `entrypoints/options/sections/ShortcutsSection.tsx`
- Modify: `entrypoints/options/sections/InlineTranslateSection.tsx`
- Modify: `entrypoints/options/sections/AdvancedSection.tsx`

Each section follows the same pattern: replace the inline sticky header div with `<SectionHeader>`, add the import, and use `stagger()` helper where applicable.

- [ ] **Step 1: Migrate ThemesSection.tsx**

Add imports at top:
```tsx
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
```

Replace lines 50-59 (the inline header) with:
```tsx
      <SectionHeader
        title="Display Themes"
        description="Choose how translated text appears on web pages."
        icon={<Palette className="w-4 h-4" />}
        accentColor="pink"
      />
```

Replace `style={{ '--stagger-delay': '0' } as React.CSSProperties}` with `style={stagger(0)}` on line 61.

- [ ] **Step 2: Migrate ProviderSection.tsx**

Add imports at top:
```tsx
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
```

Replace lines 93-102 (the inline header) with:
```tsx
      <SectionHeader
        title="Translation Provider"
        description="Configure the LLM provider for translations."
        icon={<Zap className="w-4 h-4" />}
        accentColor="amber"
      />
```

Replace all `style={{ '--stagger-delay': 'N' } as React.CSSProperties}` occurrences with `style={stagger(N)}` (lines 105, 126, 226, 304).

- [ ] **Step 3: Migrate DictionarySection.tsx**

Add imports at top:
```tsx
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
```

Replace lines 110-119 (the inline header) with:
```tsx
      <SectionHeader
        title="Custom Dictionary"
        description="Define term-specific translations injected into the system prompt."
        icon={<BookOpen className="w-4 h-4" />}
        accentColor="emerald"
      />
```

Replace all `style={{ '--stagger-delay': 'N' } as React.CSSProperties}` with `style={stagger(N)}` (lines 123, 155, 200).

- [ ] **Step 4: Migrate SiteRulesSection.tsx**

Add imports at top:
```tsx
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
```

Replace lines 75-84 (the inline header) with:
```tsx
      <SectionHeader
        title="Site Rules"
        description="Configure per-site translation behavior."
        icon={<Globe className="w-4 h-4" />}
        accentColor="teal"
      />
```

Replace all `style={{ '--stagger-delay': 'N' } as React.CSSProperties}` with `style={stagger(N)}` (lines 88, 93, 98, 130).

- [ ] **Step 5: Migrate SubtitlesSection.tsx**

Add imports at top:
```tsx
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
```

Replace lines 179-188 (the inline header) with:
```tsx
      <SectionHeader
        title="Subtitle Settings"
        description="Configure how translated subtitles appear on video players."
        icon={<SubtitlesIcon className="w-4 h-4" />}
        accentColor="cyan"
      />
```

Replace all `style={{ '--stagger-delay': 'N' } as React.CSSProperties}` with `style={stagger(N)}` (lines 192, 245, 348).

- [ ] **Step 6: Migrate StatisticsSection.tsx**

Add imports at top:
```tsx
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
```

Replace lines 54-63 (the inline header) with:
```tsx
      <SectionHeader
        title="Statistics"
        description="Translation usage and performance metrics."
        icon={<BarChart3 className="w-4 h-4" />}
        accentColor="blue"
      />
```

Replace all `style={{ '--stagger-delay': 'N' } as React.CSSProperties}` with `style={stagger(N)}` (lines 67, 112, 155, 201).

- [ ] **Step 7: Migrate ShortcutsSection.tsx**

Add imports at top:
```tsx
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
```

Replace lines 18-27 (the inline header) with:
```tsx
      <SectionHeader
        title="Keyboard Shortcuts"
        description="View and customize keyboard shortcuts for AnyLLMTranslate."
        icon={<KeyboardIcon className="w-4 h-4" />}
        accentColor="orange"
      />
```

Replace all `style={{ '--stagger-delay': 'N' } as React.CSSProperties}` with `style={stagger(N)}` (lines 31, 58).

- [ ] **Step 8: Migrate InlineTranslateSection.tsx**

Add imports at top:
```tsx
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
```

Replace lines 43-52 (the inline header) with:
```tsx
      <SectionHeader
        title="Inline Translation"
        description="Translate text in input fields with a quick key gesture."
        icon={<TextCursorInput className="w-4 h-4" />}
        accentColor="amber"
      />
```

Replace all `style={{ '--stagger-delay': 'N' } as React.CSSProperties}` with `style={stagger(N)}` (lines 55, 139).

- [ ] **Step 9: Migrate AdvancedSection.tsx**

Add imports at top:
```tsx
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
```

Replace lines 153-162 (the inline header) with:
```tsx
      <SectionHeader
        title="Advanced"
        description="Cache management, data portability, and debugging tools."
        icon={<Wrench className="w-4 h-4" />}
        accentColor="zinc"
      />
```

Replace all `style={{ '--stagger-delay': 'N' } as React.CSSProperties}` with `style={stagger(N)}` (lines 166, 246, 324).

- [ ] **Step 10: Verify all sections compile**

Run: `cd /Users/trungnguyen/Documents/AI/Project/AnyLLMTranslate && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

- [ ] **Step 11: Run existing tests**

Run: `cd /Users/trungnguyen/Documents/AI/Project/AnyLLMTranslate && npx vitest run entrypoints/options/ 2>&1 | tail -30`
Expected: All existing tests pass

- [ ] **Step 12: Commit**

```bash
git add entrypoints/options/sections/
git commit -m "refactor(sections): migrate all 9 sections to SectionHeader component and stagger helper"
```

---

## Task 6: Verify Full Build

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript compilation**

Run: `cd /Users/trungnguyen/Documents/AI/Project/AnyLLMTranslate && npx tsc --noEmit`
Expected: Clean — no errors

- [ ] **Step 2: Run full test suite**

Run: `cd /Users/trungnguyen/Documents/AI/Project/AnyLLMTranslate && npx vitest run 2>&1 | tail -40`
Expected: All tests pass

- [ ] **Step 3: Run dev build**

Run: `cd /Users/trungnguyen/Documents/AI/Project/AnyLLMTranslate && npm run build 2>&1 | tail -20`
Expected: Build succeeds with no errors

---

## Task 7: Update Existing Tests

**Files:**
- Modify: `entrypoints/options/__tests__/ThemePreview.test.tsx` (if any tests break from the label addition)

- [ ] **Step 1: Review test results from Task 6**

If any ThemePreview tests fail due to the new "Sample states:" label, update the affected selectors. The label is a sibling `<p>` element above the states container — it should not affect existing queries unless tests rely on exact DOM structure.

- [ ] **Step 2: Commit fixes if needed**

```bash
git add entrypoints/options/__tests__/
git commit -m "test: update tests for General tab UI/UX overhaul changes"
```
