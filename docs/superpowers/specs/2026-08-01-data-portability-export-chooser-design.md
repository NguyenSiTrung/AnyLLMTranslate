# Data Portability Export Chooser + Passphrase Popup Polish

**Date:** 2026-08-01
**Status:** Design (approved in brainstorming)
**Issue:** AnyLLMTranslate-1z1

## Problem

The Advanced tab's Data Portability section (built in the full-settings-backup
track) has a working but muddled export moment:

- **Risky and safe actions have equal visual weight.** "Export JSON"
  (downloads every API key in cleartext) and "Encrypted backup…" (safe path)
  are both `variant="secondary"`, side by side, risky one first. The warning
  banner below advises preferring the encrypted backup, but the button
  hierarchy contradicts it.
- **Plain export downloads instantly.** There is no pre-download warning; the
  only safeguard is a toast shown *after* the file is on disk.
- **Wrong toast semantics.** A successful plain export calls
  `showError('Exported file contains your API keys in cleartext…')` — a red
  error toast for an action that succeeded.
- **Passphrase dialog is missing strength feedback.** Beyond "min 8
  characters" there is no guidance on passphrase quality, despite the "if you
  forget the passphrase, the backup is unrecoverable" stakes. (The show/hide
  eye toggle is already provided by the shared `ui/Input` password field.)
- **Labels are inconsistent.** "Export JSON" (names a format) vs "Encrypted
  backup…" (names a purpose); "Import JSON" also accepts encrypted backups, so
  it undersells the feature.

## Goals

1. One **Export…** entry point that opens a **format chooser dialog** before
   anything is downloaded.
2. In the chooser, **encrypted backup is pre-selected and badged
   "Recommended"**; the plain JSON option carries an inline cleartext-keys
   warning (only when API keys exist) so the user is warned *before* the
   download, not after.
3. Plain export success shows a normal success toast (error toast removed).
4. Passphrase dialog gains a **live strength hint** (export mode only). The
   show/hide eye toggle already exists via the shared `ui/Input` password
   field — lock it in with a regression test.
5. Keep the existing import flow (summary dialog, merge/replace) untouched.

## Non-Goals

- No focus trap, no shared DialogShell extraction (dialog chrome stays
  duplicated as today).
- No drag-and-drop import, no "last exported" timestamp, no changes to
  `lib/backup.ts` crypto or file formats.
- No layout change to the Data Portability card grid (two sub-cards stay).

## Design Decisions (from brainstorming)

Direction chosen: **Export chooser popup** (option C from the earlier
`data-portability-options.html` mockup). Rejected alternatives:

- *Backup center* (encrypted button made primary in the card): plain export
  would still download instantly without a pre-warning.
- *Minimal fixes* (toast semantics only): leaves the equal-weight hierarchy
  problem in place.

## Component Changes

### 1. Data Portability card (`entrypoints/options/sections/AdvancedSection.tsx`)

- Export sub-card: replace the two buttons ("Export JSON", "Encrypted
  backup…") with a single **primary** button **"Export…"** (`id="export-settings-btn"`),
  which opens the chooser dialog.
- Import sub-card: rename button **"Import JSON" → "Import…"**; behavior
  unchanged.
- Warning banner: keep, with copy updated to reference the dialog
  ("…choose Encrypted backup in the export dialog to move keys safely").
- `handleExportPlain`: drop the `hasApiKeys` `showError` toast; always
  `showSuccess('Settings exported successfully')`.
- `hasApiKeys` now feeds only the banner and the chooser's inline warning.

### 2. New `ExportFormatDialog` (`entrypoints/options/components/BackupDialogs.tsx`)

Same overlay/blur/scale-in chrome as `BackupPasswordDialog` (Escape closes,
autofocus, `role="dialog"`, `aria-modal`).

- Title: **"Export settings"**; subtitle: "Choose a format. Encrypted is
  recommended when the file will leave this device."
- Two selectable choice cards (radio behavior, `role="radio"` group,
  click/keyboard selectable):
  - **Encrypted backup** — Lock icon, cyan "Recommended" badge, **pre-selected**.
    Description: "Protected with a passphrase (PBKDF2 + AES-256-GCM). Best for
    moving to another device."
  - **Plain JSON** — Braces icon. Description: "Readable file for inspection
    or editing." When `hasApiKeys`, an inline amber warning inside this
    option: "Will contain your API keys in cleartext — keep the file private."
    When no keys, no warning.
- Footer: **Cancel** (ghost) / **Continue** (primary).
- Continue with encrypted → close chooser, open `BackupPasswordDialog`
  (existing `requireConfirm` export flow, downloads on success).
- Continue with plain → close chooser, run `handleExportPlain()` (immediate
  download + success toast).

### 3. `BackupPasswordDialog` polish

- **Show/hide toggle: no work needed.** The shared `ui/Input` component
  already renders an Eye/EyeOff toggle (`aria-label="Show password"` /
  `"Hide password"`) for every `type="password"` field, and
  `BackupPasswordDialog` already uses `type="password"`. A regression test
  locks this in.
- **Strength hint (export mode only, i.e. when `requireConfirm`):** a thin
  bar + label under the passphrase field, computed from the password only.
  Character classes: lowercase, uppercase, digit, symbol. Evaluated in this
  order, first match wins:
  - Strong — length ≥ 12 **and** ≥ 3 classes (emerald)
  - Fair — length ≥ 8 **and** (≥ 2 classes **or** length ≥ 12) (amber)
  - Weak — everything else, including under 8 chars (red)
- Hidden when the field is empty. Import mode (single field, unlocking an
  existing backup) shows no meter.
- Existing behavior unchanged: min-8 validation, confirm-match inline error,
  Enter submits, Escape cancels, busy state.

### 4. State flow (`AdvancedSection.tsx`)

- New state `showExportChooser`; "Export…" sets it true.
- Chooser `onSelect('encrypted')` → `setShowExportChooser(false)` +
  `setShowExportPassword(true)`.
- Chooser `onSelect('plain')` → `setShowExportChooser(false)` +
  `handleExportPlain()`.
- Import flow state (`showImportPassword`, `importMeta`, …) unchanged.

## Error Handling

- Unchanged: encryption failure shows inline error in the password dialog;
  wrong passphrase on import shows inline `role="alert"` error; invalid JSON
  import shows error toast.
- Chooser has no failure modes (pure navigation); plain export errors surface
  via the existing toast path.

## Testing

Update `entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx`:

- Plain export test: click **Export…** → select **Plain JSON** → Continue →
  assert downloaded payload (existing assertions kept).
- Encrypted export test: click **Export…** → encrypted pre-selected →
  Continue → passphrase dialog appears; existing password/envelope assertions
  kept.
- New: chooser shows the cleartext warning only when the store has API keys.
- New: regression test that the built-in eye toggle (shared `ui/Input`)
  switches the passphrase field `type` between `password` and `text`.
- New: strength label renders Weak/Fair/Strong for sample passwords
  (export mode) and is absent in import mode.
- Import tests unchanged (button rename covered by role/name queries).

## Accessibility

- Chooser uses a real radio-group pattern (`role="radiogroup"` +
  `role="radio"`, `aria-checked`, arrow/click selection, autofocus on the
  selected option).
- All dialog close paths (Escape, Cancel, backdrop click) preserved.
- Eye toggle (built into `ui/Input`) is `type="button"` with
  `aria-label="Show password"` / `"Hide password"`.
