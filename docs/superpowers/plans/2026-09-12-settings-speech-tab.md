# Settings Speech Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote selection-bubble Speak configuration from Advanced into an accessible, progressively disclosed Speech tab under Media without changing stored TTS values or synthesis behavior.

**Architecture:** First characterize the existing TTS UI, then extract it behind typed feature components while it remains in Advanced. Introduce a shared settings-tab registry and generalized deep-link resolution, add the Speech page, then apply the approved basic-to-expert hierarchy using the existing Drawer and disclosure primitives.

**Tech Stack:** React 19, TypeScript 5.9, Zustand 5, Tailwind CSS 4, Lucide React, Vitest 3, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-12-advanced-settings-redesign-design.md`

## Global Constraints

- Preserve `TtsSettings`, `TtsLanguageOverride`, and all stored enum values exactly; no storage migration.
- Preserve `SYNTHESIZE_SPEECH`, `listProviderModels`, `listTtsVoices`, credential resolution, and browser fallback semantics.
- Use existing UI primitives and dependencies; add no package.
- Keep actionable loading and failure states inline, with toasts as supplemental feedback.
- Dependent controls must be natively disabled while Speech is disabled.
- Do not remove existing comments while moving code.
- Do not commit or push unless the user explicitly grants authority. If authority is granted, use the repository-required Devin commit footer.

---

### Task 1: Characterize the existing Speech settings behavior

**Files:**
- Create: `entrypoints/options/sections/__tests__/AdvancedSection.speech.test.tsx`
- Reference: `entrypoints/options/sections/AdvancedSection.tsx:198-847`
- Reference: `types/config.ts:304-382`

**Interfaces:**
- Consumes: `AdvancedSection`, `useSettingsStore`, `DEFAULT_SETTINGS`, `ToastProvider`.
- Produces: regression coverage that later follows the extracted UI to `SpeechSection`.

- [x] **Step 1: Add a deterministic render harness and provider-service mocks**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '@/types/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { ToastProvider } from '@/ui/ToastProvider';
import { AdvancedSection } from '../AdvancedSection';
import { listProviderModels } from '@/services/providerTester';
import { listTtsVoices } from '@/lib/tts/listTtsVoices';

vi.mock('@/services/providerTester', () => ({ listProviderModels: vi.fn() }));
vi.mock('@/lib/tts/listTtsVoices', () => ({ listTtsVoices: vi.fn() }));
vi.mock('@/entrypoints/options/hooks/useCacheStats', () => ({
  useCacheStats: () => ({
    entryCount: 0,
    totalSizeBytes: 0,
    sizeMb: 0,
    sizeLabel: '0 B',
    loading: false,
    refresh: vi.fn(),
  }),
}));

function renderSpeech(overrides: Partial<ExtensionSettings> = {}) {
  const updateSettings = vi.fn();
  useSettingsStore.setState({
    ...DEFAULT_SETTINGS,
    ...overrides,
    isLoaded: true,
    updateSettings,
  } as never);
  render(<ToastProvider><AdvancedSection /></ToastProvider>);
  return { updateSettings };
}
```

- [x] **Step 2: Test master enable and backend-dependent controls**

```tsx
it('persists the master switch and disables dependent Speech controls', () => {
  const { updateSettings } = renderSpeech({
    tts: { ...DEFAULT_SETTINGS.tts, enabled: false },
  });

  expect(screen.getByLabelText(/backend/i)).toBeDisabled();
  fireEvent.click(screen.getByRole('switch', { name: /enable speak/i }));
  expect(updateSettings).toHaveBeenCalledWith({
    tts: { ...DEFAULT_SETTINGS.tts, enabled: true },
  });
});

it('hides provider credentials for browser-only speech', () => {
  renderSpeech({
    tts: { ...DEFAULT_SETTINGS.tts, preferredBackend: 'browser' },
  });

  expect(screen.getByLabelText(/backend/i)).toHaveValue('browser');
  expect(screen.getByLabelText(/tts credentials/i)).toBeDisabled();
});
```

- [x] **Step 3: Test model and voice loading without overwriting selections on failure**

```tsx
it('loads model choices and preserves the configured model when refresh fails', async () => {
  vi.mocked(listProviderModels).mockResolvedValue({
    success: false,
    models: [],
    error: 'Catalog unavailable',
  });
  renderSpeech({
    providers: [{
      id: 'p1', displayName: 'Provider', baseUrl: 'https://example.test/v1',
      model: 'chat', requiresApiKey: false, temperature: 0.3, maxTokens: 4096,
      enabled: true, keys: [],
    }],
    tts: { ...DEFAULT_SETTINGS.tts, model: 'tts-kept' },
  });

  fireEvent.click(screen.getByRole('button', { name: /load models/i }));
  expect(await screen.findByText('Catalog unavailable')).toBeInTheDocument();
  expect(screen.getByLabelText(/^model$/i)).toHaveValue('tts-kept');
});

it('selects a loaded voice without changing unrelated TTS values', async () => {
  vi.mocked(listTtsVoices).mockResolvedValue({
    success: true,
    voices: [{ id: 'voice-1', label: 'Voice One' }],
  });
  const { updateSettings } = renderSpeech({
    tts: { ...DEFAULT_SETTINGS.tts, showVoiceField: true },
  });

  fireEvent.click(screen.getByRole('button', { name: /load voices/i }));
  fireEvent.click(await screen.findByRole('button', { name: 'Voice One' }));
  expect(updateSettings).toHaveBeenCalledWith({
    tts: expect.objectContaining({ voice: 'voice-1', rate: 1 }),
  });
});
```

- [x] **Step 4: Test language override inheritance and duplicate prevention**

```tsx
it('adds an unused language override and blocks duplicate languages', () => {
  const { updateSettings } = renderSpeech({
    tts: {
      ...DEFAULT_SETTINGS.tts,
      languageOverrides: [{ language: 'en' }],
    },
  });

  fireEvent.click(screen.getByRole('button', { name: /add language/i }));
  expect(updateSettings).toHaveBeenCalledWith({
    tts: expect.objectContaining({
      languageOverrides: expect.arrayContaining([
        { language: 'en' },
        expect.objectContaining({ language: expect.not.stringMatching(/^en$/i) }),
      ]),
    }),
  });
});
```

- [x] **Step 5: Run the characterization suite**

Run: `npm test -- entrypoints/options/sections/__tests__/AdvancedSection.speech.test.tsx`

Expected: PASS against the current Advanced implementation. If an accessibility query exposes a real label mismatch, adjust the test to the current accessible name and record that label for Task 5; do not weaken assertions to class selectors.

- [x] **Step 6: Checkpoint commit if explicitly authorized**

```bash
git add entrypoints/options/sections/__tests__/AdvancedSection.speech.test.tsx
git commit -m "test(options): characterize speech settings"
```

---

### Task 2: Extract Speech components while preserving current placement

**Files:**
- Create: `entrypoints/options/sections/speech/SpeechConfiguration.tsx`
- Create: `entrypoints/options/sections/speech/LanguageVoiceOverrides.tsx`
- Modify: `entrypoints/options/sections/AdvancedSection.tsx:5-847,1590-1627`
- Test: `entrypoints/options/sections/__tests__/AdvancedSection.speech.test.tsx`

**Interfaces:**
- Consumes: existing `TtsSettings`, `ExtensionSettings`, resolver helpers, provider catalog services, and UI primitives.
- Produces:
  - `SpeechConfiguration(props: { tts: TtsSettings; settings: ExtensionSettings; onChange: (tts: TtsSettings) => void }): JSX.Element`
  - `LanguageVoiceOverrides(props: { value: TtsLanguageOverride[]; globalModel: string; globalVoice: string; enabledProviders: ExtensionSettings['providers']; onChange: (value: TtsLanguageOverride[]) => void }): JSX.Element`

- [x] **Step 1: Change the characterization test to import a missing extracted component through Advanced**

Keep the test rendering `AdvancedSection`, but add this assertion so extraction cannot accidentally duplicate the feature:

```tsx
expect(screen.getAllByRole('switch', { name: /enable speak/i })).toHaveLength(1);
```

- [x] **Step 2: Run the test before extraction**

Run: `npm test -- entrypoints/options/sections/__tests__/AdvancedSection.speech.test.tsx`

Expected: PASS. This is the baseline immediately before mechanical extraction.

- [x] **Step 3: Move language-row logic into `LanguageVoiceOverrides.tsx`**

Move `normalizedOverrideLang`, `isDuplicateLanguage`, and `TtsLanguageOverrideRow` from `AdvancedSection.tsx:182-360`, preserving comments and behavior. Export only the collection-level component:

```tsx
interface LanguageVoiceOverridesProps {
  value: TtsLanguageOverride[];
  globalModel: string;
  globalVoice: string;
  enabledProviders: ExtensionSettings['providers'];
  onChange: (value: TtsLanguageOverride[]) => void;
}

export function LanguageVoiceOverrides({
  value,
  globalModel,
  globalVoice,
  enabledProviders,
  onChange,
}: LanguageVoiceOverridesProps) {
  const updateRow = (index: number, next: TtsLanguageOverride) => {
    const rows = [...value];
    rows[index] = next;
    onChange(rows);
  };

  return (
    <div className="space-y-3">
      {value.map((row, index) => (
        <TtsLanguageOverrideRow
          key={`${index}-${row.language}`}
          row={row}
          index={index}
          rows={value}
          globalModel={globalModel}
          globalVoice={globalVoice}
          enabledProviders={enabledProviders}
          onChange={(next) => updateRow(index, next)}
          onRemove={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))}
        />
      ))}
    </div>
  );
}
```

- [x] **Step 4: Move `TtsSettingsGroup` into `SpeechConfiguration.tsx`**

Rename the internal function to `SpeechConfiguration`, import `LanguageVoiceOverrides`, and preserve current model loading, voice loading, test voice, provider selection, warnings, and conditional visibility. Apply this mechanical signature change to the complete function at `AdvancedSection.tsx:362-847`, then move that complete function body into the new file:

```diff
-function TtsSettingsGroup({
+export function SpeechConfiguration({
   tts,
   settings,
   onChange,
 }: {
   tts: TtsSettings;
   settings: ExtensionSettings;
   onChange: (tts: TtsSettings) => void;
 }) {
   const merged = mergeTtsSettings(tts);
   const patch = (partial: Partial<TtsSettings>) => {
     onChange({ ...merged, ...partial });
   };
```

Replace only the per-language list at original lines 750-816 with `LanguageVoiceOverrides`; leave every other statement and JSX branch byte-for-byte equivalent in this extraction task. Do not alter labels or layout.

- [x] **Step 5: Replace the old Advanced block with the extracted component**

```tsx
<SpeechConfiguration
  tts={settings.tts ?? DEFAULT_TTS_SETTINGS}
  settings={settings}
  onChange={(tts) => updateSettings({ tts })}
/>
```

Remove now-unused TTS imports and helper definitions from `AdvancedSection.tsx` only after the extracted files compile.

- [x] **Step 6: Verify extraction**

Run: `npm test -- entrypoints/options/sections/__tests__/AdvancedSection.speech.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.jumpNav.test.tsx`

Expected: all tests PASS with Speech still rendered in Advanced exactly once.

Run: `npm run compile`

Expected: PASS with no unused imports or changed TTS types.

- [x] **Step 7: Checkpoint commit if explicitly authorized**

```bash
git add entrypoints/options/sections/AdvancedSection.tsx entrypoints/options/sections/speech entrypoints/options/sections/__tests__/AdvancedSection.speech.test.tsx
git commit -m "refactor(options): isolate speech settings"
```

---

### Task 3: Introduce a tested settings-tab registry and generalized deep links

**Files:**
- Create: `entrypoints/options/lib/settingsTabs.ts`
- Create: `entrypoints/options/lib/__tests__/settingsTabs.test.ts`
- Modify: `entrypoints/options/App.tsx:1-73,94-119,199-220,253-285`

**Interfaces:**
- Consumes: Lucide icon components and current tab metadata.
- Produces:
  - `TabId`
  - `TabDef`
  - `TabGroup`
  - `TAB_GROUPS`
  - `ALL_TAB_IDS`
  - `isSettingsTabId(value: string | null): value is TabId`
  - `resolveRequestedSettingsTab(value: string | null): TabId | null`

- [x] **Step 1: Write failing pure navigation tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  ALL_TAB_IDS,
  TAB_GROUPS,
  resolveRequestedSettingsTab,
} from '../settingsTabs';

describe('settingsTabs', () => {
  it('places Speech in Media after Subtitles', () => {
    expect(TAB_GROUPS.find((group) => group.label === 'MEDIA')?.tabs.map((tab) => tab.id))
      .toEqual(['subtitles', 'speech']);
  });

  it('resolves every known section and rejects invalid values', () => {
    for (const id of ALL_TAB_IDS) expect(resolveRequestedSettingsTab(id)).toBe(id);
    expect(resolveRequestedSettingsTab('unknown')).toBeNull();
    expect(resolveRequestedSettingsTab(null)).toBeNull();
  });
});
```

- [x] **Step 2: Run the pure test and verify failure**

Run: `npm test -- entrypoints/options/lib/__tests__/settingsTabs.test.ts`

Expected: FAIL because `settingsTabs.ts` does not exist.

- [x] **Step 3: Create the registry**

```ts
import {
  BarChart3,
  BookOpen,
  Globe,
  Keyboard,
  Layers,
  Palette,
  Settings,
  Subtitles,
  TextCursorInput,
  Volume2,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export type TabId =
  | 'general' | 'themes' | 'providers' | 'dictionary' | 'site-rules'
  | 'subtitles' | 'speech' | 'statistics' | 'shortcuts' | 'inline' | 'advanced';

export interface TabDef { id: TabId; label: string; icon: LucideIcon }
export interface TabGroup { label: string; tabs: TabDef[] }

export const TAB_GROUPS: TabGroup[] = [
  { label: 'DISPLAY', tabs: [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'themes', label: 'Themes', icon: Palette },
  ] },
  { label: 'TRANSLATION', tabs: [
    { id: 'providers', label: 'Providers', icon: Layers },
    { id: 'dictionary', label: 'Custom terms', icon: BookOpen },
    { id: 'site-rules', label: 'Site Rules', icon: Globe },
  ] },
  { label: 'MEDIA', tabs: [
    { id: 'subtitles', label: 'Subtitles', icon: Subtitles },
    { id: 'speech', label: 'Speech', icon: Volume2 },
  ] },
  { label: 'SYSTEM', tabs: [
    { id: 'statistics', label: 'Statistics', icon: BarChart3 },
    { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
    { id: 'inline', label: 'Inline Translate', icon: TextCursorInput },
    { id: 'advanced', label: 'Advanced', icon: Wrench },
  ] },
];

export const ALL_TAB_IDS = TAB_GROUPS.flatMap((group) => group.tabs.map((tab) => tab.id));

export function isSettingsTabId(value: string | null): value is TabId {
  return value !== null && ALL_TAB_IDS.includes(value as TabId);
}

export function resolveRequestedSettingsTab(value: string | null): TabId | null {
  return isSettingsTabId(value) ? value : null;
}
```

- [x] **Step 4: Make `App.tsx` consume the registry and generic resolver**

Remove local tab interfaces/constants and import the shared values. Replace the special-case section branch with:

```tsx
const requestedTab = resolveRequestedSettingsTab(url.searchParams.get('section'));
if (requestedTab) setActiveTab(requestedTab);
```

Keep setup wizard behavior and all existing render cases unchanged in this task. The `speech` render case is added in Task 4.

- [x] **Step 5: Run tests and compile**

Run: `npm test -- entrypoints/options/lib/__tests__/settingsTabs.test.ts`

Expected: PASS.

Run: `npm run compile`

Expected: PASS. The existing default render case remains valid until Task 4 adds the explicit Speech render case.

- [x] **Step 6: Checkpoint commit if explicitly authorized and compile is green**

```bash
git add entrypoints/options/App.tsx entrypoints/options/lib/settingsTabs.ts entrypoints/options/lib/__tests__/settingsTabs.test.ts
git commit -m "refactor(options): centralize settings navigation"
```

---

### Task 4: Add the Speech tab and move configuration out of Advanced

**Files:**
- Create: `entrypoints/options/sections/SpeechSection.tsx`
- Create: `entrypoints/options/sections/__tests__/SpeechSection.test.tsx`
- Modify: `entrypoints/options/App.tsx:8-17,199-220`
- Modify: `entrypoints/options/sections/AdvancedSection.tsx` at the `SpeechConfiguration` render site
- Remove after replacement: `entrypoints/options/sections/__tests__/AdvancedSection.speech.test.tsx`

**Interfaces:**
- Consumes: `SpeechConfiguration`, settings store, `SectionHeader`, `Toggle`, and `DEFAULT_TTS_SETTINGS`.
- Produces: `SpeechSection(): JSX.Element`, rendered by App for `activeTab === 'speech'`.

- [x] **Step 1: Write the failing Speech page test**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@/types/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { ToastProvider } from '@/ui/ToastProvider';
import { SpeechSection } from '../SpeechSection';

function renderSpeechSection() {
  const updateSettings = vi.fn();
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, isLoaded: true, updateSettings } as never);
  render(<ToastProvider><SpeechSection /></ToastProvider>);
  return updateSettings;
}

describe('SpeechSection', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('renders a first-class enable panel and persists the master switch', () => {
    const updateSettings = renderSpeechSection();
    expect(screen.getByRole('heading', { name: 'Speech' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: /enable speak/i }));
    expect(updateSettings).toHaveBeenCalledWith({
      tts: expect.objectContaining({ enabled: false }),
    });
  });
});
```

Also copy the characterization cases from `AdvancedSection.speech.test.tsx` into this file, changing only the render target.

- [x] **Step 2: Run the Speech page test and verify failure**

Run: `npm test -- entrypoints/options/sections/__tests__/SpeechSection.test.tsx`

Expected: FAIL because `SpeechSection.tsx` does not exist.

- [x] **Step 3: Implement the Speech page shell**

```tsx
import { Volume2 } from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { Toggle } from '@/ui/Toggle';
import { DisabledDimmer } from '@/ui/DisabledDimmer';
import { useSettingsStore } from '@/stores/settingsStore';
import { DEFAULT_TTS_SETTINGS } from '@/types/config';
import { mergeTtsSettings } from '@/lib/tts/resolveTtsBackend';
import { SpeechConfiguration } from './speech/SpeechConfiguration';

export function SpeechSection() {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const tts = mergeTtsSettings(settings.tts ?? DEFAULT_TTS_SETTINGS);
  const patch = (partial: Partial<typeof tts>) => updateSettings({ tts: { ...tts, ...partial } });

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Speech"
        description="Listen to original or translated text using browser or AI voices."
        icon={<Volume2 className="h-4 w-4" />}
        accentColor="cyan"
      />
      <div className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/[0.04] p-4">
        <Toggle
          id="speech-enabled-toggle"
          checked={tts.enabled}
          onChange={(enabled) => patch({ enabled })}
          label="Enable Speak"
          description={tts.enabled
            ? 'The Speak action is available after translating selected text.'
            : 'Enable to show the Speak action in the selection translation bubble.'}
        />
      </div>
      <DisabledDimmer disabled={!tts.enabled}>
        <SpeechConfiguration tts={tts} settings={settings} onChange={(next) => updateSettings({ tts: next })} />
      </DisabledDimmer>
    </div>
  );
}
```

Remove the duplicate master toggle from `SpeechConfiguration`; the page owns enable state.

- [x] **Step 4: Wire App and remove Speech from Advanced**

Add:

```tsx
import { SpeechSection } from './sections/SpeechSection';
```

and the render case:

```tsx
case 'speech': return <SpeechSection />;
```

Remove the `SpeechConfiguration` render block and now-unused TTS imports from `AdvancedSection.tsx`. Do not alter neighboring Translation Quality controls.

- [x] **Step 5: Run focused regression tests**

Run: `npm test -- entrypoints/options/sections/__tests__/SpeechSection.test.tsx entrypoints/options/lib/__tests__/settingsTabs.test.ts entrypoints/options/sections/__tests__/AdvancedSection.jumpNav.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx`

Expected: PASS. Advanced tests must no longer find Speech, while backup and jump navigation remain intact.

Run: `npm run compile`

Expected: PASS.

- [x] **Step 6: Remove the obsolete Advanced Speech test after the SpeechSection copy passes**

Delete `AdvancedSection.speech.test.tsx` only after every characterization assertion exists in `SpeechSection.test.tsx` and passes.

- [x] **Step 7: Checkpoint commit if explicitly authorized**

```bash
git add entrypoints/options/App.tsx entrypoints/options/sections/AdvancedSection.tsx entrypoints/options/sections/SpeechSection.tsx entrypoints/options/sections/speech entrypoints/options/sections/__tests__/SpeechSection.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.speech.test.tsx
git commit -m "feat(options): add dedicated Speech settings tab"
```

---

### Task 5: Apply the approved progressive Speech UX

**Files:**
- Create: `entrypoints/options/sections/speech/SpeechQuickSetup.tsx`
- Create: `entrypoints/options/sections/speech/SpeechProviderSettings.tsx`
- Modify: `entrypoints/options/sections/speech/SpeechConfiguration.tsx`
- Modify: `entrypoints/options/sections/speech/LanguageVoiceOverrides.tsx`
- Modify: `entrypoints/options/sections/__tests__/SpeechSection.test.tsx`
- Reference: `ui/Drawer.tsx`
- Reference: `ui/AdvancedDisclosure.tsx`
- Reference: `ui/SegmentedControl.tsx`

**Interfaces:**
- Consumes: unchanged `TtsSettings` and existing service handlers extracted in Task 2.
- Produces:
  - `SpeechQuickSetup(props: { value: TtsSettings; onChange: (value: TtsSettings) => void; onTest: () => void; testing: boolean }): JSX.Element`
  - `SpeechProviderSettings(props: SpeechProviderSettingsProps): JSX.Element`, where props contain the current TTS value/settings, model and voice choices/errors/loading flags, `onLoadModels`, `onLoadVoices`, and `onChange`.
  - Drawer-based create/edit flow inside `LanguageVoiceOverrides`.

- [x] **Step 1: Add failing hierarchy and disclosure tests**

```tsx
it('shows quick setup before provider details and labels backends for users', () => {
  renderSpeechSection();
  const backend = screen.getByRole('radiogroup', { name: /speech source/i });
  expect(backend).toHaveTextContent('Automatic');
  expect(backend).toHaveTextContent('Browser voice');
  expect(backend).toHaveTextContent('AI voice');
  expect(screen.getByRole('button', { name: /advanced provider settings/i }))
    .toHaveAttribute('aria-expanded', 'false');
});

it('summarizes overrides and edits one in a drawer', () => {
  useSettingsStore.setState({
    tts: { ...DEFAULT_SETTINGS.tts, languageOverrides: [{ language: 'vi', voice: 'voice-vi' }] },
  });
  renderSpeechSection();
  expect(screen.getByText('1 language override')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /edit vietnamese/i }));
  expect(screen.getByRole('dialog', { name: /edit language voice/i })).toBeInTheDocument();
  expect(screen.getByText(/uses default model/i)).toBeInTheDocument();
});
```

- [x] **Step 2: Run tests and verify failure**

Run: `npm test -- entrypoints/options/sections/__tests__/SpeechSection.test.tsx`

Expected: FAIL because the current form uses selects and permanently expanded override rows.

- [x] **Step 3: Implement `SpeechQuickSetup` with user-facing backend labels**

Map display labels to existing values without changing persistence:

```tsx
const BACKENDS = [
  { value: 'auto', label: 'Automatic' },
  { value: 'browser', label: 'Browser voice' },
  { value: 'provider', label: 'AI voice' },
] satisfies Array<{ value: TtsPreferredBackend; label: string }>;

<SegmentedControl
  id="speech-backend"
  label="Speech source"
  options={BACKENDS}
  value={value.preferredBackend}
  onChange={(preferredBackend) => onChange({ ...value, preferredBackend })}
  layout="grid"
  accent="cyan"
/>
```

Keep rate and Test voice in the same primary card. The Test voice button remains visible for all backends and disabled only while a test is running or Speech is disabled.

- [x] **Step 4: Put provider details behind a conditional disclosure**

Render `SpeechProviderSettings` only when `preferredBackend !== 'browser'`. Use this exact boundary:

```tsx
interface SpeechProviderSettingsProps {
  value: TtsSettings;
  settings: ExtensionSettings;
  modelChoices: string[];
  modelListError: string | null;
  loadingModels: boolean;
  voiceChoices: TtsVoiceChoice[];
  voiceListError: string | null;
  loadingVoices: boolean;
  onLoadModels: () => void;
  onLoadVoices: () => void;
  onChange: (value: TtsSettings) => void;
}
```

Wrap custom endpoint, pool provider, model loading, voice loading, and show-voice controls in:

```tsx
<AdvancedDisclosure label="Advanced provider settings" idPrefix="speech-provider-settings">
  <SpeechProviderSettings
    value={value}
    settings={settings}
    modelChoices={modelChoices}
    modelListError={modelListError}
    loadingModels={loadingModels}
    voiceChoices={voiceChoices}
    voiceListError={voiceListError}
    loadingVoices={loadingVoices}
    onLoadModels={() => void handleLoadModels()}
    onLoadVoices={() => void handleLoadVoices()}
    onChange={onChange}
  />
</AdvancedDisclosure>
```

Preserve inline `modelListError`, `voiceListError`, loading states, missing-provider warning, and current values after failures.

- [x] **Step 5: Replace expanded override rows with a summary list and Drawer editor**

Generalize the Task 2 duplicate helper for create mode and select the first unused language:

```tsx
function isDuplicateLanguage(
  rows: TtsLanguageOverride[],
  editingIndex: number | null,
  language: string,
): boolean {
  const normalized = normalizedOverrideLang(language);
  return Boolean(normalized) && rows.some((row, index) =>
    index !== editingIndex && normalizedOverrideLang(row.language) === normalized,
  );
}

function firstUnusedLanguage(rows: TtsLanguageOverride[]): string {
  const used = new Set(rows.map((row) => normalizedOverrideLang(row.language)));
  return getTargetLanguages().find((language) => !used.has(normalizedOverrideLang(language.code)))?.code ?? '';
}
```

Maintain local editor state:

```tsx
const [editingIndex, setEditingIndex] = useState<number | null>(null);
const [draft, setDraft] = useState<TtsLanguageOverride | null>(null);

const openCreate = () => {
  setEditingIndex(null);
  setDraft({ language: firstUnusedLanguage(value) });
};

const openEdit = (index: number) => {
  setEditingIndex(index);
  setDraft({ ...value[index] });
};

const saveDraft = () => {
  if (!draft || isDuplicateLanguage(value, editingIndex, draft.language)) return;
  onChange(editingIndex === null
    ? [...value, draft]
    : value.map((row, index) => index === editingIndex ? draft : row));
  setDraft(null);
};
```

Use the existing `Drawer` and a private `LanguageOverrideFields` function in the same file:

```tsx
<Drawer
  open={draft !== null}
  title={editingIndex === null ? 'Add language voice' : 'Edit language voice'}
  onClose={() => setDraft(null)}
  footer={
    <Button
      onClick={saveDraft}
      disabled={!draft?.language || isDuplicateLanguage(value, editingIndex, draft.language)}
    >
      Save override
    </Button>
  }
>
  {draft && (
    <LanguageOverrideFields
      value={draft}
      globalModel={globalModel}
      globalVoice={globalVoice}
      enabledProviders={enabledProviders}
      onChange={setDraft}
    />
  )}
</Drawer>
```

`LanguageOverrideFields` uses the language, credential source, conditional pool/custom credentials, model, and voice controls moved from Task 2’s `TtsLanguageOverrideRow`; bind each change to `{ ...value, changedField }` instead of persisting until Save. Display inherited empty fields with explicit summary copy such as `Uses default model` and `Uses default voice`. Keep duplicate validation inline and disable Save while duplicate or language is empty.

- [x] **Step 6: Verify all Speech behavior**

Run: `npm test -- entrypoints/options/sections/__tests__/SpeechSection.test.tsx ui/__tests__/Drawer.test.tsx lib/__tests__/ttsResolve.test.ts lib/__tests__/listTtsVoices.test.ts lib/__tests__/providerTts.test.ts`

Expected: PASS.

Run: `npm run compile && npm run lint`

Expected: PASS.

- [x] **Step 7: Checkpoint commit if explicitly authorized**

```bash
git add entrypoints/options/sections/SpeechSection.tsx entrypoints/options/sections/speech entrypoints/options/sections/__tests__/SpeechSection.test.tsx
git commit -m "feat(options): simplify Speech configuration flow"
```

---

### Task 6: Speech phase quality gate

**Files:**
- Verify only; fix failures in the files changed by Tasks 1-5.

**Interfaces:**
- Produces: a shippable Speech tab with Advanced, PDF, and runtime behavior unchanged.

- [x] **Step 1: Run focused option tests**

Run: `npm test -- entrypoints/options/sections/__tests__/SpeechSection.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.jumpNav.test.tsx entrypoints/options/lib/__tests__/settingsTabs.test.ts`

Expected: PASS.

- [x] **Step 2: Run full static and test gates**

Run: `npm run compile`

Expected: PASS.

Run: `npm run lint`

Expected: PASS.

Run: `npm test`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [x] **Step 3: Manually inspect keyboard and narrow-screen behavior**

Run: `npm run dev`

Verify:
- Arrow navigation reaches Speech in the correct Media order.
- `?section=speech` opens Speech.
- Tab and Shift+Tab traverse visible controls in logical order.
- Escape closes the language override drawer and focus remains usable.
- At widths below 600px and 450px, the sidebar and Speech controls do not overflow.
- Disabling Speech disables all dependent native controls.

- [x] **Step 4: Review the diff for scope and schema stability**

Run: `git diff --check`

Run: `git diff -- types/config.ts stores/settingsStore.ts services lib/tts entrypoints/options`

Expected: no changes to TTS setting names, enum values, background message names, or resolver semantics.

- [x] **Step 5: Update Beads**

After all gates pass:

```bash
bd close AnyLLMTranslate-5gn.1 --reason="Speech promoted to a tested Media settings tab with preserved TTS semantics"
```

- [x] **Step 6: Final phase commit if explicitly authorized and changes remain uncommitted**

```bash
git add entrypoints/options docs/superpowers/plans/2026-09-12-settings-speech-tab.md
git commit -m "feat(options): promote Speech to Media settings"
```
