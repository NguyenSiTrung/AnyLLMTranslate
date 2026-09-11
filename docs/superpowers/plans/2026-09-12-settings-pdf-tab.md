# Settings PDF Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify PDF open behavior and the local layout-preserving bridge in a dedicated, status-first PDF tab under Media without changing PDF translation runtime semantics.

**Architecture:** Characterize the two existing Advanced PDF cards, add a pure hostname normalizer and chip editor, extract bridge status ownership into a focused hook, then compose one PDF screen. Extend the settings-tab registry created by the Speech phase and remove both legacy PDF blocks from Advanced only after the dedicated page passes the same behavior tests.

**Tech Stack:** React 19, TypeScript 5.9, Zustand 5, Tailwind CSS 4, Lucide React, Vitest 3, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-12-advanced-settings-redesign-design.md`

## Global Constraints

- Prerequisite: complete `docs/superpowers/plans/2026-09-12-settings-speech-tab.md`; this plan consumes `entrypoints/options/lib/settingsTabs.ts`.
- Preserve `PdfSettings`, `ScientificPdfSettings`, `SCIENTIFIC_PDF_HEALTH`, and all stored enum values exactly; no storage migration.
- Retain `ScientificPdfWizard` as the setup mechanism.
- Do not add an options-page PDF file picker or synthetic browser tab.
- Preserve the existing non-loopback privacy warning and provider credential behavior.
- Use existing UI primitives and dependencies; add no package.
- Do not remove existing comments while moving code.
- Do not commit or push unless the user explicitly grants authority. If authority is granted, use the repository-required Devin commit footer.

---

### Task 1: Characterize existing PDF settings behavior in Advanced

**Files:**
- Create: `entrypoints/options/sections/__tests__/AdvancedSection.pdf.test.tsx`
- Reference: `entrypoints/options/sections/AdvancedSection.tsx:1169-1214,1903-2104`
- Reference: `types/config.ts:521-556,840-857`

**Interfaces:**
- Consumes: current `AdvancedSection`, settings store, runtime health message, and `ScientificPdfWizard`.
- Produces: migration-safe UI regression coverage for the new `PdfSection`.

- [ ] **Step 1: Add the render harness and deterministic Chrome runtime mock**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '@/types/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { ToastProvider } from '@/ui/ToastProvider';
import { AdvancedSection } from '../AdvancedSection';

const sendMessage = vi.hoisted(() => vi.fn());

function renderPdf(overrides: Partial<ExtensionSettings> = {}) {
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

beforeEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ success: false, status: 'offline' });
  vi.stubGlobal('chrome', {
    runtime: { sendMessage, getURL: vi.fn((path: string) => path) },
    tabs: { create: vi.fn() },
  });
});
```

Include the same `useCacheStats` mock used by existing Advanced tests so PDF assertions do not depend on IndexedDB.

- [ ] **Step 2: Test open behavior persistence and deferred site text**

```tsx
it('persists PDF auto-open and open mode without replacing site exceptions', () => {
  const { updateSettings } = renderPdf({
    pdfSettings: {
      autoOpen: 'prompt',
      openMode: 'new-tab',
      neverAutoOpenSites: ['arxiv.org'],
    },
  });

  fireEvent.change(screen.getByLabelText(/auto-open mode/i), { target: { value: 'auto' } });
  expect(updateSettings).toHaveBeenCalledWith({
    pdfSettings: {
      autoOpen: 'auto',
      openMode: 'new-tab',
      neverAutoOpenSites: ['arxiv.org'],
    },
  });
});
```

- [ ] **Step 3: Test bridge states and non-loopback warning**

```tsx
it('shows offline for a configured bridge after a failed health check', async () => {
  renderPdf({
    scientificPdf: {
      enabled: true,
      serverUrl: 'http://127.0.0.1:17890',
      setupCompletedAt: '2026-09-01T00:00:00.000Z',
    },
  });
  expect(await screen.findByText('Offline')).toBeInTheDocument();
  expect(sendMessage).toHaveBeenCalledWith({ action: 'SCIENTIFIC_PDF_HEALTH' });
});

it('warns before using a non-loopback bridge', () => {
  renderPdf({
    scientificPdf: { enabled: true, serverUrl: 'https://pdf.example.test' },
  });
  expect(screen.getByText(/full pdf plus short-lived provider credentials/i))
    .toBeInTheDocument();
});
```

- [ ] **Step 4: Test wizard launch and refresh action**

```tsx
it('opens the setup wizard and can explicitly refresh bridge status', async () => {
  renderPdf();
  fireEvent.click(screen.getByRole('button', { name: /set up/i }));
  expect(screen.getByRole('dialog', { name: /set up scientific pdf/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /close/i }));
  await waitFor(() => expect(sendMessage).toHaveBeenCalled());
});
```

- [ ] **Step 5: Run the characterization suite**

Run: `npm test -- entrypoints/options/sections/__tests__/AdvancedSection.pdf.test.tsx`

Expected: PASS against the current two-card implementation. Correct accessible-name mismatches in the test only when they reflect current semantics; do not switch to CSS selectors.

- [ ] **Step 6: Checkpoint commit if explicitly authorized**

```bash
git add entrypoints/options/sections/__tests__/AdvancedSection.pdf.test.tsx
git commit -m "test(options): characterize PDF settings"
```

---

### Task 2: Add pure site-exception normalization and a chip editor

**Files:**
- Create: `lib/pdfSiteExceptions.ts`
- Create: `lib/__tests__/pdfSiteExceptions.test.ts`
- Create: `entrypoints/options/sections/pdf/PdfSiteExceptions.tsx`
- Create: `entrypoints/options/sections/pdf/__tests__/PdfSiteExceptions.test.tsx`

**Interfaces:**
- Produces:
  - `normalizePdfSiteException(input: string): string | null`
  - `addPdfSiteException(current: string[], input: string): string[]`
  - `PdfSiteExceptions(props: { value: string[]; disabled?: boolean; onChange: (value: string[]) => void }): JSX.Element`

- [ ] **Step 1: Write failing pure normalization tests**

```ts
import { describe, expect, it } from 'vitest';
import { addPdfSiteException, normalizePdfSiteException } from '../pdfSiteExceptions';

describe('pdfSiteExceptions', () => {
  it.each([
    ['arxiv.org', 'arxiv.org'],
    [' HTTPS://Example.COM/paper.pdf?x=1 ', 'example.com'],
    ['localhost:3000/file.pdf', 'localhost'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizePdfSiteException(input)).toBe(expected);
  });

  it.each(['', 'not a host', 'file:///tmp/a.pdf', 'mailto:user@example.com'])
    ('rejects %s', (input) => {
      expect(normalizePdfSiteException(input)).toBeNull();
    });

  it('deduplicates case-insensitively without mutating existing order', () => {
    expect(addPdfSiteException(['arxiv.org'], 'ARXIV.ORG/paper'))
      .toEqual(['arxiv.org']);
    expect(addPdfSiteException(['arxiv.org'], 'example.com'))
      .toEqual(['arxiv.org', 'example.com']);
  });
});
```

- [ ] **Step 2: Run the pure test and verify failure**

Run: `npm test -- lib/__tests__/pdfSiteExceptions.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement deterministic normalization**

```ts
export function normalizePdfSiteException(input: string): string | null {
  const raw = input.trim();
  if (!raw || /^(file|mailto):/i.test(raw)) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return hostname && !hostname.includes(' ') ? hostname : null;
  } catch {
    return null;
  }
}

export function addPdfSiteException(current: string[], input: string): string[] {
  const hostname = normalizePdfSiteException(input);
  if (!hostname || current.some((item) => item.toLowerCase() === hostname)) return current;
  return [...current, hostname];
}
```

- [ ] **Step 4: Write the failing editor interaction test**

```tsx
it('adds normalized hosts and removes chips', () => {
  const onChange = vi.fn();
  render(<PdfSiteExceptions value={['arxiv.org']} onChange={onChange} />);

  fireEvent.change(screen.getByLabelText(/site to exclude/i), {
    target: { value: 'https://Example.com/paper.pdf' },
  });
  fireEvent.click(screen.getByRole('button', { name: /add site/i }));
  expect(onChange).toHaveBeenCalledWith(['arxiv.org', 'example.com']);

  fireEvent.click(screen.getByRole('button', { name: /remove arxiv.org/i }));
  expect(onChange).toHaveBeenCalledWith([]);
});
```

- [ ] **Step 5: Implement the chip editor**

Use local input state so typing never mutates persisted settings. Submit only valid, non-duplicate hosts and show `Enter a valid HTTP(S) hostname or URL` inline when normalization fails.

```tsx
export function PdfSiteExceptions({ value, disabled = false, onChange }: PdfSiteExceptionsProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const add = () => {
    const normalized = normalizePdfSiteException(draft);
    if (!normalized) {
      setError('Enter a valid HTTP(S) hostname or URL');
      return;
    }
    const next = addPdfSiteException(value, normalized);
    if (next !== value) onChange(next);
    setDraft('');
    setError('');
  };
  return (
    <FieldGroup label="Never open automatically on" htmlFor="pdf-site-exception">
      <div className="flex gap-2">
        <Input
          id="pdf-site-exception"
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); add(); }
          }}
          error={error}
          placeholder="example.com"
        />
        <Button type="button" onClick={add} disabled={disabled || !draft.trim()}>Add site</Button>
      </div>
      <div aria-label="Excluded PDF sites" className="mt-3 flex flex-wrap gap-2">
        {value.map((host) => (
          <button
            key={host}
            type="button"
            disabled={disabled}
            aria-label={`Remove ${host}`}
            onClick={() => onChange(value.filter((item) => item !== host))}
          >
            {host} ×
          </button>
        ))}
      </div>
    </FieldGroup>
  );
}
```

- [ ] **Step 6: Run helper and editor tests**

Run: `npm test -- lib/__tests__/pdfSiteExceptions.test.ts entrypoints/options/sections/pdf/__tests__/PdfSiteExceptions.test.tsx`

Expected: PASS.

- [ ] **Step 7: Checkpoint commit if explicitly authorized**

```bash
git add lib/pdfSiteExceptions.ts lib/__tests__/pdfSiteExceptions.test.ts entrypoints/options/sections/pdf/PdfSiteExceptions.tsx entrypoints/options/sections/pdf/__tests__/PdfSiteExceptions.test.tsx
git commit -m "feat(options): add PDF site exception editor"
```

---

### Task 3: Extract bridge health ownership and status presentation

**Files:**
- Create: `entrypoints/options/sections/pdf/usePdfBridgeStatus.ts`
- Create: `entrypoints/options/sections/pdf/PdfStatusPanel.tsx`
- Create: `entrypoints/options/sections/pdf/__tests__/PdfStatusPanel.test.tsx`
- Reference: `entrypoints/options/sections/AdvancedSection.tsx:850-880,1188-1214`
- Reference: `lib/scientificPdf.ts:95-133`

**Interfaces:**
- Produces:
  - `usePdfBridgeStatus(settings: ScientificPdfSettings): { status: ScientificPdfStatus; checking: boolean; error: string | null; refresh: () => Promise<void> }`
  - `PdfStatusPanel(props: { status: ScientificPdfStatus; checking: boolean; error: string | null; onSetup: () => void; onRefresh: () => void; onShowUsage: () => void }): JSX.Element`

- [ ] **Step 1: Write failing status-panel tests for all states**

```tsx
it.each([
  ['not_configured', 'Not configured', 'Set up PDF translation'],
  ['offline', 'Bridge offline', 'Check connection'],
  ['ready', 'Ready', 'How to translate a PDF'],
] as const)('renders %s state', (status, label, action) => {
  render(
    <PdfStatusPanel
      status={status}
      checking={false}
      error={null}
      onSetup={vi.fn()}
      onRefresh={vi.fn()}
      onShowUsage={vi.fn()}
    />,
  );
  expect(screen.getByText(label)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: action })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- entrypoints/options/sections/pdf/__tests__/PdfStatusPanel.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the health hook with stable status after failures**

```ts
export function usePdfBridgeStatus(settings: ScientificPdfSettings) {
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const response = await chrome.runtime.sendMessage({ action: 'SCIENTIFIC_PDF_HEALTH' }) as {
        success?: boolean; status?: string; error?: string;
      };
      const ready = Boolean(response?.success && response.status === 'ok');
      setHealthOk(ready);
      if (!ready) setError(response?.error ?? 'The PDF bridge is not reachable.');
    } catch (cause) {
      setHealthOk(false);
      setError(cause instanceof Error ? cause.message : 'Could not check the PDF bridge.');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!settings.enabled && !settings.setupCompletedAt) {
      setHealthOk(null);
      setError(null);
      return;
    }
    void refresh();
  }, [settings.enabled, settings.setupCompletedAt, settings.serverUrl, refresh]);

  return {
    status: resolveScientificPdfStatus({ settings, healthOk }),
    checking,
    error,
    refresh,
  };
}
```

- [ ] **Step 4: Implement the status panel**

Use a single status map and state-specific primary action:

```tsx
const STATUS = {
  not_configured: { label: 'Not configured', variant: 'info' as const },
  offline: { label: 'Bridge offline', variant: 'warning' as const },
  ready: { label: 'Ready', variant: 'success' as const },
};

const action = status === 'not_configured'
  ? { label: 'Set up PDF translation', onClick: onSetup }
  : status === 'offline'
    ? { label: 'Check connection', onClick: onRefresh }
    : { label: 'How to translate a PDF', onClick: onShowUsage };
```

Render checking text with `role="status"`; render `error` inline only for configured/offline states. Do not turn the Ready action into a file picker.

- [ ] **Step 5: Verify status behavior**

Run: `npm test -- entrypoints/options/sections/pdf/__tests__/PdfStatusPanel.test.tsx lib/__tests__/scientificPdf.test.ts`

Expected: PASS.

Run: `npm run compile`

Expected: PASS.

- [ ] **Step 6: Checkpoint commit if explicitly authorized**

```bash
git add entrypoints/options/sections/pdf/usePdfBridgeStatus.ts entrypoints/options/sections/pdf/PdfStatusPanel.tsx entrypoints/options/sections/pdf/__tests__/PdfStatusPanel.test.tsx
git commit -m "refactor(options): isolate PDF bridge status"
```

---

### Task 4: Build the unified PDF page and add its Media tab

**Files:**
- Create: `entrypoints/options/sections/PdfSection.tsx`
- Create: `entrypoints/options/sections/pdf/PdfOpenBehavior.tsx`
- Create: `entrypoints/options/sections/pdf/PdfBridgeSettings.tsx`
- Create: `entrypoints/options/sections/__tests__/PdfSection.test.tsx`
- Modify: `entrypoints/options/lib/settingsTabs.ts`
- Modify: `entrypoints/options/lib/__tests__/settingsTabs.test.ts`
- Modify: `entrypoints/options/App.tsx`
- Modify: `entrypoints/options/sections/AdvancedSection.tsx:1169-1214,1903-2104`
- Remove after replacement: `entrypoints/options/sections/__tests__/AdvancedSection.pdf.test.tsx`

**Interfaces:**
- Consumes: Task 2 site editor, Task 3 status hook/panel, `ScientificPdfWizard`, current Zustand settings.
- Produces:
  - `PdfSection(): JSX.Element`
  - `PdfOpenBehavior(props: { value: PdfSettings; onChange: (value: PdfSettings) => void }): JSX.Element`
  - `PdfBridgeSettings(props: { value: ScientificPdfSettings; status: ScientificPdfStatus; onChange: (value: ScientificPdfSettings) => void; onSetup: () => void; onRefresh: () => void }): JSX.Element`

- [ ] **Step 1: Copy characterization assertions into a failing `PdfSection` test**

```tsx
import { PdfSection } from '../PdfSection';

function renderPdfSection(overrides: Partial<ExtensionSettings> = {}) {
  const updateSettings = vi.fn();
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, ...overrides, isLoaded: true, updateSettings } as never);
  render(<ToastProvider><PdfSection /></ToastProvider>);
  return { updateSettings };
}

it('presents PDF as one page with readiness, behavior, bridge, and privacy', async () => {
  renderPdfSection();
  expect(screen.getByRole('heading', { name: 'PDF' })).toBeInTheDocument();
  expect(screen.getByText(/not configured/i)).toBeInTheDocument();
  expect(screen.getByText(/when PDFs open/i)).toBeInTheDocument();
  expect(screen.getByText(/local bridge/i)).toBeInTheDocument();
  expect(screen.getByText(/full pdf/i)).toBeInTheDocument();
});
```

Copy every behavior assertion from `AdvancedSection.pdf.test.tsx`, changing only the render target and new user-facing labels.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- entrypoints/options/sections/__tests__/PdfSection.test.tsx`

Expected: FAIL because `PdfSection.tsx` does not exist.

- [ ] **Step 3: Implement `PdfOpenBehavior` using unchanged persisted values**

```tsx
const AUTO_OPEN_OPTIONS = [
  { value: 'off', label: 'Manual' },
  { value: 'prompt', label: 'Prompt' },
  { value: 'auto', label: 'Automatic' },
] satisfies Array<{ value: PdfAutoOpenMode; label: string }>;

<SegmentedControl
  id="pdf-auto-open"
  label="When PDFs open"
  options={AUTO_OPEN_OPTIONS}
  value={value.autoOpen}
  onChange={(autoOpen) => onChange({ ...value, autoOpen })}
/>
```

Keep new-tab/same-tab as a second single-choice control. Render `PdfSiteExceptions` only when `autoOpen !== 'off'`, and patch `neverAutoOpenSites` without replacing `autoOpen` or `openMode`.

- [ ] **Step 4: Implement bridge settings and privacy state**

`PdfBridgeSettings` renders the existing enable toggle, server URL, setup action, refresh action, guide action, and non-loopback warning. It receives merged settings and patches complete `scientificPdf` objects:

```tsx
const patch = (partial: Partial<ScientificPdfSettings>) =>
  onChange({ ...value, ...partial });
```

The server URL uses local text state or `useDeferredCommit`; do not normalize or trim on every keystroke. The privacy copy is always visible. The non-loopback warning is additionally visible next to the URL.

- [ ] **Step 5: Compose `PdfSection`**

```tsx
export function PdfSection() {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const pdf = settings.pdfSettings ?? { ...DEFAULT_PDF_SETTINGS };
  const bridge = mergeScientificPdfSettings(settings.scientificPdf);
  const bridgeStatus = usePdfBridgeStatus(bridge);
  const [showWizard, setShowWizard] = useState(false);
  const [showUsage, setShowUsage] = useState(false);

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="PDF"
        description="Translate PDFs while preserving their layout through your local bridge."
        icon={<FileText className="h-4 w-4" />}
        accentColor="amber"
      />
      <div className="space-y-4">
        <PdfStatusPanel
          status={bridgeStatus.status}
          checking={bridgeStatus.checking}
          error={bridgeStatus.error}
          onSetup={() => setShowWizard(true)}
          onRefresh={() => void bridgeStatus.refresh()}
          onShowUsage={() => setShowUsage((visible) => !visible)}
        />
        {showUsage && (
          <div role="region" aria-label="How to translate a PDF">
            Open a PDF in the browser, open it in AnyLLMTranslate’s built-in viewer, then start PDF translation.
          </div>
        )}
        <PdfOpenBehavior value={pdf} onChange={(next) => updateSettings({ pdfSettings: next })} />
        <PdfBridgeSettings
          value={bridge}
          status={bridgeStatus.status}
          onChange={(next) => updateSettings({ scientificPdf: next })}
          onSetup={() => setShowWizard(true)}
          onRefresh={() => void bridgeStatus.refresh()}
        />
        <ScientificPdfWizard
          open={showWizard}
          onClose={() => {
            setShowWizard(false);
            void bridgeStatus.refresh();
          }}
        />
      </div>
    </div>
  );
}
```

Use Cards and production copy from the approved spec around this composition; the snippet fixes ownership and data flow.

- [ ] **Step 6: Add PDF to the registry and App**

Add `FileText` and:

```ts
{ label: 'MEDIA', tabs: [
  { id: 'subtitles', label: 'Subtitles', icon: Subtitles },
  { id: 'speech', label: 'Speech', icon: Volume2 },
  { id: 'pdf', label: 'PDF', icon: FileText },
] }
```

Extend `TabId` with `'pdf'`, import `PdfSection` in App, and add:

```tsx
case 'pdf': return <PdfSection />;
```

Update the registry test to expect `['subtitles', 'speech', 'pdf']` and confirm `resolveRequestedSettingsTab('pdf') === 'pdf'`.

- [ ] **Step 7: Remove both legacy PDF blocks from Advanced**

Remove PDF local state, health effect, wizard ownership, auto-open draft, bridge helpers/imports, overview PDF chip, PDF Translator card, Scientific PDF card, and embedded wizard from `AdvancedSection`. Do not remove Data Portability fields named `pdfSettings` or `scientificPdf`; backups must still contain both.

- [ ] **Step 8: Verify the move**

Run: `npm test -- entrypoints/options/sections/__tests__/PdfSection.test.tsx entrypoints/options/sections/pdf/__tests__/PdfStatusPanel.test.tsx entrypoints/options/sections/pdf/__tests__/PdfSiteExceptions.test.tsx entrypoints/options/lib/__tests__/settingsTabs.test.ts entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.jumpNav.test.tsx`

Expected: PASS. Update the Advanced jump-navigation expected mappings to remove the deleted PDF target; do not leave a dead section id.

Run: `npm run compile`

Expected: PASS.

- [ ] **Step 9: Remove obsolete test after coverage transfer and checkpoint if authorized**

Delete `AdvancedSection.pdf.test.tsx` after all its cases pass in `PdfSection.test.tsx`.

```bash
git add entrypoints/options lib/pdfSiteExceptions.ts lib/__tests__/pdfSiteExceptions.test.ts
git commit -m "feat(options): add unified PDF settings tab"
```

Run the commit only with explicit authority.

---

### Task 5: Add troubleshooting disclosure and finish the status-first hierarchy

**Files:**
- Modify: `entrypoints/options/sections/PdfSection.tsx`
- Modify: `entrypoints/options/sections/pdf/PdfStatusPanel.tsx`
- Modify: `entrypoints/options/sections/pdf/PdfBridgeSettings.tsx`
- Modify: `entrypoints/options/sections/__tests__/PdfSection.test.tsx`

**Interfaces:**
- Consumes: current bridge status hook and setup guide URL.
- Produces: final approved hierarchy with one readiness state, concise workflow guidance, always-visible privacy, and collapsed diagnostics.

- [ ] **Step 1: Write failing disclosure and action tests**

```tsx
it('keeps troubleshooting collapsed and exposes refresh plus guide when opened', () => {
  renderPdfSection({
    scientificPdf: { enabled: true, serverUrl: 'http://127.0.0.1:17890' },
  });
  const trigger = screen.getByRole('button', { name: 'Troubleshooting' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('button', { name: /refresh status/i })).not.toBeInTheDocument();
  fireEvent.click(trigger);
  expect(screen.getByRole('button', { name: /refresh status/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /setup guide/i })).toBeInTheDocument();
});

it('shows usage instructions instead of opening a file picker when ready', async () => {
  sendMessage.mockResolvedValue({ success: true, status: 'ok' });
  renderPdfSection({
    scientificPdf: { enabled: true, serverUrl: 'http://127.0.0.1:17890' },
  });
  fireEvent.click(await screen.findByRole('button', { name: /how to translate a pdf/i }));
  expect(screen.getByRole('region', { name: /how to translate a pdf/i })).toBeInTheDocument();
  expect(document.querySelector('input[type="file"]')).toBeNull();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- entrypoints/options/sections/__tests__/PdfSection.test.tsx`

Expected: FAIL until refresh/guide are moved into Troubleshooting and the Ready action exposes usage.

- [ ] **Step 3: Implement the final hierarchy**

- Keep the status panel first.
- Show the three-step workflow immediately below status or when Ready usage is expanded.
- Render Open behavior before Local bridge for configured users.
- Keep privacy copy visible outside any disclosure.
- Move setup guide, explicit refresh, connection error details, and technical endpoint guidance into:

```tsx
<AdvancedDisclosure label="Troubleshooting" idPrefix="pdf-troubleshooting">
  <div className="space-y-3">
    <Button variant="secondary" onClick={onRefresh}>Refresh status</Button>
    <Button variant="ghost" onClick={openSetupGuide}>Setup guide</Button>
    {error && <p role="status" className="text-sm text-amber-300">{error}</p>}
  </div>
</AdvancedDisclosure>
```

Keep the setup button visible in Not configured state even while troubleshooting is collapsed.

- [ ] **Step 4: Verify PDF component and library tests**

Run: `npm test -- entrypoints/options/sections/__tests__/PdfSection.test.tsx entrypoints/options/sections/pdf/__tests__ lib/__tests__/pdfSiteExceptions.test.ts lib/__tests__/scientificPdf.test.ts lib/__tests__/scientificPdfWizard.test.ts`

Expected: PASS.

Run: `npm run compile && npm run lint`

Expected: PASS.

- [ ] **Step 5: Checkpoint commit if explicitly authorized**

```bash
git add entrypoints/options/sections/PdfSection.tsx entrypoints/options/sections/pdf entrypoints/options/sections/__tests__/PdfSection.test.tsx
git commit -m "feat(options): make PDF settings status first"
```

---

### Task 6: PDF phase quality gate

**Files:**
- Verify only; fix failures in files changed by Tasks 1-5.

**Interfaces:**
- Produces: a shippable unified PDF Settings page and an Advanced tab with PDF removed.

- [ ] **Step 1: Run focused regression suites**

Run: `npm test -- entrypoints/options/sections/__tests__/PdfSection.test.tsx entrypoints/options/sections/pdf/__tests__ entrypoints/options/lib/__tests__/settingsTabs.test.ts entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.jumpNav.test.tsx lib/__tests__/pdfSiteExceptions.test.ts lib/__tests__/scientificPdf.test.ts lib/__tests__/scientificPdfWizard.test.ts services/__tests__/background.scientificPdf.test.ts`

Expected: PASS.

- [ ] **Step 2: Run complete quality gates**

Run: `npm run compile`

Run: `npm run lint`

Run: `npm test`

Run: `npm run build`

Expected: every command exits 0.

- [ ] **Step 3: Manually inspect PDF states and responsive behavior**

Run: `npm run dev`

Verify:
- `?section=pdf` opens PDF and invalid section values remain safe.
- Not configured, Offline, and Ready states have exactly one clear primary action.
- No Ready action opens an options-page file picker.
- Manual mode hides site exceptions; Prompt and Automatic reveal them.
- Host chips add, deduplicate, and remove correctly.
- Non-loopback warning is visible next to the URL and privacy copy is always visible.
- Setup wizard closes back to PDF and refreshes status.
- Keyboard focus reaches every action and disclosures expose their state.
- The page does not overflow below 600px or 450px.

- [ ] **Step 4: Review storage and runtime stability**

Run: `git diff --check`

Run: `git diff -- types/config.ts stores/settingsStore.ts services/background.ts lib/scientificPdf.ts entrypoints/options`

Expected: no setting-key, message-name, bridge-client, credential, or processing-semantic changes. Changes to `lib/scientificPdf.ts` are unnecessary unless a tested pure status fix is discovered.

- [ ] **Step 5: Update Beads**

After all gates pass:

```bash
bd close AnyLLMTranslate-5gn.2 --reason="PDF behavior and bridge unified in a tested Media settings tab"
```

- [ ] **Step 6: Final phase commit if explicitly authorized and changes remain uncommitted**

```bash
git add entrypoints/options lib/pdfSiteExceptions.ts lib/__tests__/pdfSiteExceptions.test.ts docs/superpowers/plans/2026-09-12-settings-pdf-tab.md
git commit -m "feat(options): unify PDF settings under Media"
```
