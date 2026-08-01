# Full-Settings Backup with Optional Password Encryption

**Date:** 2026-08-01
**Status:** Design (approved in brainstorming, pending user review)

## Problem

The Advanced tab's Export/Import covers only a curated subset of settings, so it
cannot be used to clone a setup to another browser or PC:

- Export writes only the `PORTABLE_KEYS` allowlist (~30 of ~45 top-level
  settings). The **multi-provider pool (`providers`)** is excluded entirely, so
  the biggest piece of real configuration (all providers, models, per-key
  throttles, pool API keys) never travels. `pdfSettings`, `scientificPdf`,
  `globalExcludeSelectors`, and a dozen Quality/Efficiency toggles added after
  the allowlist was created are also missing.
- Import merges "defaults + file" over current settings, so keys absent from a
  file fall back to defaults — not a true restore.
- Export writes API keys in cleartext with only a toast warning; there is no
  way to move keys safely between machines.

## Goals

1. Export can back up **everything** — every setting, including `providers`,
   `pdfSettings`, `scientificPdf`, `globalExcludeSelectors`, all toggles.
2. A password-encrypted export exists so API keys can move between machines
   without being readable at rest in the file.
3. Import can do an **exact restore** (replace everything, absent keys reset to
   defaults) or the current safe **merge**, chosen per import.
4. Existing plain JSON files (old or new format) still import fine; no
   regression to the current flows.

## Non-Goals

- No cloud sync, no auto-backup, no export of the translation cache.
- No per-install key escrow: an encrypted file can only be decrypted with the
  user's passphrase. If they forget it, the file is unrecoverable (by design).
- No change to how keys are encrypted at rest in `chrome.storage.local`
  (`lib/crypto.ts` stays as-is).

## Design Decisions (from brainstorming)

- **Two export actions**, side by side:
  - **Export settings (JSON)** — full plaintext settings, all API keys
    included in cleartext, with a prominent warning.
  - **Export encrypted backup…** — password modal (password + confirm, min 8
    chars), downloads an encrypted envelope.
- **Import flow**: file picker → auto-detect format → encrypted files prompt
  for the password first → summary dialog with a checkbox
  **"Replace all current settings"** (default off = merge; on = exact restore).
- **Plain export includes API keys in cleartext** (user's explicit choice) —
  same risk profile as today but for every key, hence the stronger warning.

## File Formats

### Plain JSON

```json
{
  "sourceLanguage": "auto",
  "targetLanguage": "vi",
  "providers": ["...pool providers with decrypted apiKey values..."],
  "apiKey": "sk-...",
  "tts": { "...": "..." }
  "...all remaining ExtensionSettings keys..."
}
```

- Filename: `anyllm-translate-settings-YYYY-MM-DD.json` (unchanged).
- No envelope, no `format` marker: identical shape to the existing import, so
  old files and new full files are indistinguishable by design — both are
  valid plain JSON settings.

### Encrypted envelope

```json
{
  "format": "anyllm-translate-backup",
  "version": 1,
  "createdAt": "2026-08-01T00:00:00.000Z",
  "kdf": "PBKDF2-SHA256",
  "iterations": 210000,
  "salt": "<base64, 16 random bytes>",
  "iv": "<base64, 12 random bytes>",
  "ciphertext": "<base64, AES-256-GCM of the full settings JSON>"
}
```

- Filename: `anyllm-translate-backup-YYYY-MM-DD.json`.
- `format` + `version` are bound as GCM additional authenticated data (AAD),
  so a file can't be replayed or relabeled under a different format.
- Wrong password or any tamper → GCM auth-tag failure → import reports
  "Wrong password or corrupted file" and changes nothing.
- Header (everything but `ciphertext`) is cleartext and identifies the file
  without revealing settings content. `detectFormat()` keys off the `format`
  field.

## Crypto (`lib/backup.ts`, new)

Pure module, `crypto.subtle` (available in the extension options page and in
Node ≥ 18 for tests):

- `detectFormat(text: string): 'plain' | 'encrypted'`
  - `'encrypted'` when the parsed object has `format === 'anyllm-translate-backup'`
    and a string `ciphertext`; otherwise `'plain'` (matches today's parser —
    any JSON object is treated as settings).
- `encryptBackup(settings: ExtensionSettings, password: string): Promise<string>`
  - Validate password: min 8 chars (throw on short password — the UI enforces
    a confirm field too).
  - Random 16-byte salt, random 12-byte IV, PBKDF2-SHA256 210,000 iterations,
    AES-256-GCM; serialize envelope as JSON.
- `decryptBackup(text: string, password: string): Promise<ExtensionSettings>`
  - Parse envelope; reject unknown `version`; derive key; decrypt with AAD;
    on any failure (bad password, tamper, malformed) throw a typed error
    `BackupDecryptError` so the UI can show "Wrong password or corrupted file".
- `sanitizeImportObject(parsed: unknown): { recognized, ignored }` — extracted
  from today's `handleImportSettings`:
  - Must be a plain object (reject arrays/null).
  - Silently drop `__proto__`, `constructor`, `prototype` (prototype-pollution
    guard, existing behavior).
  - Split keys into `recognized` (in `DEFAULT_SETTINGS`) vs `ignored` (report
    in the toast, existing behavior).

## Import Pipeline

1. **Pick file** → read text → `detectFormat`.
2. **Encrypted** → password modal. On submit, `decryptBackup`; on error, stay
   open with the error, modify nothing.
3. **Summary dialog** (both formats):
   - Shows: format (plain/encrypted), recognized count, ignored unknown keys.
   - Checkbox **"Replace all current settings"** — default **off (merge)**.
4. **Apply**:
   - Merge (off): only the file's recognized keys are applied via the store's
     existing `updateSettings` deep-merge — absent keys keep their current
     values. (Note: today's code spreads `DEFAULT_SETTINGS` into the partial,
     which actually RESETS absent keys; the true merge below is the behavior
     the user chose in brainstorming and differs from today's import.)
   - Replace (on): `saveSettings({ ...DEFAULT_SETTINGS, ...recognized })` then
     reload the store — absent keys reset to defaults (true clone).
   - `recognized` values that are not full objects (e.g. a partial
     `subtitleSettings` or `providers` array) are still applied via the store's
     existing `deepMerge` path; full exports always contain complete objects.

## Export UI (Advanced → Data portability)

- Replace the single Export button with two:
  1. **Export settings (JSON)** — plaintext full export; warning callout
     upgraded to "includes ALL your API keys in cleartext — keep the file
     private".
  2. **Export encrypted backup…** — opens a password modal (password + confirm,
     min 8 chars, mismatch error); on success downloads the envelope and shows
     a confirmation toast; on error shows the error, changes nothing.
- Keep the existing hidden `<input type="file">` for import; import handler now
  calls the pipeline above.
- Existing toasts: "Settings exported successfully", "Exported file contains
  your API key in cleartext…" replaced per the new flow; import success toast
  keeps the recognized/ignored report.

## Security Notes

- The encrypted file is self-contained (salt + IV + iterations in the header);
  no per-install data is needed to decrypt, so it works across browsers and PCs.
- The plain JSON export intentionally contains secrets — the UI must warn
  clearly and the existing P2 prototype-pollution guards carry into the new
  sanitizer.
- `decryptBackup` never returns partial data on failure; it either returns a
  complete settings object or throws.

## Testing

### `lib/__tests__/backup.test.ts` (new)

- Round-trip: encrypt → decrypt returns a deep-equal full settings object
  (including `providers` with keys and nested TTS overrides).
- Wrong password → `BackupDecryptError`, no partial data.
- Tampered ciphertext / tampered AAD (`format` changed) → error.
- Unknown `version` → error.
- `detectFormat`: plain JSON → `'plain'`; envelope → `'encrypted'`; garbage →
  treated as `'plain'` (and fails the object validation on import).
- `sanitizeImportObject`: prototype-pollution keys dropped silently; unknown
  keys reported in `ignored`; arrays/null rejected.
- Short password → `encryptBackup` throws.

### Component tests (`AdvancedSection`)

- Export encrypted: password + confirm mismatch blocked; success downloads.
- Import encrypted: wrong password shows error and doesn't modify the store.
- Import dialog: merge (default) keeps absent keys; "Replace all" resets absent
  keys to defaults (assert via store state).
- Existing `AdvancedSection.jumpNav.test.tsx` and any other Advanced tests keep
  passing.

## Quality Gates

`pnpm test`, `pnpm lint`, `pnpm compile`, and `wxt build` all green before the
work is complete. The change is confined to `lib/backup.ts` (+ test), the
Advanced section (+ tests), and possibly small store/save helpers.
