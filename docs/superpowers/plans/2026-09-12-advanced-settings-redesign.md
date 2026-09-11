# Advanced Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the remaining Advanced tab into five understandable, accessible destinations with explicit navigation, progressive disclosure, focused components, and unchanged settings semantics.

**Architecture:** After Speech and PDF have moved to Media, characterize all remaining controls and extract one owner per workflow: Translation engine, Performance, Website compatibility, Data and recovery, and Diagnostics. Finish by replacing status chips with a neutral section navigator and reducing `AdvancedSection` to composition plus the full-reset flow.

**Tech Stack:** React 19, TypeScript 5.9, Zustand 5, Tailwind CSS 4, Lucide React, Vitest 3, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-12-advanced-settings-redesign-design.md`

## Global Constraints

- Prerequisites: complete `docs/superpowers/plans/2026-09-12-settings-speech-tab.md` and `docs/superpowers/plans/2026-09-12-settings-pdf-tab.md`.
- Preserve every remaining `ExtensionSettings` key, default, validation range, backup format, and runtime meaning; no storage migration.
- Keep `DEFAULT_SYSTEM_PROMPT_TEMPLATE`, prompt variables, backup encryption, import merge/replace, pre-import snapshot, cache clearing, and reset semantics unchanged.
- Clear cache moves to Performance and retains confirmation; only full reset remains in the Danger Zone.
- Use existing UI primitives and dependencies; add no package.
- Preserve existing comments when moving code.
- Do not commit or push unless the user explicitly grants authority. If authority is granted, use the repository-required Devin commit footer.

---

### Task 1: Characterize all remaining Advanced controls

**Files:**
- Create: `entrypoints/options/sections/__tests__/AdvancedSection.settings.test.tsx`
- Modify only if required for stable accessible labels: `entrypoints/options/sections/AdvancedSection.tsx`
- Reference: `entrypoints/options/sections/AdvancedSection.tsx` after Speech/PDF removal
- Reference: `types/config.ts:678-768,990-1007`

**Interfaces:**
- Consumes: `AdvancedSection`, `DEFAULT_SETTINGS`, settings store, cache statistics mock, and ToastProvider.
- Produces: baseline assertions for prompt, behavior, context, performance, compatibility, debug, cache confirmation, and reset.

- [ ] **Step 1: Add a shared render harness**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '@/types/config';
import { DEFAULT_SYSTEM_PROMPT_TEMPLATE } from '@/services/base';
import { useSettingsStore } from '@/stores/settingsStore';
import { ToastProvider } from '@/ui/ToastProvider';
import { AdvancedSection } from '../AdvancedSection';

const cacheStats = vi.hoisted(() => ({
  entryCount: 12,
  totalSizeBytes: 2048,
  sizeMb: 0.002,
  sizeLabel: '2 KB',
  loading: false,
  refresh: vi.fn(),
}));

vi.mock('@/entrypoints/options/hooks/useCacheStats', () => ({ useCacheStats: () => cacheStats }));

function renderAdvanced(overrides: Partial<ExtensionSettings> = {}) {
  const updateSettings = vi.fn();
  const resetToDefaults = vi.fn();
  useSettingsStore.setState({
    ...DEFAULT_SETTINGS,
    ...overrides,
    isLoaded: true,
    updateSettings,
    resetToDefaults,
  } as never);
  render(<ToastProvider><AdvancedSection /></ToastProvider>);
  return { updateSettings, resetToDefaults };
}
```

- [ ] **Step 2: Characterize prompt editing and reset**

```tsx
it('commits a valid prompt on blur and resets to the built-in template', () => {
  const { updateSettings } = renderAdvanced();
  const prompt = screen.getByLabelText(/custom prompt template/i);
  fireEvent.change(prompt, { target: { value: 'Translate to {{targetLanguage}}.' } });
  fireEvent.blur(prompt);
  expect(updateSettings).toHaveBeenCalledWith({
    customSystemPrompt: 'Translate to {{targetLanguage}}.',
  });

  fireEvent.click(screen.getByRole('button', { name: /reset to default/i }));
  expect(updateSettings).toHaveBeenCalledWith({ customSystemPrompt: null });
  expect(prompt).toHaveValue(DEFAULT_SYSTEM_PROMPT_TEMPLATE);
});
```

- [ ] **Step 3: Characterize behavior and context dependencies**

```tsx
it('persists translation behavior toggles through their existing keys', () => {
  const { updateSettings } = renderAdvanced();
  fireEvent.click(screen.getByRole('switch', { name: /streaming translation/i }));
  expect(updateSettings).toHaveBeenCalledWith({ enableStreamingTranslation: false });
  fireEvent.click(screen.getByRole('switch', { name: /source-language detection/i }));
  expect(updateSettings).toHaveBeenCalledWith({ enableSourceLanguageDetection: false });
});

it('disables category controls until context awareness is enabled', () => {
  renderAdvanced({ enableContextAwareTranslation: false });
  expect(screen.getByRole('switch', { name: /page category detection/i })).toBeDisabled();
  expect(screen.queryByLabelText(/detection mode/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 4: Characterize performance validation and cache confirmation**

```tsx
it('does not persist an invalid cache lifetime', () => {
  const { updateSettings } = renderAdvanced();
  const ttl = screen.getByLabelText(/cache ttl/i);
  fireEvent.change(ttl, { target: { value: '0' } });
  fireEvent.blur(ttl);
  expect(screen.getByText(/between 1 and 365 days/i)).toBeInTheDocument();
  expect(updateSettings).not.toHaveBeenCalledWith({ cacheTTLDays: 0 });
});

it('confirms cache clearing and keeps configuration', () => {
  renderAdvanced();
  fireEvent.click(screen.getByRole('button', { name: /^clear cache$/i }));
  expect(screen.getByRole('dialog', { name: /clear translation cache/i })).toBeInTheDocument();
  expect(screen.getByText(/settings, dictionary, and site rules are kept/i)).toBeInTheDocument();
});
```

- [ ] **Step 5: Characterize compatibility, debug, and reset**

```tsx
it('applies the selected page scope preset and keeps low-level settings available', () => {
  const { updateSettings } = renderAdvanced();
  fireEvent.change(screen.getByLabelText(/page scope preset/i), {
    target: { value: 'classic' },
  });
  expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({
    enableStreamingTranslation: false,
  }));
  expect(screen.getByRole('switch', { name: /walk open shadow dom/i })).toBeInTheDocument();
});

it('requires confirmation before resetting all settings', () => {
  const { resetToDefaults } = renderAdvanced();
  fireEvent.click(screen.getByRole('button', { name: /reset everything/i }));
  expect(resetToDefaults).not.toHaveBeenCalled();
  const dialog = screen.getByRole('dialog', { name: /reset all settings/i });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Reset everything' }));
  expect(resetToDefaults).toHaveBeenCalledOnce();
});
```

- [ ] **Step 6: Run the baseline suites**

Run: `npm test -- entrypoints/options/sections/__tests__/AdvancedSection.settings.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.jumpNav.test.tsx entrypoints/options/lib/__tests__/scrollToAdvancedSection.test.ts`

Expected: PASS against the post-Speech/PDF Advanced page. If a label changed only because the approved Speech/PDF phases removed neighboring content, update the accessible query rather than weakening behavior assertions.

- [ ] **Step 7: Checkpoint commit if explicitly authorized**

```bash
git add entrypoints/options/sections/__tests__/AdvancedSection.settings.test.tsx
git commit -m "test(options): characterize advanced settings"
```

---

### Task 2: Extract Translation engine ownership

**Files:**
- Create: `entrypoints/options/sections/advanced/TranslationEngineCard.tsx`
- Create: `entrypoints/options/sections/advanced/__tests__/TranslationEngineCard.test.tsx`
- Modify: `entrypoints/options/sections/AdvancedSection.tsx` at prompt, quality, and context blocks
- Test: `entrypoints/options/sections/__tests__/AdvancedSection.settings.test.tsx`

**Interfaces:**
- Consumes: settings store, `DEFAULT_SYSTEM_PROMPT_TEMPLATE`, prompt validation, page behavior toggles, and context controls.
- Produces: `TranslationEngineCard(): JSX.Element`, owning its deferred prompt draft and all translation/context updates.

- [ ] **Step 1: Write failing focused tests**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@/types/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { TranslationEngineCard } from '../TranslationEngineCard';

it('summarizes the default prompt and keeps its editor collapsed', () => {
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, updateSettings: vi.fn() } as never);
  render(<TranslationEngineCard />);
  expect(screen.getByText('Using default')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /system prompt/i }))
    .toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByLabelText(/custom prompt template/i)).not.toBeInTheDocument();
});

it('shows Customized while keeping the prompt discoverable', () => {
  useSettingsStore.setState({
    ...DEFAULT_SETTINGS,
    customSystemPrompt: 'Translate to {{targetLanguage}}.',
    updateSettings: vi.fn(),
  } as never);
  render(<TranslationEngineCard />);
  expect(screen.getByText('Customized')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /system prompt/i }));
  expect(screen.getByLabelText(/custom prompt template/i))
    .toHaveValue('Translate to {{targetLanguage}}.');
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- entrypoints/options/sections/advanced/__tests__/TranslationEngineCard.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Move prompt state and editor into the card**

The component owns the deferred field so storage synchronization cannot replace text while typing:

```tsx
export function TranslationEngineCard() {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const promptField = useDeferredCommit(
    settings.customSystemPrompt ?? DEFAULT_SYSTEM_PROMPT_TEMPLATE,
    (customSystemPrompt) => updateSettings({ customSystemPrompt }),
  );
  const customized = promptField.value !== DEFAULT_SYSTEM_PROMPT_TEMPLATE;
  const validation = promptField.value ? validatePromptTemplate(promptField.value) : null;

  return (
    <Card
      variant="bordered"
      title="Translation engine"
      description="Prompting, output behavior, reliability, and page context."
      icon={<BrainCircuit className="h-3.5 w-3.5" />}
      headerExtra={<Badge variant={customized ? 'info' : 'success'}>
        {customized ? 'Customized' : 'Using default'}
      </Badge>}
    >
      <div className="space-y-6">
        <AdvancedDisclosure
          label="System prompt"
          idPrefix="translation-engine-prompt"
          defaultExpanded={customized}
        >
          <PromptEditor
            field={promptField}
            validation={validation}
            onReset={() => {
              promptField.adopt(DEFAULT_SYSTEM_PROMPT_TEMPLATE);
              updateSettings({ customSystemPrompt: null });
            }}
          />
        </AdvancedDisclosure>
        <TranslationBehavior settings={settings} updateSettings={updateSettings} />
        <ContextAwareness settings={settings} updateSettings={updateSettings} />
      </div>
    </Card>
  );
}
```

Implement `PromptEditor`, `TranslationBehavior`, and `ContextAwareness` as private functions in this file unless one exceeds roughly 150 lines. Move the exact variable insertion behavior and validation warning list; do not change supported prompt tokens.

- [ ] **Step 4: Group only the approved controls**

Translation behavior contains selection dictionary, rich translate, streaming, source-language detection, failure cache, and web resume. Context contains context-aware translation, category detection, and detection mode. Do not move request budgets, adaptive batching, or DOM controls into this card.

Use outcome-oriented descriptions, including `Uses one additional AI request` for category detection.

- [ ] **Step 5: Replace old blocks in Advanced**

```tsx
<div id={ADVANCED_SECTION_IDS.translation} tabIndex={-1} className={SECTION_ANCHOR_CLASS}>
  <TranslationEngineCard />
</div>
```

Remove parent prompt draft, prompt validation, variable insertion helper, and now-unused imports only after focused tests pass.

- [ ] **Step 6: Verify extraction**

Run: `npm test -- entrypoints/options/sections/advanced/__tests__/TranslationEngineCard.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.settings.test.tsx`

Expected: PASS.

Run: `npm run compile`

Expected: PASS.

- [ ] **Step 7: Checkpoint commit if explicitly authorized**

```bash
git add entrypoints/options/sections/AdvancedSection.tsx entrypoints/options/sections/advanced/TranslationEngineCard.tsx entrypoints/options/sections/advanced/__tests__/TranslationEngineCard.test.tsx
git commit -m "refactor(options): extract translation engine settings"
```

---

### Task 3: Extract Performance and cache maintenance

**Files:**
- Create: `entrypoints/options/sections/advanced/PerformanceCard.tsx`
- Create: `entrypoints/options/sections/advanced/__tests__/PerformanceCard.test.tsx`
- Modify: `entrypoints/options/sections/AdvancedSection.tsx` at performance, cache modal, and former cache DangerAction
- Test: `entrypoints/options/sections/__tests__/AdvancedSection.settings.test.tsx`

**Interfaces:**
- Consumes: `useCacheStats`, `useDeferredCommit`, settings store, toast provider, `CLEAR_CACHE` runtime message.
- Produces: `PerformanceCard(): JSX.Element`, owning cache statistics, validated drafts, clear status, and clear confirmation.

- [ ] **Step 1: Write failing tests for primary and custom controls**

```tsx
it('shows cache health and common limits before custom tuning', () => {
  renderPerformance();
  expect(screen.getByText(/12 entries/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/cache lifetime/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/provider requests per minute/i)).toBeInTheDocument();
  const disclosure = screen.getByRole('button', { name: /custom performance tuning/i });
  expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByLabelText(/maximum pieces per request/i)).not.toBeInTheDocument();
});

it('keeps cache clearing in Performance behind confirmation', async () => {
  renderPerformance();
  fireEvent.click(screen.getByRole('button', { name: /^clear cache$/i }));
  expect(screen.getByRole('dialog', { name: /clear translation cache/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear cache' }));
  await waitFor(() => expect(chrome.runtime.sendMessage)
    .toHaveBeenCalledWith({ action: 'CLEAR_CACHE' }));
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- entrypoints/options/sections/advanced/__tests__/PerformanceCard.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Move cache and common limit ownership**

Move these validated deferred fields into `PerformanceCard`:

```tsx
const ttl = useDeferredCommit(settings.cacheTTLDays, (cacheTTLDays) => updateSettings({ cacheTTLDays }));
const maxCache = useDeferredCommit(settings.maxCacheSizeMB, (maxCacheSizeMB) => updateSettings({ maxCacheSizeMB }));
const maxRpm = useDeferredCommit(settings.maxRpm ?? 0, (maxRpm) => updateSettings({ maxRpm }));
```

Keep exact ranges:

- Cache lifetime: integer or numeric value from 1 through 365 days according to current input semantics.
- Cache size: 10 through 1000 MB.
- Provider RPM: integer from 0 through 600, where 0 is unlimited.

Use labels **Cache lifetime**, **Storage limit**, and **Provider requests per minute**; retain units and defaults in hints.

- [ ] **Step 4: Move specialist budgets into one collapsed disclosure**

Define a private typed numeric field:

```tsx
interface NumberDraftFieldProps {
  id: string;
  label: string;
  description: string;
  hint: string;
  min: number;
  max: number;
  field: UseDeferredCommitResult<number>;
  onBlur?: () => void;
  error?: string;
}

function NumberDraftField({
  id, label, description, hint, min, max, field, onBlur = field.commit, error,
}: NumberDraftFieldProps) {
  return (
    <FieldGroup label={label} description={description} htmlFor={id}>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={field.value}
        onChange={(event) => field.setValue(Number(event.target.value))}
        onBlur={onBlur}
        hint={hint}
        error={error}
      />
    </FieldGroup>
  );
}
```

Use it inside the disclosure with the current ranges and validation wrappers:

```tsx
<AdvancedDisclosure label="Custom performance tuning" idPrefix="advanced-performance-custom">
  <div className="grid gap-5 sm:grid-cols-2">
    <NumberDraftField id="max-batch-chars-input" label="Maximum batch characters" description="Largest text batch sent in one translation request." hint="500–10000 · default 2000" min={500} max={10000} field={maxBatch} onBlur={handleMaxBatchBlur} error={maxBatchError} />
    <NumberDraftField id="max-text-group-input" label="Maximum pieces per request" description="Paragraphs grouped into one request; 0 removes this limit." hint="0–50 · default 4" min={0} max={50} field={maxGroup} />
    <NumberDraftField id="max-text-length-input" label="Maximum characters per request" description="Total characters grouped into one request; 0 removes this limit." hint="0–20000 · default 2000" min={0} max={20000} field={maxLength} />
    <NumberDraftField id="failure-ttl-input" label="Failure memory lifetime" description="How long a failed request is remembered before retry." hint="1–1440 min · default 120" min={1} max={1440} field={failureTtl} />
  </div>
  <Toggle
    id="adaptive-batching-toggle"
    checked={settings.enableAdaptiveBatching}
    onChange={(enableAdaptiveBatching) => updateSettings({ enableAdaptiveBatching })}
    label="Adjust request size automatically"
    description="Adapts request size from recent provider latency; fixed limits above still cap requests."
  />
</AdvancedDisclosure>
```

Preserve current limits and blur-commit behavior for every field. Do not persist invalid draft values.

- [ ] **Step 5: Move clear-cache confirmation into Performance**

Move `clearStatus`, `showClearCacheModal`, cache refresh, runtime message, toast feedback, and modal from Advanced. Render one secondary Clear cache button inside the card. Remove the cache DangerAction and its special clipped-ring CSS constant from Advanced.

- [ ] **Step 6: Replace the old performance block**

```tsx
<div id={ADVANCED_SECTION_IDS.performance} tabIndex={-1} className={SECTION_ANCHOR_CLASS}>
  <PerformanceCard />
</div>
```

- [ ] **Step 7: Verify performance behavior**

Run: `npm test -- entrypoints/options/sections/advanced/__tests__/PerformanceCard.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.settings.test.tsx`

Expected: PASS.

Run: `npm run compile`

Expected: PASS.

- [ ] **Step 8: Checkpoint commit if explicitly authorized**

```bash
git add entrypoints/options/sections/AdvancedSection.tsx entrypoints/options/sections/advanced/PerformanceCard.tsx entrypoints/options/sections/advanced/__tests__/PerformanceCard.test.tsx
git commit -m "refactor(options): move cache into Performance"
```

---

### Task 4: Extract Website compatibility and clarify labels

**Files:**
- Create: `entrypoints/options/sections/advanced/WebsiteCompatibilityCard.tsx`
- Create: `entrypoints/options/sections/advanced/__tests__/WebsiteCompatibilityCard.test.tsx`
- Modify: `entrypoints/options/sections/AdvancedSection.tsx` at page-walk controls
- Reference: `lib/pageScopePreset.ts`

**Interfaces:**
- Consumes: `detectPageScopePreset`, `applyPageScopePreset`, `PAGE_SCOPE_PRESET_OPTIONS`, and related settings keys.
- Produces: `WebsiteCompatibilityCard(): JSX.Element`.

- [ ] **Step 1: Write failing preset and disclosure tests**

```tsx
it('marks Balanced as recommended and reports mixed values as Custom', () => {
  renderCompatibility(DEFAULT_SETTINGS);
  expect(screen.getByLabelText(/page coverage preset/i)).toHaveValue('balanced');
  expect(screen.getByText(/recommended/i)).toBeInTheDocument();

  cleanup();
  renderCompatibility({ ...DEFAULT_SETTINGS, enableAsideCaps: false, enableBodyTagWhitelist: true });
  expect(screen.getByLabelText(/page coverage preset/i)).toHaveValue('custom');
});

it('keeps individual compatibility controls collapsed by default', () => {
  renderCompatibility(DEFAULT_SETTINGS);
  const trigger = screen.getByRole('button', { name: /individual compatibility controls/i });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(trigger);
  expect(screen.getByRole('switch', { name: /translate text inside web components/i }))
    .toBeInTheDocument();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- entrypoints/options/sections/advanced/__tests__/WebsiteCompatibilityCard.test.tsx`

Expected: FAIL because the component does not exist and current labels are technical.

- [ ] **Step 3: Implement preset-first presentation**

Compute the selected value once:

```tsx
const currentPreset = detectPageScopePreset({
  enableStreamingTranslation: settings.enableStreamingTranslation,
  enableAsideCaps: settings.enableAsideCaps,
  enableBodyTagWhitelist: settings.enableBodyTagWhitelist,
  enableSmartExcludes: settings.enableSmartExcludes,
});
```

Render a select labeled **Page coverage preset** with existing preset values plus `custom`. Keep `custom` non-selectable as an action: selecting it does nothing. Show the selected preset description directly below and add a Recommended badge when Balanced is selected.

- [ ] **Step 4: Move individual settings behind disclosure with outcome labels**

Use these primary labels while preserving keys:

| Setting key | Primary label |
|---|---|
| `enableBodyTagWhitelist` | Focus on main page content |
| `enableAsideCaps` | Limit sidebar translation |
| `enableShadowDomWalk` | Translate text inside web components |
| `enableLayoutContainment` | Protect card and grid layouts |
| `cacheKeyIncludesModel` | Keep cache separate by model |
| `enableTranslationQualityCheck` | Retry obvious translation mistakes |

Secondary descriptions may mention BODY tags, open Shadow DOM, containment, cache keys, and self-check prompts for technical accuracy.

- [ ] **Step 5: Replace the old page-walk block**

```tsx
<div id={ADVANCED_SECTION_IDS.compatibility} tabIndex={-1} className={SECTION_ANCHOR_CLASS}>
  <WebsiteCompatibilityCard />
</div>
```

Remove `enableAdaptiveBatching` from this block because Task 3 owns it.

- [ ] **Step 6: Verify compatibility behavior**

Run: `npm test -- entrypoints/options/sections/advanced/__tests__/WebsiteCompatibilityCard.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.settings.test.tsx lib/__tests__/pageScopePreset.test.ts`

Expected: PASS.

Run: `npm run compile`

Expected: PASS.

- [ ] **Step 7: Checkpoint commit if explicitly authorized**

```bash
git add entrypoints/options/sections/AdvancedSection.tsx entrypoints/options/sections/advanced/WebsiteCompatibilityCard.tsx entrypoints/options/sections/advanced/__tests__/WebsiteCompatibilityCard.test.tsx
git commit -m "refactor(options): clarify website compatibility settings"
```

---

### Task 5: Extract Data and recovery with existing backup semantics

**Files:**
- Create: `entrypoints/options/sections/advanced/DataRecoveryCard.tsx`
- Create: `entrypoints/options/sections/advanced/__tests__/DataRecoveryCard.test.tsx`
- Modify: `entrypoints/options/sections/AdvancedSection.tsx` at Data Portability and backup dialogs
- Modify: `entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx`
- Reference: `entrypoints/options/components/BackupDialogs.tsx`
- Reference: `lib/backup.ts`
- Reference: `lib/config.ts` pre-import snapshot functions

**Interfaces:**
- Consumes: settings store backup actions, backup library, dialogs, ToastProvider.
- Produces: `DataRecoveryCard(props?: { onRequestResetExport?: () => void }): JSX.Element`, owning every export/import/restore state and dialog.

- [ ] **Step 1: Create focused tests by moving the existing backup suite**

Copy all cases from `AdvancedSection.backup.test.tsx` to `advanced/__tests__/DataRecoveryCard.test.tsx`. Change only the render helper:

```tsx
function renderDataRecovery() {
  return render(<ToastProvider><DataRecoveryCard /></ToastProvider>);
}
```

Add this hierarchy assertion:

```tsx
it('recommends encrypted backup when API keys exist', async () => {
  storeWith({ providers: [providerWithApiKey] });
  renderDataRecovery();
  fireEvent.click(screen.getByRole('button', { name: /export backup/i }));
  expect(await screen.findByRole('radio', { name: /encrypted backup/i }))
    .toBeChecked();
  expect(screen.getByText(/api keys/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- entrypoints/options/sections/advanced/__tests__/DataRecoveryCard.test.tsx`

Expected: FAIL because `DataRecoveryCard` does not exist.

- [ ] **Step 3: Move download and backup workflow ownership**

Move `downloadBlob`, export chooser/password state, import password/metadata state, snapshot state, file input ref, and handlers from Advanced into the component. Preserve handler signatures and cryptography calls exactly.

The component starts with the existing selectors and moves every related state value and handler from `AdvancedSection.tsx:850-1113` into the same scope:

```tsx
export function DataRecoveryCard() {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const replaceSettings = useSettingsStore((state) => state.replaceSettings);
  const restoreSettings = useSettingsStore((state) => state.restoreSettings);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { success: showSuccess, error: showError, successWithAction } = useToast();
  const [showExportChooser, setShowExportChooser] = useState(false);
  const [showExportPassword, setShowExportPassword] = useState(false);
  const [showImportPassword, setShowImportPassword] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [pendingEncryptedText, setPendingEncryptedText] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [importMeta, setImportMeta] = useState<ImportState | null>(null);
```

Define the state type above the component:

```ts
interface ImportState {
  recognized: Record<string, unknown>;
  ignored: string[];
  source: 'plain' | 'encrypted';
  mergeImpact: ImportImpact;
  replaceImpact: ImportImpact;
}
```

After the existing handlers, move the complete Data Portability card tree from original lines 2106-2204 and the five backup/restore dialog branches from original lines 2378-2459. Change only the card title to `Data and recovery`, the description to `Back up, import, or restore your settings.`, and action labels to `Export backup` and `Import backup`. Keep the existing action markup and dialog props so focused tests can interact with the real controls.

- [ ] **Step 4: Preserve no-mutation-before-confirmation guarantees**

Confirm in code and tests:

- File parse/decryption only sets `importMeta`.
- `savePreImportSnapshot` runs before merge or replace.
- Merge calls `updateSettings(recognized)`.
- Replace calls `replaceSettings(recognized)`.
- Undo/restore calls `restoreSettings(snapshot)` and consumes the snapshot.
- Failed parse, decryption, or snapshot load never replaces current settings.

- [ ] **Step 5: Replace the old Advanced block**

```tsx
<div id={ADVANCED_SECTION_IDS.data} tabIndex={-1} className={SECTION_ANCHOR_CLASS}>
  <DataRecoveryCard />
</div>
```

Remove backup state and dialogs from Advanced only after the focused suite passes.

- [ ] **Step 6: Verify and retire the old test location**

Run: `npm test -- entrypoints/options/sections/advanced/__tests__/DataRecoveryCard.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx`

Expected: both pass during transition. Then remove `AdvancedSection.backup.test.tsx` because every case exists in the focused suite, and rerun:

Run: `npm test -- entrypoints/options/sections/advanced/__tests__/DataRecoveryCard.test.tsx`

Expected: PASS.

- [ ] **Step 7: Checkpoint commit if explicitly authorized**

```bash
git add entrypoints/options/sections/AdvancedSection.tsx entrypoints/options/sections/advanced/DataRecoveryCard.tsx entrypoints/options/sections/advanced/__tests__/DataRecoveryCard.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx
git commit -m "refactor(options): isolate data recovery workflows"
```

---

### Task 6: Extract Diagnostics and reduce Advanced to composition

**Files:**
- Create: `entrypoints/options/sections/advanced/DiagnosticsCard.tsx`
- Create: `entrypoints/options/sections/advanced/__tests__/DiagnosticsCard.test.tsx`
- Modify: `entrypoints/options/sections/AdvancedSection.tsx`
- Test: `entrypoints/options/sections/__tests__/AdvancedSection.settings.test.tsx`

**Interfaces:**
- Produces: `DiagnosticsCard(): JSX.Element`.
- Leaves `AdvancedSection` owning only section composition, reset confirmation, and navigator integration.

- [ ] **Step 1: Write failing diagnostics test**

```tsx
it('explains debug logging and persists its state', () => {
  const updateSettings = vi.fn();
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, debugMode: false, updateSettings } as never);
  render(<DiagnosticsCard />);
  expect(screen.getByText(/browser developer tools/i)).toBeInTheDocument();
  expect(screen.getByText(/turn it off after troubleshooting/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('switch', { name: /debug logging/i }));
  expect(updateSettings).toHaveBeenCalledWith({ debugMode: true });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- entrypoints/options/sections/advanced/__tests__/DiagnosticsCard.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the compact diagnostics card**

```tsx
export function DiagnosticsCard() {
  const debugMode = useSettingsStore((state) => state.debugMode);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  return (
    <Card
      variant="bordered"
      title="Diagnostics"
      description="Logging for troubleshooting page and translation problems."
      icon={<Bug className="h-3.5 w-3.5" />}
      headerExtra={debugMode ? <Badge variant="warning">Logging on</Badge> : undefined}
    >
      <Toggle
        id="debug-mode-toggle"
        checked={debugMode}
        onChange={(next) => updateSettings({ debugMode: next })}
        label="Debug logging"
        description="Writes verbose background and page logs to browser Developer Tools. It can be noisy; turn it off after troubleshooting."
      />
    </Card>
  );
}
```

- [ ] **Step 4: Compose the five cards in Advanced**

`AdvancedSection` should read only `resetToDefaults` and toast state needed for full reset. Define its anchor locally:

```tsx
function AdvancedAnchor({
  id,
  index,
  children,
}: {
  id: AdvancedSectionId;
  index: number;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      tabIndex={-1}
      className={SECTION_ANCHOR_CLASS}
      style={stagger(index)}
    >
      {children}
    </div>
  );
}
```

Compose the screen and concrete reset flow:

```tsx
export function AdvancedSection() {
  const resetToDefaults = useSettingsStore((state) => state.resetToDefaults);
  const [showResetModal, setShowResetModal] = useState(false);
  const { success } = useToast();

  const handleReset = () => {
    resetToDefaults();
    setShowResetModal(false);
    success('All settings reset to defaults');
  };

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Advanced"
        description="Expert translation behavior, performance, compatibility, and recovery."
        icon={<Wrench className="h-4 w-4" />}
        accentColor="zinc"
      />
      <AdvancedSectionNav />
      <div className="space-y-4">
        <AdvancedAnchor id={ADVANCED_SECTION_IDS.translation} index={0}><TranslationEngineCard /></AdvancedAnchor>
        <AdvancedAnchor id={ADVANCED_SECTION_IDS.performance} index={1}><PerformanceCard /></AdvancedAnchor>
        <AdvancedAnchor id={ADVANCED_SECTION_IDS.compatibility} index={2}><WebsiteCompatibilityCard /></AdvancedAnchor>
        <AdvancedAnchor id={ADVANCED_SECTION_IDS.data} index={3}><DataRecoveryCard /></AdvancedAnchor>
        <AdvancedAnchor id={ADVANCED_SECTION_IDS.diagnostics} index={4}><DiagnosticsCard /></AdvancedAnchor>
        <div className="animate-stagger" style={stagger(5)}>
          <DangerZone description="Reset removes saved configuration and cannot be undone.">
            <DangerAction
              severity="critical"
              icon={<ShieldAlert />}
              title="Reset all settings"
              description="Restores factory defaults and removes provider keys, dictionary entries, site rules, themes, and prompts."
              meta={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => scrollToAdvancedSection(ADVANCED_SECTION_IDS.data)}
                >
                  Export backup first
                </Button>
              }
              action={
                <Button
                  id="reset-all-settings-btn"
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowResetModal(true)}
                  icon={<RotateCcw className="h-3.5 w-3.5" />}
                >
                  Reset everything
                </Button>
              }
            />
          </DangerZone>
        </div>
      </div>
      {showResetModal && (
        <Modal
          title="Reset all settings?"
          message="Everything returns to factory defaults. Provider keys, dictionary entries, site rules, themes, prompts, and performance tuning are removed. This cannot be undone."
          variant="danger"
          confirmLabel="Reset everything"
          cancelLabel="Keep settings"
          onConfirm={handleReset}
          onCancel={() => setShowResetModal(false)}
        />
      )}
    </div>
  );
}
```

The **Export backup first** action only jumps to `ADVANCED_SECTION_IDS.data`; it must not reset or start an export automatically.

- [ ] **Step 5: Verify thin composition and workflows**

Run: `npm test -- entrypoints/options/sections/advanced/__tests__ entrypoints/options/sections/__tests__/AdvancedSection.settings.test.tsx`

Expected: PASS.

Run: `npm run compile`

Expected: PASS with no workflow imports left in `AdvancedSection.tsx`.

- [ ] **Step 6: Confirm the file boundary**

Run: `wc -l entrypoints/options/sections/AdvancedSection.tsx`

Expected: approximately 250 lines or fewer. If reset confirmation copy makes it slightly larger, keep it readable rather than extracting a one-use trivial wrapper; it must still be a composition component.

- [ ] **Step 7: Checkpoint commit if explicitly authorized**

```bash
git add entrypoints/options/sections/AdvancedSection.tsx entrypoints/options/sections/advanced/DiagnosticsCard.tsx entrypoints/options/sections/advanced/__tests__/DiagnosticsCard.test.tsx
git commit -m "refactor(options): make Advanced a composition screen"
```

---

### Task 7: Replace status chips with explicit section navigation

**Files:**
- Create: `entrypoints/options/sections/advanced/AdvancedSectionNav.tsx`
- Create: `entrypoints/options/sections/advanced/__tests__/AdvancedSectionNav.test.tsx`
- Modify: `entrypoints/options/lib/scrollToAdvancedSection.ts:1-14`
- Modify: `entrypoints/options/lib/__tests__/scrollToAdvancedSection.test.ts`
- Modify: `entrypoints/options/sections/__tests__/AdvancedSection.jumpNav.test.tsx`
- Modify: `entrypoints/options/sections/AdvancedSection.tsx`

**Interfaces:**
- Produces revised ids:
  - `ADVANCED_SECTION_IDS.translation`
  - `ADVANCED_SECTION_IDS.performance`
  - `ADVANCED_SECTION_IDS.compatibility`
  - `ADVANCED_SECTION_IDS.data`
  - `ADVANCED_SECTION_IDS.diagnostics`
- Consumes unchanged `scrollToAdvancedSection(sectionId): boolean` behavior.

- [ ] **Step 1: Rewrite the jump-navigation test for explicit destinations**

```tsx
const destinations = [
  ['Translation engine', ADVANCED_SECTION_IDS.translation],
  ['Performance', ADVANCED_SECTION_IDS.performance],
  ['Website compatibility', ADVANCED_SECTION_IDS.compatibility],
  ['Data and recovery', ADVANCED_SECTION_IDS.data],
  ['Diagnostics', ADVANCED_SECTION_IDS.diagnostics],
] as const;

it('renders explicit navigation for every Advanced destination', () => {
  renderAdvanced();
  const nav = screen.getByRole('navigation', { name: /advanced sections/i });
  for (const [label, id] of destinations) {
    expect(within(nav).getByRole('button', { name: label })).toBeInTheDocument();
    expect(document.getElementById(id)).toHaveAttribute('tabindex', '-1');
  }
});

it('jumps without changing settings', () => {
  const updateSettings = vi.fn();
  useSettingsStore.setState({ updateSettings });
  renderAdvanced();
  for (const [label, id] of destinations) {
    scrollToAdvancedSection.mockClear();
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(scrollToAdvancedSection).toHaveBeenCalledWith(id);
  }
  expect(updateSettings).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- entrypoints/options/sections/__tests__/AdvancedSection.jumpNav.test.tsx`

Expected: FAIL because the old status chips and ids remain.

- [ ] **Step 3: Replace the id map**

```ts
export const ADVANCED_SECTION_IDS = {
  translation: 'advanced-section-translation',
  performance: 'advanced-section-performance',
  compatibility: 'advanced-section-compatibility',
  data: 'advanced-section-data',
  diagnostics: 'advanced-section-diagnostics',
} as const;
```

Keep reduced-motion detection, `scrollIntoView`, focus with `preventScroll`, and temporary highlight behavior unchanged. Update pure helper tests to use the new ids.

- [ ] **Step 4: Implement neutral navigation**

```tsx
const ITEMS = [
  { id: ADVANCED_SECTION_IDS.translation, label: 'Translation engine', icon: BrainCircuit },
  { id: ADVANCED_SECTION_IDS.performance, label: 'Performance', icon: Gauge },
  { id: ADVANCED_SECTION_IDS.compatibility, label: 'Website compatibility', icon: Globe },
  { id: ADVANCED_SECTION_IDS.data, label: 'Data and recovery', icon: Database },
  { id: ADVANCED_SECTION_IDS.diagnostics, label: 'Diagnostics', icon: Bug },
] as const;

export function AdvancedSectionNav() {
  return (
    <nav
      aria-label="Advanced sections"
      className="sticky top-0 z-10 mb-4 -mx-1 overflow-x-auto px-1 py-2 backdrop-blur-md"
    >
      <div className="flex min-w-max gap-2 rounded-xl border border-white/10 bg-zinc-950/90 p-2">
        {ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => scrollToAdvancedSection(id)}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
```

Navigation color must not encode feature state. Card badges own all status communication.

- [ ] **Step 5: Verify navigation and reduced motion**

Run: `npm test -- entrypoints/options/sections/advanced/__tests__/AdvancedSectionNav.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.jumpNav.test.tsx entrypoints/options/lib/__tests__/scrollToAdvancedSection.test.ts`

Expected: PASS.

- [ ] **Step 6: Checkpoint commit if explicitly authorized**

```bash
git add entrypoints/options/lib/scrollToAdvancedSection.ts entrypoints/options/lib/__tests__/scrollToAdvancedSection.test.ts entrypoints/options/sections/advanced/AdvancedSectionNav.tsx entrypoints/options/sections/advanced/__tests__/AdvancedSectionNav.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.jumpNav.test.tsx entrypoints/options/sections/AdvancedSection.tsx
git commit -m "feat(options): add explicit Advanced section navigation"
```

---

### Task 8: Apply visual hierarchy and responsive refinements

**Files:**
- Modify: `entrypoints/options/sections/AdvancedSection.tsx`
- Modify: `entrypoints/options/sections/advanced/*.tsx`
- Modify only if utility classes cannot express required behavior: `entrypoints/options/style.css:201-304`
- Test: `entrypoints/options/sections/advanced/__tests__/*.test.tsx`

**Interfaces:**
- Consumes: the five-card structure and existing responsive settings shell.
- Produces: a calm neutral layout with readable text, limited severity color, stacked narrow layouts, and no nested scroll regions.

- [ ] **Step 1: Add structural accessibility assertions**

```tsx
it('uses one labeled section navigator and one heading for each destination', () => {
  renderAdvanced();
  expect(screen.getAllByRole('navigation', { name: /advanced sections/i })).toHaveLength(1);
  for (const name of [
    'Translation engine', 'Performance', 'Website compatibility',
    'Data and recovery', 'Diagnostics',
  ]) {
    expect(screen.getByRole('heading', { name })).toBeInTheDocument();
  }
});

it('does not place Clear cache in the Danger Zone', () => {
  renderAdvanced();
  const danger = screen.getByText('Danger Zone').closest('section');
  expect(danger).toBeTruthy();
  expect(within(danger as HTMLElement).queryByRole('button', { name: /clear cache/i }))
    .not.toBeInTheDocument();
  expect(within(danger as HTMLElement).getByRole('button', { name: /reset everything/i }))
    .toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests before final styling**

Run: `npm test -- entrypoints/options/sections/__tests__/AdvancedSection.settings.test.tsx entrypoints/options/sections/advanced/__tests__`

Expected: hierarchy tests PASS if Tasks 2-7 are complete. Capture this checkpoint before class-only changes.

- [ ] **Step 3: Normalize card and text hierarchy**

Apply these exact rules:

- Normal cards use `variant="bordered"` with no unique accent unless warning state requires it.
- Primary labels use existing `text-sm` or component defaults; avoid adding new `text-[11px]` body descriptions.
- Green, amber, and red appear only for success, caution, and destructive states.
- Independent long descriptions remain single-column.
- Two-column grids use `grid gap-4 sm:grid-cols-2` only for short paired fields/actions.
- Remove nested borders that do not indicate conditional state.
- Keep disclosure content spaced with `mt-4`/`space-y-4`, without independent scrolling.

- [ ] **Step 4: Confirm narrow-screen behavior in implementation**

The section navigator uses `overflow-x-auto` and `min-w-max`; card grids stack before 600px through `sm:` breakpoints. Do not add fixed widths. Keep primary recovery buttons `w-full sm:w-auto` when they share a row.

Use global CSS only if a sticky navigator needs a stable scrollbar treatment that cannot be represented by existing utilities. Do not alter sidebar breakpoints.

- [ ] **Step 5: Run focused tests and static checks**

Run: `npm test -- entrypoints/options/sections/__tests__/AdvancedSection.settings.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.jumpNav.test.tsx entrypoints/options/sections/advanced/__tests__ entrypoints/options/lib/__tests__/scrollToAdvancedSection.test.ts`

Expected: PASS.

Run: `npm run compile && npm run lint`

Expected: PASS.

- [ ] **Step 6: Checkpoint commit if explicitly authorized**

```bash
git add entrypoints/options/sections/AdvancedSection.tsx entrypoints/options/sections/advanced entrypoints/options/style.css
git commit -m "style(options): clarify Advanced settings hierarchy"
```

---

### Task 9: Complete the redesign quality gate

**Files:**
- Verify only; fix failures in files changed by this plan.
- Update: `docs/superpowers/specs/2026-09-12-advanced-settings-redesign-design.md` status after all acceptance criteria pass.

**Interfaces:**
- Produces: the complete approved Settings redesign across Speech, PDF, and Advanced.

- [ ] **Step 1: Run all focused Settings suites**

Run: `npm test -- entrypoints/options/sections/__tests__/SpeechSection.test.tsx entrypoints/options/sections/__tests__/PdfSection.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.settings.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.jumpNav.test.tsx entrypoints/options/sections/advanced/__tests__ entrypoints/options/sections/pdf/__tests__ entrypoints/options/lib/__tests__/settingsTabs.test.ts entrypoints/options/lib/__tests__/scrollToAdvancedSection.test.ts`

Expected: PASS.

- [ ] **Step 2: Run project quality gates**

Run: `npm run compile`

Expected: PASS.

Run: `npm run lint`

Expected: PASS.

Run: `npm test`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Perform manual Settings acceptance checks**

Run: `npm run dev`

Verify:
- Media order is Subtitles, Speech, PDF.
- `?section=speech`, `?section=pdf`, and every other valid id open correctly.
- Speech, PDF, and Advanced preserve values across tab switches and page reload.
- Advanced opens with specialist prompt, performance, and compatibility details collapsed appropriately.
- Every Advanced navigator button scrolls, focuses, and highlights the correct section.
- Reduced motion removes smooth scrolling.
- Clear cache appears in Performance only and retains confirmation.
- Data import changes nothing before confirmation; undo/restore remains usable.
- Only Reset all settings appears in the Danger Zone.
- Keyboard and narrow-screen behavior satisfy the spec at widths above and below 600px and 450px.

- [ ] **Step 4: Review diff and file boundaries**

Run: `git diff --check`

Run: `git status --short`

Run: `wc -l entrypoints/options/sections/AdvancedSection.tsx entrypoints/options/sections/SpeechSection.tsx entrypoints/options/sections/PdfSection.tsx`

Expected: no whitespace errors; Advanced is a small composition component; feature workflows live in their feature directories.

Run: `git diff -- types/config.ts stores/settingsStore.ts services entrypoints/options lib`

Expected: no unplanned schema, translation, TTS, PDF processing, encryption, cache, or reset semantic changes.

- [ ] **Step 5: Update approved spec status**

Change the spec status from `Approved for implementation planning` to `Implemented and verified` only after every quality gate and acceptance check passes.

- [ ] **Step 6: Close implementation and parent Beads issues**

```bash
bd close AnyLLMTranslate-5gn.3 --reason="Advanced decomposed and redesigned with explicit navigation and preserved settings semantics"
bd close AnyLLMTranslate-5gn --reason="Advanced Settings audit, Speech/PDF promotion, and Advanced redesign implemented and verified"
```

Do not close either issue while gates or acceptance checks are incomplete.

- [ ] **Step 7: Final commit if explicitly authorized and changes remain uncommitted**

```bash
git add entrypoints/options lib docs/superpowers/specs/2026-09-12-advanced-settings-redesign-design.md docs/superpowers/plans/2026-09-12-settings-speech-tab.md docs/superpowers/plans/2026-09-12-settings-pdf-tab.md docs/superpowers/plans/2026-09-12-advanced-settings-redesign.md
git commit -m "feat(options): redesign advanced settings experience"
```
