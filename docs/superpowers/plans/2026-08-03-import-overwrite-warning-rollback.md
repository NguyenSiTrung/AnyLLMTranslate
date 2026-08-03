# Import Overwrite Warning + Pre-Import Rollback Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Warn users which settings an import will overwrite/reset, and let them undo an import by restoring a single pre-import snapshot (toast Undo + persistent button).

**Architecture:** A pure diff function (`computeImportImpact` + `deepEqual` + `pickKnownSettings` in `lib/backup.ts`) computes the warning lists the `ImportSummaryDialog` shows. Before applying any import, the full current settings are encrypted at rest into a single snapshot slot (`lib/config.ts` helpers under a new `STORAGE_KEYS.PRE_IMPORT_SNAPSHOT` key). Rollback restores that snapshot via a new `restoreSettings` store action, then clears the slot. The shared toast gains optional action-button support so the import-success toast can offer "Undo import".

**Tech Stack:** TypeScript, React 19, Zustand 5, Vitest 3 + Testing Library, chrome.storage.local, WebCrypto (AES-GCM for API keys at rest), WXT.

## Global Constraints

- The repository has **no git author identity configured**. Commit with one-off flags; never change git config:
  `git -c user.name="Trung Nguyen" -c user.email="trungnguyen@Trungs-Mac-mini.local" commit -m "…"`.
- Commit messages follow repo convention (conventional commits: `feat(scope): …`, `fix(scope): …`, `chore(scope): …`).
- **Beads tracking:** issue `AnyLLMTranslate-yqr` owns this work. Do NOT use TodoWrite for task tracking. Run `bd update AnyLLMTranslate-yqr --claim` before starting, `bd update AnyLLMTranslate-yqr --notes "…"` after each task, `bd close AnyLLMTranslate-yqr` when the plan completes.
- Code style: single quotes, semicolons, `import type` for type-only imports, **no non-null assertions (`!`)** — eslint `no-non-null-assertion` is on; use optional chaining / explicit guards instead. Prototype-pollution-safe object access (`Object.prototype.hasOwnProperty.call`).
- Test environments are auto-selected by `vitest.config.ts` (`environmentMatchGlobs`): `lib/**` default **node**; `entrypoints/**`, `ui/**` → **jsdom**. `vitest.setup.ts` mocks `chrome` for jsdom; node-env tests that touch `lib/config.ts` must mock `../crypto` and `chrome.storage` explicitly (pattern: `lib/__tests__/configMigration.pool.test.ts`).
- Run the narrowest tests after each task: `npx vitest run <file>`. Full quality gates run once in Task 9: `npm test`, `npm run compile`, `npm run lint`.
- `lib/backup.ts` must stay chrome.*-free (pure, node-testable).
- Spec: `docs/superpowers/specs/2026-08-03-import-overwrite-warning-rollback-design.md`.

---

### Task 1: `deepEqual` helper in `lib/backup.ts`

**Files:**
- Modify: `lib/backup.ts` (add helper near the top, after the `FORBIDDEN_KEYS` set)
- Test: `lib/__tests__/backup.test.ts`

**Interfaces:**
- Produces: `export function deepEqual(a: unknown, b: unknown): boolean` — structural equality for JSON-shaped settings values. Scalars via `Object.is`; arrays element-wise in order; plain objects by own-key sets (own keys only); everything else reference equality.

- [ ] **Step 1: Write the failing tests**

Append to `lib/__tests__/backup.test.ts` (before the `afterEach` block), and add `deepEqual` to the existing import from `@/lib/backup`:

```ts
import {
  BACKUP_FORMAT,
  BackupDecryptError,
  deepEqual,
  decryptBackup,
  detectFormat,
  encryptBackup,
  sanitizeImportObject,
  serializeSettings,
} from '@/lib/backup';
```

```ts
describe('deepEqual', () => {
  it('compares scalars with Object.is semantics', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual(0, -0)).toBe(false);
    expect(deepEqual(NaN, NaN)).toBe(true);
  });

  it('compares arrays element-wise, order-sensitive', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual([{ a: 1 }], [{ a: 1 }])).toBe(true);
  });

  it('compares nested plain objects by own keys', () => {
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
  });

  it('never compares inherited properties', () => {
    const o = Object.create({ inherited: 1 }) as Record<string, unknown>;
    o.own = 1;
    expect(deepEqual(o, { own: 1 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/backup.test.ts`
Expected: FAIL — `deepEqual is not a function` / undefined import.

- [ ] **Step 3: Implement `deepEqual`**

Add to `lib/backup.ts` (after the `FORBIDDEN_KEYS` const):

```ts
/** True for plain JSON-shaped objects (settings data is JSON-shaped). */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof Date) &&
    !(v instanceof RegExp) &&
    !(v instanceof Map) &&
    !(v instanceof Set)
  );
}

/**
 * Structural equality for JSON-shaped settings values. Arrays compare
 * element-wise in order (deepMerge replaces arrays wholesale, so order
 * matters); plain objects compare own keys only (prototype-pollution safe).
 * Scalars use Object.is; anything non-JSON falls back to reference equality.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => deepEqual(value, b[index]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]),
    );
  }
  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/backup.test.ts`
Expected: PASS (all existing + new deepEqual tests).

- [ ] **Step 5: Commit**

```bash
git add lib/backup.ts lib/__tests__/backup.test.ts
git -c user.name="Trung Nguyen" -c user.email="trungnguyen@Trungs-Mac-mini.local" commit -m "feat(backup): add deepEqual for settings diffing"
```

---

### Task 2: `computeImportImpact` diff function in `lib/backup.ts`

**Files:**
- Modify: `lib/backup.ts` (imports + new function)
- Test: `lib/__tests__/backup.test.ts`

**Interfaces:**
- Consumes: `deepEqual` (Task 1); `deepMerge` from `@/lib/utils`; `BUILT_IN_RULES` from `@/lib/siteRules`; `DEFAULT_SETTINGS` from `@/types/config` (already imported).
- Produces:
  - `export interface ImportImpact { changed: string[]; resetToDefaults: string[] }`
  - `export function computeImportImpact(current: ExtensionSettings, recognized: Record<string, unknown>, mode: 'merge' | 'replace'): ImportImpact`

Semantics (must mirror the store exactly): merge = `deepMerge(current, recognized)`; replace = `deepMerge({ ...DEFAULT_SETTINGS, siteRules: BUILT_IN_RULES copies }, recognized)` — the same baseline `settingsStore.replaceSettings` builds. `changed` = recognized keys whose post-import value differs from current; `resetToDefaults` (replace only) = customized keys absent from the file. `undefined` file values leave the value unchanged in merge (stays current) and in replace (stays default).

- [ ] **Step 1: Write the failing tests**

Add imports to `lib/__tests__/backup.test.ts`:

```ts
import { BUILT_IN_RULES } from '@/lib/siteRules';
```

Add `computeImportImpact` to the `@/lib/backup` import list. Append:

```ts
describe('computeImportImpact', () => {
  const customized = (): ExtensionSettings => ({
    ...DEFAULT_SETTINGS,
    targetLanguage: 'ja',
    theme: 'bubble',
    // Untouched built-in site rules — how a real loaded store looks.
    siteRules: BUILT_IN_RULES.map((r) => ({ ...r })),
  });

  it('merge: lists recognized keys whose imported value differs from current', () => {
    const impact = computeImportImpact(customized(), { targetLanguage: 'ko' }, 'merge');
    expect(impact.changed).toEqual(['targetLanguage']);
    expect(impact.resetToDefaults).toEqual([]);
  });

  it('merge: omits keys whose imported value equals current', () => {
    const impact = computeImportImpact(customized(), { targetLanguage: 'ja' }, 'merge');
    expect(impact.changed).toEqual([]);
  });

  it('merge: a partial nested object that changes a nested field is listed as changed', () => {
    const current = customized();
    current.pdfSettings = { ...DEFAULT_SETTINGS.pdfSettings, openMode: 'same-tab' };
    const impact = computeImportImpact(current, { pdfSettings: { autoOpen: 'prompt' } }, 'merge');
    expect(impact.changed).toEqual(['pdfSettings']);
  });

  it('merge: undefined file values are no-ops', () => {
    const current = customized();
    const impact = computeImportImpact(current, { targetLanguage: undefined }, 'merge');
    expect(impact.changed).toEqual([]);
  });

  it('replace: lists changed recognized keys against the defaults baseline', () => {
    const impact = computeImportImpact(customized(), { targetLanguage: 'ko' }, 'replace');
    expect(impact.changed).toEqual(['targetLanguage']);
  });

  it('replace: lists customized keys absent from the file as resetToDefaults', () => {
    const impact = computeImportImpact(customized(), { targetLanguage: 'ko' }, 'replace');
    expect(impact.resetToDefaults).toContain('theme');
    expect(impact.resetToDefaults).not.toContain('targetLanguage');
  });

  it('replace: untouched built-in site rules are NOT listed as resetToDefaults', () => {
    const impact = computeImportImpact(customized(), { targetLanguage: 'ko' }, 'replace');
    expect(impact.resetToDefaults).not.toContain('siteRules');
  });

  it('replace: empty recognized file warns every customized key; merge is a no-op', () => {
    const current = customized();
    expect(computeImportImpact(current, {}, 'merge')).toEqual({
      changed: [],
      resetToDefaults: [],
    });
    const replace = computeImportImpact(current, {}, 'replace');
    expect(replace.changed).toEqual([]);
    expect(replace.resetToDefaults).toContain('theme');
    expect(replace.resetToDefaults).toContain('targetLanguage');
  });

  it('replace: nothing customized means no reset warnings', () => {
    const current = { ...DEFAULT_SETTINGS, siteRules: BUILT_IN_RULES.map((r) => ({ ...r })) };
    expect(computeImportImpact(current, {}, 'replace').resetToDefaults).toEqual([]);
  });
});
```

Note: `computeImportImpact(customized(), …)` creates a fresh object per call via the helper, so mutating `current.pdfSettings` in the nested-object test never leaks.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/backup.test.ts`
Expected: FAIL — `computeImportImpact is not defined`.

- [ ] **Step 3: Implement `computeImportImpact`**

Add imports at the top of `lib/backup.ts`:

```ts
import { deepMerge } from '@/lib/utils';
import { BUILT_IN_RULES } from '@/lib/siteRules';
```

Add after `deepEqual`:

```ts
export interface ImportImpact {
  /** Recognized keys whose post-import value differs from the current value. */
  changed: string[];
  /** Replace mode only: customized keys absent from the file that reset to defaults. */
  resetToDefaults: string[];
}

/**
 * Compute what an import would change before it is applied, mirroring the
 * store's real semantics (lib/utils deepMerge: arrays overwritten, empty
 * source objects replace). Merge deep-merges onto current; replace resets to
 * defaults — with built-in site rules injected exactly like
 * settingsStore.replaceSettings — then applies the file.
 *
 * The `current` argument must be a loaded store state (site rules injected),
 * i.e. what pickKnownSettings produces.
 */
export function computeImportImpact(
  current: ExtensionSettings,
  recognized: Record<string, unknown>,
  mode: 'merge' | 'replace',
): ImportImpact {
  const baseline: ExtensionSettings =
    mode === 'replace'
      ? { ...DEFAULT_SETTINGS, siteRules: BUILT_IN_RULES.map((r) => ({ ...r })) }
      : current;

  const currentRecord = current as unknown as Record<string, unknown>;
  const baselineRecord = baseline as unknown as Record<string, unknown>;

  const changed: string[] = [];
  for (const [key, fileValue] of Object.entries(recognized)) {
    const currentValue = currentRecord[key];
    const baseValue = baselineRecord[key];
    let postImportValue: unknown;
    if (fileValue === undefined) {
      // deepMerge skips undefined source values: merge keeps current, replace keeps default.
      postImportValue = mode === 'merge' ? currentValue : baseValue;
    } else if (isPlainObject(baseValue) && isPlainObject(fileValue)) {
      postImportValue = deepMerge(baseValue, fileValue);
    } else {
      postImportValue = fileValue;
    }
    if (!deepEqual(currentValue, postImportValue)) changed.push(key);
  }

  let resetToDefaults: string[] = [];
  if (mode === 'replace') {
    resetToDefaults = Object.keys(DEFAULT_SETTINGS).filter(
      (key) =>
        !Object.prototype.hasOwnProperty.call(recognized, key) &&
        !deepEqual(currentRecord[key], baselineRecord[key]),
    );
  }

  return { changed, resetToDefaults };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/backup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/backup.ts lib/__tests__/backup.test.ts
git -c user.name="Trung Nguyen" -c user.email="trungnguyen@Trungs-Mac-mini.local" commit -m "feat(backup): compute import overwrite impact"
```

---

### Task 3: `pickKnownSettings` snapshot capture in `lib/backup.ts`

**Files:**
- Modify: `lib/backup.ts`
- Test: `lib/__tests__/backup.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_SETTINGS` (already imported).
- Produces: `export function pickKnownSettings(state: ExtensionSettings | Record<string, unknown>): ExtensionSettings`

Picks every top-level key of `DEFAULT_SETTINGS` from a settings-like record (zustand store state), falling back to defaults for missing keys. Includes `safeKeyThrottleMigrated` (which `extractSettings` omits) and never copies store internals (`isLoaded`, methods).

- [ ] **Step 1: Write the failing tests**

Add `pickKnownSettings` to the `@/lib/backup` import list in `lib/__tests__/backup.test.ts`. Append:

```ts
describe('pickKnownSettings', () => {
  it('picks every DEFAULT_SETTINGS key and excludes store internals', () => {
    const state = {
      ...DEFAULT_SETTINGS,
      safeKeyThrottleMigrated: true,
      isLoaded: true,
      updateSettings: () => {},
      replaceSettings: () => {},
    };
    const picked = pickKnownSettings(state as unknown as Record<string, unknown>);
    const keys = Object.keys(picked);
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      expect(keys).toContain(k);
    }
    expect(keys).not.toContain('isLoaded');
    expect(keys).not.toContain('updateSettings');
    expect(keys).not.toContain('replaceSettings');
    expect(picked.safeKeyThrottleMigrated).toBe(true);
  });

  it('falls back to DEFAULT_SETTINGS values for missing keys', () => {
    const picked = pickKnownSettings({} as Record<string, unknown>);
    expect(picked.targetLanguage).toBe('vi');
    expect(picked.theme).toBe('blockquote');
    expect(picked.siteRules).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/backup.test.ts`
Expected: FAIL — `pickKnownSettings is not defined`.

- [ ] **Step 3: Implement `pickKnownSettings`**

Add after `computeImportImpact` in `lib/backup.ts`:

```ts
/**
 * Pick every top-level key of DEFAULT_SETTINGS from a settings-like record
 * (the zustand store state). Used to capture the exact pre-import config for
 * the rollback snapshot — includes safeKeyThrottleMigrated, which
 * extractSettings deliberately omits, and never copies store internals
 * (isLoaded, zustand methods). Missing keys fall back to defaults so the
 * result is always a complete ExtensionSettings.
 */
export function pickKnownSettings(
  state: ExtensionSettings | Record<string, unknown>,
): ExtensionSettings {
  const source = state as Record<string, unknown>;
  const defaults = DEFAULT_SETTINGS as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    out[key] = Object.prototype.hasOwnProperty.call(source, key)
      ? source[key]
      : defaults[key];
  }
  return out as unknown as ExtensionSettings;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/backup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/backup.ts lib/__tests__/backup.test.ts
git -c user.name="Trung Nguyen" -c user.email="trungnguyen@Trungs-Mac-mini.local" commit -m "feat(backup): pickKnownSettings for pre-import snapshot"
```

---

### Task 4: Pre-import snapshot storage helpers

**Files:**
- Modify: `lib/constants.ts` (add storage key)
- Modify: `lib/config.ts` (add three helpers after `saveSettings`)
- Create: `lib/__tests__/preImportSnapshot.test.ts`

**Interfaces:**
- Consumes: `encryptPoolKeys`, `decryptPoolKeys`, `encryptApiKey`, `decryptApiKeyResult` (all already in `lib/config.ts`); `STORAGE_KEYS` from `./constants`.
- Produces:
  - `STORAGE_KEYS.PRE_IMPORT_SNAPSHOT: 'anyllm-translate-preimport-snapshot'`
  - `export async function savePreImportSnapshot(settings: ExtensionSettings): Promise<void>`
  - `export async function loadPreImportSnapshot(): Promise<ExtensionSettings | null>`
  - `export async function clearPreImportSnapshot(): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/preImportSnapshot.test.ts`:

```ts
/**
 * Tests: pre-import snapshot slot (save/load/clear) with keys encrypted at rest.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { savePreImportSnapshot, loadPreImportSnapshot, clearPreImportSnapshot } from '../config';
import { STORAGE_KEYS } from '../constants';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '@/types/config';

vi.mock('../crypto', () => ({
  encryptApiKey: vi.fn(async (plain: string) => `enc:${plain}`),
  decryptApiKeyResult: vi.fn(async (value: string) => {
    if (value.startsWith('enc:')) {
      return { value: value.slice(4), ok: true, encrypted: true };
    }
    return { value, ok: true, encrypted: false };
  }),
}));

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockRemove = vi.fn();
global.chrome = {
  storage: {
    local: {
      get: mockGet,
      set: mockSet,
      remove: mockRemove,
    },
  },
} as unknown as typeof chrome;

function settingsWithKeys(): ExtensionSettings {
  return {
    ...DEFAULT_SETTINGS,
    provider: { ...DEFAULT_SETTINGS.provider, apiKey: 'legacy-secret' },
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
            apiKey: 'sk-secret',
            maxRpm: 20,
            concurrencyLimit: 1,
            interval: 500,
            enabled: true,
          },
        ],
      },
    ],
  };
}

describe('pre-import snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves full settings with encrypted keys under the snapshot key', async () => {
    await savePreImportSnapshot(settingsWithKeys());
    expect(mockSet).toHaveBeenCalledTimes(1);
    const data = mockSet.mock.calls[0]?.[0] as Record<string, unknown>;
    const stored = data[STORAGE_KEYS.PRE_IMPORT_SNAPSHOT] as ExtensionSettings;
    expect(stored).toBeTruthy();
    expect(stored.provider.apiKey).toBe('enc:legacy-secret');
    expect(stored.providers[0]?.keys[0]?.apiKey).toBe('enc:sk-secret');
  });

  it('loads and decrypts the snapshot', async () => {
    const source = settingsWithKeys();
    const encrypted: ExtensionSettings = {
      ...source,
      provider: { ...source.provider, apiKey: 'enc:legacy-secret' },
      providers: source.providers.map((p) => ({
        ...p,
        keys: p.keys.map((k) => ({ ...k, apiKey: 'enc:sk-secret' })),
      })),
    };
    mockGet.mockResolvedValue({ [STORAGE_KEYS.PRE_IMPORT_SNAPSHOT]: encrypted });

    const snapshot = await loadPreImportSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot?.provider.apiKey).toBe('legacy-secret');
    expect(snapshot?.providers[0]?.keys[0]?.apiKey).toBe('sk-secret');
  });

  it('returns null when nothing is stored', async () => {
    mockGet.mockResolvedValue({});
    expect(await loadPreImportSnapshot()).toBeNull();
  });

  it('returns null when storage read fails', async () => {
    mockGet.mockRejectedValue(new Error('storage gone'));
    expect(await loadPreImportSnapshot()).toBeNull();
  });

  it('clears the snapshot', async () => {
    await clearPreImportSnapshot();
    expect(mockRemove).toHaveBeenCalledWith(STORAGE_KEYS.PRE_IMPORT_SNAPSHOT);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/preImportSnapshot.test.ts`
Expected: FAIL — `savePreImportSnapshot is not a function` (and the import of `STORAGE_KEYS.PRE_IMPORT_SNAPSHOT` is `undefined`).

- [ ] **Step 3: Implement the storage key**

Add to the `STORAGE_KEYS` object in `lib/constants.ts` (after `ASR_REALIGN_STORE`):

```ts
  /** Pre-import settings snapshot for one-shot rollback after an import. */
  PRE_IMPORT_SNAPSHOT: 'anyllm-translate-preimport-snapshot',
```

- [ ] **Step 4: Implement the helpers**

Add to `lib/config.ts` after `saveSettings`:

```ts
/** Snapshot full settings to the single pre-import slot (keys encrypted at rest). */
export async function savePreImportSnapshot(settings: ExtensionSettings): Promise<void> {
  const encryptedProviders = await encryptPoolKeys(settings.providers ?? []);
  const encrypted = {
    ...settings,
    provider: {
      ...settings.provider,
      apiKey: await encryptApiKey(settings.provider.apiKey),
    },
    providers: encryptedProviders,
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.PRE_IMPORT_SNAPSHOT]: encrypted });
}

/** Read the pre-import snapshot; returns null when absent or unreadable. Keys are decrypted. */
export async function loadPreImportSnapshot(): Promise<ExtensionSettings | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.PRE_IMPORT_SNAPSHOT);
    const stored = result[STORAGE_KEYS.PRE_IMPORT_SNAPSHOT] as ExtensionSettings | undefined;
    if (!stored) return null;
    const decrypted: ExtensionSettings = { ...stored };
    const legacy = await decryptApiKeyResult(decrypted.provider?.apiKey ?? '');
    if (decrypted.provider) {
      decrypted.provider = { ...decrypted.provider, apiKey: legacy.ok ? legacy.value : '' };
    }
    // Freshly deserialized object — in-place decryption is safe (matches loadSettings).
    await decryptPoolKeys(decrypted);
    return decrypted;
  } catch {
    return null;
  }
}

/** Remove the pre-import snapshot (called after a successful rollback). */
export async function clearPreImportSnapshot(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.PRE_IMPORT_SNAPSHOT);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/preImportSnapshot.test.ts`
Expected: PASS. Also run the existing config tests to make sure nothing regressed:

Run: `npx vitest run lib/__tests__/configMigration.pool.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/constants.ts lib/config.ts lib/__tests__/preImportSnapshot.test.ts
git -c user.name="Trung Nguyen" -c user.email="trungnguyen@Trungs-Mac-mini.local" commit -m "feat(config): pre-import snapshot storage helpers"
```

---

### Task 5: `restoreSettings` store action

**Files:**
- Modify: `stores/settingsStore.ts` (interface + implementation)
- Test: `stores/__tests__/settingsStore.test.ts`

**Interfaces:**
- Consumes: `saveSettings` from `@/lib/config` (already imported).
- Produces: `restoreSettings(full: ExtensionSettings): Promise<void>` on the settings store — persists the full object via `saveSettings` and sets it as store state.

- [ ] **Step 1: Write the failing test**

Add a `describe` block to `stores/__tests__/settingsStore.test.ts`:

```ts
describe('restoreSettings', () => {
  it('persists the full object and sets store state', async () => {
    const restored: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      theme: 'bubble',
      targetLanguage: 'ko',
      safeKeyThrottleMigrated: true,
      providers: [
        {
          id: 'p1',
          displayName: 'OpenAI',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
          requiresApiKey: true,
          temperature: 0.3,
          maxTokens: 4096,
          enabled: true,
          keys: [
            {
              id: 'k1',
              apiKey: 'sk-restored',
              maxRpm: 20,
              concurrencyLimit: 1,
              interval: 500,
              enabled: true,
            },
          ],
        },
      ],
    };
    await useSettingsStore.getState().restoreSettings(restored);
    const state = useSettingsStore.getState();
    expect(state.theme).toBe('bubble');
    expect(state.targetLanguage).toBe('ko');
    expect(state.safeKeyThrottleMigrated).toBe(true);
    expect(state.providers[0]?.keys[0]?.apiKey).toBe('sk-restored');
    expect(state.isLoaded).toBe(true);
    const data = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(data['anyllm-translate-settings']).toBeTruthy();
  });
});
```

`ExtensionSettings` is already imported at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run stores/__tests__/settingsStore.test.ts`
Expected: FAIL — `restoreSettings is not a function`.

- [ ] **Step 3: Implement the action**

In `stores/settingsStore.ts`, add to the `SettingsState` interface (after `replaceSettings`):

```ts
  /** Exact restore of a full settings object (used by import rollback). */
  restoreSettings: (full: ExtensionSettings) => Promise<void>;
```

Add to the store implementation (after `replaceSettings`):

```ts
  restoreSettings: async (full) => {
    await saveSettings(full);
    set({ ...full, isLoaded: true });
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run stores/__tests__/settingsStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add stores/settingsStore.ts stores/__tests__/settingsStore.test.ts
git -c user.name="Trung Nguyen" -c user.email="trungnguyen@Trungs-Mac-mini.local" commit -m "feat(store): restoreSettings action for rollback"
```

---

### Task 6: Toast action-button support

**Files:**
- Modify: `ui/Toast.tsx`
- Modify: `ui/ToastProvider.tsx`
- Create: `ui/__tests__/Toast.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `export interface ToastAction { label: string; onClick: () => void }` and `ToastData.action?: ToastAction` (backwards compatible).
  - `useToast()` gains `successWithAction(message: string, action: ToastAction, duration?: number): void`. Existing `success`/`error`/`info`/`toast` signatures unchanged.
  - Toasts with an action auto-dismiss after `duration ?? 8000` ms; no-action toasts keep `duration ?? 4000`.

- [ ] **Step 1: Write the failing tests**

Create `ui/__tests__/Toast.test.tsx`:

```tsx
/**
 * Tests: Toast action-button support (used by the import Undo toast).
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider, useToast } from '@/ui/ToastProvider';
import type { ToastAction } from '@/ui/Toast';

function Harness({ action, message }: { action?: ToastAction; message: string }) {
  const { successWithAction, success } = useToast();
  return (
    <button
      type="button"
      onClick={() => (action ? successWithAction(message, action) : success(message))}
    >
      show
    </button>
  );
}

describe('Toast action', () => {
  it('renders an action button, invokes onClick, and dismisses after click', async () => {
    const onClick = vi.fn();
    render(
      <ToastProvider>
        <Harness action={{ label: 'Undo import', onClick }} message="Imported 2 settings" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'show' }));
    expect(screen.getByText('Imported 2 settings')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo import' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByText('Imported 2 settings')).not.toBeInTheDocument(),
    );
  });

  it('no-action toasts render no action button and behave as before', () => {
    render(
      <ToastProvider>
        <Harness message="Plain success" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'show' }));
    expect(screen.getByText('Plain success')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run ui/__tests__/Toast.test.tsx`
Expected: FAIL — `successWithAction is not a function` (toast action button never renders).

- [ ] **Step 3: Implement `Toast` action support**

In `ui/Toast.tsx`, replace the type block and the component signature + duration logic:

```tsx
export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastData {
  id: string;
  variant: ToastVariant;
  message: string;
  duration?: number;
  action?: ToastAction;
}

interface ToastProps extends ToastData {
  onDismiss: (id: string) => void;
}
```

Change the component to:

```tsx
export function Toast({ id, variant, message, duration, action, onDismiss }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);
  const Icon = icons[variant];
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Action toasts linger so the Undo is discoverable; plain toasts keep 4s.
  const timeoutMs = action ? (duration ?? 8000) : (duration ?? 4000);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      dismissTimerRef.current = setTimeout(() => onDismiss(id), 200);
    }, timeoutMs);
    return () => {
      clearTimeout(timer);
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = undefined;
      }
    };
  }, [id, timeoutMs, onDismiss]);
```

Keep `handleManualDismiss` unchanged, and inside the returned JSX, right after the message `<p>` and before the dismiss button, add:

```tsx
      {action && (
        <button
          onClick={() => {
            action.onClick();
            handleManualDismiss();
          }}
          className="shrink-0 rounded-md border border-zinc-700 bg-zinc-800/80 px-2 py-1 text-xs font-semibold text-zinc-100 transition-colors hover:bg-zinc-700"
        >
          {action.label}
        </button>
      )}
```

- [ ] **Step 4: Implement `successWithAction` in `ToastProvider`**

In `ui/ToastProvider.tsx`:

```tsx
import { Toast, type ToastAction, type ToastData, type ToastVariant } from './Toast';

interface ToastContextValue {
  toast: (variant: ToastVariant, message: string, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  successWithAction: (message: string, action: ToastAction, duration?: number) => void;
}
```

Change `addToast` and `value`:

```tsx
  const addToast = useCallback(
    (variant: ToastVariant, message: string, duration?: number, action?: ToastAction) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, variant, message, duration, action }]);
    },
    [],
  );
```

```tsx
  const value: ToastContextValue = {
    toast: addToast,
    success: (msg, dur) => addToast('success', msg, dur),
    error: (msg, dur) => addToast('error', msg, dur),
    info: (msg, dur) => addToast('info', msg, dur),
    successWithAction: (msg, action, dur) => addToast('success', msg, dur, action),
  };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run ui/__tests__/Toast.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/Toast.tsx ui/ToastProvider.tsx ui/__tests__/Toast.test.tsx
git -c user.name="Trung Nguyen" -c user.email="trungnguyen@Trungs-Mac-mini.local" commit -m "feat(ui): toast action button support"
```

---

### Task 7: Import summary overwrite/reset warnings

**Files:**
- Modify: `entrypoints/options/components/BackupDialogs.tsx` (`ImportSummaryDialog`)
- Create: `entrypoints/options/components/__tests__/BackupDialogs.test.tsx`

**Interfaces:**
- Consumes: `ImportImpact` from `@/lib/backup` (Task 2).
- Produces: `ImportSummaryDialog` gains props `mergeImpact: ImportImpact` and `replaceImpact: ImportImpact`. It derives the visible lists from its local `replaceAll` toggle state: `impact = replaceAll ? replaceImpact : mergeImpact`; renders `impact.changed` (amber, "will be overwritten") always, and `impact.resetToDefaults` (rose, "will reset to defaults") only when `replaceAll` is on.

- [ ] **Step 1: Write the failing tests**

Create `entrypoints/options/components/__tests__/BackupDialogs.test.tsx`:

```tsx
/**
 * Tests: ImportSummaryDialog overwrite/reset warnings.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ImportSummaryDialog } from '../BackupDialogs';

const baseProps = {
  source: 'plain' as const,
  recognizedCount: 1,
  ignored: [] as string[],
  mergeImpact: { changed: ['targetLanguage'], resetToDefaults: [] },
  replaceImpact: { changed: ['targetLanguage'], resetToDefaults: ['theme', 'glossary'] },
  busy: false,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe('ImportSummaryDialog', () => {
  it('shows the overwrite list from the active (merge) impact by default', () => {
    render(<ImportSummaryDialog {...baseProps} />);
    expect(screen.getByText(/1 setting will be overwritten/i)).toBeInTheDocument();
    expect(screen.getByText('targetLanguage')).toBeInTheDocument();
    expect(screen.queryByText(/reset to defaults/i)).not.toBeInTheDocument();
  });

  it('reveals the reset-to-defaults list only when replace is toggled on', () => {
    render(<ImportSummaryDialog {...baseProps} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Replace all current settings' }));
    expect(
      screen.getByText(/2 customized settings not in the file will reset to defaults/i),
    ).toBeInTheDocument();
    expect(screen.getByText('theme')).toBeInTheDocument();
    expect(screen.getByText('glossary')).toBeInTheDocument();
  });

  it('hides both lists when they are empty', () => {
    render(
      <ImportSummaryDialog
        {...baseProps}
        mergeImpact={{ changed: [], resetToDefaults: [] }}
        replaceImpact={{ changed: [], resetToDefaults: [] }}
      />,
    );
    expect(screen.queryByText(/will be overwritten/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reset to defaults/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run entrypoints/options/components/__tests__/BackupDialogs.test.tsx`
Expected: FAIL — TS/type error (missing required props) and no warnings rendered.

- [ ] **Step 3: Implement the dialog**

In `entrypoints/options/components/BackupDialogs.tsx`, add the import:

```tsx
import type { ImportImpact } from '@/lib/backup';
```

Change `ImportSummaryDialogProps`:

```tsx
interface ImportSummaryDialogProps {
  source: 'plain' | 'encrypted';
  recognizedCount: number;
  ignored: string[];
  mergeImpact: ImportImpact;
  replaceImpact: ImportImpact;
  busy?: boolean;
  onConfirm: (replaceAll: boolean) => void;
  onCancel: () => void;
}
```

Change the function signature and add the derived impact:

```tsx
export function ImportSummaryDialog({
  source,
  recognizedCount,
  ignored,
  mergeImpact,
  replaceImpact,
  busy = false,
  onConfirm,
  onCancel,
}: ImportSummaryDialogProps) {
  const [replaceAll, setReplaceAll] = useState(false);
  // ...
  const impact = replaceAll ? replaceImpact : mergeImpact;
```

Insert between the closing `</ul>` and the toggle `<div className="mt-4">`:

```tsx
          {impact.changed.length > 0 && (
            <div
              role="alert"
              className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs"
            >
              <p className="font-medium text-amber-300">
                {impact.changed.length} setting{impact.changed.length === 1 ? '' : 's'} will be
                overwritten:
              </p>
              <p className="mt-1 break-words text-amber-200/80">{impact.changed.join(', ')}</p>
            </div>
          )}

          {replaceAll && impact.resetToDefaults.length > 0 && (
            <div
              role="alert"
              className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-xs"
            >
              <p className="font-medium text-rose-300">
                {impact.resetToDefaults.length} customized setting
                {impact.resetToDefaults.length === 1 ? '' : 's'} not in the file will reset to
                defaults:
              </p>
              <p className="mt-1 break-words text-rose-200/80">
                {impact.resetToDefaults.join(', ')}
              </p>
            </div>
          )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run entrypoints/options/components/__tests__/BackupDialogs.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/components/BackupDialogs.tsx entrypoints/options/components/__tests__/BackupDialogs.test.tsx
git -c user.name="Trung Nguyen" -c user.email="trungnguyen@Trungs-Mac-mini.local" commit -m "feat(options): import summary overwrite warnings"
```

---

### Task 8: AdvancedSection import/rollback flow

**Files:**
- Modify: `entrypoints/options/sections/AdvancedSection.tsx`
- Modify: `entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx`

**Interfaces:**
- Consumes: `computeImportImpact`, `pickKnownSettings`, `ImportImpact` from `@/lib/backup`; `savePreImportSnapshot`, `loadPreImportSnapshot`, `clearPreImportSnapshot` from `@/lib/config`; `restoreSettings` store action (Task 5); `successWithAction` toast (Task 6); `ImportSummaryDialog` new props (Task 7).
- Produces: the full import/rollback UX in the Advanced tab.

Flow: on file select/decrypt, compute `mergeImpact` + `replaceImpact` from `pickKnownSettings(useSettingsStore.getState())` and stash them in `importMeta`. On apply: snapshot current config first (best-effort), apply merge/replace, then re-read the snapshot to decide whether to show the Undo toast and set `hasSnapshot`. `handleRestoreSnapshot` restores via the store action, clears the snapshot, and hides the persistent button. Mount loads `hasSnapshot`.

- [ ] **Step 1: Write the failing tests**

Update `entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx`:

Add a module mock after the existing `vi.mock('@/entrypoints/options/hooks/useCacheStats', …)` block:

```tsx
vi.mock('@/lib/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/config')>();
  return {
    ...actual,
    savePreImportSnapshot: vi.fn(async () => {}),
    loadPreImportSnapshot: vi.fn(async () => null),
    clearPreImportSnapshot: vi.fn(async () => {}),
  };
});
```

Add imports (extend the existing `@/lib/backup`-adjacent imports; `ExtensionSettings` is already imported):

```tsx
import { BUILT_IN_RULES } from '@/lib/siteRules';
import {
  clearPreImportSnapshot,
  loadPreImportSnapshot,
  savePreImportSnapshot,
} from '@/lib/config';
```

In `beforeEach`, after `storeWith({})`, reset the config mocks:

```tsx
    vi.mocked(savePreImportSnapshot).mockClear();
    vi.mocked(clearPreImportSnapshot).mockClear();
    vi.mocked(loadPreImportSnapshot).mockResolvedValue(null);
```

Append these tests inside the `describe('AdvancedSection Data Portability', …)` block:

```tsx
  it('shows which settings will be overwritten in the import summary (merge)', async () => {
    storeWith({ targetLanguage: 'ja', theme: 'bubble' });
    renderAdvanced();

    const file = new File([JSON.stringify({ targetLanguage: 'ko' })], 's.json', {
      type: 'application/json',
    });
    fireEvent.change(screen.getByTestId('import-settings-file'), { target: { files: [file] } });

    await screen.findByRole('dialog', { name: 'Import settings' });
    expect(screen.getByText(/1 setting will be overwritten/i)).toBeInTheDocument();
    expect(screen.getByText('targetLanguage')).toBeInTheDocument();
  });

  it('replace toggle reveals the reset-to-defaults list', async () => {
    storeWith({
      targetLanguage: 'ja',
      theme: 'bubble',
      siteRules: BUILT_IN_RULES.map((r) => ({ ...r })),
    });
    renderAdvanced();

    const file = new File([JSON.stringify({ targetLanguage: 'ko' })], 's.json', {
      type: 'application/json',
    });
    fireEvent.change(screen.getByTestId('import-settings-file'), { target: { files: [file] } });

    await screen.findByRole('dialog', { name: 'Import settings' });
    expect(screen.queryByText(/reset to defaults/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Replace all current settings' }));
    expect(
      screen.getByText(/customized setting.*will reset to defaults/i),
    ).toBeInTheDocument();
    expect(screen.getByText('theme')).toBeInTheDocument();
    expect(screen.queryByText('siteRules')).not.toBeInTheDocument();
  });

  it('saves a pre-import snapshot before applying the import', async () => {
    storeWith({ targetLanguage: 'ja' });
    renderAdvanced();

    const file = new File([JSON.stringify({ targetLanguage: 'ko' })], 's.json', {
      type: 'application/json',
    });
    fireEvent.change(screen.getByTestId('import-settings-file'), { target: { files: [file] } });

    await screen.findByRole('dialog', { name: 'Import settings' });
    fireEvent.click(screen.getByRole('button', { name: 'Merge & import' }));

    await waitFor(() => expect(savePreImportSnapshot).toHaveBeenCalled());
    const arg = vi.mocked(savePreImportSnapshot).mock.calls.at(-1)?.[0] as ExtensionSettings;
    expect(arg.targetLanguage).toBe('ja');
  });

  it('undo toast restores the pre-import snapshot and consumes it', async () => {
    const snapshot = { ...DEFAULT_SETTINGS, theme: 'bubble', targetLanguage: 'ja' };
    vi.mocked(loadPreImportSnapshot).mockResolvedValue(snapshot);
    storeWith({ targetLanguage: 'ja' });
    renderAdvanced();

    const file = new File([JSON.stringify({ targetLanguage: 'ko' })], 's.json', {
      type: 'application/json',
    });
    fireEvent.change(screen.getByTestId('import-settings-file'), { target: { files: [file] } });
    await screen.findByRole('dialog', { name: 'Import settings' });
    fireEvent.click(screen.getByRole('button', { name: 'Merge & import' }));

    await screen.findByText('Settings imported successfully!');
    fireEvent.click(screen.getByRole('button', { name: 'Undo import' }));

    await waitFor(() => expect(useSettingsStore.getState().theme).toBe('bubble'));
    expect(useSettingsStore.getState().targetLanguage).toBe('ja');
    expect(clearPreImportSnapshot).toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Restore previous settings' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('persistent restore button rolls back and consumes the snapshot', async () => {
    const snapshot = { ...DEFAULT_SETTINGS, theme: 'paper', targetLanguage: 'fr' };
    vi.mocked(loadPreImportSnapshot).mockResolvedValue(snapshot);
    storeWith({ targetLanguage: 'ja' });
    renderAdvanced();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Restore previous settings' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(useSettingsStore.getState().theme).toBe('paper'));
    expect(useSettingsStore.getState().targetLanguage).toBe('fr');
    expect(clearPreImportSnapshot).toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Restore previous settings' }),
      ).not.toBeInTheDocument(),
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx`
Expected: FAIL — new tests fail (no warning text, no snapshot save, no Undo, no restore button).

- [ ] **Step 3: Implement the section wiring**

In `entrypoints/options/sections/AdvancedSection.tsx`:

Extend the `@/lib/backup` import:

```tsx
import {
  BackupDecryptError,
  computeImportImpact,
  decryptBackup,
  detectFormat,
  encryptBackup,
  pickKnownSettings,
  sanitizeImportObject,
  serializeSettings,
  type ImportImpact,
} from '@/lib/backup';
```

Add a new import:

```tsx
import {
  clearPreImportSnapshot,
  loadPreImportSnapshot,
  savePreImportSnapshot,
} from '@/lib/config';
```

Extend the toast destructure (currently `const { success: showSuccess, error: showError } = useToast();`):

```tsx
  const { success: showSuccess, error: showError, successWithAction } = useToast();
```

Add store hook (near `const replaceSettings = useSettingsStore((s) => s.replaceSettings);`):

```tsx
  const restoreSettings = useSettingsStore((s) => s.restoreSettings);
```

Extend the `importMeta` state shape:

```tsx
  const [importMeta, setImportMeta] = useState<{
    recognized: Record<string, unknown>;
    ignored: string[];
    source: 'plain' | 'encrypted';
    mergeImpact: ImportImpact;
    replaceImpact: ImportImpact;
  } | null>(null);
```

Add new state (near the other `useState`):

```tsx
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
```

Add a mount effect (near the existing `useEffect` that refreshes scientific health):

```tsx
  useEffect(() => {
    void loadPreImportSnapshot()
      .then((snap) => setHasSnapshot(snap !== null))
      .catch(() => setHasSnapshot(false));
  }, []);
```

Update `handleImportFile` so the summary computes impacts:

```tsx
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
        const current = pickKnownSettings(useSettingsStore.getState());
        setImportMeta({
          recognized,
          ignored,
          source: 'plain',
          mergeImpact: computeImportImpact(current, recognized, 'merge'),
          replaceImpact: computeImportImpact(current, recognized, 'replace'),
        });
      } catch {
        showError('Failed to import settings. Invalid JSON file.');
      }
    },
    [showError],
  );
```

Update `handleImportPassword` similarly (the `catch` stays unchanged):

```tsx
  const handleImportPassword = useCallback(
    async (password: string) => {
      if (!pendingEncryptedText) return;
      setPasswordBusy(true);
      setPasswordError(null);
      try {
        const decrypted = await decryptBackup(pendingEncryptedText, password);
        const { recognized, ignored } = sanitizeImportObject(decrypted);
        const current = pickKnownSettings(useSettingsStore.getState());
        setShowImportPassword(false);
        setPendingEncryptedText(null);
        setImportMeta({
          recognized,
          ignored,
          source: 'encrypted',
          mergeImpact: computeImportImpact(current, recognized, 'merge'),
          replaceImpact: computeImportImpact(current, recognized, 'replace'),
        });
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
```

Add `handleRestoreSnapshot` BEFORE `handleImportApply` (it is a dependency of it):

```tsx
  const handleRestoreSnapshot = useCallback(async () => {
    setShowRestoreModal(false);
    setImportBusy(true);
    try {
      const snapshot = await loadPreImportSnapshot();
      if (!snapshot) {
        setHasSnapshot(false);
        showError('No previous settings to restore.');
        return;
      }
      await restoreSettings(snapshot);
      await clearPreImportSnapshot();
      setHasSnapshot(false);
      showSuccess('Previous settings restored.');
    } catch {
      await clearPreImportSnapshot().catch(() => {});
      setHasSnapshot(false);
      showError('Failed to restore previous settings.');
    } finally {
      setImportBusy(false);
    }
  }, [restoreSettings, showSuccess, showError]);
```

Replace `handleImportApply`:

```tsx
  const handleImportApply = useCallback(
    async (replaceAll: boolean) => {
      if (!importMeta || importBusy) return;
      setImportBusy(true);
      try {
        // Best-effort snapshot: import proceeds even if saving it fails.
        try {
          await savePreImportSnapshot(pickKnownSettings(useSettingsStore.getState()));
        } catch {
          // Snapshot unavailable — import still applies, no Undo action.
        }
        if (replaceAll) {
          await replaceSettings(importMeta.recognized);
        } else {
          await updateSettings(importMeta.recognized);
        }
        // Re-read storage so the toast Undo and the persistent button agree.
        const snapshotNow = await loadPreImportSnapshot();
        setHasSnapshot(snapshotNow !== null);
        const message =
          importMeta.ignored.length > 0
            ? `Imported ${Object.keys(importMeta.recognized).length} settings; ignored ${importMeta.ignored.length} unknown key(s): ${importMeta.ignored.join(', ')}`
            : 'Settings imported successfully!';
        if (snapshotNow) {
          successWithAction(message, {
            label: 'Undo import',
            onClick: () => void handleRestoreSnapshot(),
          });
        } else {
          showSuccess(message);
        }
      } catch {
        showError('Failed to import settings.');
      } finally {
        setImportBusy(false);
        setImportMeta(null);
      }
    },
    [
      importMeta,
      importBusy,
      replaceSettings,
      updateSettings,
      showSuccess,
      showError,
      successWithAction,
      handleRestoreSnapshot,
    ],
  );
```

Update the `ImportSummaryDialog` usage at the bottom of the component:

```tsx
      {importMeta && (
        <ImportSummaryDialog
          source={importMeta.source}
          recognizedCount={Object.keys(importMeta.recognized).length}
          ignored={importMeta.ignored}
          mergeImpact={importMeta.mergeImpact}
          replaceImpact={importMeta.replaceImpact}
          busy={importBusy}
          onConfirm={(replaceAll) => void handleImportApply(replaceAll)}
          onCancel={() => setImportMeta(null)}
        />
      )}
```

In the Data Portability import sub-card, add the persistent restore button under the existing Import button (the `RotateCcw` icon is already imported):

```tsx
                <Button
                  id="import-settings-btn"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  icon={<Upload className="w-3.5 h-3.5" />}
                  className="w-full sm:w-auto"
                >
                  Import…
                </Button>
                {hasSnapshot && (
                  <Button
                    id="restore-previous-settings-btn"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowRestoreModal(true)}
                    icon={<RotateCcw className="w-3.5 h-3.5" />}
                  >
                    Restore previous settings
                  </Button>
                )}
```

Add the restore confirmation modal next to the other modals (after the Import Summary Modal block):

```tsx
      {/* Restore Previous Settings Confirmation Modal */}
      {showRestoreModal && (
        <Modal
          title="Restore previous settings?"
          message="Replaces your current settings with the state before your last import. After this, the saved snapshot is consumed."
          variant="danger"
          confirmLabel="Restore"
          cancelLabel="Keep current"
          onConfirm={() => void handleRestoreSnapshot()}
          onCancel={() => setShowRestoreModal(false)}
        />
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx`
Expected: PASS (all existing + new tests).

- [ ] **Step 5: Type-check the touched files**

Run: `npm run compile`
Expected: exit 0, no errors. (If unrelated pre-existing errors exist, only confirm none are in `entrypoints/options/sections/AdvancedSection.tsx`, `entrypoints/options/components/BackupDialogs.tsx`, `lib/backup.ts`, `lib/config.ts`, `stores/settingsStore.ts`, `ui/Toast.tsx`, `ui/ToastProvider.tsx`.)

- [ ] **Step 6: Commit**

```bash
git add entrypoints/options/sections/AdvancedSection.tsx entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx
git -c user.name="Trung Nguyen" -c user.email="trungnguyen@Trungs-Mac-mini.local" commit -m "feat(options): pre-import snapshot and undo import"
```

---

### Task 9: Final quality gates and beads close

**Files:**
- None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: ALL PASS. If failures appear, fix them and re-run before proceeding.

- [ ] **Step 2: Run the type check**

Run: `npm run compile`
Expected: exit 0.

- [ ] **Step 3: Run the linter**

Run: `npm run lint`
Expected: no errors. If the linter reports issues, run `npx eslint <changed-file> --fix` on files touched by this plan and re-run `npm run lint`.

- [ ] **Step 4: Verify the full diff**

Run: `git status --short && git diff --stat`
Expected: only the plan's files plus the two docs (spec + plan) are modified/added. Confirm no stray files.

- [ ] **Step 5: Commit any fixes from the gates**

If Step 1–3 produced fixes, commit them:

```bash
git add -A
git -c user.name="Trung Nguyen" -c user.email="trungnguyen@Trungs-Mac-mini.local" commit -m "chore: fix quality-gate findings"
```

(If there were no fixes, skip this step.)

- [ ] **Step 6: Update and close the beads issue**

```bash
bd update AnyLLMTranslate-yqr --notes "Implementation complete: warning lists, pre-import snapshot, toast Undo + persistent restore. Full suite, tsc, eslint pass."
bd close AnyLLMTranslate-yqr --reason="Feature implemented per spec 2026-08-03-import-overwrite-warning-rollback-design"
```

- [ ] **Step 7: Sync per repo session-close protocol**

The repo's `AGENTS.md`/`CLAUDE.md` session-close protocol requires a push at session end. Only run these when you have push authority (the plan executor or the human):

```bash
git pull --rebase
bd dolt push
git push
git status   # must show "up to date with origin"
```

If `git pull --rebase` conflicts, resolve and re-run the gates.

---

## Handoff Notes

- The import warning is computed from the live store state at dialog-open time (`pickKnownSettings(useSettingsStore.getState())`), so it always matches what an apply would do.
- The snapshot is consumed after a successful rollback; a failed snapshot save never blocks an import (the Undo action simply isn't offered).
- `extractSettings` is intentionally left untouched — export payloads are unchanged; `pickKnownSettings` is snapshot-only.
- Test command quick reference: `npx vitest run lib/__tests__/backup.test.ts`, `npx vitest run lib/__tests__/preImportSnapshot.test.ts`, `npx vitest run stores/__tests__/settingsStore.test.ts`, `npx vitest run ui/__tests__/Toast.test.tsx`, `npx vitest run entrypoints/options/components/__tests__/BackupDialogs.test.tsx`, `npx vitest run entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx`.
