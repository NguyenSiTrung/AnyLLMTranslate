# Full-Settings Backup with Optional Password Encryption — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Advanced tab's Data Portability export/import to back up *all* settings, with a password-encrypted option that lets API keys move safely between browsers/PCs, and an import flow that can exact-restore or merge per file.

**Architecture:** A new pure module `lib/backup.ts` owns serialization + crypto (PBKDF2-SHA256 + AES-256-GCM envelope, self-contained so it decrypts on any machine) and the prototype-pollution-safe import sanitizer. The settings store gains `replaceSettings` for exact-restore. Two small dialog components (`BackupDialogs.tsx`) handle password entry and the import summary. `AdvancedSection.tsx` wires it together: two export actions (plain full JSON / encrypted), and an import pipeline that auto-detects format, prompts for the passphrase on encrypted files, and applies via merge (default) or replace (checkbox).

**Tech Stack:** TypeScript, WXT, React, Zustand, Vitest (jsdom for components, node for lib), Web Crypto API (`crypto.subtle`).

## Global Constraints

- PBKDF2-SHA256 with **210,000 iterations**, AES-GCM-256, 16-byte salt, 12-byte IV (from spec).
- Envelope fields exactly: `format: 'anyllm-translate-backup'`, `version: 1`, `createdAt` (ISO), `kdf: 'PBKDF2-SHA256'`, `iterations`, `salt`, `iv`, `ciphertext` (all base64 except version/createdAt/iterations).
- `format` + `version` bound as GCM AAD.
- Password minimum 8 chars, enforced in both UI and `encryptBackup`.
- Merge import = only the file's recognized keys applied (absent keys keep current values). Replace import = file over defaults (+ built-in site rules), absent keys reset. See Task 1 Step 0 for the spec correction this implies.
- Prototype-pollution keys (`__proto__`, `constructor`, `prototype`) silently dropped; never named in toasts.
- Filenames: plain `anyllm-translate-settings-YYYY-MM-DD.json`; encrypted `anyllm-translate-backup-YYYY-MM-DD.json`.
- `lib/crypto.ts` (keys at rest) is NOT changed. `lib/backup.ts` never touches `chrome.storage` or `chrome.runtime` (must be fully testable in node).
- Quality gates: `pnpm test`, `pnpm lint`, `pnpm compile`, `wxt build` all green.

---

### Task 1: `lib/backup.ts` — backup crypto + sanitizer (and spec correction)

**Files:**
- Create: `lib/backup.ts`
- Test: `lib/__tests__/backup.test.ts`
- Modify: `docs/superpowers/specs/2026-08-01-full-settings-backup-design.md` (merge-semantics correction only)

**Interfaces:**
- Produces (consumed by Tasks 3–4):
  - `type BackupFormat = 'plain' | 'encrypted'`
  - `detectFormat(text: string): BackupFormat`
  - `encryptBackup(settings: ExtensionSettings, password: string): Promise<string>`
  - `decryptBackup(text: string, password: string): Promise<ExtensionSettings>` — throws `BackupDecryptError` on any failure
  - `sanitizeImportObject(parsed: unknown): { recognized: Record<string, unknown>; ignored: string[] }`
  - `serializeSettings(settings: ExtensionSettings): string`
  - `class BackupDecryptError extends Error` (name `'BackupDecryptError'`)

- [ ] **Step 1: Fix the spec's merge description (docs only)**

In `docs/superpowers/specs/2026-08-01-full-settings-backup-design.md`, replace the "Apply" bullet:

```markdown
   - Merge (off): `{ ...DEFAULT_SETTINGS, ...recognized }` merged into current
     state (today's behavior — absent keys keep current values).
```

with:

```markdown
   - Merge (off): only the file's recognized keys are applied via the store's
     existing `updateSettings` deep-merge — absent keys keep their current
     values. (Note: today's code spreads `DEFAULT_SETTINGS` into the partial,
     which actually RESETS absent keys; the true merge below is the behavior
     the user chose in brainstorming and differs from today's import.)
```

Commit: `git add docs/superpowers/specs/2026-08-01-full-settings-backup-design.md && git commit -m "docs: correct merge semantics in backup design spec"`

- [ ] **Step 2: Write the failing tests**

Create `lib/__tests__/backup.test.ts`:

```ts
/**
 * Tests: full-settings backup encryption + import sanitizer.
 * Runs in the node env (default for lib/**); crypto.subtle is Node's global
 * webcrypto — no chrome mock required.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  BACKUP_FORMAT,
  BackupDecryptError,
  decryptBackup,
  detectFormat,
  encryptBackup,
  sanitizeImportObject,
  serializeSettings,
} from '@/lib/backup';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '@/types/config';

const PASSWORD = 'correct horse battery staple';

function fullSettings(): ExtensionSettings {
  return {
    ...DEFAULT_SETTINGS,
    targetLanguage: 'ja',
    theme: 'bubble',
    siteRules: [
      {
        id: 'r1',
        hostname: '*.example.com',
        includeSelectors: ['article'],
        excludeSelectors: [],
        alwaysTranslate: true,
        neverTranslate: false,
        builtIn: false,
      },
    ],
    glossary: [{ id: 'g1', source: 'hello', target: 'こんにちは' }],
    providers: [
      {
        id: 'p1',
        displayName: 'My Provider',
        baseUrl: 'https://api.example.com/v1',
        model: 'gpt-4o-mini',
        requiresApiKey: true,
        temperature: 0.3,
        maxTokens: 4096,
        enabled: true,
        keys: [
          {
            id: 'k1',
            apiKey: 'sk-secret-1',
            maxRpm: 20,
            concurrencyLimit: 1,
            interval: 500,
            enabled: true,
          },
        ],
      },
    ],
    tts: {
      ...DEFAULT_SETTINGS.tts,
      enabled: true,
      customApiKey: 'tts-secret',
      languageOverrides: [{ language: 'vi', model: 'tts-1', voice: 'nova' }],
    },
  };
}

describe('encryptBackup / decryptBackup', () => {
  it('round-trips a full settings object including pool keys and TTS overrides', async () => {
    const source = fullSettings();
    const envelope = await encryptBackup(source, PASSWORD);
    const parsed = JSON.parse(envelope) as Record<string, unknown>;

    expect(parsed['format']).toBe(BACKUP_FORMAT);
    expect(parsed['version']).toBe(1);
    expect(parsed['kdf']).toBe('PBKDF2-SHA256');
    expect(typeof parsed['salt']).toBe('string');
    expect(typeof parsed['iv']).toBe('string');
    expect(typeof parsed['ciphertext']).toBe('string');
    // The envelope must NOT contain plaintext settings or keys.
    expect(envelope).not.toContain('sk-secret-1');
    expect(envelope).not.toContain('tts-secret');

    expect(await decryptBackup(envelope, PASSWORD)).toEqual(source);
  });

  it('throws on wrong password', async () => {
    const envelope = await encryptBackup(fullSettings(), PASSWORD);
    await expect(decryptBackup(envelope, 'wrong-password-123')).rejects.toThrow(
      BackupDecryptError,
    );
  });

  it('throws on tampered ciphertext', async () => {
    const envelope = JSON.parse(
      await encryptBackup(fullSettings(), PASSWORD),
    ) as Record<string, string>;
    const last = envelope['ciphertext'];
    const flipped =
      last.slice(0, -1) + (last.endsWith('A') ? 'B' : 'A');
    envelope['ciphertext'] = flipped;
    await expect(decryptBackup(JSON.stringify(envelope), PASSWORD)).rejects.toThrow(
      BackupDecryptError,
    );
  });

  it('throws when the format marker is tampered (AAD)', async () => {
    const envelope = JSON.parse(
      await encryptBackup(fullSettings(), PASSWORD),
    ) as Record<string, unknown>;
    envelope['format'] = 'other-format';
    await expect(decryptBackup(JSON.stringify(envelope), PASSWORD)).rejects.toThrow(
      BackupDecryptError,
    );
  });

  it('throws on unknown version', async () => {
    const envelope = JSON.parse(
      await encryptBackup(fullSettings(), PASSWORD),
    ) as Record<string, unknown>;
    envelope['version'] = 99;
    await expect(decryptBackup(JSON.stringify(envelope), PASSWORD)).rejects.toThrow(
      BackupDecryptError,
    );
  });

  it('throws on non-envelope plain JSON', async () => {
    await expect(decryptBackup('{"targetLanguage":"ja"}', PASSWORD)).rejects.toThrow(
      BackupDecryptError,
    );
  });

  it('rejects short passwords', async () => {
    await expect(encryptBackup(fullSettings(), 'short')).rejects.toThrow(
      /at least 8 characters/,
    );
  });
});

describe('detectFormat', () => {
  it('detects the encrypted envelope', () => {
    expect(
      detectFormat(
        JSON.stringify({
          format: BACKUP_FORMAT,
          version: 1,
          ciphertext: 'abc',
          salt: 's',
          iv: 'i',
        }),
      ),
    ).toBe('encrypted');
  });

  it('treats plain settings JSON as plain', () => {
    expect(detectFormat(JSON.stringify({ targetLanguage: 'ja' }))).toBe('plain');
    expect(detectFormat('{"format":"not-ours","ciphertext":"x"}')).toBe('plain');
    expect(detectFormat('not json at all')).toBe('plain');
  });
});

describe('sanitizeImportObject', () => {
  it('splits recognized vs ignored keys and drops prototype-pollution keys silently', () => {
    const parsed = {
      targetLanguage: 'ja',
      unknownSetting: 1,
      __proto__: { polluted: true },
      constructor: { x: 1 },
      prototype: { y: 2 },
    };
    const { recognized, ignored } = sanitizeImportObject(parsed);
    expect(recognized).toEqual({ targetLanguage: 'ja' });
    expect(ignored).toEqual(['unknownSetting']);
    // No pollution leaked into Object.prototype.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects non-object payloads', () => {
    expect(() => sanitizeImportObject(null)).toThrow(/JSON object/);
    expect(() => sanitizeImportObject([1, 2])).toThrow(/JSON object/);
    expect(() => sanitizeImportObject('string')).toThrow(/JSON object/);
  });

  it('accepts a full settings object untouched', () => {
    const { recognized, ignored } = sanitizeImportObject(fullSettings());
    expect(ignored).toEqual([]);
    expect(recognized['providers']).toEqual(fullSettings().providers);
  });
});

describe('serializeSettings', () => {
  it('emits pretty JSON containing every key', () => {
    const text = serializeSettings(fullSettings());
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed['providers']).toBeTruthy();
    expect(parsed['pdfSettings']).toBeTruthy();
    expect(parsed['scientificPdf']).toBeTruthy();
    expect(text).toContain('\n  ');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run lib/__tests__/backup.test.ts`
Expected: FAIL — `lib/backup.ts` does not exist (module resolution error).

- [ ] **Step 4: Implement `lib/backup.ts`**

Create `lib/backup.ts`:

```ts
/**
 * Settings backup serialization — full plaintext export and password-encrypted
 * backups (PBKDF2-SHA256 + AES-256-GCM).
 *
 * The encrypted envelope is self-contained (salt, IV, KDF params in the
 * header), so a backup decrypts on any browser/PC with the passphrase — no
 * per-install state required. This module never touches chrome.storage or
 * chrome.runtime, keeping it fully testable in node.
 */

import type { ExtensionSettings } from '@/types/config';
import { DEFAULT_SETTINGS } from '@/types/config';

export const BACKUP_FORMAT = 'anyllm-translate-backup';
export const BACKUP_VERSION = 1;
export const PBKDF2_ITERATIONS = 210_000;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

/** Thrown when an encrypted backup cannot be decrypted (wrong password or tamper). */
export class BackupDecryptError extends Error {
  constructor(message = 'Wrong password or corrupted file') {
    super(message);
    this.name = 'BackupDecryptError';
  }
}

export type BackupFormat = 'plain' | 'encrypted';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function assertPassword(password: string): void {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Serialize full settings to a JSON string (the plaintext export body). */
export function serializeSettings(settings: ExtensionSettings): string {
  return JSON.stringify(settings, null, 2);
}

/** Identify whether a settings/backup file is an encrypted envelope. */
export function detectFormat(text: string): BackupFormat {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      parsed['format'] === BACKUP_FORMAT &&
      typeof parsed['ciphertext'] === 'string'
    ) {
      return 'encrypted';
    }
  } catch {
    // Malformed JSON is treated as plain; it fails the object check on import.
  }
  return 'plain';
}

/** Encrypt full settings into a self-contained backup envelope. */
export async function encryptBackup(
  settings: ExtensionSettings,
  password: string,
): Promise<string> {
  assertPassword(password);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);

  const aad = new TextEncoder().encode(`${BACKUP_FORMAT}:${BACKUP_VERSION}`);
  const plaintext = new TextEncoder().encode(serializeSettings(settings));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
      additionalData: aad,
    },
    key,
    plaintext,
  );

  const envelope = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(envelope, null, 2);
}

/** Decrypt a backup envelope back to full settings. Throws BackupDecryptError on any failure. */
export async function decryptBackup(
  text: string,
  password: string,
): Promise<ExtensionSettings> {
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new BackupDecryptError();
  }
  if (
    !envelope ||
    typeof envelope !== 'object' ||
    Array.isArray(envelope) ||
    envelope['format'] !== BACKUP_FORMAT
  ) {
    throw new BackupDecryptError();
  }
  if (envelope['version'] !== BACKUP_VERSION) {
    throw new BackupDecryptError('Unsupported backup version');
  }

  let salt: Uint8Array | null = null;
  let iv: Uint8Array | null = null;
  let ciphertext: Uint8Array | null = null;
  try {
    if (typeof envelope['salt'] === 'string') salt = base64ToBytes(envelope['salt']);
    if (typeof envelope['iv'] === 'string') iv = base64ToBytes(envelope['iv']);
    if (typeof envelope['ciphertext'] === 'string') {
      ciphertext = base64ToBytes(envelope['ciphertext']);
    }
  } catch {
    throw new BackupDecryptError();
  }
  if (!salt || !iv || !ciphertext) throw new BackupDecryptError();

  try {
    const key = await deriveKey(password, salt);
    const aad = new TextEncoder().encode(`${BACKUP_FORMAT}:${BACKUP_VERSION}`);
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource,
        additionalData: aad,
      },
      key,
      ciphertext as unknown as BufferSource,
    );
    const parsed: unknown = JSON.parse(new TextDecoder().decode(decrypted));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('decrypted payload is not an object');
    }
    return parsed as ExtensionSettings;
  } catch {
    // GCM auth failure covers wrong password, tamper, and malformed payloads.
    throw new BackupDecryptError();
  }
}

/** Split a parsed settings object into recognized vs ignored keys (prototype-pollution safe). */
export function sanitizeImportObject(
  parsed: unknown,
): { recognized: Record<string, unknown>; ignored: string[] } {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Settings file must be a JSON object');
  }
  const knownKeys = new Set(Object.keys(DEFAULT_SETTINGS));
  const recognized: Record<string, unknown> = {};
  const ignored: string[] = [];
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (knownKeys.has(key)) recognized[key] = value;
    else ignored.push(key);
  }
  return { recognized, ignored };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run lib/__tests__/backup.test.ts`
Expected: PASS (all ~14 tests). PBKDF2 at 210k iterations makes the crypto tests take a second or two — that is expected.

- [ ] **Step 6: Commit**

```bash
git add lib/backup.ts lib/__tests__/backup.test.ts
git commit -m "feat: add encrypted settings backup crypto module"
```

---

### Task 2: Store `replaceSettings` for exact-restore imports

**Files:**
- Modify: `stores/settingsStore.ts` (interface + implementation)
- Modify: `stores/__tests__/settingsStore.test.ts`

**Interfaces:**
- Consumes: nothing new (uses existing `DEFAULT_SETTINGS`, `BUILT_IN_RULES`, `deepMerge`, `saveSettings`).
- Produces (consumed by Task 4): `replaceSettings(partial: Partial<ExtensionSettings>): Promise<void>` on `SettingsState`.

- [ ] **Step 1: Write the failing test**

Add to `stores/__tests__/settingsStore.test.ts`, inside the `describe('useSettingsStore')` block, after the `core CRUD` test (append a new `describe('replaceSettings')`):

```ts
  describe('replaceSettings', () => {
    it('resets to defaults then applies the partial (exact restore)', async () => {
      // Simulate a machine with existing settings.
      mockStorageData['anyllm-translate-settings'] = {
        theme: 'bubble',
        targetLanguage: 'ja',
        maxRpm: 60,
      };
      await useSettingsStore.getState().loadFromStorage();
      expect(useSettingsStore.getState().theme).toBe('bubble');
      expect(useSettingsStore.getState().maxRpm).toBe(60);

      // File contains only these keys — absent keys must reset to defaults.
      await useSettingsStore.getState().replaceSettings({
        theme: 'paper',
        targetLanguage: 'ko',
      });

      const state = useSettingsStore.getState();
      expect(state.theme).toBe('paper');
      expect(state.targetLanguage).toBe('ko');
      // Absent keys reset to defaults (NOT preserved from the loaded state).
      expect(state.maxRpm).toBe(DEFAULT_SETTINGS.maxRpm);
      expect(state.subtitleSettings.fontFamily).toBe('system');
      // Built-in site rules still seeded, like resetToDefaults.
      expect(state.siteRules.length).toBeGreaterThan(0);
      expect(state.isLoaded).toBe(true);
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run stores/__tests__/settingsStore.test.ts`
Expected: FAIL — `replaceSettings is not a function`.

- [ ] **Step 3: Implement `replaceSettings`**

In `stores/settingsStore.ts`:

1. Add to the `SettingsState` interface, after `resetToDefaults`:

```ts
  /** Exact-restore import: reset to defaults, then apply `partial` on top. */
  replaceSettings: (partial: Partial<ExtensionSettings>) => Promise<void>;
```

2. Add to the store implementation, after `resetToDefaults`:

```ts
  replaceSettings: async (partial) => {
    const defaults = {
      ...DEFAULT_SETTINGS,
      siteRules: BUILT_IN_RULES.map((r) => ({ ...r })),
    };
    const merged = deepMerge(
      defaults as unknown as Record<string, unknown>,
      partial as unknown as Record<string, unknown>,
    ) as unknown as ExtensionSettings;
    await saveSettings(merged);
    set({ ...merged, isLoaded: true });
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run stores/__tests__/settingsStore.test.ts`
Expected: PASS (existing tests + new one).

- [ ] **Step 5: Commit**

```bash
git add stores/settingsStore.ts stores/__tests__/settingsStore.test.ts
git commit -m "feat: add replaceSettings exact-restore to settings store"
```

---

### Task 3: `BackupDialogs.tsx` — password and import-summary dialogs

**Files:**
- Create: `entrypoints/options/components/BackupDialogs.tsx`
- Test: `entrypoints/options/components/__tests__/BackupDialogs.test.tsx`

**Interfaces:**
- Consumes: `@/ui/Button`, `@/ui/Input`, `@/ui/Toggle`, `lucide-react` icons.
- Produces (consumed by Task 4):
  - `BackupPasswordDialog(props: { title: string; message: ReactNode; confirmLabel: string; requireConfirm?: boolean; error?: string | null; busy?: boolean; onConfirm: (password: string) => void; onCancel: () => void })`
  - `ImportSummaryDialog(props: { source: 'plain' | 'encrypted'; recognizedCount: number; ignored: string[]; onConfirm: (replaceAll: boolean) => void; onCancel: () => void })`

- [ ] **Step 1: Write the failing tests**

Create `entrypoints/options/components/__tests__/BackupDialogs.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BackupPasswordDialog, ImportSummaryDialog } from '../BackupDialogs';

describe('BackupPasswordDialog', () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    onConfirm.mockClear();
    onCancel.mockClear();
  });

  it('blocks submit until a matching 8+ char password is entered (export mode)', () => {
    render(
      <BackupPasswordDialog
        title="Encrypt backup"
        message="Choose a passphrase"
        confirmLabel="Encrypt & download"
        requireConfirm
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const confirmBtn = screen.getByRole('button', { name: 'Encrypt & download' });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/passphrase \(min/i), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByLabelText(/confirm passphrase/i), {
      target: { value: 'different' },
    });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/confirm passphrase/i), {
      target: { value: 'password123' },
    });
    expect(confirmBtn).toBeEnabled();

    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledWith('password123');
  });

  it('import mode needs only one password, and shows the error from the parent', () => {
    render(
      <BackupPasswordDialog
        title="Unlock backup"
        message="Enter the passphrase used when exporting"
        confirmLabel="Unlock"
        error="Wrong password or corrupted file"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const unlockBtn = screen.getByRole('button', { name: 'Unlock' });
    expect(unlockBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/passphrase/i), {
      target: { value: 'password123' },
    });
    expect(unlockBtn).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Wrong password or corrupted file');

    fireEvent.click(unlockBtn);
    expect(onConfirm).toHaveBeenCalledWith('password123');
  });

  it('dismisses on cancel', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('ImportSummaryDialog', () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    onConfirm.mockClear();
    onCancel.mockClear();
  });

  it('defaults to merge and reports recognized/ignored counts', () => {
    render(
      <ImportSummaryDialog
        source="plain"
        recognizedCount={42}
        ignored={['oldKey']}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText(/42 recognized settings/)).toBeInTheDocument();
    expect(screen.getByText(/1 unknown key ignored: oldKey/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Merge & import' }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('exact restore when the replace toggle is on', () => {
    render(
      <ImportSummaryDialog
        source="encrypted"
        recognizedCount={3}
        ignored={[]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Replace all current settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace & import' }));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });
});
```

Note: `screen.getByLabelText(/passphrase \(min/i)` matches the label "Passphrase (min 8 characters)" rendered with `htmlFor="backup-password"`; in import mode the label is plain "Passphrase". If jsdom's label matching is brittle, add `aria-label="Passphrase"` / `aria-label="Confirm passphrase"` to the `Input`s in Step 3 and match those instead.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run entrypoints/options/components/__tests__/BackupDialogs.test.tsx`
Expected: FAIL — module `../BackupDialogs` cannot be resolved.

- [ ] **Step 3: Implement `BackupDialogs.tsx`**

Create `entrypoints/options/components/BackupDialogs.tsx`:

```tsx
/**
 * Password + import-summary dialogs for Data Portability backups.
 * Modelled on ui/Modal's visuals, but with form controls — ui/Modal's
 * onConfirm cannot carry input values.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { Toggle } from '@/ui/Toggle';

interface BackupPasswordDialogProps {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  /** When true, require a matching confirm field (export). Single field for import. */
  requireConfirm?: boolean;
  /** Inline error shown above the actions (e.g. wrong password). */
  error?: string | null;
  busy?: boolean;
  onConfirm: (password: string) => void;
  onCancel: () => void;
}

export function BackupPasswordDialog({
  title,
  message,
  confirmLabel,
  requireConfirm = false,
  error = null,
  busy = false,
  onConfirm,
  onCancel,
}: BackupPasswordDialogProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
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
      () => (dialogRef.current?.querySelector('input') as HTMLInputElement | null)?.focus(),
      50,
    );
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      window.clearTimeout(t);
    };
  }, []);

  const mismatch = requireConfirm && confirm.length > 0 && confirm !== password;
  const canSubmit =
    password.length >= 8 &&
    (!requireConfirm || (confirm.length > 0 && confirm === password));

  const submit = () => {
    if (!canSubmit || busy) return;
    onConfirm(password);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div
        ref={dialogRef}
        className="relative w-full max-w-md mx-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl animate-[scaleIn_200ms_ease-out] overflow-hidden"
      >
        <div className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/15">
              <KeyRound className="w-4 h-4 text-blue-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
              <div className="text-sm text-zinc-400 mt-1.5 leading-relaxed">{message}</div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="backup-password" className="text-xs font-medium text-zinc-400">
                Passphrase{requireConfirm ? ' (min 8 characters)' : ''}
              </label>
              <Input
                id="backup-password"
                aria-label="Passphrase"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter passphrase"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSubmit && !busy) submit();
                }}
              />
            </div>
            {requireConfirm && (
              <div>
                <label htmlFor="backup-password-confirm" className="text-xs font-medium text-zinc-400">
                  Confirm passphrase
                </label>
                <Input
                  id="backup-password-confirm"
                  aria-label="Confirm passphrase"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat passphrase"
                  error={mismatch ? 'Passphrases do not match' : undefined}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canSubmit && !busy) submit();
                  }}
                />
              </div>
            )}
            {password.length > 0 && password.length < 8 && (
              <p className="text-xs text-amber-400/90">Use at least 8 characters.</p>
            )}
            {error && (
              <p
                className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={submit}
              disabled={!canSubmit || busy}
              loading={busy}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ImportSummaryDialogProps {
  source: 'plain' | 'encrypted';
  recognizedCount: number;
  ignored: string[];
  onConfirm: (replaceAll: boolean) => void;
  onCancel: () => void;
}

export function ImportSummaryDialog({
  source,
  recognizedCount,
  ignored,
  onConfirm,
  onCancel,
}: ImportSummaryDialogProps) {
  const [replaceAll, setReplaceAll] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Import settings"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div
        ref={dialogRef}
        className="relative w-full max-w-md mx-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl animate-[scaleIn_200ms_ease-out] overflow-hidden"
      >
        <div className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/15">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-zinc-100">Import settings</h3>
              <div className="text-sm text-zinc-400 mt-1.5 leading-relaxed">
                {source === 'encrypted'
                  ? 'Encrypted backup decrypted successfully. Review what will be applied.'
                  : 'Review what will be applied from this file.'}
              </div>
            </div>
          </div>

          <ul className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-xs text-zinc-400">
            <li className="flex gap-2">
              <span className="text-emerald-400/70">•</span>
              {recognizedCount} recognized setting{recognizedCount === 1 ? '' : 's'}
              {source === 'encrypted' ? ' (decrypted backup)' : ''}
            </li>
            {ignored.length > 0 ? (
              <li className="flex gap-2">
                <span className="text-amber-400/80">•</span>
                {ignored.length} unknown key{ignored.length === 1 ? '' : 's'} ignored:{' '}
                {ignored.join(', ')}
              </li>
            ) : (
              <li className="flex gap-2">
                <span className="text-zinc-600">•</span>
                No unknown keys
              </li>
            )}
          </ul>

          <div className="mt-4">
            <Toggle
              id="import-replace-toggle"
              checked={replaceAll}
              onChange={setReplaceAll}
              label="Replace all current settings"
              description={
                replaceAll
                  ? 'Everything not in the file resets to defaults — exact restore.'
                  : 'Merge: only the settings in the file are applied; everything else stays.'
              }
            />
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={() => onConfirm(replaceAll)}>
              {replaceAll ? 'Replace & import' : 'Merge & import'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run entrypoints/options/components/__tests__/BackupDialogs.test.tsx`
Expected: PASS. If the `getByLabelText(/passphrase/i)` queries are ambiguous, fix by targeting the `aria-label`s added above.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/components/BackupDialogs.tsx entrypoints/options/components/__tests__/BackupDialogs.test.tsx
git commit -m "feat: add backup password and import summary dialogs"
```

---

### Task 4: Wire full-settings backup into the Advanced tab

**Files:**
- Modify: `entrypoints/options/sections/AdvancedSection.tsx`
- Test: `entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx`

**Interfaces:**
- Consumes: `lib/backup.ts` (Task 1), store `replaceSettings` (Task 2), `BackupPasswordDialog` + `ImportSummaryDialog` (Task 3).
- Produces: the Data Portability UI behavior — two export actions, auto-detect import with password prompt + replace/merge summary.

- [ ] **Step 1: Write the failing component tests**

Create `entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx`:

```tsx
/**
 * Tests: Advanced tab Data Portability — full plaintext export, encrypted
 * export/import, and merge-vs-replace import behavior.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { webcrypto } from 'node:crypto';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '@/types/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { ToastProvider } from '@/ui/ToastProvider';
import { AdvancedSection } from '../AdvancedSection';
import { encryptBackup } from '@/lib/backup';

// jsdom's crypto lacks subtle; use Node's webcrypto for the real crypto paths.
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

const cacheStatsState = vi.hoisted(() => ({
  entryCount: 0,
  totalSizeBytes: 0,
  sizeMb: 0,
  sizeLabel: '0 B',
  loading: false,
  refresh: vi.fn(),
}));

vi.mock('@/entrypoints/options/hooks/useCacheStats', () => ({
  useCacheStats: () => cacheStatsState,
}));

const blobUrl = vi.hoisted(() => vi.fn(() => 'blob:mock'));
const revokeUrl = vi.hoisted(() => vi.fn());
const anchorClick = vi.hoisted(() => vi.fn());

function renderAdvanced() {
  return render(
    <ToastProvider>
      <AdvancedSection />
    </ToastProvider>,
  );
}

function storeWith(overrides: Partial<ExtensionSettings> & { updateSettings?: unknown; replaceSettings?: unknown }) {
  useSettingsStore.setState({
    ...DEFAULT_SETTINGS,
    ...overrides,
    isLoaded: true,
    updateSettings: vi.fn(),
    replaceSettings: vi.fn(),
  } as never);
}

async function readLastDownload(): Promise<Record<string, unknown>> {
  const blob = (blobUrl as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as Blob;
  expect(blob).toBeTruthy();
  return JSON.parse(await blob.text()) as Record<string, unknown>;
}

describe('AdvancedSection Data Portability', () => {
  beforeEach(() => {
    blobUrl.mockClear();
    revokeUrl.mockClear();
    anchorClick.mockClear();
    vi.spyOn(URL, 'createObjectURL').mockImplementation(blobUrl);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeUrl);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(anchorClick);
    storeWith({});
  });

  it('plain export downloads the FULL settings object (providers, pdf, toggles)', async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      targetLanguage: 'ja',
      theme: 'bubble',
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
          keys: [{ id: 'k1', apiKey: 'sk-abc', maxRpm: 20, concurrencyLimit: 1, interval: 500, enabled: true }],
        },
      ],
    };
    storeWith(settings);
    renderAdvanced();

    fireEvent.click(screen.getByRole('button', { name: /export json/i }));

    const payload = await readLastDownload();
    expect(payload['providers']).toEqual(settings.providers);
    expect(payload['pdfSettings']).toBeTruthy();
    expect(payload['scientificPdf']).toBeTruthy();
    expect(payload['enableShadowDomWalk']).toBe(false);
    expect(anchorClick).toHaveBeenCalled();
  });

  it('encrypted export asks for a matching password and downloads an envelope', async () => {
    storeWith({ targetLanguage: 'ja' });
    renderAdvanced();

    fireEvent.click(screen.getByRole('button', { name: /encrypted backup/i }));
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm passphrase'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /encrypt & download/i }));

    await waitFor(() => expect(blobUrl).toHaveBeenCalled());
    const payload = await readLastDownload();
    expect(payload['format']).toBe('anyllm-translate-backup');
    expect(payload['ciphertext']).toBeTruthy();
  });

  it('plain import merges by default — only the file keys are passed to updateSettings', async () => {
    const updateSettings = vi.fn();
    storeWith({ updateSettings });
    renderAdvanced();

    const file = new File([JSON.stringify({ targetLanguage: 'ko' })], 'settings.json', {
      type: 'application/json',
    });
    fireEvent.change(screen.getByTestId('import-settings-file'), { target: { files: [file] } });

    await screen.findByRole('dialog', { name: 'Import settings' });
    fireEvent.click(screen.getByRole('button', { name: 'Merge & import' }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ targetLanguage: 'ko' }));
    expect(screen.getByText(/settings imported successfully/i)).toBeInTheDocument();
  });

  it('plain import can exact-restore via the replace toggle', async () => {
    const replaceSettings = vi.fn();
    storeWith({ replaceSettings });
    renderAdvanced();

    const file = new File([JSON.stringify({ targetLanguage: 'ko', theme: 'paper' })], 's.json', {
      type: 'application/json',
    });
    fireEvent.change(screen.getByTestId('import-settings-file'), { target: { files: [file] } });

    await screen.findByRole('dialog', { name: 'Import settings' });
    fireEvent.click(screen.getByRole('button', { name: 'Replace all current settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace & import' }));

    await waitFor(() =>
      expect(replaceSettings).toHaveBeenCalledWith({ targetLanguage: 'ko', theme: 'paper' }),
    );
  });

  it('encrypted import asks for the password, rejects wrong ones, then proceeds', async () => {
    const updateSettings = vi.fn();
    storeWith({ updateSettings });
    const envelope = await encryptBackup(
      { ...DEFAULT_SETTINGS, targetLanguage: 'fr' },
      'password123',
    );
    renderAdvanced();

    const file = new File([envelope], 'backup.json', { type: 'application/json' });
    fireEvent.change(screen.getByTestId('import-settings-file'), { target: { files: [file] } });

    await screen.findByRole('dialog', { name: 'Unlock backup' });
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/wrong password or corrupted file/i);
    expect(updateSettings).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    await screen.findByRole('dialog', { name: 'Import settings' });
    fireEvent.click(screen.getByRole('button', { name: 'Merge & import' }));
    await waitFor(() => expect(updateSettings).toHaveBeenCalled());
    const arg = (updateSettings as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
    expect(arg['targetLanguage']).toBe('fr');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx`
Expected: FAIL — no `Encrypted backup` button, no `getByTestId('import-settings-file')`, and `AdvancedSection` has no encrypted flow.

- [ ] **Step 3: Implement the Advanced tab wiring**

In `entrypoints/options/sections/AdvancedSection.tsx`:

1. **Imports** — add to the lucide import list: `Lock`. Add new imports after the existing `@/lib/scientificPdf` block:

```ts
import {
  BackupDecryptError,
  decryptBackup,
  detectFormat,
  encryptBackup,
  sanitizeImportObject,
  serializeSettings,
} from '@/lib/backup';
import {
  BackupPasswordDialog,
  ImportSummaryDialog,
} from '@/entrypoints/options/components/BackupDialogs';
```

2. **Delete** the `PORTABLE_KEYS` constant (lines ~103–132) and its comment block — it becomes dead code.

3. **Add a module-scope download helper** after `CHIP_BASE_CLASS`:

```ts
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

4. **Component state** — inside `AdvancedSection()`, after the existing `fileInputRef` line:

```ts
const replaceSettings = useSettingsStore((s) => s.replaceSettings);
const [showExportPassword, setShowExportPassword] = useState(false);
const [showImportPassword, setShowImportPassword] = useState(false);
const [pendingEncryptedText, setPendingEncryptedText] = useState<string | null>(null);
const [passwordError, setPasswordError] = useState<string | null>(null);
const [passwordBusy, setPasswordBusy] = useState(false);
const [importBusy, setImportBusy] = useState(false);
const [importMeta, setImportMeta] = useState<{
  recognized: Record<string, unknown>;
  ignored: string[];
  source: 'plain' | 'encrypted';
} | null>(null);
```

5. **Replace `handleExportSettings`** with plain + encrypted handlers:

```ts
const hasApiKeys =
  Boolean(settings.provider?.apiKey) ||
  (settings.providers ?? []).some((p) => (p.keys ?? []).some((k) => Boolean(k.apiKey)));

const handleExportPlain = useCallback(() => {
  const blob = new Blob([serializeSettings(settings)], { type: 'application/json' });
  downloadBlob(
    blob,
    `anyllm-translate-settings-${new Date().toISOString().slice(0, 10)}.json`,
  );
  // P2 security: the full export carries every API key in cleartext.
  if (hasApiKeys) {
    showError('Exported file contains your API keys in cleartext — keep it private!');
  } else {
    showSuccess('Settings exported successfully');
  }
}, [settings, hasApiKeys, showSuccess, showError]);

const handleExportEncrypted = useCallback(
  async (password: string) => {
    setPasswordBusy(true);
    setPasswordError(null);
    try {
      const envelope = await encryptBackup(settings, password);
      downloadBlob(
        new Blob([envelope], { type: 'application/json' }),
        `anyllm-translate-backup-${new Date().toISOString().slice(0, 10)}.json`,
      );
      setShowExportPassword(false);
      showSuccess('Encrypted backup exported — keep the passphrase safe!');
    } catch {
      setPasswordError('Encryption failed — try again.');
    } finally {
      setPasswordBusy(false);
    }
  },
  [settings, showSuccess],
);
```

6. **Replace `handleImportSettings`** with the pipeline:

```ts
const handleImportFile = useCallback(
  async (file: File) => {
    try {
      const text = await file.text();
      if (detectFormat(text) === 'encrypted') {
        setPendingEncryptedText(text);
        setPasswordError(null);
        setShowImportPassword(true);
        return;
      }
      const { recognized, ignored } = sanitizeImportObject(JSON.parse(text));
      setImportMeta({ recognized, ignored, source: 'plain' });
    } catch {
      showError('Failed to import settings. Invalid JSON file.');
    }
  },
  [showError],
);

const handleImportPassword = useCallback(
  async (password: string) => {
    if (!pendingEncryptedText) return;
    setPasswordBusy(true);
    setPasswordError(null);
    try {
      const decrypted = await decryptBackup(pendingEncryptedText, password);
      const { recognized, ignored } = sanitizeImportObject(decrypted);
      setShowImportPassword(false);
      setPendingEncryptedText(null);
      setImportMeta({ recognized, ignored, source: 'encrypted' });
    } catch (err) {
      setPasswordError(
        err instanceof BackupDecryptError
          ? err.message
          : 'Wrong password or corrupted file',
      );
    } finally {
      setPasswordBusy(false);
    }
  },
  [pendingEncryptedText],
);

const handleImportApply = useCallback(
  async (replaceAll: boolean) => {
    if (!importMeta || importBusy) return;
    setImportBusy(true);
    try {
      if (replaceAll) {
        await replaceSettings(importMeta.recognized);
      } else {
        await updateSettings(importMeta.recognized);
      }
      if (importMeta.ignored.length > 0) {
        showSuccess(
          `Imported ${Object.keys(importMeta.recognized).length} settings; ignored ${importMeta.ignored.length} unknown key(s): ${importMeta.ignored.join(', ')}`,
        );
      } else {
        showSuccess('Settings imported successfully!');
      }
    } catch {
      showError('Failed to import settings.');
    } finally {
      setImportBusy(false);
      setImportMeta(null);
    }
  },
  [importMeta, importBusy, replaceSettings, updateSettings, showSuccess, showError],
);
```

7. **Data Portability card UI** — replace the export button block and import description. In the export card (the first `flex flex-col gap-3 ...` div):

Replace:

```tsx
                <Button
                  id="export-settings-btn"
                  variant="secondary"
                  size="sm"
                  onClick={handleExportSettings}
                  icon={<Download className="w-3.5 h-3.5" />}
                  className="w-full sm:w-auto"
                >
                  Export JSON
                </Button>
```

with:

```tsx
                <div className="flex flex-wrap gap-2">
                  <Button
                    id="export-settings-btn"
                    variant="secondary"
                    size="sm"
                    onClick={handleExportPlain}
                    icon={<Download className="w-3.5 h-3.5" />}
                  >
                    Export JSON
                  </Button>
                  <Button
                    id="export-encrypted-btn"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowExportPassword(true)}
                    icon={<Lock className="w-3.5 h-3.5" />}
                  >
                    Encrypted backup…
                  </Button>
                </div>
```

8. **Import card** — update description text and the file input:

Replace:

```tsx
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                    Merge a previous export. Unknown keys are ignored safely.
                  </p>
```

with:

```tsx
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                    Restore a plain JSON export or a password-encrypted backup. Choose merge or
                    exact replace before applying.
                  </p>
```

Replace the hidden input:

```tsx
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImportSettings(file);
                    e.target.value = '';
                  }}
                />
```

with:

```tsx
                <input
                  ref={fileInputRef}
                  data-testid="import-settings-file"
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleImportFile(file);
                    e.target.value = '';
                  }}
                />
```

9. **Warning callout** — replace the whole `<div className={...mt-3 flex items-start gap-2...}>` block (the `settings.provider?.apiKey` conditional) with:

```tsx
            <div
              className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${
                hasApiKeys
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-zinc-800 bg-zinc-900/40 text-zinc-500'
              }`}
            >
              {hasApiKeys ? (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden="true" />
              )}
              <span>
                {hasApiKeys
                  ? 'Plain JSON exports include ALL your API keys in cleartext. Treat the file as a secret. Use "Encrypted backup" to move keys safely between devices.'
                  : 'Plain JSON exports include provider configuration. Once API keys are added, they appear as cleartext in plain JSON exports — prefer "Encrypted backup" for moving devices.'}
              </span>
            </div>
```

10. **Card description** — update the Data Portability Card description prop:

Replace:

```tsx
            description="Back up or restore settings as JSON. Useful before resets or when moving browsers."
```

with:

```tsx
            description="Back up or restore all settings as plain JSON or a password-encrypted backup. Useful before resets or when moving browsers."
```

11. **Render the new dialogs** — add just before the closing `</div>` of the component, after the Reset Confirmation Modal block:

```tsx
      {/* Encrypted Export Password Modal */}
      {showExportPassword && (
        <BackupPasswordDialog
          title="Encrypt backup"
          message={
            <p>
              The file is encrypted with your passphrase (PBKDF2 + AES-256-GCM). Anyone with the
              file and this passphrase can restore it on any device. If you forget the passphrase,
              the backup is unrecoverable.
            </p>
          }
          confirmLabel="Encrypt & download"
          requireConfirm
          error={passwordError}
          busy={passwordBusy}
          onConfirm={(password) => void handleExportEncrypted(password)}
          onCancel={() => {
            setShowExportPassword(false);
            setPasswordError(null);
          }}
        />
      )}

      {/* Encrypted Import Password Modal */}
      {showImportPassword && (
        <BackupPasswordDialog
          title="Unlock backup"
          message="Enter the passphrase that was used when this backup was exported."
          confirmLabel="Unlock"
          error={passwordError}
          busy={passwordBusy}
          onConfirm={(password) => void handleImportPassword(password)}
          onCancel={() => {
            setShowImportPassword(false);
            setPendingEncryptedText(null);
            setPasswordError(null);
          }}
        />
      )}

      {/* Import Summary Modal */}
      {importMeta && (
        <ImportSummaryDialog
          source={importMeta.source}
          recognizedCount={Object.keys(importMeta.recognized).length}
          ignored={importMeta.ignored}
          onConfirm={(replaceAll) => void handleImportApply(replaceAll)}
          onCancel={() => setImportMeta(null)}
        />
      )}
```

- [ ] **Step 4: Run the new tests and the existing Advanced tests**

Run: `pnpm vitest run entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.jumpNav.test.tsx`
Expected: PASS. If `getByLabelText('Passphrase')` is ambiguous (two dialogs can't be open at once, but the export dialog has an extra confirm field), use `screen.getByLabelText('Passphrase')` — only one password dialog renders at a time.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/sections/AdvancedSection.tsx entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx
git commit -m "feat: wire full-settings backup and encrypted import into Advanced tab"
```

---

### Task 5: Full quality gates

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS (existing suite + new tests). If any pre-existing test fails that is unrelated to this work, note it and do not touch it.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors in changed files (fix any in `lib/backup.ts`, `BackupDialogs.tsx`, `AdvancedSection.tsx`, and the test files).

- [ ] **Step 3: Type check**

Run: `pnpm compile`
Expected: `tsc --noEmit` exits 0.

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: WXT build succeeds (this is `wxt build`; the `postinstall` already ran `wxt prepare`).

- [ ] **Step 5: Final commit**

If the gates required any fixes, commit them:

```bash
git add -A
git commit -m "fix: satisfy quality gates for backup feature"
```

Otherwise skip. Then close the tracker issue once the work is pushed per the repo workflow:

```bash
bd close AnyLLMTranslate-8ms
```

---

## Self-Review Notes (checked against spec)

- **Spec coverage:** encrypted envelope fields + AAD (Task 1) ✓; full plaintext export with upgraded warning (Task 4) ✓; auto-detect + password prompt + replace/merge checkbox (Tasks 1, 3, 4) ✓; sanitizer with pollution guard + ignored-key report (Task 1, 4) ✓; old plain files still import (detectFormat → 'plain') ✓; store exact-restore (Task 2) ✓; tests for wrong password/tamper/version/round-trip (Task 1) and component flows (Tasks 3–4) ✓; quality gates (Task 5) ✓.
- **Behavior correction vs spec:** merge now truly merges (only file keys), fixing the "today's behavior resets absent keys" trap — spec updated in Task 1 Step 1.
- **Type consistency:** `detectFormat`, `encryptBackup`, `decryptBackup`, `sanitizeImportObject`, `serializeSettings`, `BackupDecryptError` names match across Tasks 1/4; `replaceSettings` matches Tasks 2/4; dialog prop names match Tasks 3/4.
