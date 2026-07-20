# Popup Toolbar UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the toolbar popup into a translate-first balanced control center: one status channel, contextual This page rows, collapsed Quick settings, clickable footer, and a split component/hook architecture — with no new settings keys.

**Architecture:** Add a pure `derivePopupStatus` helper (TDD). Extract presentational pieces and hooks from the 1,650-line `App.tsx` god file. Restyle IA per the approved spec: merge progress under the action zone, group site/PDF/category rows, remove the Advanced accordion, make the footer open Options. Reuse `ui/SegmentedControl`, `ui/Toggle`, and `ui/Button`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Lucide React, Vitest (+ jsdom for popup component tests), WXT popup entry.

**Spec:** `docs/superpowers/specs/2026-07-20-popup-toolbar-redesign-design.md`  
**Beads:** AnyLLMTranslate-mvg

## Global Constraints

- No new settings schema keys — presentation/IA/structure only.
- Preserve message contracts: `startTranslation`, `stopTranslation`, `getStatus`, `setCategoryOverride`, `getPageCategory`, `pageCategoryUpdate`, `OPEN_PDF_VIEWER`, `getSubtitleKnobOverride`, `setSubtitleKnobOverride`, `getPageContentType`, `getCategoryOverride`.
- Preserve settings keys: languages, theme, displayMode, subtitleSettings, siteRules, enableContextAwareTranslation (read-only in popup after move), pdfSettings (read-only after move), provider pool fields.
- Status priority: `setup` > `blocked` > `error` > `translating` > `active` > `ready`.
- Default disclosures: Quick settings collapsed; subtitle style collapsed; PDF URL input closed.
- No permanent PDF card on normal web pages.
- No standalone status summary card — progress lives under the action zone.
- Advanced toggles (context-aware, LLM category detection, auto-open PDF) leave the popup; replace with “More in Settings →”.
- Footer is one control that opens Options (same window size as the gear: 1200×800 popup).
- Width stays `340px`; drop or lower `min-h-[480px]` (prefer content-driven / ~min-h-0).
- Commits: if git user unset, use  
  `git -c user.name="AnyLLMTranslate Agent" -c user.email="agent@anyllmtranslate.local" commit ...`
- Do not modify content-script translation pipeline for this redesign.

---

## File map

| File | Responsibility |
|------|----------------|
| Create: `entrypoints/popup/lib/derivePopupStatus.ts` | Pure status kind + chip label + whether to show progress |
| Create: `entrypoints/popup/lib/__tests__/derivePopupStatus.test.ts` | Unit tests for priority matrix |
| Create: `entrypoints/popup/components/CustomSelect.tsx` | Extract from App (behavior unchanged initially) |
| Create: `entrypoints/popup/components/CategoryPicker.tsx` | Extract from App (behavior unchanged initially) |
| Create: `entrypoints/popup/components/PopupHeader.tsx` | Brand + single status chip + settings |
| Create: `entrypoints/popup/components/LanguageBar.tsx` | Source ⇄ target |
| Create: `entrypoints/popup/components/ActionZone.tsx` | CTA / recovery / unsupported + inline progress |
| Create: `entrypoints/popup/components/ThisPageSection.tsx` | Always-translate, category, PDF rows |
| Create: `entrypoints/popup/components/QuickSettings.tsx` | Theme, mode, subtitles, More in Settings |
| Create: `entrypoints/popup/components/PopupFooter.tsx` | Clickable provider/model |
| Create: `entrypoints/popup/hooks/usePopupSettings.ts` | load/update settings + storage listener |
| Create: `entrypoints/popup/hooks/usePopupTab.ts` | tab, hostname, PDF, unsupported, category |
| Create: `entrypoints/popup/hooks/useTranslationToggle.ts` | start/stop translation |
| Create: `entrypoints/popup/lib/typography.ts` | Shared `TYPOGRAPHY` / `SPACING` / `THEME_LABELS` constants used by components |
| Create: `entrypoints/popup/lib/unsupportedPage.ts` | Move `getUnsupportedPageInfo` out of App |
| Create: `entrypoints/popup/lib/__tests__/unsupportedPage.test.ts` | Unit tests for unsupported detection |
| Rewrite: `entrypoints/popup/App.tsx` | Composition only |
| Optional: `entrypoints/popup/components/__tests__/ActionZone.test.tsx` | Smoke: renders Translate vs recovery |
| Optional README one-liner | Only if Advanced move needs docs |

**Do not modify:** content scripts, `types/config` defaults, provider readiness math (only consume), webTranslateStatus formatters (only consume).

---

### Task 1: `derivePopupStatus` pure helper (TDD)

**Files:**
- Create: `entrypoints/popup/lib/derivePopupStatus.ts`
- Create: `entrypoints/popup/lib/__tests__/derivePopupStatus.test.ts`

**Interfaces:**
- Consumes: `TabTranslationStatus` from `@/types/messages`; `isReadingAreaReady` from `@/lib/webTranslateStatus` (for `active` when reading-area ready)
- Produces:
  - `export type PopupStatusKind = 'ready' | 'translating' | 'active' | 'error' | 'blocked' | 'setup'`
  - `export interface DerivePopupStatusInput { status: TabTranslationStatus; isTranslating: boolean; hasError: boolean; unsupported: boolean; needsSetup: boolean; readingAreaReady: boolean }`
  - `export interface PopupStatusView { kind: PopupStatusKind; chipLabel: string; showProgress: boolean }`
  - `export function derivePopupStatus(input: DerivePopupStatusInput): PopupStatusView`

- [ ] **Step 1: Write the failing unit test**

Create `entrypoints/popup/lib/__tests__/derivePopupStatus.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { derivePopupStatus } from '../derivePopupStatus';

const base = {
  status: 'idle' as const,
  isTranslating: false,
  hasError: false,
  unsupported: false,
  needsSetup: false,
  readingAreaReady: false,
};

describe('derivePopupStatus', () => {
  it('returns ready by default', () => {
    expect(derivePopupStatus(base)).toEqual({
      kind: 'ready',
      chipLabel: 'Ready',
      showProgress: false,
    });
  });

  it('prioritizes setup over blocked', () => {
    const v = derivePopupStatus({ ...base, needsSetup: true, unsupported: true });
    expect(v.kind).toBe('setup');
    expect(v.chipLabel).toBe('Setup');
  });

  it('prioritizes blocked over error', () => {
    const v = derivePopupStatus({ ...base, unsupported: true, hasError: true, status: 'error' });
    expect(v.kind).toBe('blocked');
    expect(v.chipLabel).toBe('Unavailable');
  });

  it('prioritizes error over translating', () => {
    const v = derivePopupStatus({
      ...base,
      hasError: true,
      status: 'error',
      isTranslating: true,
    });
    expect(v.kind).toBe('error');
    expect(v.chipLabel).toBe('Error');
    expect(v.showProgress).toBe(false);
  });

  it('returns translating when in flight', () => {
    const v = derivePopupStatus({ ...base, isTranslating: true, status: 'translating' });
    expect(v.kind).toBe('translating');
    expect(v.chipLabel).toBe('Translating');
    expect(v.showProgress).toBe(true);
  });

  it('returns active when done', () => {
    const v = derivePopupStatus({ ...base, status: 'done' });
    expect(v.kind).toBe('active');
    expect(v.chipLabel).toBe('Active');
    expect(v.showProgress).toBe(true);
  });

  it('returns active when reading area ready', () => {
    const v = derivePopupStatus({ ...base, status: 'done', readingAreaReady: true });
    expect(v.kind).toBe('active');
    expect(v.chipLabel).toBe('Active');
    expect(v.showProgress).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run entrypoints/popup/lib/__tests__/derivePopupStatus.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement minimal helper**

Create `entrypoints/popup/lib/derivePopupStatus.ts`:

```ts
import type { TabTranslationStatus } from '@/types/messages';

export type PopupStatusKind = 'ready' | 'translating' | 'active' | 'error' | 'blocked' | 'setup';

export interface DerivePopupStatusInput {
  status: TabTranslationStatus;
  isTranslating: boolean;
  hasError: boolean;
  unsupported: boolean;
  needsSetup: boolean;
  readingAreaReady: boolean;
}

export interface PopupStatusView {
  kind: PopupStatusKind;
  chipLabel: string;
  /** True when action zone should render the progress/error detail strip. */
  showProgress: boolean;
}

const CHIP: Record<PopupStatusKind, string> = {
  ready: 'Ready',
  translating: 'Translating',
  active: 'Active',
  error: 'Error',
  blocked: 'Unavailable',
  setup: 'Setup',
};

export function derivePopupStatus(input: DerivePopupStatusInput): PopupStatusView {
  let kind: PopupStatusKind = 'ready';

  if (input.needsSetup) {
    kind = 'setup';
  } else if (input.unsupported) {
    kind = 'blocked';
  } else if (input.hasError || input.status === 'error') {
    kind = 'error';
  } else if (input.isTranslating || input.status === 'translating') {
    kind = 'translating';
  } else if (input.status === 'done' || input.readingAreaReady) {
    kind = 'active';
  }

  return {
    kind,
    chipLabel: CHIP[kind],
    showProgress: kind === 'translating' || kind === 'active',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run entrypoints/popup/lib/__tests__/derivePopupStatus.test.ts`

Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add entrypoints/popup/lib/derivePopupStatus.ts entrypoints/popup/lib/__tests__/derivePopupStatus.test.ts
git commit -m "feat(popup): add derivePopupStatus helper"
```

---

### Task 2: Extract pure unsupported-page helper (TDD)

**Files:**
- Create: `entrypoints/popup/lib/unsupportedPage.ts`
- Create: `entrypoints/popup/lib/__tests__/unsupportedPage.test.ts`
- Modify: `entrypoints/popup/App.tsx` — import helper, delete local copy

**Interfaces:**
- Produces:
  - `export type UnsupportedPageInfo = { title: string; description: string }`
  - `export function getUnsupportedPageInfo(tab?: chrome.tabs.Tab): UnsupportedPageInfo | null`

- [ ] **Step 1: Write failing tests**

Create `entrypoints/popup/lib/__tests__/unsupportedPage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getUnsupportedPageInfo } from '../unsupportedPage';

describe('getUnsupportedPageInfo', () => {
  it('returns message when tab missing', () => {
    const info = getUnsupportedPageInfo(undefined);
    expect(info?.title).toMatch(/can't be translated/i);
  });

  it('allows normal https pages', () => {
    expect(
      getUnsupportedPageInfo({ id: 1, url: 'https://example.com/page' } as chrome.tabs.Tab),
    ).toBeNull();
  });

  it('blocks chrome:// pages', () => {
    const info = getUnsupportedPageInfo({ id: 1, url: 'chrome://extensions' } as chrome.tabs.Tab);
    expect(info).not.toBeNull();
  });

  it('returns PDF viewer special copy', () => {
    const info = getUnsupportedPageInfo({
      id: 1,
      url: 'chrome-extension://abcdef/pdf-viewer.html?file=https%3A%2F%2Fx.com%2Fa.pdf',
    } as chrome.tabs.Tab);
    expect(info?.title).toMatch(/PDF translation is active/i);
  });

  it('blocks Chrome Web Store', () => {
    const info = getUnsupportedPageInfo({
      id: 1,
      url: 'https://chromewebstore.google.com/detail/foo',
    } as chrome.tabs.Tab);
    expect(info).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm exec vitest run entrypoints/popup/lib/__tests__/unsupportedPage.test.ts`

- [ ] **Step 3: Move implementation**

Copy `getUnsupportedPageInfo` and `UnsupportedPageInfo` verbatim from `entrypoints/popup/App.tsx` (lines ~109–158) into `entrypoints/popup/lib/unsupportedPage.ts` and export them.

In `App.tsx`, delete the local type/function and add:

```ts
import { getUnsupportedPageInfo, type UnsupportedPageInfo } from './lib/unsupportedPage';
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm exec vitest run entrypoints/popup/lib/__tests__/unsupportedPage.test.ts`

- [ ] **Step 5: Commit**

```bash
git add entrypoints/popup/lib/unsupportedPage.ts entrypoints/popup/lib/__tests__/unsupportedPage.test.ts entrypoints/popup/App.tsx
git commit -m "refactor(popup): extract getUnsupportedPageInfo"
```

---

### Task 3: Extract shared popup constants + CustomSelect + CategoryPicker

**Files:**
- Create: `entrypoints/popup/lib/typography.ts`
- Create: `entrypoints/popup/components/CustomSelect.tsx`
- Create: `entrypoints/popup/components/CategoryPicker.tsx`
- Modify: `entrypoints/popup/App.tsx` — import extracted modules; remove inlined components

**Interfaces:**
- `typography.ts` exports `TYPOGRAPHY`, `SPACING`, `THEME_LABELS` (move from App)
- `CustomSelect` — same props as today
- `CategoryPicker` — same props as today

- [ ] **Step 1: Create `typography.ts`**

```ts
import type { ThemeName } from '@/types/config';

export const TYPOGRAPHY = {
  label: 'text-[11px] uppercase tracking-wider text-zinc-500 font-semibold',
  body: 'text-xs text-zinc-300',
  small: 'text-[11px] text-zinc-400',
  tiny: 'text-[10px] text-zinc-500',
} as const;

export const SPACING = {
  xs: 'space-y-1',
  sm: 'space-y-2',
  md: 'space-y-3',
  lg: 'space-y-4',
} as const;

export const THEME_LABELS: Record<ThemeName, string> = {
  'dividing-line': 'Dividing Line',
  blockquote: 'Blockquote',
  paper: 'Paper',
  underline: 'Underline',
  'dashed-underline': 'Dashed',
  highlight: 'Highlight',
  'wavy-underline': 'Wavy',
  bubble: 'Bubble',
  'side-by-side': 'Side by Side',
  mask: 'Mask',
  'fade-in': 'Fade In',
  italic: 'Italic',
  'dotted-border': 'Dotted',
  'shadow-card': 'Card',
  minimal: 'Minimal',
  'gradient-accent': 'Gradient',
  custom: 'Custom',
};
```

- [ ] **Step 2: Move `CustomSelect`**

Cut the entire `CustomSelect` function from `App.tsx` into `entrypoints/popup/components/CustomSelect.tsx`.

Add required imports (`useState`, `useEffect`, `useCallback`, `useLayoutEffect`, `useRef`, `createPortal`, lucide icons, `TYPOGRAPHY` from `../lib/typography`).

Export: `export function CustomSelect(...)`.

Keep behavior identical (portal dropdown, search when >10 options).

- [ ] **Step 3: Move `CategoryPicker` + `CATEGORY_GROUPS`**

Cut `CATEGORY_GROUPS` and `CategoryPicker` into `entrypoints/popup/components/CategoryPicker.tsx`.

Import lucide icons, keep props interface identical, export `CategoryPicker`.

- [ ] **Step 4: Wire App imports**

```ts
import { CustomSelect } from './components/CustomSelect';
import { CategoryPicker } from './components/CategoryPicker';
import { TYPOGRAPHY, SPACING, THEME_LABELS } from './lib/typography';
```

Remove dead local definitions.

- [ ] **Step 5: Typecheck**

Run: `pnpm run compile`

Expected: no errors related to popup

- [ ] **Step 6: Commit**

```bash
git add entrypoints/popup/lib/typography.ts entrypoints/popup/components/CustomSelect.tsx entrypoints/popup/components/CategoryPicker.tsx entrypoints/popup/App.tsx
git commit -m "refactor(popup): extract CustomSelect and CategoryPicker"
```

---

### Task 4: Extract hooks (`usePopupSettings`, `usePopupTab`, `useTranslationToggle`)

**Files:**
- Create: `entrypoints/popup/hooks/usePopupSettings.ts`
- Create: `entrypoints/popup/hooks/usePopupTab.ts`
- Create: `entrypoints/popup/hooks/useTranslationToggle.ts`
- Modify: `entrypoints/popup/App.tsx` — call hooks instead of inline state/effects

**Interfaces:**

```ts
// usePopupSettings
export function usePopupSettings(): {
  settings: ExtensionSettings;
  updateSetting: (partial: Partial<ExtensionSettings>) => Promise<void>;
  updateSubtitleSetting: (partial: Partial<ExtensionSettings['subtitleSettings']>) => Promise<void>;
}

// usePopupTab
export function usePopupTab(): {
  status: StatusResponse;
  setStatus: React.Dispatch<React.SetStateAction<StatusResponse>>;
  isTranslating: boolean;
  setIsTranslating: React.Dispatch<React.SetStateAction<boolean>>;
  activeHostname: string | null;
  activeTabUrl: string | null;
  activeTabIsPdf: boolean;
  unsupportedPage: UnsupportedPageInfo | null;
  setUnsupportedPage: React.Dispatch<React.SetStateAction<UnsupportedPageInfo | null>>;
  categoryInfo: CategoryInfo | null;
  setCategoryInfo: React.Dispatch<React.SetStateAction<CategoryInfo | null>>;
  customCategoryInput: string;
  setCustomCategoryInput: React.Dispatch<React.SetStateAction<string>>;
  tabOverrides: Partial<ProfileKnobs>;
  setTabOverrides: React.Dispatch<React.SetStateAction<Partial<ProfileKnobs>>>;
  loadTabOverrides: () => Promise<void>;
  handleCategoryChange: (value: string) => Promise<void>;
  handleCustomCategorySubmit: () => Promise<void>;
  handleSaveAsRule: () => Promise<void>;
  handleTabKnob: (knob: keyof ProfileKnobs, value: string) => Promise<void>;
  handleToggleAlwaysTranslate: () => Promise<void>;
  isAlwaysTranslate: boolean;
  openPdfTranslator: (url: string) => void;
  openSetupGuide: (step?: 'provider' | 'test' | 'language') => void;
}

// useTranslationToggle
export function useTranslationToggle(deps: {
  isTranslating: boolean;
  status: StatusResponse;
  setIsTranslating: ...;
  setStatus: ...;
  setUnsupportedPage: ...;
}): { handleToggleTranslation: () => Promise<void> }
```

- [ ] **Step 1: Implement `usePopupSettings`**

Move from App:
- `settings` state
- `loadSettingsFromStorage` + mount effect portion for settings
- `storageListener` for `STORAGE_KEYS.SETTINGS`
- `updateSetting`, `updateSubtitleSetting`

Keep the same `loadSettings` / `updateSettings` imports from `@/lib/config`.

- [ ] **Step 2: Implement `usePopupTab`**

Move the large mount effect that:
1. queries active tab  
2. `queryTabStatus` / unsupported  
3. hostname + PDF viewer `?file=` hostname  
4. `getPageContentType` + URL PDF heuristic  
5. `getPageCategory` + background override fallback  
6. `statusUpdate` / `pageCategoryUpdate` listeners  

Also move handlers: category, save-as-rule, tab knobs, always-translate, `openPdfTranslator`, `openSetupGuide`.

`handleSaveAsRule` and `handleToggleAlwaysTranslate` need `settings` + `updateSetting` — accept them as hook args:

```ts
export function usePopupTab(
  settings: ExtensionSettings,
  updateSetting: (partial: Partial<ExtensionSettings>) => Promise<void>,
): UsePopupTabResult
```

- [ ] **Step 3: Implement `useTranslationToggle`**

Move `handleToggleTranslation` exactly (including connect-failure → unsupported message).

- [ ] **Step 4: Rewire App to hooks only (still old JSX OK)**

```tsx
export default function App() {
  const { settings, updateSetting, updateSubtitleSetting } = usePopupSettings();
  const tab = usePopupTab(settings, updateSetting);
  const { handleToggleTranslation } = useTranslationToggle({
    isTranslating: tab.isTranslating,
    status: tab.status,
    setIsTranslating: tab.setIsTranslating,
    setStatus: tab.setStatus,
    setUnsupportedPage: tab.setUnsupportedPage,
  });
  // ... existing JSX using tab.* and settings
}
```

- [ ] **Step 5: Compile**

Run: `pnpm run compile`

Expected: clean

- [ ] **Step 6: Commit**

```bash
git add entrypoints/popup/hooks entrypoints/popup/App.tsx
git commit -m "refactor(popup): extract settings, tab, and toggle hooks"
```

---

### Task 5: Presentational shell components (structure first)

Build components that accept props and render the **new** IA. App still wires data.

**Files:**
- Create: `entrypoints/popup/components/PopupHeader.tsx`
- Create: `entrypoints/popup/components/LanguageBar.tsx`
- Create: `entrypoints/popup/components/ActionZone.tsx`
- Create: `entrypoints/popup/components/ThisPageSection.tsx`
- Create: `entrypoints/popup/components/QuickSettings.tsx`
- Create: `entrypoints/popup/components/PopupFooter.tsx`
- Create: `entrypoints/popup/components/__tests__/ActionZone.test.tsx`
- Modify: `entrypoints/popup/App.tsx` — compose components

**Interfaces (props contracts):**

```ts
// PopupHeader
{ chipLabel: string; kind: PopupStatusKind; isTranslating: boolean; onOpenSettings: () => void }

// LanguageBar
{ sourceLanguage: string; targetLanguage: string; sourceOptions: {value:string;label:string}[];
  targetOptions: {value:string;label:string}[];
  onSourceChange: (v: string) => void; onTargetChange: (v: string) => void; onSwap: () => void }

// ActionZone
{ kind: PopupStatusKind;
  onTranslateToggle: () => void;
  progressLabel: string; progressDetail: string; progressPercent: number;
  error?: string; showProgress: boolean;
  // recovery
  recovery?: { title: string; description: string; action: string; canTest: boolean;
    onSetup: () => void; onTest: () => void; setupLabel: string };
  unsupported?: { title: string; description: string } | null;
  isActive: boolean; // translating || done — for Restore vs Translate chrome
}

// ThisPageSection
{ activeHostname: string | null;
  isAlwaysTranslate: boolean; onToggleAlwaysTranslate: () => void;
  showCategory: boolean; categoryProps: React.ComponentProps<typeof CategoryPicker> | null;
  activeTabIsPdf: boolean; activeTabUrl: string | null;
  pdfUrlInput: string; pdfInputOpen: boolean;
  onPdfUrlInputChange: (v: string) => void; onTogglePdfInput: () => void;
  onOpenPdf: (url: string) => void;
  hideForUnsupported: boolean;
}

// QuickSettings
{ expanded: boolean; onToggle: () => void;
  theme: ThemeName; onThemeChange: (t: ThemeName) => void;
  displayMode: DisplayMode; onDisplayModeChange: (m: DisplayMode) => void;
  subtitlesEnabled: boolean; onSubtitlesToggle: () => void;
  styleExpanded: boolean; onStyleToggle: () => void;
  tabOverrides: Partial<ProfileKnobs>; onTabKnob: (knob: keyof ProfileKnobs, value: string) => void;
  onOpenMoreSettings: () => void;
}

// PopupFooter
{ displayName: string; model: string; connectionStatus: 'unknown' | 'success' | 'error';
  onOpenSettings: () => void }
```

- [ ] **Step 1: Write ActionZone smoke test**

Create `entrypoints/popup/components/__tests__/ActionZone.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionZone } from '../ActionZone';

describe('ActionZone', () => {
  it('renders Translate Page when ready', async () => {
    const onToggle = vi.fn();
    render(
      <ActionZone
        kind="ready"
        onTranslateToggle={onToggle}
        progressLabel=""
        progressDetail=""
        progressPercent={0}
        showProgress={false}
        isActive={false}
        unsupported={null}
      />,
    );
    expect(screen.getByRole('button', { name: /translate page/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /translate page/i }));
    expect(onToggle).toHaveBeenCalled();
  });

  it('renders recovery card when setup', () => {
    render(
      <ActionZone
        kind="setup"
        onTranslateToggle={() => {}}
        progressLabel=""
        progressDetail=""
        progressPercent={0}
        showProgress={false}
        isActive={false}
        unsupported={null}
        recovery={{
          title: 'Provider not ready',
          description: 'Add a provider',
          action: 'Enter URL',
          canTest: false,
          onSetup: () => {},
          onTest: () => {},
          setupLabel: 'Set up provider',
        }}
      />,
    );
    expect(screen.getByText('Provider not ready')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /translate page/i })).not.toBeInTheDocument();
  });

  it('shows progress under Restore when active', () => {
    render(
      <ActionZone
        kind="translating"
        onTranslateToggle={() => {}}
        progressLabel="Translating..."
        progressDetail="3 of 10 completed"
        progressPercent={30}
        showProgress
        isActive
        unsupported={null}
      />,
    );
    expect(screen.getByRole('button', { name: /restore original/i })).toBeInTheDocument();
    expect(screen.getByText(/3 of 10/i)).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
  });
});
```

If `@testing-library/user-event` is not a dependency, use `fireEvent.click` from `@testing-library/react` instead (check `package.json`; project already uses Testing Library in options tests — mirror that import style).

- [ ] **Step 2: Implement ActionZone**

Key structure:

```tsx
export function ActionZone(props: ActionZoneProps) {
  if (props.kind === 'setup' && props.recovery) {
    return (/* amber recovery card — copy from current App recovery block */);
  }
  if (props.kind === 'blocked' && props.unsupported) {
    return (/* compact unsupported status */);
  }
  return (
    <div className="space-y-2">
      <button type="button" onClick={props.onTranslateToggle} className="/* hero CTA styles */">
        {props.isActive ? (/* Restore + Alt+X */) : (/* Translate + Alt+A */)}
      </button>
      {(props.showProgress || props.error) && (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 px-3 py-2">
          {props.error ? (
            <p className="text-[11px] text-red-400/90">{props.error}</p>
          ) : (
            <>
              <div className="flex justify-between gap-2 text-[11px] text-zinc-400">
                <span className="min-w-0 leading-snug">
                  <span className="font-medium text-zinc-300">{props.progressLabel}</span>
                  {' · '}
                  {props.progressDetail}
                </span>
                <span className="font-mono font-semibold shrink-0">{props.progressPercent}%</span>
              </div>
              <div className="mt-1.5 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${props.kind === 'translating' ? 'bg-gradient-to-r from-blue-500 to-cyan-500' : 'bg-gradient-to-r from-emerald-500 to-teal-500'}`}
                  style={{ width: `${props.progressPercent}%` }}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

**Do not** render a second large colored status card above the CTA.

- [ ] **Step 3: Implement remaining components**

**PopupHeader** — logo, title, chip from `chipLabel`, settings button with `aria-label="Open full settings"`.

**LanguageBar** — compact card with two `CustomSelect` ghost + swap button; swap `title="Pick a source language to swap"` when source is `auto`.

**ThisPageSection** — return `null` if `hideForUnsupported` or no rows; else:

```tsx
<section className="space-y-2">
  <h2 className={TYPOGRAPHY.label}>This page</h2>
  {activeHostname && (
    <SharedToggle
      checked={isAlwaysTranslate}
      onChange={onToggleAlwaysTranslate}
      label={`Always translate ${truncateHost(activeHostname)}`}
      // full host via description or title on wrapper
    />
  )}
  {showCategory && categoryProps && <CategoryPicker {...categoryProps} />}
  {/* PDF row — not a permanent card */}
  <div className="flex items-center justify-between gap-2 px-0.5">
    <span className="flex items-center gap-2 text-xs text-zinc-300">
      <FileText className="w-3.5 h-3.5 text-zinc-500" /> PDF
    </span>
    {activeTabIsPdf ? (
      <button type="button" className="text-[11px] text-blue-400 ..." onClick={() => activeTabUrl && onOpenPdf(activeTabUrl)}>
        Open current PDF
      </button>
    ) : (
      <button type="button" className="text-[11px] text-blue-400 ..." onClick={onTogglePdfInput}>
        {pdfInputOpen ? 'Cancel' : 'Open PDF URL…'}
      </button>
    )}
  </div>
  {pdfInputOpen && !activeTabIsPdf && (/* url input row */)}
</section>
```

Add helper in same file or `lib/truncateHost.ts`:

```ts
export function truncateHost(host: string, max = 28): string {
  if (host.length <= max) return host;
  const keep = max - 1;
  const head = Math.ceil(keep * 0.55);
  const tail = keep - head;
  return `${host.slice(0, head)}…${host.slice(-tail)}`;
}
```

Pass full hostname as `title` on the toggle label wrapper.

**QuickSettings** — disclosure with `aria-expanded={expanded}`:

- Theme via `CustomSelect`
- Display mode via `SegmentedControl` from `@/ui/SegmentedControl`:

```tsx
<SegmentedControl
  size="sm"
  label="Display mode"
  value={displayMode}
  onChange={onDisplayModeChange}
  options={[
    { value: 'bilingual-below', label: 'Bilingual' },
    { value: 'translation-only', label: 'Translation only' },
  ]}
/>
```

- Subtitle toggle
- Nested subtitle style knobs with `SegmentedControl` size sm (map each knob’s opts)
- Link button: `More in Settings →` calling `onOpenMoreSettings`

**No** Context-Aware / LLM category / Auto-open PDF toggles here.

**PopupFooter** —

```tsx
<button
  type="button"
  onClick={onOpenSettings}
  className="w-full bg-zinc-950/80 border-t border-zinc-900/80 px-4 py-3 flex items-center justify-between hover:bg-zinc-900/80 transition-colors text-left"
  aria-label={`Open settings — ${displayName}, ${model}`}
  title="Open settings"
>
  ...
</button>
```

- [ ] **Step 4: Compose App**

Rewrite `App.tsx` return to:

```tsx
const popupStatus = derivePopupStatus({
  status: tab.status.status,
  isTranslating: tab.isTranslating,
  hasError: Boolean(tab.status.error),
  unsupported: Boolean(tab.unsupportedPage),
  needsSetup: shouldShowProviderRecovery,
  readingAreaReady,
});

return (
  <div className="w-[340px] bg-zinc-950 text-zinc-100 font-sans selection:bg-blue-500/30 relative shadow-2xl flex flex-col">
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute -top-24 -left-20 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl" />
    </div>
    <PopupHeader
      chipLabel={popupStatus.chipLabel}
      kind={popupStatus.kind}
      isTranslating={tab.isTranslating}
      onOpenSettings={openOptionsWindow}
    />
    <div className="px-4 py-3 space-y-3 relative flex-1 overflow-y-auto">
      <LanguageBar ... />
      <ActionZone
        kind={popupStatus.kind}
        showProgress={popupStatus.showProgress || Boolean(tab.status.error)}
        ...
      />
      <ThisPageSection hideForUnsupported={Boolean(tab.unsupportedPage)} ... />
      <QuickSettings ... />
    </div>
    <PopupFooter ... onOpenSettings={openOptionsWindow} />
  </div>
);
```

Shared helper in App or `lib/openOptions.ts`:

```ts
export function openOptionsWindow(query = ''): void {
  const url = chrome.runtime.getURL(`options.html${query}`);
  chrome.windows.create({ url, type: 'popup', width: 1200, height: 800, focused: true });
}
```

Remove: old status card block, Advanced accordion, always-visible PDF card, dual header status wording.

- [ ] **Step 5: Run ActionZone tests + compile**

```bash
pnpm exec vitest run entrypoints/popup/components/__tests__/ActionZone.test.tsx
pnpm exec vitest run entrypoints/popup/lib/__tests__
pnpm run compile
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add entrypoints/popup
git commit -m "feat(popup): compose redesign shell components"
```

---

### Task 6: Visual polish + a11y pass

**Files:**
- Modify component classNames only (header, language, this page, quick settings, footer, App shell)

- [ ] **Step 1: Spacing / hierarchy**

Confirm:
- Shell: `w-[340px]`, no `min-h-[480px]` (or `min-h-0`)
- Body: `px-4 py-3 space-y-3`
- Single blur orb
- This page uses section label + rows, not N× `rounded-2xl` glass cards
- PDF is a row, not a card
- Progress only under ActionZone

- [ ] **Step 2: A11y attributes**

| Control | Attr |
|---------|------|
| Settings gear | `aria-label="Open full settings"` |
| Footer | `aria-label="Open settings — {name}, {model}"` |
| Quick settings button | `aria-expanded={expanded}` |
| Subtitle style button | `aria-expanded={styleExpanded}` |
| Swap | `aria-label="Swap languages"` + `title` when disabled |

- [ ] **Step 3: Error-under-CTA**

When `status.error` and kind is `error` (and not setup/blocked), ActionZone should still show Restore/Translate per `isActive`, with error text in the progress strip (`showProgress` forced true when error present — already handled if App passes `showProgress={popupStatus.showProgress \|\| Boolean(error)}`).

For pure error after failed run, prefer showing error strip; CTA label follows `isActive` (if idle after error, Translate; if was active, Restore). Match previous toggle semantics: `isTranslating || status.status === 'done'` for Restore.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/popup
git commit -m "style(popup): tighten hierarchy and a11y attributes"
```

---

### Task 7: Verification matrix + cleanup

**Files:**
- Possibly fix test selectors / imports
- Optional: one-line README under popup usage if Advanced is documented there

- [ ] **Step 1: Automated suite**

```bash
pnpm exec vitest run entrypoints/popup
pnpm run compile
pnpm run lint
```

Expected: pass (fix any lint issues introduced)

- [ ] **Step 2: Manual checklist** (implementer or human)

| # | Scenario | Expect |
|---|----------|--------|
| 1 | Normal https page, provider ready | Translate CTA; no PDF card; no Advanced |
| 2 | Click Translate | Chip → Translating; progress under CTA; no second status card |
| 3 | Done | Restore; progress emerald |
| 4 | Always-translate toggle | Persists site rule |
| 5 | Context-aware on | Category row under This page |
| 6 | Context-aware off | No category row |
| 7 | PDF URL tab / contentType pdf | “Open current PDF” row |
| 8 | Non-PDF | “Open PDF URL…” expands input |
| 9 | chrome:// or Web Store | Unsupported; no always-translate |
| 10 | PDF viewer extension page | PDF active copy |
| 11 | Provider empty/untested | Recovery card; Setup chip |
| 12 | Footer click | Options window |
| 13 | Gear click | Options window |
| 14 | Quick settings | Theme, segmented mode, subtitles; More in Settings |
| 15 | Subtitle knobs | Per-tab override still works |
| 16 | Language swap with Auto | Disabled + tooltip |
| 17 | Long hostname | Truncated label; title full host |

- [ ] **Step 3: Grep guardrails**

```bash
# Advanced toggles must not remain in popup UI
grep -n "enableContextAwareTranslation\|enableLLMPageCategoryDetection\|Auto-open PDF" entrypoints/popup || true
# Should only appear as reads for showCategory / not as Toggle labels in JSX
```

`enableContextAwareTranslation` may still be **read** for `showCategoryDropdown` — that is correct. It must not appear as a Toggle label in popup components.

- [ ] **Step 4: Final commit if fixes needed**

```bash
git add -A entrypoints/popup
git commit -m "test(popup): finish toolbar redesign verification fixes"
```

- [ ] **Step 5: Close bead**

```bash
bd close AnyLLMTranslate-mvg --reason="Popup toolbar redesign implemented per spec"
```

---

## Spec coverage checklist

| Spec section | Task(s) |
|--------------|---------|
| §2 Goals translate-first / one status / contextual | 1, 5, 6 |
| §3 Non-goals (no schema, no pipeline) | Global constraints |
| §4 IA zones | 5 |
| §5 Visual hierarchy, PDF row, Quick settings, footer | 5, 6 |
| §6 Status model | 1, 5 |
| §7 Edge matrix | 2, 5, 7 |
| §8 Component architecture | 3, 4, 5 |
| §9 A11y scoped | 6 |
| §10 Behavior parity | 4, 5, 7 |
| §11 Testing | 1, 2, 5, 7 |
| §12 Success criteria | 7 |
| §14 Phases extract→status→IA→shared→verify | Tasks 1–7 order |

## Placeholder / consistency self-review

- No TBD/TODO left in plan steps.  
- `PopupStatusKind` and `derivePopupStatus` names consistent across Task 1 and Task 5.  
- Hooks produced in Task 4 are what App consumes in Task 5.  
- Advanced removal and footer click called out explicitly.
