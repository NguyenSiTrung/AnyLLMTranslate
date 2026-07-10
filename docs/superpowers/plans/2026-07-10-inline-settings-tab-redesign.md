# Inline Settings Tab Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure Settings → Inline into hero enable + Preview + Trigger + Write & language + Site blocklist + Advanced timing + How it works, with a reactive mock preview and no new settings keys.

**Architecture:** Extract pure preview projection helpers into `lib/inlineTranslatePreview.ts`. Build a presentational `InlineTranslatePreview` component. Rewrite `InlineTranslateSection.tsx` using Subtitles/General patterns (`DisabledDimmer`, `AdvancedDisclosure`, `SegmentedControl`, `Badge`, `Button`, card descriptions). Unit-test helpers first; section smoke tests with Zustand + Testing Library.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Lucide React, Zustand, Vitest + Testing Library (jsdom for `entrypoints/**`).

**Spec:** `docs/superpowers/specs/2026-07-10-inline-settings-tab-redesign-design.md`  
**Beads:** ALT-doc

## Global Constraints

- No new settings schema keys — presentation/IA only; store fields unchanged.
- Preserve control ids where they exist: `inline-translate-toggle`, `inline-translate-target-language`, `inline-translate-tap-count`, `inline-translate-time-window`, `inline-translate-idle-ms`, `inline-translate-gap-ms`, `inline-translate-tolerance`, `inline-translate-prefix-toggle`, `inline-translate-prefix-char`, `inline-translate-dual-mode` (migrate dual mode to segmented control with id `inline-translate-dual-mode`), `inline-translate-fallback-undo`, `inline-translate-blocklist`.
- Preview is reactive mock only — **no network / provider calls**.
- When language prefix is enabled in preview: demo uses fixed `{prefix}en` + English sample; when disabled: plain source + `targetLanguage` sample.
- Dual-mode join separator in projection: ` / ` (space-slash-space).
- Timing starts collapsed via `AdvancedDisclosure` `defaultExpanded={false}`.
- Zinc dark chrome; SegmentedControl keeps global blue active styles; hero strip uses amber.
- No purple-first styling.
- Master enable hero always interactive; other cards use `DisabledDimmer` when `!enabled`.

---

## File map

| File | Responsibility |
|------|----------------|
| Create `lib/inlineTranslatePreview.ts` | Sample map + pure `resolvePreviewTranslation` + `buildPreviewProjection` |
| Create `lib/__tests__/inlineTranslatePreview.test.ts` | Unit tests for projection matrix |
| Create `entrypoints/options/components/InlineTranslatePreview.tsx` | Presentational reactive mock UI |
| Rewrite `entrypoints/options/sections/InlineTranslateSection.tsx` | Full section IA |
| Create `entrypoints/options/sections/__tests__/InlineTranslateSection.test.tsx` | Section smoke tests |

**Do not modify:** content scripts, `types/config` defaults, `settingsStore` schema.

---

### Task 1: Preview projection helpers (TDD)

**Files:**
- Create: `lib/inlineTranslatePreview.ts`
- Create: `lib/__tests__/inlineTranslatePreview.test.ts`

**Interfaces:**
- Consumes: none (pure strings)
- Produces:
  - `export const INLINE_PREVIEW_SOURCE = 'hello world'`
  - `export function resolvePreviewTranslation(targetLanguage: string): string`
  - `export interface PreviewProjectionInput { targetLanguage: string; dualMode: boolean; enableLanguagePrefix: boolean; languagePrefix: string }`
  - `export interface PreviewProjection { before: string; after: string; meta: string }`
  - `export function buildPreviewProjection(input: PreviewProjectionInput): PreviewProjection`

- [ ] **Step 1: Write the failing unit test**

Create `lib/__tests__/inlineTranslatePreview.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  INLINE_PREVIEW_SOURCE,
  resolvePreviewTranslation,
  buildPreviewProjection,
} from '@/lib/inlineTranslatePreview';

describe('resolvePreviewTranslation', () => {
  it('returns a mapped sample for known languages', () => {
    expect(resolvePreviewTranslation('vi')).toBeTruthy();
    expect(resolvePreviewTranslation('vi')).not.toContain('translated ·');
    expect(resolvePreviewTranslation('en')).toMatch(/hello/i);
  });

  it('falls back for unknown codes', () => {
    expect(resolvePreviewTranslation('xx')).toBe('(translated · xx)');
  });
});

describe('buildPreviewProjection', () => {
  it('translation-only without prefix uses target sample', () => {
    const p = buildPreviewProjection({
      targetLanguage: 'vi',
      dualMode: false,
      enableLanguagePrefix: false,
      languagePrefix: '/',
    });
    expect(p.before).toBe(INLINE_PREVIEW_SOURCE);
    expect(p.after).toBe(resolvePreviewTranslation('vi'));
    expect(p.meta).toContain('vi');
  });

  it('dual mode joins original and translation with /', () => {
    const p = buildPreviewProjection({
      targetLanguage: 'vi',
      dualMode: true,
      enableLanguagePrefix: false,
      languagePrefix: '/',
    });
    expect(p.after).toBe(`${INLINE_PREVIEW_SOURCE} / ${resolvePreviewTranslation('vi')}`);
  });

  it('prefix mode demos fixed en override and English sample', () => {
    const p = buildPreviewProjection({
      targetLanguage: 'vi',
      dualMode: false,
      enableLanguagePrefix: true,
      languagePrefix: '/',
    });
    expect(p.before).toBe(`/en ${INLINE_PREVIEW_SOURCE}`);
    expect(p.after).toBe(resolvePreviewTranslation('en'));
    expect(p.meta.toLowerCase()).toMatch(/prefix|en/);
  });

  it('prefix dual mode joins source (without prefix) and English sample', () => {
    const p = buildPreviewProjection({
      targetLanguage: 'ja',
      dualMode: true,
      enableLanguagePrefix: true,
      languagePrefix: '#',
    });
    expect(p.before).toBe(`#en ${INLINE_PREVIEW_SOURCE}`);
    expect(p.after).toBe(
      `${INLINE_PREVIEW_SOURCE} / ${resolvePreviewTranslation('en')}`,
    );
  });

  it('uses custom prefix character when provided; empty falls back to /', () => {
    const empty = buildPreviewProjection({
      targetLanguage: 'en',
      dualMode: false,
      enableLanguagePrefix: true,
      languagePrefix: '',
    });
    expect(empty.before.startsWith('/en ')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/__tests__/inlineTranslatePreview.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

Create `lib/inlineTranslatePreview.ts`:

```typescript
/**
 * Pure helpers for the Inline settings reactive mock preview.
 * No network — sample strings only.
 */

export const INLINE_PREVIEW_SOURCE = 'hello world';

/** Short sample translations for common targets (options UI only). */
const SAMPLE_TRANSLATIONS: Record<string, string> = {
  en: 'hello world',
  vi: 'xin chào thế giới',
  ja: 'こんにちは世界',
  zh: '你好世界',
  ko: '안녕하세요 세계',
  es: 'hola mundo',
  fr: 'bonjour le monde',
  de: 'hallo welt',
  pt: 'olá mundo',
  ru: 'привет мир',
};

export function resolvePreviewTranslation(targetLanguage: string): string {
  const code = (targetLanguage || 'en').toLowerCase();
  return SAMPLE_TRANSLATIONS[code] ?? `(translated · ${code})`;
}

export interface PreviewProjectionInput {
  targetLanguage: string;
  dualMode: boolean;
  enableLanguagePrefix: boolean;
  languagePrefix: string;
}

export interface PreviewProjection {
  /** Text the user “typed” in the mock field (may include language prefix). */
  before: string;
  /** Projected write-back result. */
  after: string;
  /** Short meta line for the preview footer. */
  meta: string;
}

export function buildPreviewProjection(input: PreviewProjectionInput): PreviewProjection {
  const prefixChar = input.languagePrefix?.slice(0, 1) || '/';
  const source = INLINE_PREVIEW_SOURCE;

  if (input.enableLanguagePrefix) {
    const translation = resolvePreviewTranslation('en');
    const before = `${prefixChar}en ${source}`;
    const after = input.dualMode ? `${source} / ${translation}` : translation;
    return {
      before,
      after,
      meta: `Prefix ${prefixChar}en → English (demo)`,
    };
  }

  const code = input.targetLanguage || 'en';
  const translation = resolvePreviewTranslation(code);
  const after = input.dualMode ? `${source} / ${translation}` : translation;
  return {
    before: source,
    after,
    meta: `Target · ${code}`,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/__tests__/inlineTranslatePreview.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/inlineTranslatePreview.ts lib/__tests__/inlineTranslatePreview.test.ts
git commit -m "feat(inline): pure helpers for settings preview projection"
```

---

### Task 2: InlineTranslatePreview component

**Files:**
- Create: `entrypoints/options/components/InlineTranslatePreview.tsx`

**Interfaces:**
- Consumes: `buildPreviewProjection` from `@/lib/inlineTranslatePreview`
- Produces:

```typescript
export interface InlineTranslatePreviewProps {
  disabled: boolean;
  targetLanguage: string;
  dualMode: boolean;
  enableLanguagePrefix: boolean;
  languagePrefix: string;
  tapCount: number;
  timeWindowMs: number;
  triggerKeyLabel: string;
}
export function InlineTranslatePreview(props: InlineTranslatePreviewProps): JSX.Element
```

- [ ] **Step 1: Implement the component**

Create `entrypoints/options/components/InlineTranslatePreview.tsx`:

```tsx
/**
 * InlineTranslatePreview — reactive mock input for Settings → Inline.
 * Mirrors dual mode, language prefix, target language, and gesture labels.
 * No real translation.
 */

import { buildPreviewProjection } from '@/lib/inlineTranslatePreview';

export interface InlineTranslatePreviewProps {
  disabled: boolean;
  targetLanguage: string;
  dualMode: boolean;
  enableLanguagePrefix: boolean;
  languagePrefix: string;
  tapCount: number;
  timeWindowMs: number;
  triggerKeyLabel: string;
}

export function InlineTranslatePreview({
  disabled,
  targetLanguage,
  dualMode,
  enableLanguagePrefix,
  languagePrefix,
  timeWindowMs,
  triggerKeyLabel,
}: InlineTranslatePreviewProps) {
  const projection = buildPreviewProjection({
    targetLanguage,
    dualMode,
    enableLanguagePrefix,
    languagePrefix,
  });

  return (
    <div
      className={`rounded-xl border border-zinc-700/60 bg-zinc-950/60 overflow-hidden ${
        disabled ? 'opacity-50' : ''
      }`}
      data-testid="inline-translate-preview"
    >
      {/* Decorative field-type chips */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-800/80 bg-zinc-900/50">
        {(['input', 'textarea', 'contentEditable'] as const).map((t) => (
          <span
            key={t}
            className="text-[10px] font-mono text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/40"
            aria-hidden="true"
          >
            {t}
          </span>
        ))}
        <span className="ml-auto text-[10px] text-zinc-600" aria-hidden="true">
          mock field
        </span>
      </div>

      <div className="p-4 space-y-3">
        {disabled ? (
          <p className="text-xs text-zinc-500">
            Enable inline translation to preview
          </p>
        ) : (
          <>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1">
                Before
              </p>
              <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/80 px-3 py-2 font-mono text-xs text-zinc-400">
                {projection.before}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1">
                After gesture / Alt+I
              </p>
              <div
                className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 font-mono text-xs text-zinc-200"
                aria-live="polite"
              >
                {projection.after}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t border-zinc-800/80 bg-zinc-900/40">
        <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-300 font-mono">
          {triggerKeyLabel}
        </kbd>
        <span className="text-[10px] text-zinc-500">within {timeWindowMs}ms</span>
        <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-300 font-mono">
          Alt+I
        </kbd>
        <span className="ml-auto text-[10px] text-zinc-500 truncate max-w-[50%]">
          {projection.meta}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck (optional quick)**

Run: `npx tsc --noEmit`  
Expected: no errors related to this file (or fix any introduced).

- [ ] **Step 3: Commit**

```bash
git add entrypoints/options/components/InlineTranslatePreview.tsx
git commit -m "feat(inline): reactive mock preview component for settings"
```

---

### Task 3: Rewrite InlineTranslateSection

**Files:**
- Rewrite: `entrypoints/options/sections/InlineTranslateSection.tsx`
- Create: `entrypoints/options/sections/__tests__/InlineTranslateSection.test.tsx`

**Interfaces:**
- Consumes: store `inlineTranslate` + `updateSettings`; `InlineTranslatePreview`; UI primitives listed below
- Produces: `export function InlineTranslateSection(): JSX.Element` (same public export)

**Required imports:**  
`TextCursorInput`, `Keyboard`, `ShieldOff`, `Languages`, `Type`, `RotateCcw`, `SlidersHorizontal` from lucide-react;  
`SectionHeader`, `Card`, `Toggle`, `Slider`, `FieldGroup`, `Select`, `SegmentedControl`, `AdvancedDisclosure`, `DisabledDimmer`, `Badge`, `Button`;  
`useSettingsStore`, `LANGUAGES`, `DEFAULT_INLINE_TRANSLATE_BLOCKLIST`, `stagger`, `InlineTranslatePreview`.

- [ ] **Step 1: Write failing section smoke tests**

Create `entrypoints/options/sections/__tests__/InlineTranslateSection.test.tsx` (mirror GeneralSection chrome stub pattern):

```tsx
/**
 * InlineTranslateSection — hero, cards, dual mode segments, dimmer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DEFAULT_SETTINGS, DEFAULT_INLINE_TRANSLATE_SETTINGS } from '@/types/config';

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

import { useSettingsStore } from '@/stores/settingsStore';
import { InlineTranslateSection } from '../InlineTranslateSection';

describe('InlineTranslateSection', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      inlineTranslate: { ...DEFAULT_INLINE_TRANSLATE_SETTINGS, enabled: true },
    });
    for (const k of Object.keys(mockStorageData)) {
      Reflect.deleteProperty(mockStorageData, k);
    }
    vi.clearAllMocks();
  });

  it('renders hero enable and primary card titles', () => {
    render(<InlineTranslateSection />);
    expect(screen.getByLabelText(/Enable Inline Translation/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Preview', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Trigger', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Write & language', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Site blocklist', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Advanced', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How it works', level: 3 })).toBeInTheDocument();
  });

  it('shows reactive preview after text when enabled', () => {
    render(<InlineTranslateSection />);
    expect(screen.getByTestId('inline-translate-preview')).toBeInTheDocument();
    expect(screen.getByText(/After gesture/i)).toBeInTheDocument();
  });

  it('shows enable-to-preview message when disabled', () => {
    useSettingsStore.setState({
      inlineTranslate: { ...DEFAULT_INLINE_TRANSLATE_SETTINGS, enabled: false },
    });
    render(<InlineTranslateSection />);
    expect(screen.getByText(/Enable inline translation to preview/i)).toBeInTheDocument();
  });

  it('dual mode segment updates store', async () => {
    render(<InlineTranslateSection />);
    fireEvent.click(screen.getByRole('radio', { name: /Original \+ translation/i }));
    await waitFor(() => {
      expect(useSettingsStore.getState().inlineTranslate.dualMode).toBe(true);
    });
  });

  it('toggles enabled via hero control', async () => {
    render(<InlineTranslateSection />);
    const toggle = screen.getByLabelText(/Enable Inline Translation/i);
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(useSettingsStore.getState().inlineTranslate.enabled).toBe(false);
    });
  });

  it('shows blocklist pattern count badge', () => {
    render(<InlineTranslateSection />);
    const n = DEFAULT_INLINE_TRANSLATE_SETTINGS.blocklistPatterns.length;
    expect(screen.getByText(new RegExp(`${n}\\s+patterns?`, 'i'))).toBeInTheDocument();
  });

  it('Gesture timing disclosure starts collapsed', () => {
    render(<InlineTranslateSection />);
    const btn = screen.getByRole('button', { name: /Gesture timing/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });
});
```

Note: Adjust toggle label query if `Toggle` uses different accessible name (check `ui/Toggle.tsx` — use `getByRole('switch')` if needed).

- [ ] **Step 2: Run tests — expect fail**

Run: `npm test -- entrypoints/options/sections/__tests__/InlineTranslateSection.test.tsx`

Expected: FAIL (missing cards / dual mode radio)

- [ ] **Step 3: Rewrite InlineTranslateSection**

Replace `entrypoints/options/sections/InlineTranslateSection.tsx` with structure:

```tsx
/**
 * Inline Translate Section — hero enable, reactive preview, progressive disclosure.
 * Spec: docs/superpowers/specs/2026-07-10-inline-settings-tab-redesign-design.md
 */

import {
  TextCursorInput,
  Keyboard,
  ShieldOff,
  Languages,
  Type,
  RotateCcw,
  slidersHorizontal as SlidersHorizontal, // use SlidersHorizontal from lucide
} from 'lucide-react';
// … correct import: SlidersHorizontal from 'lucide-react'

import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import { Card } from '@/ui/Card';
import { Toggle } from '@/ui/Toggle';
import { Slider } from '@/ui/Slider';
import { FieldGroup } from '@/ui/FieldGroup';
import { Select } from '@/ui/Select';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { AdvancedDisclosure } from '@/ui/AdvancedDisclosure';
import { DisabledDimmer } from '@/ui/DisabledDimmer';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Textarea } from '@/ui/Textarea';
import { useSettingsStore } from '@/stores/settingsStore';
import { LANGUAGES } from '@/lib/languages';
import { DEFAULT_INLINE_TRANSLATE_BLOCKLIST } from '@/types/config';
import { InlineTranslatePreview } from '@/entrypoints/options/components/InlineTranslatePreview';

// Dual mode segment values as strings for SegmentedControl
const DUAL_MODE_OPTIONS = [
  { value: 'translation-only', label: 'Translation only', icon: <Type className="w-3.5 h-3.5" /> },
  { value: 'dual', label: 'Original + translation', icon: <Languages className="w-3.5 h-3.5" /> },
] as const;

export function InlineTranslateSection() {
  const inlineTranslate = useSettingsStore((s) => s.inlineTranslate);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const targetLanguages = LANGUAGES.filter((l) => l.code !== 'auto');
  const enabled = inlineTranslate.enabled;

  const patch = (partial: Partial<typeof inlineTranslate>) => {
    updateSettings({ inlineTranslate: { ...inlineTranslate, ...partial } });
  };

  const gestureLabel =
    inlineTranslate.triggerKey === ' '
      ? `Space × ${inlineTranslate.tapCount}`
      : `${inlineTranslate.triggerKey} × ${inlineTranslate.tapCount}`;

  const blocklistText = (inlineTranslate.blocklistPatterns ?? []).join('\n');
  const patternCount = (inlineTranslate.blocklistPatterns ?? []).filter(Boolean).length;

  const handleBlocklistChange = (value: string) => {
    const patterns = value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    patch({ blocklistPatterns: patterns });
  };

  const resetBlocklist = () => {
    patch({ blocklistPatterns: [...DEFAULT_INLINE_TRANSLATE_BLOCKLIST] });
  };

  const dualModeValue = inlineTranslate.dualMode ? 'dual' : 'translation-only';

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Inline Translation"
        description="Translate text in inputs with a key gesture or Alt+I."
        icon={<TextCursorInput className="w-4 h-4" />}
        accentColor="amber"
      />

      {/* Hero enable */}
      <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-4">
        <Toggle
          id="inline-translate-toggle"
          label="Enable Inline Translation"
          description={
            enabled
              ? 'Active in text fields on pages that are not blocklisted.'
              : 'Off — enable to translate text inside inputs with a key gesture or Alt+I.'
          }
          checked={enabled}
          onChange={(next) => patch({ enabled: next })}
        />
      </div>

      <div className="space-y-4">
        {/* 1. Preview */}
        <div className="animate-stagger" style={stagger(0)}>
          <Card
            title="Preview"
            description="Sample field that mirrors your current settings. No real translation runs here."
            icon={<TextCursorInput className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <InlineTranslatePreview
              disabled={!enabled}
              targetLanguage={inlineTranslate.targetLanguage}
              dualMode={inlineTranslate.dualMode ?? false}
              enableLanguagePrefix={inlineTranslate.enableLanguagePrefix ?? true}
              languagePrefix={inlineTranslate.languagePrefix ?? '/'}
              tapCount={inlineTranslate.tapCount}
              timeWindowMs={inlineTranslate.timeWindowMs}
              triggerKeyLabel={gestureLabel}
            />
          </Card>
        </div>

        {/* 2. Trigger */}
        <div className="animate-stagger" style={stagger(1)}>
          <Card
            title="Trigger"
            description="Default language and how the key gesture fires."
            icon={<Keyboard className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <DisabledDimmer disabled={!enabled}>
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-lg bg-zinc-800/40 border border-zinc-700/50">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-zinc-400">Gesture:</span>
                    <kbd className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 font-mono">
                      {gestureLabel}
                    </kbd>
                  </div>
                  <span className="text-xs text-zinc-500">
                    within {inlineTranslate.timeWindowMs}ms
                  </span>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-xs text-zinc-400">Shortcut:</span>
                    <kbd className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 font-mono">
                      Alt+I
                    </kbd>
                  </div>
                </div>

                <FieldGroup
                  label="Target Language"
                  description="Default language for input translation (overridable with /en-style prefixes)."
                  hint="Type the first few letters to jump to a language."
                  htmlFor="inline-translate-target-language"
                >
                  <Select
                    id="inline-translate-target-language"
                    value={inlineTranslate.targetLanguage}
                    onChange={(e) => patch({ targetLanguage: e.target.value })}
                    options={targetLanguages.map((lang) => ({
                      value: lang.code,
                      label: `${lang.nativeName} (${lang.name})`,
                    }))}
                    disabled={!enabled}
                  />
                </FieldGroup>

                <FieldGroup
                  label="Tap Count"
                  description={`Number of consecutive key presses to trigger (${inlineTranslate.tapCount})`}
                >
                  <Slider
                    id="inline-translate-tap-count"
                    min={2}
                    max={5}
                    step={1}
                    value={inlineTranslate.tapCount}
                    onChange={(tapCount) => patch({ tapCount })}
                    disabled={!enabled}
                  />
                </FieldGroup>

                <FieldGroup
                  label="Time Window"
                  description={`Maximum span for the gesture burst (${inlineTranslate.timeWindowMs}ms)`}
                >
                  <Slider
                    id="inline-translate-time-window"
                    min={200}
                    max={1000}
                    step={50}
                    value={inlineTranslate.timeWindowMs}
                    onChange={(timeWindowMs) => patch({ timeWindowMs })}
                    disabled={!enabled}
                  />
                </FieldGroup>
              </div>
            </DisabledDimmer>
          </Card>
        </div>

        {/* 3. Write & language */}
        <div className="animate-stagger" style={stagger(2)}>
          <Card
            title="Write & language"
            description="How the translated text is written back and optional per-request language overrides."
            icon={<Languages className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <DisabledDimmer disabled={!enabled}>
              <div className="space-y-5">
                <FieldGroup
                  label="Write mode"
                  description="Translation only replaces the field. Original + translation keeps both."
                >
                  <SegmentedControl
                    id="inline-translate-dual-mode"
                    label="Write mode"
                    options={[...DUAL_MODE_OPTIONS]}
                    value={dualModeValue}
                    onChange={(v) => patch({ dualMode: v === 'dual' })}
                    disabled={!enabled}
                  />
                </FieldGroup>

                <Toggle
                  id="inline-translate-prefix-toggle"
                  label="Enable Language Prefix"
                  description="Leading tokens like /en or /ja set the target language for that request"
                  checked={inlineTranslate.enableLanguagePrefix ?? true}
                  onChange={(enableLanguagePrefix) => patch({ enableLanguagePrefix })}
                  disabled={!enabled}
                />

                <FieldGroup
                  label="Prefix Character"
                  description="Character that starts a language override (default /)."
                  htmlFor="inline-translate-prefix-char"
                >
                  <input
                    id="inline-translate-prefix-char"
                    type="text"
                    maxLength={1}
                    value={inlineTranslate.languagePrefix ?? '/'}
                    onChange={(e) => {
                      const languagePrefix = e.target.value.slice(0, 1) || '/';
                      patch({ languagePrefix });
                    }}
                    disabled={
                      !enabled || !(inlineTranslate.enableLanguagePrefix ?? true)
                    }
                    className="w-16 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-50"
                    aria-label="Language prefix character"
                  />
                </FieldGroup>

                <Toggle
                  id="inline-translate-fallback-undo"
                  label="Fallback Undo"
                  description="Re-triggering the gesture/shortcut restores the original when native Ctrl+Z is unavailable"
                  checked={inlineTranslate.enableFallbackUndo ?? true}
                  onChange={(enableFallbackUndo) => patch({ enableFallbackUndo })}
                  disabled={!enabled}
                />
              </div>
            </DisabledDimmer>
          </Card>
        </div>

        {/* 4. Site blocklist */}
        <div className="animate-stagger" style={stagger(3)}>
          <Card
            title="Site blocklist"
            description="Disable inline translate on matching hosts. Wildcards (*) supported."
            icon={<ShieldOff className="w-3.5 h-3.5" />}
            variant="bordered"
            headerExtra={
              <Badge variant="info">
                {patternCount} pattern{patternCount === 1 ? '' : 's'}
              </Badge>
            }
          >
            <DisabledDimmer disabled={!enabled}>
              <div className="space-y-3">
                <FieldGroup
                  label="Blocked hosts / patterns"
                  description="One pattern per line (e.g. *figma.com)."
                  htmlFor="inline-translate-blocklist"
                >
                  <Textarea
                    id="inline-translate-blocklist"
                    rows={6}
                    value={blocklistText}
                    onChange={(e) => handleBlocklistChange(e.target.value)}
                    disabled={!enabled}
                    mono
                    spellCheck={false}
                    aria-label="Blocklist patterns"
                    className="min-h-[6rem] resize-y text-xs"
                  />
                </FieldGroup>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw className="w-3 h-3" />}
                  onClick={resetBlocklist}
                  disabled={!enabled}
                >
                  Reset to defaults
                </Button>
              </div>
            </DisabledDimmer>
          </Card>
        </div>

        {/* 5. Advanced timing */}
        <div className="animate-stagger" style={stagger(4)}>
          <Card
            title="Advanced"
            description="Fine-tune gesture recognition. Defaults work for most users."
            icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <DisabledDimmer disabled={!enabled}>
              <AdvancedDisclosure label="Gesture timing" idPrefix="inline-gesture-timing">
                <div className="space-y-5">
                  <FieldGroup
                    label="Idle Debounce"
                    description={`Wait after the last trigger tap before firing (${inlineTranslate.idleMs ?? 0}ms). 0 = fire immediately.`}
                  >
                    <Slider
                      id="inline-translate-idle-ms"
                      min={0}
                      max={500}
                      step={25}
                      value={inlineTranslate.idleMs ?? 0}
                      onChange={(idleMs) => patch({ idleMs })}
                      disabled={!enabled}
                    />
                  </FieldGroup>
                  <FieldGroup
                    label="Trigger Gap"
                    description={`Minimum gap between counted taps (${inlineTranslate.triggerGapMs ?? 0}ms). 0 = no gap filter.`}
                  >
                    <Slider
                      id="inline-translate-gap-ms"
                      min={0}
                      max={200}
                      step={10}
                      value={inlineTranslate.triggerGapMs ?? 0}
                      onChange={(triggerGapMs) => patch({ triggerGapMs })}
                      disabled={!enabled}
                    />
                  </FieldGroup>
                  <FieldGroup
                    label="Tolerance"
                    description={`Extra noisy taps allowed before reset (${inlineTranslate.triggerToleranceCount ?? 0})`}
                  >
                    <Slider
                      id="inline-translate-tolerance"
                      min={0}
                      max={3}
                      step={1}
                      value={inlineTranslate.triggerToleranceCount ?? 0}
                      onChange={(triggerToleranceCount) =>
                        patch({ triggerToleranceCount })
                      }
                      disabled={!enabled}
                    />
                  </FieldGroup>
                </div>
              </AdvancedDisclosure>
            </DisabledDimmer>
          </Card>
        </div>

        {/* 6. How it works */}
        <div className="animate-stagger" style={stagger(5)}>
          <Card title="How it works" variant="bordered">
            <ul className="list-disc list-inside space-y-1.5 text-xs text-zinc-500">
              <li>
                Press{' '}
                <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 font-mono">
                  {gestureLabel}
                </kbd>{' '}
                in a text field, or{' '}
                <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 font-mono">
                  Alt+I
                </kbd>{' '}
                (customize under chrome://extensions/shortcuts).
              </li>
              <li>
                Prefix example:{' '}
                <code className="text-zinc-400">
                  {(inlineTranslate.languagePrefix ?? '/') + 'en hello'}
                </code>{' '}
                + gesture → English, strips the prefix token.
              </li>
              <li>Works in text inputs, search boxes, textareas, and contentEditable fields.</li>
              <li>
                Undo with Ctrl+Z when available; otherwise re-trigger if Fallback Undo is on.
              </li>
              <li>
                Password fields, code editors, blocklisted hosts, browser internal pages, and the
                Web Store are excluded.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
```

**Important:** Fix the accidental bad lucide import in the sketch above — use:

```ts
import {
  TextCursorInput,
  Keyboard,
  ShieldOff,
  Languages,
  Type,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
```

Check `ui/Toggle.tsx` for how labels map to accessible names so tests pass (may need `getByRole('switch', { name: ... })`).

- [ ] **Step 4: Run section tests — fix until pass**

Run: `npm test -- entrypoints/options/sections/__tests__/InlineTranslateSection.test.tsx`

Expected: PASS

- [ ] **Step 5: Run helper tests still pass**

Run: `npm test -- lib/__tests__/inlineTranslatePreview.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add \
  entrypoints/options/sections/InlineTranslateSection.tsx \
  entrypoints/options/sections/__tests__/InlineTranslateSection.test.tsx
git commit -m "feat(inline): restructure Settings Inline tab with preview and progressive disclosure"
```

---

### Task 4: Verification + close

**Files:** none new

- [ ] **Step 1: Run focused test suite**

```bash
npm test -- lib/__tests__/inlineTranslatePreview.test.ts entrypoints/options/sections/__tests__/InlineTranslateSection.test.tsx
```

Expected: all PASS

- [ ] **Step 2: Typecheck**

```bash
npm run compile
```

Expected: exit 0 (or no new errors in touched files)

- [ ] **Step 3: Manual checklist** (options page → Inline)

1. Hero toggle dims cards and shows “Enable…to preview”.  
2. Dual mode segment updates preview after line.  
3. Prefix toggle changes Before to `/en hello world` and after to English sample.  
4. Tap count / window update chips.  
5. Gesture timing starts collapsed; expand shows three sliders.  
6. Blocklist badge count updates; Reset restores defaults.  

- [ ] **Step 4: Close beads + push**

```bash
bd close ALT-doc --reason="Inline settings tab redesigned (IA C + reactive mock)"
git pull --rebase
bd dolt push
git push
git status
```

---

## Spec coverage checklist

| Spec section | Task |
|--------------|------|
| §5.1 Hero enable | Task 3 |
| §5.2 Preview + component | Tasks 1–2 |
| §5.3 Trigger | Task 3 |
| §5.4 Write & language (segments) | Task 3 |
| §5.5 Blocklist + badge | Task 3 |
| §5.6 Advanced timing collapsed | Task 3 |
| §5.7 How it works bullets | Task 3 |
| §6 Pure helpers | Task 1 |
| §9 Tests | Tasks 1, 3, 4 |
| No schema changes | Global constraint |

## Self-review notes

- No TBD placeholders in tasks.  
- `buildPreviewProjection` signatures consistent across Tasks 1–3.  
- Dual mode store key remains boolean `dualMode`; UI maps to/from segment strings.  
- SegmentedControl `id` stays `inline-translate-dual-mode` for test stability.
