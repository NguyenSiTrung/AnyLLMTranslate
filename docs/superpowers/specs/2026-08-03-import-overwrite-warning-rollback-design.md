# Import Overwrite Warning + Pre-Import Rollback Snapshot

**Date:** 2026-08-03
**Status:** Design (approved in brainstorming)

## Problem

The Advanced tab's Data Portability import flow (built in the
full-settings-backup track) applies a file with no notice of what it will
change:

- **No overwrite warning.** The import summary dialog shows only counts of
  recognized/ignored keys. When the file's value for a recognized key differs
  from the user's current value, the current value is silently replaced —
  whether in merge or replace mode. In replace mode, any customized setting
  whose key is absent from the file silently resets to defaults
  (`replaceSettings` = defaults + recognized keys only). The user only learns
  what changed after the import has already happened.
- **No undo.** There is no way to revert an import. A mistyped file, an old
  export, or a wrong merge/replace choice destroys the previous configuration
  with no recovery path.

## Goals

1. The import summary dialog warns, before applying, **which settings will be
   overwritten** (named list + count), in both merge and replace mode.
2. In replace mode, it additionally warns which **customized settings absent
   from the file will reset to defaults** (named list + count).
3. Before every import (merge *and* replace), the full current settings are
   saved to a **single pre-import snapshot slot** (API keys encrypted at rest,
   same as regular settings).
4. The user can roll back to that snapshot — from an **"Undo" action in the
   import-success toast** and from a persistent **"Restore previous settings"
   button** in the Data Portability card.
5. The snapshot is **consumed** (cleared) after a successful rollback.

## Non-Goals

- No multi-snapshot history (single slot only, per brainstorming).
- No change to the backup file formats (`lib/backup.ts` serialize/encrypt
  envelope), nor to how exports work.
- No drag-and-drop import, no import history UI beyond the single snapshot.
- No focus-trap/shared DialogShell extraction; dialog chrome stays duplicated
  as today.

## Design Decisions (from brainstorming)

Direction chosen: **pure diff function + storage-backed snapshot** (option A
from brainstorming). Rejected alternatives:

- *Store-centric (memory-only snapshot, diff in the dialog component):* the
  snapshot dies on extension/page reload, exactly when a rollback is most
  needed; diff logic embedded in a component is hard to unit-test.
- *Reuse the encrypted-backup envelope for the snapshot:* `encryptBackup`
  requires a passphrase + KDF envelope; storing one internally would mean
  inventing and hiding a password. Heavyweight and pointless for an internal
  snapshot.

## Component Changes

### 1. Diff: `computeImportImpact` (`lib/backup.ts`)

New pure, node-testable function (no chrome.* deps — backup.ts is already
that module). Backed by a new small recursive `deepEqual` helper:

- Scalars: `Object.is` comparison.
- Arrays: same length + element-wise `deepEqual` (order-sensitive; arrays are
  replaced wholesale by `deepMerge`, so order matters).
- Plain objects: same own-key sets + per-key `deepEqual` (prototype-pollution
  safe: use `Object.prototype.hasOwnProperty.call` / `Object.keys` only).
- Anything else (Date, RegExp, etc.): reference equality — settings data is
  JSON-shaped, so this never bites.

Signature:

```ts
export function computeImportImpact(
  current: ExtensionSettings,
  recognized: Record<string, unknown>,
  mode: 'merge' | 'replace',
): { changed: string[]; resetToDefaults: string[] }
```

The replace-mode baseline mirrors `settingsStore.replaceSettings` exactly
(it builds `{ ...DEFAULT_SETTINGS, siteRules: BUILT_IN_RULES.map(r => ({ ...r })) }`
— site rules are injected at load, so comparing against `DEFAULT_SETTINGS`'s
empty `siteRules` would produce phantom "will reset" entries for untouched
rules). `BUILT_IN_RULES` is a pure constant (`lib/siteRules.ts`), importable
in backup.ts without chrome.* deps.

Post-import value per recognized top-level key mirrors the store's real
semantics (from `stores/settingsStore.ts` and `lib/utils.ts` `deepMerge`:
arrays overwritten, empty source objects replace):

```ts
const replaceDefaults = {
  ...DEFAULT_SETTINGS,
  siteRules: BUILT_IN_RULES.map((r) => ({ ...r })),
};
```

- **merge:** `deepMerge(current[key], fileValue)` when both are plain objects,
  else `fileValue`.
- **replace:** `deepMerge(replaceDefaults[key], fileValue)` when both are
  plain objects, else `fileValue`.

Output:

- `changed` (both modes): recognized keys where `!deepEqual(current[key],
  postImportValue)`. Labeled "will be overwritten". Includes partial nested
  objects that change some nested field (e.g. a file `pdfSettings` that only
  sets `autoOpen` while the user customized `openMode`).
- `resetToDefaults` (replace mode only): top-level keys **absent** from
  `recognized` where `!deepEqual(current[key], replaceDefaults[key])` — the
  customized settings an exact restore would silently wipe.

Edge cases handled:

- File with only unknown keys → `recognized` empty → merge is a no-op
  (`changed: []`); replace warns every customized key under
  `resetToDefaults`.
- Key present in file with value equal to current → not listed as changed.
- Untouched built-in site rules are never listed (baseline comparison uses
  `replaceDefaults`, not `DEFAULT_SETTINGS`).
- `DEFAULT_SETTINGS` and `BUILT_IN_RULES` imported in backup.ts.

### 2. Import summary dialog (`entrypoints/options/components/BackupDialogs.tsx`)

`ImportSummaryDialog` gains two props:

```ts
changed: string[];
resetToDefaults: string[];
```

Rendering (both lists optional — absent/empty renders nothing, keeping the
dialog compact for no-op imports):

- `changed.length > 0` → amber warning block: "N setting(s) will be
  overwritten: `key1`, `key2`, …" (named list with count).
- `resetToDefaults.length > 0` **and the replace toggle is on** → amber/rose
  warning block: "M customized setting(s) not in the file will reset to
  defaults: `key1`, `key2`, …". Shown only when the "Replace all current
  settings" toggle is checked (toggle is already local state in the dialog).

### 3. Pre-import snapshot (`lib/constants.ts`, `lib/config.ts`, `stores/settingsStore.ts`)

- `lib/constants.ts`: `STORAGE_KEYS.PRE_IMPORT_SNAPSHOT =
  'anyllm-translate-preimport-snapshot'`.
- `lib/config.ts` (already owns encryption + storage):
  - `savePreImportSnapshot(settings: ExtensionSettings): Promise<void>` —
    encrypts per-key API keys exactly like `saveSettings` (reuse
    `encryptPoolKeys` / `encryptApiKey`), writes under the snapshot key.
  - `loadPreImportSnapshot(): Promise<ExtensionSettings | null>` — reads the
    key; decrypts keys like `loadSettings`; returns `null` when absent.
  - `clearPreImportSnapshot(): Promise<void>` — `chrome.storage.local.remove`.
- `stores/settingsStore.ts`: new action `restoreSettings(full:
  ExtensionSettings): Promise<void>` — `await saveSettings(full)` then
  `set({ ...full, isLoaded: true })`. (Snapshot is a full settings object, so
  this is a direct restore, not a merge onto defaults.)

### 4. Import/rollback flow (`entrypoints/options/sections/AdvancedSection.tsx`)

- New state: `hasSnapshot: boolean` (loaded on mount via
  `loadPreImportSnapshot()`), `showRestoreModal: boolean`.
- `handleImportApply` (both merge and replace):
  1. **Before** applying, capture the current config and persist it:
     `savePreImportSnapshot(pickKnownSettings(useSettingsStore.getState()))`
     — best-effort; on failure the import proceeds but the toast has no Undo
     action.
  2. Apply via existing `replaceSettings` / `updateSettings`.
  3. On success: `setHasSnapshot(true)`; show a toast **with an Undo action**
     ("Imported N settings" / existing ignored-keys copy), which triggers the
     same rollback path as the button.
- Snapshot content: `pickKnownSettings(state)` — a pure helper in
  `lib/backup.ts` that picks every top-level key of `DEFAULT_SETTINGS` from a
  given record (the zustand store state): **including
  `safeKeyThrottleMigrated`**, which `extractSettings` deliberately omits —
  excluding store internals (`isLoaded`, zustand methods). Export payloads
  are unchanged (we do not touch `extractSettings`). Rollback therefore
  restores the exact pre-import config, migration flag included. The same
  captured object is used as `current` for the dialog's `computeImportImpact`,
  so the warning and the snapshot always agree.
- Rollback path (`handleRestoreSnapshot`): confirm modal → `restoreSettings(
  await loadPreImportSnapshot())` → `clearPreImportSnapshot()` →
  `setHasSnapshot(false)` → success toast. Used by both the toast Undo and
  the persistent button. If the snapshot is missing/corrupt at rollback time:
  error toast, `clearPreImportSnapshot()`, `setHasSnapshot(false)`.
- Data Portability card: when `hasSnapshot`, render a third action button
  "Restore previous settings" (secondary) on the import sub-card, opening the
  confirm modal. Modal copy: "Replaces your current settings with the state
  before your last import. After this, the saved snapshot is consumed."

### 5. Toast action support (`ui/Toast.tsx`, `ui/ToastProvider.tsx`)

Backwards-compatible extension of the shared toast (existing callers
unaffected):

- `ToastData` gains optional `action?: { label: string; onClick: () => void }`.
- `Toast` renders a small button next to the message when `action` is present;
  clicking it calls `onClick` and dismisses the toast. Auto-dismiss duration
  is extended (e.g. 8s) when an action is present so the Undo is discoverable.
- `ToastProvider`/`useToast` expose `successWithAction(message, action,
  duration?)` (and keep `success`/`error`/`info` signatures unchanged).

## Error Handling

- Snapshot save failure during import: import still applies; success toast
  without Undo action (snapshot is best-effort safety, not a gate).
- Rollback with missing/corrupt snapshot: error toast; snapshot cleared;
  button hidden (no dead undo).
- Rollback is destructive and always behind a confirm modal.
- Existing import errors unchanged (invalid JSON toast, wrong-passphrase
  inline `role="alert"`, apply-failure toast).

## Testing

### Unit (`lib/__tests__/backup.test.ts`)

- `deepEqual`: scalars, arrays (order-sensitive), nested objects, object key
  mismatch, prototype-pollution keys ignored.
- `computeImportImpact`:
  - merge: changed key listed when file value differs; unchanged key omitted;
    partial nested object (file `pdfSettings` subset vs customized current)
    listed as changed.
  - replace: changed keys per `deepMerge(replaceDefaults, file)`; customized
    keys absent from file listed under `resetToDefaults`; keys equal to
    current/default not listed; empty-recognized file → all customized keys in
    `resetToDefaults`, `changed: []`.
  - site rules: a store holding only `BUILT_IN_RULES` (untouched) is NOT
    listed under `resetToDefaults` in replace mode (baseline comparison
    against `replaceDefaults`, not `DEFAULT_SETTINGS`).
- Snapshot round-trip: `savePreImportSnapshot` → `loadPreImportSnapshot`
  returns plaintext keys; `clearPreImportSnapshot` → `null`. Follow the
  chrome.storage mocking pattern from `lib/__tests__/configMigration.pool.test.ts`.
- Snapshot content: capture includes `safeKeyThrottleMigrated` and all
  `DEFAULT_SETTINGS` keys; excludes store internals (`isLoaded`).

### Store (`stores/__tests__/settingsStore.test.ts`)

- `restoreSettings` persists the full object and sets store state.

### Component (`entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx`)

- Import summary shows named changed-key list when the file differs from the
  current store (merge).
- Replace toggle reveals the reset-to-defaults list; off → hidden.
- Import calls `savePreImportSnapshot` before applying (spy).
- Undo toast appears after import; clicking Undo restores the snapshot,
  clears it, and hides the persistent button.
- Persistent "Restore previous settings" button appears when a snapshot
  exists; confirm flow restores + consumes.

### UI (`ui/__tests__/`)

- Toast renders the action button, invokes `onClick`, and dismisses after
  click; no-action toasts behave exactly as before (4s auto-dismiss).

## Accessibility

- Warning lists in the dialog use real list markup with clear labels
  ("will be overwritten" / "will reset to defaults"); counts included in text
  for screen readers.
- Restore modal reuses `ui/Modal` (Escape, backdrop click, focus
  preservation as today).
- Toast action button is a real `<button>` with a descriptive label (e.g.
  "Undo import").
