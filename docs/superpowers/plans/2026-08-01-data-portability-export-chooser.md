# Data Portability Export Chooser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Data Portability section's two equal-weight export buttons with a single "Export…" button that opens a format chooser dialog (encrypted recommended, plain JSON warned inline), and add a live passphrase strength hint to the backup password dialog.

**Architecture:** A pure `passphraseStrength` utility in `lib/`, a new `ExportFormatDialog` plus a strength-meter UI in `entrypoints/options/components/BackupDialogs.tsx` (same overlay chrome as the existing dialogs), and rewiring in `entrypoints/options/sections/AdvancedSection.tsx` (new `showExportChooser` state, toast-semantics fix, copy updates).

**Tech Stack:** React 19, TypeScript, Tailwind 4, lucide-react, Vitest + Testing Library, WXT.

**Spec:** `docs/superpowers/specs/2026-08-01-data-portability-export-chooser-design.md`
**Beads issue:** AnyLLMTranslate-1z1

## Global Constraints

- The show/hide password eye toggle **already exists** in `ui/Input.tsx` for `type="password"` — do not build one; only add a regression test.
- Strength meter appears **only** in export mode (`requireConfirm`); import mode stays meter-free.
- Tailwind classes in strength/severity maps must be complete string literals (the scanner does not see interpolated class names).
- Keep dialog chrome identical to the existing `BackupPasswordDialog` (overlay `bg-black/60 backdrop-blur-sm`, panel `max-w-md bg-zinc-900 border-zinc-700 rounded-xl animate-[scaleIn_200ms_ease-out]`, Escape closes, `document.body.style.overflow` lock).
- Do not change `lib/backup.ts`, file formats, or the import flow (`ImportSummaryDialog` untouched).
- Filenames stay `anyllm-translate-settings-YYYY-MM-DD.json` (plain) and `anyllm-translate-backup-YYYY-MM-DD.json` (encrypted).

---

### Task 1: `passphraseStrength` utility

**Files:**
- Create: `lib/passphraseStrength.ts`
- Test: `lib/__tests__/passphraseStrength.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type PassphraseStrength = 'weak' | 'fair' | 'strong';
  export function passphraseStrength(password: string): PassphraseStrength | null;
  ```
  Returns `null` for empty input (so callers hide the meter). Evaluation order, first match wins — classes = count of matched character classes among lowercase `[a-z]`, uppercase `[A-Z]`, digit `\d`, symbol `[^a-zA-Z0-9]`:
  1. `strong` — length ≥ 12 AND classes ≥ 3
  2. `fair` — length ≥ 8 AND (classes ≥ 2 OR length ≥ 12)
  3. `weak` — everything else

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/passphraseStrength.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { passphraseStrength } from '../passphraseStrength';

describe('passphraseStrength', () => {
  it('returns null for empty input (meter hidden)', () => {
    expect(passphraseStrength('')).toBeNull();
  });

  it('weak: under 8 chars, or 8+ with a single class below 12 chars', () => {
    expect(passphraseStrength('abc')).toBe('weak');
    expect(passphraseStrength('abcdefgh')).toBe('weak');
  });

  it('fair: 8+ with two classes, or 12+ with fewer than three classes', () => {
    expect(passphraseStrength('abcd1234')).toBe('fair');
    expect(passphraseStrength('Abcdefgh')).toBe('fair');
    expect(passphraseStrength('abcdefghijkl')).toBe('fair');
    expect(passphraseStrength('abcdefghij12')).toBe('fair');
  });

  it('strong: 12+ chars with three or more classes', () => {
    expect(passphraseStrength('Abcdefg12345')).toBe('strong');
    expect(passphraseStrength('abcd1234!@#$')).toBe('strong');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/passphraseStrength.test.ts`
Expected: FAIL — "Cannot find module '../passphraseStrength'"

- [ ] **Step 3: Write minimal implementation**

Create `lib/passphraseStrength.ts`:

```ts
/**
 * Passphrase quality heuristic for the encrypted-backup export dialog.
 * Returns null for empty input so callers can hide the meter entirely.
 *
 * Evaluation order (first match wins). Character classes: lowercase,
 * uppercase, digit, symbol.
 *   strong — length >= 12 AND >= 3 classes
 *   fair   — length >= 8 AND (>= 2 classes OR length >= 12)
 *   weak   — everything else
 */

export type PassphraseStrength = 'weak' | 'fair' | 'strong';

const CLASS_RES = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/] as const;

export function passphraseStrength(password: string): PassphraseStrength | null {
  if (!password) return null;
  const classes = CLASS_RES.filter((re) => re.test(password)).length;
  if (password.length >= 12 && classes >= 3) return 'strong';
  if (password.length >= 8 && (classes >= 2 || password.length >= 12)) return 'fair';
  return 'weak';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/passphraseStrength.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/passphraseStrength.ts lib/__tests__/passphraseStrength.test.ts
git commit -m "feat: add passphraseStrength heuristic for backup export dialog"
```

---

### Task 2: Strength hint in `BackupPasswordDialog`

**Files:**
- Modify: `entrypoints/options/components/BackupDialogs.tsx`
- Test: `entrypoints/options/components/__tests__/BackupDialogs.test.tsx`

**Interfaces:**
- Consumes: `passphraseStrength` from `@/lib/passphraseStrength` (Task 1).
- Produces: no new exports. Visual contract later tasks/tests rely on: meter text is exactly `Strength: Weak` / `Strength: Fair` / `Strength: Strong`, rendered only when `requireConfirm` and the passphrase field is non-empty; wrapped in a container with `aria-live="polite"` (and NOT `role="alert"` — the import-mode test asserts a single alert for errors).

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('BackupPasswordDialog', ...)` block in `entrypoints/options/components/__tests__/BackupDialogs.test.tsx` (after the 'dismisses on cancel' test):

```tsx
  it('shows a live strength hint in export mode', () => {
    render(
      <BackupPasswordDialog
        title="Encrypt backup"
        message="x"
        confirmLabel="OK"
        requireConfirm
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const field = screen.getByLabelText(/passphrase \(min/i);
    expect(screen.queryByText(/strength:/i)).not.toBeInTheDocument();

    fireEvent.change(field, { target: { value: 'abc' } });
    expect(screen.getByText('Strength: Weak')).toBeInTheDocument();

    fireEvent.change(field, { target: { value: 'abcd1234' } });
    expect(screen.getByText('Strength: Fair')).toBeInTheDocument();

    fireEvent.change(field, { target: { value: 'Abcdefg12345' } });
    expect(screen.getByText('Strength: Strong')).toBeInTheDocument();
  });

  it('hides the strength hint in import mode', () => {
    render(
      <BackupPasswordDialog
        title="Unlock backup"
        message="x"
        confirmLabel="Unlock"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.change(screen.getByLabelText('Passphrase'), {
      target: { value: 'Abcdefg12345' },
    });
    expect(screen.queryByText(/strength:/i)).not.toBeInTheDocument();
  });

  it('passphrase field can be revealed via the built-in show/hide toggle', () => {
    render(
      <BackupPasswordDialog
        title="Unlock backup"
        message="x"
        confirmLabel="Unlock"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const field = screen.getByLabelText('Passphrase') as HTMLInputElement;
    expect(field.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field.type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(field.type).toBe('password');
  });
```

(The toggle test passes already — it locks in existing `ui/Input` behavior. The two strength tests must fail.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run entrypoints/options/components/__tests__/BackupDialogs.test.tsx`
Expected: FAIL on 'shows a live strength hint in export mode' ("Unable to find an element with the text: Strength: Weak") and 'hides the strength hint in import mode' passes trivially; toggle test passes.

- [ ] **Step 3: Implement the strength meter**

In `entrypoints/options/components/BackupDialogs.tsx`:

a) Extend the imports at the top:

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { Toggle } from '@/ui/Toggle';
import { passphraseStrength, type PassphraseStrength } from '@/lib/passphraseStrength';
```

b) Add the meter metadata map below the imports:

```tsx
const STRENGTH_META: Record<
  PassphraseStrength,
  { label: string; width: string; bar: string; text: string }
> = {
  weak: { label: 'Weak', width: '33%', bar: 'bg-rose-500', text: 'text-rose-400/90' },
  fair: { label: 'Fair', width: '66%', bar: 'bg-amber-500', text: 'text-amber-400/90' },
  strong: { label: 'Strong', width: '100%', bar: 'bg-emerald-500', text: 'text-emerald-400/90' },
};
```

c) Inside `BackupPasswordDialog`, just below the existing `const canSubmit = …` line, add:

```tsx
  const strength =
    requireConfirm && password.length > 0 ? passphraseStrength(password) : null;
```

d) Render the meter immediately after the first passphrase field's closing `</div>` and before the `{requireConfirm && (` block that renders the confirm field:

```tsx
            {strength && (
              <div aria-live="polite">
                <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${STRENGTH_META[strength].bar}`}
                    style={{ width: STRENGTH_META[strength].width }}
                  />
                </div>
                <p className={`mt-1 text-[11px] font-medium ${STRENGTH_META[strength].text}`}>
                  Strength: {STRENGTH_META[strength].label}
                </p>
              </div>
            )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run entrypoints/options/components/__tests__/BackupDialogs.test.tsx`
Expected: PASS (all BackupPasswordDialog + ImportSummaryDialog tests, 8 total)

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/components/BackupDialogs.tsx entrypoints/options/components/__tests__/BackupDialogs.test.tsx
git commit -m "feat: add live passphrase strength hint to backup password dialog"
```

---

### Task 3: `ExportFormatDialog` component

**Files:**
- Modify: `entrypoints/options/components/BackupDialogs.tsx`
- Test: `entrypoints/options/components/__tests__/BackupDialogs.test.tsx`

**Interfaces:**
- Consumes: `Badge` from `@/ui/Badge`, `Button` from `@/ui/Button`, lucide icons `Download`, `Lock`, `Braces`, `AlertTriangle`.
- Produces:
  ```ts
  export interface ExportFormatDialogProps {
    /** When true, the Plain JSON option shows an inline cleartext API-key warning. */
    hasApiKeys: boolean;
    onSelect: (format: 'plain' | 'encrypted') => void;
    onCancel: () => void;
  }
  export function ExportFormatDialog(props: ExportFormatDialogProps): JSX.Element;
  ```
  Contract Task 4 relies on: dialog `aria-label="Export settings"`; radiogroup `aria-label="Export format"`; radios contain text "Encrypted backup" (+ "Recommended" badge) and "Plain JSON"; warning text "Will contain your API keys in cleartext — keep the file private." only when `hasApiKeys`; footer buttons "Cancel" and "Continue"; 'encrypted' pre-selected.

- [ ] **Step 1: Write the failing tests**

Append a new describe block at the end of `entrypoints/options/components/__tests__/BackupDialogs.test.tsx`, and update the import line:

```tsx
import { BackupPasswordDialog, ExportFormatDialog, ImportSummaryDialog } from '../BackupDialogs';
```

```tsx
describe('ExportFormatDialog', () => {
  const onSelect = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    onSelect.mockClear();
    onCancel.mockClear();
  });

  it('pre-selects encrypted (recommended) and continues with it by default', () => {
    render(<ExportFormatDialog hasApiKeys={false} onSelect={onSelect} onCancel={onCancel} />);

    const encrypted = screen.getByRole('radio', { name: /encrypted backup/i });
    expect(encrypted).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /plain json/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onSelect).toHaveBeenCalledWith('encrypted');
  });

  it('warns about cleartext keys on Plain JSON only when keys exist', () => {
    const { rerender } = render(
      <ExportFormatDialog hasApiKeys={false} onSelect={onSelect} onCancel={onCancel} />,
    );
    expect(screen.queryByText(/cleartext/i)).not.toBeInTheDocument();

    rerender(<ExportFormatDialog hasApiKeys onSelect={onSelect} onCancel={onCancel} />);
    expect(
      screen.getByText(/will contain your api keys in cleartext/i),
    ).toBeInTheDocument();
  });

  it('selects Plain JSON on click and continues with it', () => {
    render(<ExportFormatDialog hasApiKeys onSelect={onSelect} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('radio', { name: /plain json/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onSelect).toHaveBeenCalledWith('plain');
  });

  it('supports arrow-key navigation between formats', () => {
    render(<ExportFormatDialog hasApiKeys={false} onSelect={onSelect} onCancel={onCancel} />);
    const group = screen.getByRole('radiogroup', { name: 'Export format' });

    fireEvent.keyDown(group, { key: 'ArrowDown' });
    expect(screen.getByRole('radio', { name: /plain json/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    fireEvent.keyDown(group, { key: 'ArrowUp' });
    expect(screen.getByRole('radio', { name: /encrypted backup/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('closes on Escape and Cancel', () => {
    render(<ExportFormatDialog hasApiKeys={false} onSelect={onSelect} onCancel={onCancel} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    onCancel.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run entrypoints/options/components/__tests__/BackupDialogs.test.tsx`
Expected: FAIL — "ExportFormatDialog is not exported" (TS error or undefined component)

- [ ] **Step 3: Implement `ExportFormatDialog`**

In `entrypoints/options/components/BackupDialogs.tsx`:

a) Update the lucide import and add Badge:

```tsx
import { AlertTriangle, Braces, Download, KeyRound, Lock, ShieldCheck } from 'lucide-react';
```

```tsx
import { Badge } from '@/ui/Badge';
```

b) Append the component at the end of the file:

```tsx
type ExportFormat = 'plain' | 'encrypted';

const FORMAT_ORDER: ExportFormat[] = ['encrypted', 'plain'];

export interface ExportFormatDialogProps {
  /** When true, the Plain JSON option shows an inline cleartext API-key warning. */
  hasApiKeys: boolean;
  onSelect: (format: ExportFormat) => void;
  onCancel: () => void;
}

/**
 * Format chooser shown before any export download. Encrypted backup is
 * pre-selected and badged Recommended; Plain JSON carries an inline
 * cleartext-keys warning (when keys exist) so the user is warned BEFORE
 * the file is written, not after.
 */
export function ExportFormatDialog({
  hasApiKeys,
  onSelect,
  onCancel,
}: ExportFormatDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('encrypted');
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(
      () =>
        (
          dialogRef.current?.querySelector('[aria-checked="true"]') as HTMLElement | null
        )?.focus(),
      50,
    );
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      window.clearTimeout(t);
    };
  }, []);

  const moveSelection = (delta: number) => {
    const idx = FORMAT_ORDER.indexOf(format);
    const next =
      FORMAT_ORDER[(idx + delta + FORMAT_ORDER.length) % FORMAT_ORDER.length];
    setFormat(next);
    (
      dialogRef.current?.querySelector(`[data-format="${next}"]`) as HTMLElement | null
    )?.focus();
  };

  const optionClass = (active: boolean) =>
    `flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 ${
      active
        ? 'border-cyan-500/50 bg-cyan-500/[0.08]'
        : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
    }`;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Export settings"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div
        ref={dialogRef}
        className="relative w-full max-w-md mx-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl animate-[scaleIn_200ms_ease-out] overflow-hidden"
      >
        <div className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/15">
              <Download className="w-4 h-4 text-blue-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-zinc-100">Export settings</h3>
              <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">
                Choose a format. Encrypted is recommended when the file will leave this
                device.
              </p>
            </div>
          </div>

          <div
            role="radiogroup"
            aria-label="Export format"
            className="space-y-2"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                e.preventDefault();
                moveSelection(1);
              }
              if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                e.preventDefault();
                moveSelection(-1);
              }
            }}
          >
            <button
              type="button"
              role="radio"
              aria-checked={format === 'encrypted'}
              data-format="encrypted"
              onClick={() => setFormat('encrypted')}
              className={optionClass(format === 'encrypted')}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cyan-500/25 bg-cyan-500/10 text-cyan-400">
                <Lock className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-100">Encrypted backup</span>
                  <Badge variant="info">Recommended</Badge>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">
                  Protected with a passphrase (PBKDF2 + AES-256-GCM). Best for moving to
                  another device.
                </span>
              </span>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={format === 'plain'}
              data-format="plain"
              onClick={() => setFormat('plain')}
              className={optionClass(format === 'plain')}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800/60 text-zinc-400">
                <Braces className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-sm font-medium text-zinc-100">Plain JSON</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">
                  Readable file for inspection or editing.
                </span>
                {hasApiKeys && (
                  <span className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Will contain your API keys in cleartext — keep the file private.
                  </span>
                )}
              </span>
            </button>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={() => onSelect(format)}>
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run entrypoints/options/components/__tests__/BackupDialogs.test.tsx`
Expected: PASS (13 tests total)

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/components/BackupDialogs.tsx entrypoints/options/components/__tests__/BackupDialogs.test.tsx
git commit -m "feat: add ExportFormatDialog with encrypted-recommended chooser"
```

---

### Task 4: Wire the chooser into `AdvancedSection` + toast-semantics fix

**Files:**
- Modify: `entrypoints/options/sections/AdvancedSection.tsx`
- Test: `entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx`

**Interfaces:**
- Consumes: `ExportFormatDialog` (Task 3) with `onSelect(format: 'plain' | 'encrypted')`.
- Produces: UI contract the tests rely on — one card button `Export…` (only card button matching `/export/i`), chooser appears with `role="dialog"` name "Export settings"; Continue (encrypted pre-selected) opens the existing passphrase dialog; choosing Plain JSON + Continue downloads immediately and shows toast "Settings exported successfully"; the old error toast "Exported file contains your API keys in cleartext — keep it private!" is gone.

- [ ] **Step 1: Update the failing tests**

In `entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx`:

a) In the test `'plain export downloads the FULL settings object…'`, replace:

```tsx
    fireEvent.click(screen.getByRole('button', { name: /export json/i }));
```

with:

```tsx
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    fireEvent.click(await screen.findByRole('radio', { name: /plain json/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
```

(The test's enclosing `it` is already `async`.)

b) In the test `'encrypted export asks for a matching password and downloads an envelope'`, replace:

```tsx
    fireEvent.click(screen.getByRole('button', { name: /encrypted backup/i }));
```

with:

```tsx
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    // Encrypted backup is pre-selected in the chooser.
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
```

c) Add a new test at the end of the describe block:

```tsx
  it('warns inside the chooser before plain export, then shows a success toast (no error toast)', async () => {
    const settings: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      providers: [
        {
          id: 'p1',
          displayName: 'P',
          baseUrl: 'https://x/v1',
          model: 'm',
          requiresApiKey: true,
          temperature: 0.3,
          maxTokens: 4096,
          enabled: true,
          keys: [
            {
              id: 'k1',
              apiKey: 'sk-abc',
              maxRpm: 20,
              concurrencyLimit: 1,
              interval: 500,
              enabled: true,
            },
          ],
        },
      ],
    };
    storeWith(settings);
    renderAdvanced();

    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    // Warning is shown BEFORE anything is downloaded.
    expect(
      await screen.findByText(/will contain your api keys in cleartext/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /plain json/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText(/settings exported successfully/i)).toBeInTheDocument();
    // The old post-hoc error toast is gone.
    expect(screen.queryByText(/keep it private/i)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx`
Expected: FAIL — no radio "Plain JSON" exists yet (chooser not wired), and the old `Export JSON` button name no longer matches `/export/i` exclusively (it will still match the old button, but the chooser never opens).

- [ ] **Step 3: Implement the wiring**

In `entrypoints/options/sections/AdvancedSection.tsx`:

a) Extend the dialog import:

```tsx
import {
  BackupPasswordDialog,
  ExportFormatDialog,
  ImportSummaryDialog,
} from '@/entrypoints/options/components/BackupDialogs';
```

b) Remove `Lock` from the lucide-react import (it was only used by the removed "Encrypted backup…" button — verify with a search for `Lock` in the file before removing).

c) Add state next to the existing `showExportPassword` declaration:

```tsx
  const [showExportChooser, setShowExportChooser] = useState(false);
```

d) Replace `handleExportPlain` (toast-semantics fix — success toast always, no more `showError`):

```tsx
  const handleExportPlain = useCallback(() => {
    const full = extractSettings(settings);
    const blob = new Blob([serializeSettings(full)], { type: 'application/json' });
    downloadBlob(
      blob,
      `anyllm-translate-settings-${new Date().toISOString().slice(0, 10)}.json`,
    );
    showSuccess('Settings exported successfully');
  }, [settings, showSuccess]);
```

e) In the Export sub-card, replace the whole `<div className="flex flex-wrap gap-2">…two buttons…</div>` block with:

```tsx
                <div className="flex flex-wrap gap-2">
                  <Button
                    id="export-settings-btn"
                    variant="primary"
                    size="sm"
                    onClick={() => setShowExportChooser(true)}
                    icon={<Download className="w-3.5 h-3.5" />}
                  >
                    Export…
                  </Button>
                </div>
```

f) In the Import sub-card, change the button label `Import JSON` → `Import…`.

g) Update the warning banner copy (both branches):

```tsx
                {hasApiKeys
                  ? 'A plain JSON export includes ALL your API keys in cleartext. Treat the file as a secret — choose Encrypted backup in the export dialog to move keys safely between devices.'
                  : 'Plain JSON exports include provider configuration. Once API keys are added, they appear in cleartext — choose Encrypted backup in the export dialog when moving devices.'}
```

h) Render the chooser just above the `{/* Encrypted Export Password Modal */}` block:

```tsx
      {/* Export Format Chooser Modal */}
      {showExportChooser && (
        <ExportFormatDialog
          hasApiKeys={hasApiKeys}
          onSelect={(format) => {
            setShowExportChooser(false);
            if (format === 'encrypted') {
              setShowExportPassword(true);
            } else {
              handleExportPlain();
            }
          }}
          onCancel={() => setShowExportChooser(false)}
        />
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/sections/AdvancedSection.tsx entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx
git commit -m "feat: route data portability export through format chooser dialog"
```

---

### Task 5: Quality gates + close out

**Files:** none (verification only)

- [ ] **Step 1: Run the full affected test surface**

Run: `npx vitest run lib/__tests__/passphraseStrength.test.ts entrypoints/options/components/__tests__/BackupDialogs.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx entrypoints/options/sections/__tests__`
Expected: PASS. (The whole `sections/__tests__` directory is included to catch other AdvancedSection suites that may query the old button names, e.g. `AdvancedSection.backup.test.tsx` neighbors.)

If another suite references the removed buttons (`Export JSON`, `Encrypted backup…`, `#export-encrypted-btn`), update those queries to go through the chooser as in Task 4 Step 1.

- [ ] **Step 2: Typecheck**

Run: `npm run compile`
Expected: exit 0, no errors

- [ ] **Step 3: Lint changed files**

Run: `npx eslint lib/passphraseStrength.ts lib/__tests__/passphraseStrength.test.ts entrypoints/options/components/BackupDialogs.tsx entrypoints/options/components/__tests__/BackupDialogs.test.tsx entrypoints/options/sections/AdvancedSection.tsx entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx`
Expected: no errors (fix any unused-import warnings, e.g. a leftover `Lock` import)

- [ ] **Step 4: Commit any gate fixes, then mark the beads issue done**

```bash
git add -A
git commit -m "fix: satisfy quality gates for export chooser" || true
bd close AnyLLMTranslate-1z1
```

---

## Self-Review Notes

- **Spec coverage:** chooser dialog (Task 3), wiring + toast fix + copy (Task 4), strength hint (Tasks 1–2), eye-toggle regression test (Task 2), tests updated (Tasks 2–4), import flow untouched (verified — no task modifies it). Out-of-scope items (focus trap, DialogShell, drag-and-drop) are not in any task.
- **Type consistency:** `passphraseStrength` signature identical in Tasks 1–2; `ExportFormatDialogProps.onSelect(format: 'plain' | 'encrypted')` identical between Task 3's component and Task 4's wiring; `ExportFormat` type is local to BackupDialogs.tsx and the union matches the prop type.
- **No placeholders:** every code step contains complete code; every command has expected output.
