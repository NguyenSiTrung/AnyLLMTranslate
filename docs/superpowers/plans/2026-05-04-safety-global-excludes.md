# Safety Global Excludes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce a safer set of default global exclude selectors (like `[contenteditable="true"]` and `[translate="no"]`) to protect user data and React/Vue hydration states without overwriting users' custom rules.

**Architecture:** We will centralize the safe selectors into `CRITICAL_GLOBAL_EXCLUDES` in `types/config.ts`. Then, in `lib/config.ts` `loadSettings()`, we will force-merge this list with the user's stored `globalExcludeSelectors` using a `Set` to prevent duplicates. Finally, we will update the Options UI to rely on this centralized list instead of a local constant.

**Tech Stack:** TypeScript, React, Chrome Extension API (storage.local).

---

### Task 1: Update Constants and Types

**Files:**
- Modify: `types/config.ts`

- [ ] **Step 1: Write the failing test**

*(We skip the test here because this is purely adding a constant and updating a default configuration object)*

- [ ] **Step 2: Write minimal implementation**

Modify `types/config.ts`. Add `CRITICAL_GLOBAL_EXCLUDES` and update `DEFAULT_SETTINGS.globalExcludeSelectors`.

```typescript
export const CRITICAL_GLOBAL_EXCLUDES = [
  'pre',
  'code',
  '.code-block',
  '[contenteditable="true"]',
  'textarea',
  'input',
  '[translate="no"]',
  '.notranslate',
  'script',
  'style',
  'kbd',
  '.mathjax',
  '.katex'
];

export const DEFAULT_SETTINGS: ExtensionSettings = {
  // ... (keep everything else the same)
  globalExcludeSelectors: [...CRITICAL_GLOBAL_EXCLUDES],
  // ...
};
```

- [ ] **Step 3: Run TypeScript compiler to verify syntax**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add types/config.ts
git commit -m "feat: add CRITICAL_GLOBAL_EXCLUDES and update defaults"
```

---

### Task 2: Implement "Force Merge" Migration

**Files:**
- Modify: `lib/config.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/configMigration.test.ts` to test the migration logic.

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { loadSettings } from '../config';
import { CRITICAL_GLOBAL_EXCLUDES } from '@/types/config';

// Mock chrome.storage.local
const mockGet = vi.fn();
global.chrome = {
  storage: {
    local: {
      get: mockGet,
    },
  },
} as any;

describe('loadSettings migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('force merges CRITICAL_GLOBAL_EXCLUDES with user excludes', async () => {
    mockGet.mockResolvedValue({
      settings: {
        globalExcludeSelectors: ['.my-custom-rule', 'pre'],
        provider: { apiKey: 'test' } // to satisfy decryptApiKey which we will mock or bypass
      }
    });

    vi.mock('../crypto', () => ({
      decryptApiKey: vi.fn().mockResolvedValue('test'),
      encryptApiKey: vi.fn()
    }));

    const settings = await loadSettings();
    expect(settings.globalExcludeSelectors).toContain('.my-custom-rule');
    CRITICAL_GLOBAL_EXCLUDES.forEach(selector => {
      expect(settings.globalExcludeSelectors).toContain(selector);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/configMigration.test.ts`
Expected: FAIL (because loadSettings doesn't do the force merge yet)

- [ ] **Step 3: Write minimal implementation**

Modify `lib/config.ts`. In `loadSettings()`, replace the existing migration for `globalExcludeSelectors`:

```typescript
import { CRITICAL_GLOBAL_EXCLUDES } from '@/types/config';
// ...
    // Migrate: inject critical globalExcludeSelectors for existing users
    const storedExcludes = stored.globalExcludeSelectors || [];
    const mergedExcludes = new Set([...storedExcludes, ...CRITICAL_GLOBAL_EXCLUDES]);
    merged.globalExcludeSelectors = Array.from(mergedExcludes);
// ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/configMigration.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/config.ts lib/__tests__/configMigration.test.ts
git commit -m "feat: implement force merge for global safety excludes"
```

---

### Task 3: Apply Centralized Selectors to Options UI

**Files:**
- Modify: `entrypoints/options/sections/SiteRulesSection.tsx`

- [ ] **Step 1: Write the failing test**

*(UI component update - we will rely on TS compilation and manual verification)*

- [ ] **Step 2: Write minimal implementation**

Modify `entrypoints/options/sections/SiteRulesSection.tsx`:
1. Remove the local `const DEFAULT_GLOBAL_EXCLUDES = ['pre', 'code', '.code-block'];`
2. Import `CRITICAL_GLOBAL_EXCLUDES` from `@/types/config`.
3. Replace all usages of `DEFAULT_GLOBAL_EXCLUDES` with `CRITICAL_GLOBAL_EXCLUDES`.

```tsx
import { CRITICAL_GLOBAL_EXCLUDES } from '@/types/config';

// Inside GlobalExcludesCard
// ...
    CRITICAL_GLOBAL_EXCLUDES.length === globalExcludeSelectors.length &&
    CRITICAL_GLOBAL_EXCLUDES.every((s) => globalExcludeSelectors.includes(s));
// ...
            onClick={() => updateSettings({ globalExcludeSelectors: [...CRITICAL_GLOBAL_EXCLUDES] })}
// ...
```

- [ ] **Step 3: Run TypeScript compiler to verify syntax**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add entrypoints/options/sections/SiteRulesSection.tsx
git commit -m "refactor: use CRITICAL_GLOBAL_EXCLUDES in options UI"
```
