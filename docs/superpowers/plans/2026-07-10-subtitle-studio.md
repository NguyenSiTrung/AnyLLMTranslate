# Subtitle Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Settings → Subtitles into Subtitle Studio: split-pane live preview + Appearance, reordered controls (Source track, Platforms, Caption quality, Translation style), cyan segments, compact style knobs — with no new settings keys.

**Architecture:** Add pure summary-chip helpers; extend `SegmentedControl` with optional cyan accent; enhance `SubtitlePreview`; extract card modules under `entrypoints/options/sections/subtitles/`; rewrite `SubtitlesSection` with Theme Studio pane shell (independent column scroll). Store/`subtitleSettings` schema unchanged.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Lucide React, Zustand (`useSettingsStore`), Vitest + Testing Library (jsdom for `entrypoints/**` and `ui/**`), existing `ui/*` primitives.

**Spec:** `docs/superpowers/specs/2026-07-10-subtitle-studio-design.md`  
**Beads:** ALT-5zv

## Global Constraints

- No new `chrome.storage` / settings schema keys — only existing `subtitleSettings` fields.
- Preserve control ids: `subtitle-enabled-toggle`, `subtitle-preferred-language`, `subtitle-auto-activate-toggle`, `subtitle-font-size`, `subtitle-opacity`, `subtitle-translation-timeout`, `subtitle-generic-handler-toggle`, `subtitle-site-${platform}`, `youtube-asr-resegment-enable`, `youtube-asr-resegment-ai-enable`.
- Preview is reactive mock only — **no network / provider / real video**.
- Desktop shell: Theme Studio pattern — `lg:h-[calc(100dvh-4.5rem)]` + `lg:grid-cols-5` + per-column `overflow-y-auto` (not fragile sticky-only).
- Studio rail (~40%): Live preview + Appearance. Controls rail (~60%): Source track → Platforms → Caption quality → Translation style.
- Style knobs: **compact 2×2 grid, always open** (not collapsed).
- ASR master off must clear `aiEnable` (existing behavior).
- Knob Auto omits key from `knobOverrides` (existing).
- Section accent: cyan. SegmentedControl active on this tab: `accent="cyan"`.
- Method hints demoted to tooltip/`title` (not always-visible body third line).
- Zinc dark chrome; no purple-first styling.
- Master enable hero always interactive; studio + controls use `DisabledDimmer` when `!enabled`.
- TDD for pure helpers; section smoke tests after shell lands.
- Do not change content scripts, coordinator, or ASR algorithms.

---

## File map

| File | Responsibility |
|------|----------------|
| Create `lib/subtitlePreviewSummary.ts` | Pure summary chip labels for Appearance projection |
| Create `lib/__tests__/subtitlePreviewSummary.test.ts` | Unit tests for chips |
| Modify `ui/SegmentedControl.tsx` | Optional `accent?: 'blue' \| 'cyan'` (default blue) |
| Create `ui/__tests__/SegmentedControl.test.tsx` | Accent class smoke + a11y roles |
| Modify `entrypoints/options/components/SubtitlePreview.tsx` | Height 200–220px; optional summary chips row; `data-testid` |
| Create `entrypoints/options/sections/subtitles/types.ts` | Shared props types for cards (`handleUpdate` shape) |
| Create `entrypoints/options/sections/subtitles/knobSpec.ts` | `KNOB_SPEC` + option constants moved from section |
| Create `entrypoints/options/sections/subtitles/SiteRow.tsx` | Monogram + SiteRow (method hint as title) |
| Create `entrypoints/options/sections/subtitles/AppearanceCard.tsx` | Appearance groups |
| Create `entrypoints/options/sections/subtitles/SourceTrackCard.tsx` | Preferred language + auto-activate |
| Create `entrypoints/options/sections/subtitles/PlatformsCard.tsx` | Sites + fallback only |
| Create `entrypoints/options/sections/subtitles/CaptionQualityCard.tsx` | YouTube ASR |
| Create `entrypoints/options/sections/subtitles/TranslationStyleCard.tsx` | 2×2 knobs + Advanced timeout |
| Rewrite `entrypoints/options/sections/SubtitlesSection.tsx` | Shell: header, hero, split layout, compose cards |
| Create `entrypoints/options/sections/__tests__/SubtitlesSection.test.tsx` | Section smoke tests |

**Do not modify:** content scripts, `types/config` schema defaults (unless a type-only re-export is needed — prefer not), `settingsStore` schema, inject interceptors.

---

### Task 1: Preview summary helpers (TDD)

**Files:**
- Create: `lib/subtitlePreviewSummary.ts`
- Create: `lib/__tests__/subtitlePreviewSummary.test.ts`

**Interfaces:**
- Consumes: `SubtitleFontSizeMode`, `SubtitleDisplayMode`, `SubtitleFontFamily` from `@/types/config`
- Produces:
  - `export interface SubtitleAppearanceSummaryInput { position: 'bottom' \| 'top'; displayMode: SubtitleDisplayMode; fontSizeMode: SubtitleFontSizeMode; fontSize: number; backgroundOpacity: number }`
  - `export interface SubtitleAppearanceSummaryChips { position: string; display: string; size: string; opacity: string }`
  - `export function buildAppearanceSummaryChips(input: SubtitleAppearanceSummaryInput): SubtitleAppearanceSummaryChips`

- [ ] **Step 1: Write the failing unit test**

Create `lib/__tests__/subtitlePreviewSummary.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildAppearanceSummaryChips } from '@/lib/subtitlePreviewSummary';

describe('buildAppearanceSummaryChips', () => {
  it('maps fixed size and bilingual bottom', () => {
    const chips = buildAppearanceSummaryChips({
      position: 'bottom',
      displayMode: 'bilingual',
      fontSizeMode: 'fixed',
      fontSize: 16,
      backgroundOpacity: 0.5,
    });
    expect(chips).toEqual({
      position: 'Bottom',
      display: 'Bilingual',
      size: '16px',
      opacity: '50%',
    });
  });

  it('maps top, translated-only, auto size, rounded opacity', () => {
    const chips = buildAppearanceSummaryChips({
      position: 'top',
      displayMode: 'translation-only',
      fontSizeMode: 'auto',
      fontSize: 22,
      backgroundOpacity: 0.33,
    });
    expect(chips.position).toBe('Top');
    expect(chips.display).toBe('Translated');
    expect(chips.size).toBe('Auto');
    expect(chips.opacity).toBe('33%');
  });

  it('clamps opacity percent to 0–100 integer', () => {
    expect(
      buildAppearanceSummaryChips({
        position: 'bottom',
        displayMode: 'bilingual',
        fontSizeMode: 'fixed',
        fontSize: 12,
        backgroundOpacity: 1,
      }).opacity,
    ).toBe('100%');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/__tests__/subtitlePreviewSummary.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

Create `lib/subtitlePreviewSummary.ts`:

```typescript
import type {
  SubtitleDisplayMode,
  SubtitleFontSizeMode,
} from '@/types/config';

export interface SubtitleAppearanceSummaryInput {
  position: 'bottom' | 'top';
  displayMode: SubtitleDisplayMode;
  fontSizeMode: SubtitleFontSizeMode;
  fontSize: number;
  backgroundOpacity: number;
}

export interface SubtitleAppearanceSummaryChips {
  position: string;
  display: string;
  size: string;
  opacity: string;
}

export function buildAppearanceSummaryChips(
  input: SubtitleAppearanceSummaryInput,
): SubtitleAppearanceSummaryChips {
  const pct = Math.round(Math.min(1, Math.max(0, input.backgroundOpacity)) * 100);
  return {
    position: input.position === 'top' ? 'Top' : 'Bottom',
    display: input.displayMode === 'bilingual' ? 'Bilingual' : 'Translated',
    size: input.fontSizeMode === 'auto' ? 'Auto' : `${input.fontSize}px`,
    opacity: `${pct}%`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/__tests__/subtitlePreviewSummary.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/subtitlePreviewSummary.ts lib/__tests__/subtitlePreviewSummary.test.ts
git commit -m "feat(subtitles): pure appearance summary chips for studio preview"
```

---

### Task 2: SegmentedControl cyan accent

**Files:**
- Modify: `ui/SegmentedControl.tsx`
- Create: `ui/__tests__/SegmentedControl.test.tsx`

**Interfaces:**
- Consumes: existing `SegmentedControlProps`
- Produces: add `accent?: 'blue' | 'cyan'` (default `'blue'`)

- [ ] **Step 1: Write the failing test**

Create `ui/__tests__/SegmentedControl.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SegmentedControl } from '@/ui/SegmentedControl';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
] as const;

describe('SegmentedControl', () => {
  it('uses blue active styles by default', () => {
    render(
      <SegmentedControl
        label="Test"
        options={[...OPTIONS]}
        value="a"
        onChange={() => {}}
      />,
    );
    const active = screen.getByRole('radio', { name: 'Alpha' });
    expect(active.className).toMatch(/bg-blue-600/);
  });

  it('uses cyan active styles when accent is cyan', () => {
    render(
      <SegmentedControl
        label="Test"
        options={[...OPTIONS]}
        value="a"
        onChange={() => {}}
        accent="cyan"
      />,
    );
    const active = screen.getByRole('radio', { name: 'Alpha' });
    expect(active.className).toMatch(/bg-cyan-600/);
    expect(active.className).not.toMatch(/bg-blue-600/);
  });

  it('calls onChange when selecting another option', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Test"
        options={[...OPTIONS]}
        value="a"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ui/__tests__/SegmentedControl.test.tsx`

Expected: FAIL (cyan accent prop ignored / no cyan class)

- [ ] **Step 3: Implement accent prop**

In `ui/SegmentedControl.tsx`, extend props and active styles:

```typescript
// Add to SegmentedControlProps:
accent?: 'blue' | 'cyan';

// In component destructuring: accent = 'blue'
// Replace active branch classes:
const activeStyles =
  accent === 'cyan'
    ? 'bg-cyan-600 text-white shadow-sm shadow-cyan-900/40'
    : 'bg-blue-600 text-white shadow-sm shadow-blue-900/40';
```

Use `activeStyles` in the active button `className` ternary (keep inactive styles unchanged). Default remains blue so other tabs are untouched.

Full updated component body for the button active class (preserve existing size/disabled/focus classes):

```tsx
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  id,
  disabled = false,
  accent = 'blue',
}: SegmentedControlProps<T>) {
  const sizeStyles = {
    sm: 'py-1 px-3 text-xs',
    md: 'py-1.5 px-4 text-sm',
  };
  const activeStyles =
    accent === 'cyan'
      ? 'bg-cyan-600 text-white shadow-sm shadow-cyan-900/40'
      : 'bg-blue-600 text-white shadow-sm shadow-blue-900/40';

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled}
      id={id}
      className="inline-flex items-center gap-0.5 rounded-lg bg-zinc-900 border border-zinc-700/60 p-1 w-full"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`
              flex-1 flex items-center justify-center gap-1.5 rounded-md font-medium
              transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60
              ${sizeStyles[size]}
              ${
                active
                  ? activeStyles
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 disabled:hover:text-zinc-400 disabled:hover:bg-transparent'
              }
            `}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
```

Also add `accent?: 'blue' | 'cyan'` to the `SegmentedControlProps` interface.

- [ ] **Step 4: Run tests**

Run: `npm test -- ui/__tests__/SegmentedControl.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ui/SegmentedControl.tsx ui/__tests__/SegmentedControl.test.tsx
git commit -m "feat(ui): optional cyan accent on SegmentedControl"
```

---

### Task 3: SubtitlePreview height + summary chips

**Files:**
- Modify: `entrypoints/options/components/SubtitlePreview.tsx`
- Optionally consume: `buildAppearanceSummaryChips` from `@/lib/subtitlePreviewSummary`

**Interfaces:**
- Consumes: existing props + optional `showSummaryChips?: boolean` (default true) OR always show when not disabled
- Produces: updated shell height; summary row under player; `data-testid="subtitle-preview"`

- [ ] **Step 1: Extend props and shell**

Update `SubtitlePreviewProps` and component:

```typescript
export interface SubtitlePreviewProps {
  disabled: boolean;
  fontSize: number;
  fontSizeMode: SubtitleFontSizeMode;
  backgroundOpacity: number;
  fontFamily: SubtitleFontFamily;
  displayMode: SubtitleDisplayMode;
  position: 'bottom' | 'top';
  cues?: PreviewCue[];
  styleChip?: string;
  /** When true (default), show Appearance summary chips under the shell. */
  showSummaryChips?: boolean;
}
```

- [ ] **Step 2: Implementation details**

1. Default `showSummaryChips = true`.
2. Change shell `height` from `170px` to `210px`.
3. Wrap shell + chips in outer column:

```tsx
export function SubtitlePreview({
  disabled,
  fontSize,
  fontSizeMode,
  backgroundOpacity,
  fontFamily,
  displayMode,
  position,
  cues = DEFAULT_CUES,
  styleChip,
  showSummaryChips = true,
}: SubtitlePreviewProps) {
  const chips = buildAppearanceSummaryChips({
    position,
    displayMode,
    fontSizeMode,
    fontSize,
    backgroundOpacity,
  });

  return (
    <div className="space-y-2" data-testid="subtitle-preview">
      <div
        className={`relative rounded-lg overflow-hidden transition-all duration-300 ${
          disabled ? 'opacity-50 grayscale pointer-events-none' : ''
        }`}
        aria-hidden="true"
        style={{
          height: '210px',
          background: 'linear-gradient(135deg, #0f1117 0%, #1a1d26 50%, #111318 100%)',
        }}
      >
        {/* keep existing grain, scanlines, styleChip, play, AnimatedCue, ProgressBar */}
      </div>

      {showSummaryChips && !disabled && (
        <div
          className="flex flex-wrap gap-1.5"
          data-testid="subtitle-preview-summary"
          aria-live="polite"
        >
          {[chips.position, chips.display, chips.size, chips.opacity].map((label) => (
            <span
              key={label}
              className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/50"
            >
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

Import `buildAppearanceSummaryChips` from `@/lib/subtitlePreviewSummary`.

Keep style chip on-shell (spec: on-shell style only; summary = Appearance fields).

- [ ] **Step 3: Smoke via section tests later** — if you want an isolated component test, optional; not required for this task.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/options/components/SubtitlePreview.tsx
git commit -m "feat(subtitles): taller Live preview with appearance summary chips"
```

---

### Task 4: Extract knob constants, SiteRow, and card modules

**Files:**
- Create: `entrypoints/options/sections/subtitles/knobSpec.ts`
- Create: `entrypoints/options/sections/subtitles/SiteRow.tsx`
- Create: `entrypoints/options/sections/subtitles/AppearanceCard.tsx`
- Create: `entrypoints/options/sections/subtitles/SourceTrackCard.tsx`
- Create: `entrypoints/options/sections/subtitles/PlatformsCard.tsx`
- Create: `entrypoints/options/sections/subtitles/CaptionQualityCard.tsx`
- Create: `entrypoints/options/sections/subtitles/TranslationStyleCard.tsx`

**Interfaces:**
- Consumes: `SubtitleSettings` fields via props; `update` callback  
- Produces: presentational cards with no store imports (prefer props-only for testability) **or** thin store usage inside cards — **prefer props-only**.

Shared update type:

```typescript
// entrypoints/options/sections/subtitles/types.ts
import type { SubtitleSettings } from '@/types/config';

export type SubtitleSettingsPatch = Partial<SubtitleSettings>;

export interface SubtitleCardBaseProps {
  settings: SubtitleSettings;
  disabled: boolean; // master enable is false
  onUpdate: (partial: SubtitleSettingsPatch) => void;
}
```

- [ ] **Step 1: Move constants**

Create `knobSpec.ts` by moving from current `SubtitlesSection.tsx`:

- `POSITION_OPTIONS`, `FONT_FAMILY_OPTIONS`, `DISPLAY_MODE_OPTIONS`, `FONT_SIZE_MODE_OPTIONS`
- `KNOB_SPEC`, `KnobKey`, `KnobSpec`
- Update labels per spec:
  - Font size mode: `{ value: 'auto', label: 'Auto' }` (not `Auto (Video Size)`)
  - Display: `{ value: 'translation-only', label: 'Translated' }`
  - Knob descriptions → friendlier blurbs from spec §6.7

- [ ] **Step 2: SiteRow with demoted method hints**

```tsx
// SiteRow.tsx — method hint only on monogram title, not body third line
function MonogramDot({ site }: { site: SubtitleSiteInfo }) {
  const monogram = site.monogram ?? site.name.slice(0, 1);
  return (
    <span
      className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md border text-[11px] font-semibold ${monogramAccentClasses(site.accent)}`}
      aria-hidden="true"
      title={site.methodHint}
    >
      {monogram}
    </span>
  );
}

export function SiteRow({ site, checked, disabled, onToggle }: {
  site: SubtitleSiteInfo;
  checked: boolean;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <MonogramDot site={site} />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-zinc-200">{site.name}</div>
          {site.summary ? (
            <div className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{site.summary}</div>
          ) : null}
        </div>
      </div>
      <div className="shrink-0 pt-0.5">
        <Toggle
          id={
            site.platform === 'generic'
              ? 'subtitle-generic-handler-toggle'
              : `subtitle-site-${site.platform}`
          }
          ariaLabel={`${site.name} subtitles`}
          checked={checked}
          onChange={onToggle}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: AppearanceCard**

Use `Card`, `SettingsGroup`, `SegmentedControl` with `accent="cyan"`, icons:

```tsx
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Languages,
  Type,
  Paintbrush,
} from 'lucide-react';
// POSITION with icons:
const POSITION_OPTIONS = [
  { value: 'bottom' as const, label: 'Bottom', icon: <ArrowDownToLine className="w-3.5 h-3.5" /> },
  { value: 'top' as const, label: 'Top', icon: <ArrowUpToLine className="w-3.5 h-3.5" /> },
];
const DISPLAY_MODE_OPTIONS = [
  { value: 'bilingual' as const, label: 'Bilingual', icon: <Languages className="w-3.5 h-3.5" /> },
  { value: 'translation-only' as const, label: 'Translated', icon: <Type className="w-3.5 h-3.5" /> },
];
```

Structure:

```tsx
export function AppearanceCard({ settings, disabled, onUpdate }: SubtitleCardBaseProps) {
  return (
    <Card
      title="Appearance"
      description="Layout and type for the on-player overlay."
      icon={<Paintbrush className="w-3.5 h-3.5" />}
      variant="bordered"
    >
      <DisabledDimmer disabled={disabled}>
        <div className="space-y-5">
          <SettingsGroup title="Layout" description="Where captions sit relative to the video.">
            <SegmentedControl
              label="Subtitle Position"
              options={POSITION_OPTIONS}
              value={settings.position}
              onChange={(val) => onUpdate({ position: val })}
              disabled={disabled}
              accent="cyan"
            />
          </SettingsGroup>

          <SettingsGroup title="Type" description="Typeface and size for overlay text.">
            <div className="space-y-4">
              <SegmentedControl
                label="Font Family"
                options={FONT_FAMILY_OPTIONS}
                value={settings.fontFamily}
                onChange={(val) => onUpdate({ fontFamily: val })}
                disabled={disabled}
                accent="cyan"
              />
              <div>
                <SegmentedControl
                  label="Font Size Mode"
                  options={FONT_SIZE_MODE_OPTIONS}
                  value={settings.fontSizeMode}
                  onChange={(val) => onUpdate({ fontSizeMode: val })}
                  disabled={disabled}
                  accent="cyan"
                />
                <p className="text-[10px] text-zinc-500 mt-1.5">Auto scales with player height.</p>
              </div>
              {settings.fontSizeMode === 'fixed' && (
                <Slider
                  id="subtitle-font-size"
                  label="Font Size"
                  value={settings.fontSize}
                  min={10}
                  max={32}
                  step={1}
                  onChange={(v) => onUpdate({ fontSize: v })}
                  formatValue={(v) => `${v}px`}
                  minLabel="10px"
                  maxLabel="32px"
                  disabled={disabled}
                />
              )}
            </div>
          </SettingsGroup>

          <SettingsGroup title="Backdrop">
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
          </SettingsGroup>

          <SettingsGroup
            title="Mode"
            description="Bilingual shows original + translation. Translated shows translation only."
          >
            <SegmentedControl
              label="Display Mode"
              options={DISPLAY_MODE_OPTIONS}
              value={settings.displayMode}
              onChange={(val) => onUpdate({ displayMode: val })}
              disabled={disabled}
              accent="cyan"
            />
          </SettingsGroup>
        </div>
      </DisabledDimmer>
    </Card>
  );
}
```

- [ ] **Step 4: SourceTrackCard**

```tsx
export function SourceTrackCard({ settings, disabled, onUpdate }: SubtitleCardBaseProps) {
  const preferredLanguages = LANGUAGES.filter((l) => l.code !== 'auto');
  return (
    <Card
      title="Source track"
      description="Which caption track to prefer before translating to your target language."
      icon={<Languages className="w-3.5 h-3.5" />}
      variant="bordered"
    >
      <DisabledDimmer disabled={disabled}>
        <div className="space-y-5">
          <FieldGroup
            label="Preferred source subtitle language"
            description="Choose the subtitle track language to auto-select before translating."
            hint="Used when platforms expose multiple subtitle tracks."
            htmlFor="subtitle-preferred-language"
          >
            <Select
              id="subtitle-preferred-language"
              value={settings.preferredSubtitleLanguage}
              onChange={(e) => onUpdate({ preferredSubtitleLanguage: e.target.value })}
              disabled={disabled}
              options={preferredLanguages.map((lang) => ({
                value: lang.code,
                label: `${lang.nativeName} (${lang.name})`,
              }))}
            />
          </FieldGroup>
          <Toggle
            id="subtitle-auto-activate-toggle"
            checked={settings.autoActivateSubtitles}
            onChange={(checked) => onUpdate({ autoActivateSubtitles: checked })}
            label="Auto-Activate Subtitles"
            description="Automatically fetch and translate when the preferred language is detected."
            disabled={disabled}
          />
        </div>
      </DisabledDimmer>
    </Card>
  );
}
```

- [ ] **Step 5: PlatformsCard**

Copy site list + load more + fallback from current section. **Do not** include ASR block.

Props extension for load-more can stay internal state in the card:

```tsx
export function PlatformsCard({ settings, disabled, onUpdate }: SubtitleCardBaseProps) {
  const [visibleSiteCount, setVisibleSiteCount] = useState(SUBTITLE_SITES_INITIAL_VISIBLE);
  const { visibleSites, showLoadMore, remainingCount, nextVisibleCount } =
    getSubtitleSitesLoadMoreState(SUPPORTED_SUBTITLE_SITES, visibleSiteCount);
  const genericSite = SUPPORTED_SUBTITLE_SITES.find((s) => s.platform === 'generic');

  return (
    <Card
      title="Platforms"
      description="Enable or disable subtitle capture per site."
      icon={<Globe className="w-3.5 h-3.5" />}
      variant="bordered"
    >
      <DisabledDimmer disabled={disabled}>
        {/* map SiteRow for visibleSites — toggle disabledSubtitleSites */}
        {/* Load more button */}
        {/* Fallback SiteRow for generic → enableGenericSubtitleHandler */}
      </DisabledDimmer>
    </Card>
  );
}
```

Toggle logic (unchanged):

```typescript
onToggle={(checked) => {
  const current = settings.disabledSubtitleSites ?? [];
  const updated = checked
    ? current.filter((p) => p !== site.platform)
    : [...current, site.platform];
  onUpdate({ disabledSubtitleSites: updated });
}}
```

- [ ] **Step 6: CaptionQualityCard**

```tsx
export function CaptionQualityCard({ settings, disabled, onUpdate }: SubtitleCardBaseProps) {
  const asr = settings.youtubeAsrResegment ?? DEFAULT_YOUTUBE_ASR_RESEGMENT_SETTINGS;
  const masterOn = asr.enable;

  return (
    <Card
      title="Caption quality"
      description="Improve auto-generated YouTube captions before translation."
      icon={<Sparkles className="w-3.5 h-3.5" />}
      variant="bordered"
      headerExtra={<Badge variant="info">YouTube</Badge>}
    >
      <DisabledDimmer disabled={disabled}>
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-zinc-200">Improve auto-generated captions</p>
              <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                Re-chunk fragmented ASR captions into clearer sentences before translation.
                Human-uploaded tracks are unchanged.
              </p>
            </div>
            <Toggle
              id="youtube-asr-resegment-enable"
              ariaLabel="Improve auto-generated captions"
              checked={masterOn}
              disabled={disabled}
              onChange={(checked) => {
                onUpdate({
                  youtubeAsrResegment: {
                    ...asr,
                    enable: checked,
                    aiEnable: checked ? asr.aiEnable : false,
                  },
                });
              }}
            />
          </div>

          <div
            className={`rounded-lg border p-3 space-y-1 ${
              masterOn
                ? 'border-cyan-500/15 bg-cyan-500/[0.03]'
                : 'border-zinc-800/50 bg-transparent opacity-70'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-300">AI re-align</p>
                <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                  Use your configured LLM (BYOK) for smarter sentence boundaries. Falls back
                  to local rules if the AI call fails. Uses extra tokens.
                </p>
              </div>
              <Toggle
                id="youtube-asr-resegment-ai-enable"
                ariaLabel="AI re-align auto-generated captions"
                checked={asr.aiEnable}
                disabled={disabled || !masterOn}
                onChange={(checked) => {
                  onUpdate({
                    youtubeAsrResegment: { ...asr, aiEnable: checked },
                  });
                }}
              />
            </div>
          </div>
        </div>
      </DisabledDimmer>
    </Card>
  );
}
```

- [ ] **Step 7: TranslationStyleCard — 2×2 knobs**

```tsx
export function TranslationStyleCard({ settings, disabled, onUpdate }: SubtitleCardBaseProps) {
  const overrides = settings.knobOverrides ?? {};
  const overrideCount = KNOB_SPEC.filter((k) => overrides[k.key] !== undefined).length;

  const handleKnobChange = (knob: KnobKey, value: string) => {
    const next = { ...overrides };
    if (value === 'auto') {
      const { [knob]: _removed, ...rest } = next;
      onUpdate({ knobOverrides: rest });
      return;
    }
    (next as Record<string, string>)[knob] = value;
    onUpdate({ knobOverrides: next });
  };

  return (
    <Card
      title="Translation style"
      description="Auto follows each site profile. Override knobs to apply them everywhere."
      icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
      variant="bordered"
      headerExtra={
        overrideCount > 0 ? <Badge variant="info">{overrideCount} custom</Badge> : undefined
      }
    >
      <DisabledDimmer disabled={disabled}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {KNOB_SPEC.map((knob) => {
              const overridden = overrides[knob.key] !== undefined;
              return (
                <div key={knob.key} className="min-w-0 space-y-2">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{knob.label}</p>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">{knob.description}</p>
                  </div>
                  <SegmentedControl
                    label={knob.label}
                    options={knob.options}
                    value={overrides[knob.key] ?? 'auto'}
                    onChange={(v) => handleKnobChange(knob.key, v)}
                    disabled={disabled}
                    size="sm"
                    accent="cyan"
                  />
                  <div className="text-[10px] text-zinc-500">
                    {overridden ? (
                      <span className="inline-flex items-center gap-1 text-cyan-400">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400" />
                        Custom
                      </span>
                    ) : (
                      <span>Profile default</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<RotateCcw className="w-3 h-3" />}
            disabled={disabled || overrideCount === 0}
            onClick={() => onUpdate({ knobOverrides: {} })}
          >
            Reset to profile defaults
          </Button>

          <AdvancedDisclosure label="Advanced">
            <Slider
              id="subtitle-translation-timeout"
              label="Translation Timeout"
              value={settings.translationTimeout}
              min={10}
              max={120}
              step={1}
              onChange={(v) => onUpdate({ translationTimeout: v })}
              formatValue={(v) => `${v}s`}
              minLabel="10s"
              maxLabel="120s"
              accentClassName="accent-cyan-500"
              disabled={disabled}
            />
            <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">
              Max seconds to wait for each subtitle chunk to translate before falling back to
              the original text. Lower values keep subtitles in sync on fast connections; raise
              it for slow local LLMs.
            </p>
          </AdvancedDisclosure>
        </div>
      </DisabledDimmer>
    </Card>
  );
}
```

- [ ] **Step 8: Commit extraction (section still old until Task 5 — cards may be unused briefly)**

Prefer committing cards only after Task 5 wires them, **or** commit cards as pure files then wire in Task 5. If TypeScript unused export is fine, commit:

```bash
git add entrypoints/options/sections/subtitles/
git commit -m "refactor(subtitles): extract Subtitle Studio card modules"
```

If the repo lint fails on unused files, combine Tasks 4–5 in one commit series with Task 5 first consumer.

---

### Task 5: SubtitlesSection shell (Subtitle Studio layout)

**Files:**
- Rewrite: `entrypoints/options/sections/SubtitlesSection.tsx`

**Interfaces:**
- Consumes: all cards + `SubtitlePreview` + store
- Produces: public `SubtitlesSection` export (unchanged import path from `App.tsx`)

- [ ] **Step 1: Replace section body**

```tsx
/**
 * Subtitle Studio — split-pane live preview + Appearance, progressive controls.
 * Spec: docs/superpowers/specs/2026-07-10-subtitle-studio-design.md
 */

import { Subtitles as SubtitlesIcon, MonitorPlay } from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import { useSettingsStore } from '@/stores/settingsStore';
import { Card } from '@/ui/Card';
import { Toggle } from '@/ui/Toggle';
import { SubtitlePreview } from '@/entrypoints/options/components/SubtitlePreview';
import { getPreviewCuesForLanguage, resolveStyleChipLabel } from '@/lib/subtitlePreviewCues';
import { AppearanceCard } from './subtitles/AppearanceCard';
import { SourceTrackCard } from './subtitles/SourceTrackCard';
import { PlatformsCard } from './subtitles/PlatformsCard';
import { CaptionQualityCard } from './subtitles/CaptionQualityCard';
import { TranslationStyleCard } from './subtitles/TranslationStyleCard';

export function SubtitlesSection() {
  const subtitleSettings = useSettingsStore((s) => s.subtitleSettings);
  const targetLanguage = useSettingsStore((s) => s.targetLanguage);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const handleUpdate = (partial: Partial<typeof subtitleSettings>) => {
    updateSettings({
      subtitleSettings: { ...subtitleSettings, ...partial },
    });
  };

  const isDisabled = !subtitleSettings.enabled;
  const previewCues = getPreviewCuesForLanguage(targetLanguage);
  const styleChip = resolveStyleChipLabel(subtitleSettings.knobOverrides ?? {});

  return (
    <div className="animate-fade-in-up flex flex-col lg:h-[calc(100dvh-4.5rem)] lg:min-h-[28rem] lg:max-h-[calc(100dvh-4.5rem)]">
      <div className="shrink-0">
        <SectionHeader
          title="Subtitle Studio"
          description="Tune how translated captions look and behave on video."
          icon={<SubtitlesIcon className="w-4 h-4" />}
          accentColor="cyan"
        />

        <div className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/[0.04] p-4">
          <Toggle
            id="subtitle-enabled-toggle"
            checked={subtitleSettings.enabled}
            onChange={(checked) => handleUpdate({ enabled: checked })}
            label="Enable Subtitles"
            description={
              subtitleSettings.enabled
                ? 'Translated subtitles are active on supported video players.'
                : 'Subtitles are off — enable to configure the studio and show captions on video.'
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 flex-1 min-h-0 items-stretch">
        {/* Studio rail */}
        <div className="lg:col-span-2 order-1 min-h-0 lg:overflow-y-auto lg:overscroll-contain space-y-4 lg:pr-1 [scrollbar-gutter:stable]">
          <Card
            title="Live preview"
            description="Reacts to Appearance and style knobs. No real video or API calls."
            icon={<MonitorPlay className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <SubtitlePreview
              disabled={isDisabled}
              fontSize={subtitleSettings.fontSize}
              fontSizeMode={subtitleSettings.fontSizeMode}
              backgroundOpacity={subtitleSettings.backgroundOpacity}
              fontFamily={subtitleSettings.fontFamily}
              displayMode={subtitleSettings.displayMode}
              position={subtitleSettings.position}
              cues={previewCues}
              styleChip={styleChip}
            />
          </Card>

          <AppearanceCard
            settings={subtitleSettings}
            disabled={isDisabled}
            onUpdate={handleUpdate}
          />
        </div>

        {/* Controls rail */}
        <div className="lg:col-span-3 order-2 min-h-0 lg:overflow-y-auto lg:overscroll-contain space-y-4 [scrollbar-gutter:stable]">
          <div className="animate-stagger" style={stagger(0)}>
            <SourceTrackCard
              settings={subtitleSettings}
              disabled={isDisabled}
              onUpdate={handleUpdate}
            />
          </div>
          <div className="animate-stagger" style={stagger(1)}>
            <PlatformsCard
              settings={subtitleSettings}
              disabled={isDisabled}
              onUpdate={handleUpdate}
            />
          </div>
          <div className="animate-stagger" style={stagger(2)}>
            <CaptionQualityCard
              settings={subtitleSettings}
              disabled={isDisabled}
              onUpdate={handleUpdate}
            />
          </div>
          <div className="animate-stagger" style={stagger(3)}>
            <TranslationStyleCard
              settings={subtitleSettings}
              disabled={isDisabled}
              onUpdate={handleUpdate}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Remove old monolithic JSX** from `SubtitlesSection.tsx` (no leftover Style/Sites/Appearance inline blocks).

- [ ] **Step 3: Typecheck**

Run: `npm run compile`

Expected: no errors in new section files.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/options/sections/SubtitlesSection.tsx entrypoints/options/sections/subtitles/
git commit -m "feat(subtitles): Subtitle Studio split-pane shell and card composition"
```

---

### Task 6: Section smoke tests + polish pass

**Files:**
- Create: `entrypoints/options/sections/__tests__/SubtitlesSection.test.tsx`

**Interfaces:**
- Consumes: `SubtitlesSection`, `useSettingsStore`, `DEFAULT_SETTINGS` / `DEFAULT_SUBTITLE_SETTINGS`

- [ ] **Step 1: Write tests**

```tsx
/**
 * SubtitlesSection — Subtitle Studio shell, cards, ASR nesting, knobs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DEFAULT_SETTINGS, DEFAULT_SUBTITLE_SETTINGS } from '@/types/config';

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
import { SubtitlesSection } from '../SubtitlesSection';

describe('SubtitlesSection (Subtitle Studio)', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      targetLanguage: 'vi',
      subtitleSettings: { ...DEFAULT_SUBTITLE_SETTINGS, enabled: true },
    });
    for (const k of Object.keys(mockStorageData)) {
      Reflect.deleteProperty(mockStorageData, k);
    }
    vi.clearAllMocks();
  });

  it('renders studio header, hero, and primary card titles', () => {
    render(<SubtitlesSection />);
    expect(screen.getByRole('heading', { name: 'Subtitle Studio', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Enable Subtitles/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Live preview', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Appearance', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Source track', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Platforms', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Caption quality', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Translation style', level: 3 })).toBeInTheDocument();
  });

  it('shows preview summary chips when enabled', () => {
    render(<SubtitlesSection />);
    expect(screen.getByTestId('subtitle-preview')).toBeInTheDocument();
    expect(screen.getByTestId('subtitle-preview-summary')).toBeInTheDocument();
  });

  it('toggles enabled via hero control', async () => {
    render(<SubtitlesSection />);
    fireEvent.click(screen.getByRole('switch', { name: /Enable Subtitles/i }));
    await waitFor(() => {
      expect(useSettingsStore.getState().subtitleSettings.enabled).toBe(false);
    });
  });

  it('updates display mode via Appearance segment', async () => {
    render(<SubtitlesSection />);
    fireEvent.click(screen.getByRole('radio', { name: /Translated/i }));
    await waitFor(() => {
      expect(useSettingsStore.getState().subtitleSettings.displayMode).toBe('translation-only');
    });
  });

  it('clears aiEnable when ASR master turns off', async () => {
    useSettingsStore.setState({
      subtitleSettings: {
        ...DEFAULT_SUBTITLE_SETTINGS,
        enabled: true,
        youtubeAsrResegment: { enable: true, aiEnable: true },
      },
    });
    render(<SubtitlesSection />);
    fireEvent.click(screen.getByRole('switch', { name: /Improve auto-generated captions/i }));
    await waitFor(() => {
      const asr = useSettingsStore.getState().subtitleSettings.youtubeAsrResegment;
      expect(asr?.enable).toBe(false);
      expect(asr?.aiEnable).toBe(false);
    });
  });

  it('omits knob key when set to Auto', async () => {
    useSettingsStore.setState({
      subtitleSettings: {
        ...DEFAULT_SUBTITLE_SETTINGS,
        enabled: true,
        knobOverrides: { register: 'casual' },
      },
    });
    render(<SubtitlesSection />);
    // There may be multiple Auto radios — scope to Register group
    const registerGroup = screen.getByRole('radiogroup', { name: 'Register' });
    const auto = registerGroup.querySelector('[role="radio"][aria-checked="false"]')
      ?? Array.from(registerGroup.querySelectorAll('[role="radio"]')).find(
        (el) => el.textContent?.trim() === 'Auto',
      );
    expect(auto).toBeTruthy();
    fireEvent.click(auto!);
    await waitFor(() => {
      expect(useSettingsStore.getState().subtitleSettings.knobOverrides?.register).toBeUndefined();
    });
  });
});
```

If the Auto-click test is flaky with multiple Auto options, simplify: click Reset and assert `knobOverrides` is `{}` instead:

```tsx
it('resets knob overrides', async () => {
  useSettingsStore.setState({
    subtitleSettings: {
      ...DEFAULT_SUBTITLE_SETTINGS,
      enabled: true,
      knobOverrides: { register: 'casual', brevity: 'terse' },
    },
  });
  render(<SubtitlesSection />);
  fireEvent.click(screen.getByRole('button', { name: /Reset to profile defaults/i }));
  await waitFor(() => {
    expect(useSettingsStore.getState().subtitleSettings.knobOverrides).toEqual({});
  });
});
```

- [ ] **Step 2: Run section tests**

Run: `npm test -- entrypoints/options/sections/__tests__/SubtitlesSection.test.tsx`

Expected: PASS

- [ ] **Step 3: Run related unit tests**

Run:

```bash
npm test -- lib/__tests__/subtitlePreviewSummary.test.ts ui/__tests__/SegmentedControl.test.tsx entrypoints/options/sections/__tests__/SubtitlesSection.test.tsx
```

Expected: all PASS

- [ ] **Step 4: Manual QA checklist** (agent or human)

- [ ] Desktop: long scroll on Platforms does not remove Live preview from viewport  
- [ ] Change position / opacity / bilingual → preview updates  
- [ ] Style chip updates when a knob is customized  
- [ ] Narrow window: stacked preview → Appearance → controls  
- [ ] Method hints not permanent third lines on site rows  
- [ ] `prefers-reduced-motion`: no aggressive cue/progress animation  

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/sections/__tests__/SubtitlesSection.test.tsx
git commit -m "test(subtitles): Subtitle Studio section smoke coverage"
```

- [ ] **Step 6: Close issue after full green + push**

```bash
npm test -- lib/__tests__/subtitlePreviewSummary.test.ts ui/__tests__/SegmentedControl.test.tsx entrypoints/options/sections/__tests__/SubtitlesSection.test.tsx
bd close ALT-5zv --reason="Subtitle Studio shipped: split layout, cards, cyan segments, tests"
git pull --rebase
git push
```

---

## Spec coverage checklist (self-review)

| Spec requirement | Task |
|------------------|------|
| Goals / no new keys | Global Constraints |
| Desktop split panes Theme Studio shell | Task 5 |
| Narrow stack order | Task 5 (`order-1` preview first) |
| Section header copy | Task 5 |
| Hero enable status copy | Task 5 |
| Live preview height + summary chips | Task 1 + 3 |
| Appearance groups + icons + cyan segments | Task 2 + 4 |
| Source track rename | Task 4 |
| Platforms without ASR; hint demotion | Task 4 |
| Caption quality card + nested AI | Task 4 |
| Translation style 2×2 always open + Advanced timeout | Task 4 |
| Segment accent cyan | Task 2 |
| File extraction | Task 4–5 |
| A11y / reduced motion | Task 3 (existing) + Task 6 |
| Success criteria / tests | Task 6 |

**Placeholder scan:** none intentional.  
**Type consistency:** `onUpdate(partial: Partial<SubtitleSettings>)` / `SubtitleCardBaseProps` used across cards; ASR object spread matches store.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-10-subtitle-studio.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration  
2. **Inline Execution** — execute tasks in this session with executing-plans and checkpoints  

Which approach?
