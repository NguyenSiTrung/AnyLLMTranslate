# OpenCode Go Provider Preset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate OpenCode Go template to the existing OpenAI-compatible provider catalog without changing runtime protocol handling or persisted settings.

**Architecture:** Extend the static catalog with the documented Go gateway metadata. Reuse existing catalog selection, URL inference, API-key linking, model listing, and provider tester paths. Add focused catalog assertions, then run the project validators.

**Tech Stack:** TypeScript, Vitest, ESLint, TypeScript compiler, existing `OPENAI_COMPATIBLE_CATALOG` helpers.

## Global Constraints

- Keep OpenCode Zen as a separate, unchanged catalog entry.
- Use `id: 'opencode-go'`, `baseUrl: 'https://opencode.ai/zen/go/v1'`, `getKeyUrl: 'https://opencode.ai/auth'`, and `defaultModel: 'deepseek-v4-flash'`.
- Keep `preset: 'custom'`; do not add a `ProviderPreset` value or storage migration.
- Set `requiresApiKey: true`, `supportsModelListing: true`, and `category: 'cloud'`.
- Do not add Responses API or Anthropic Messages API support in this change.
- Do not hardcode the complete OpenCode Go model list.
- Do not commit changes unless the user explicitly authorizes committing.

---

### Task 1: Add failing catalog coverage

**Files:**
- Modify: `lib/__tests__/openAiCompatibleCatalog.test.ts`

**Interfaces:**
- Consumes: `OPENAI_COMPATIBLE_CATALOG`, `filterCatalog`, `getCatalogEntryById`, `getKeyUrlForProvider`, and `inferCatalogId`.
- Produces: Regression coverage proving the `opencode-go` catalog contract and preserving the existing `opencode-zen` entry.

- [ ] **Step 1: Add a focused failing test**

Add this test to `lib/__tests__/openAiCompatibleCatalog.test.ts`:

```ts
  it('includes the OpenCode Go catalog entry', () => {
    const entry = getCatalogEntryById('opencode-go');

    expect(entry).toMatchObject({
      id: 'opencode-go',
      displayName: 'OpenCode Go',
      baseUrl: 'https://opencode.ai/zen/go/v1',
      requiresApiKey: true,
      getKeyUrl: 'https://opencode.ai/auth',
      defaultModel: 'deepseek-v4-flash',
      supportsModelListing: true,
      category: 'cloud',
      monogram: 'OG',
    });
    expect(filterCatalog('go').map((provider) => provider.id)).toContain('opencode-go');
    expect(filterCatalog('opencode')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'opencode-zen' }),
        expect.objectContaining({ id: 'opencode-go' }),
      ]),
    );
    expect(inferCatalogId('https://opencode.ai/zen/go/v1/')).toBe('opencode-go');
    expect(getKeyUrlForProvider('https://opencode.ai/zen/go/v1')).toBe(
      'https://opencode.ai/auth',
    );
    expect(getCatalogEntryById('opencode-zen')?.baseUrl).toBe(
      'https://opencode.ai/zen/v1',
    );
  });
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
pnpm exec vitest run lib/__tests__/openAiCompatibleCatalog.test.ts
```

Expected: FAIL because `getCatalogEntryById('opencode-go')` is currently `undefined`.

### Task 2: Implement the OpenCode Go catalog entry

**Files:**
- Modify: `lib/openAiCompatibleCatalog.ts` near the existing `opencode-zen` entry

**Interfaces:**
- Consumes: The catalog entry contract used by provider selection, `filterCatalog`, `inferCatalogId`, `getKeyUrlForProvider`, and identity badges.
- Produces: A static `opencode-go` entry that the existing UI and model picker discover automatically.

- [ ] **Step 1: Add the minimal catalog entry**

Insert this entry after the existing `opencode-zen` entry and before `deepseek`:

```ts
  {
    id: 'opencode-go',
    displayName: 'OpenCode Go',
    keywords: ['opencode', 'go', 'opencode go', 'opencode.ai'],
    baseUrl: 'https://opencode.ai/zen/go/v1',
    requiresApiKey: true,
    placeholder: '...',
    defaultModel: 'deepseek-v4-flash',
    supportsModelListing: true,
    getKeyUrl: 'https://opencode.ai/auth',
    accent: 'blue',
    monogram: 'OG',
    category: 'cloud',
  },
```

The existing catalog helpers will then handle trailing-slash normalization, exact URL inference, API-key URL resolution, category grouping, and UI identity rendering without new logic.

- [ ] **Step 2: Run the focused catalog test and confirm it passes**

Run:

```bash
pnpm exec vitest run lib/__tests__/openAiCompatibleCatalog.test.ts
```

Expected: PASS for all catalog tests.

### Task 3: Run project validators

**Files:**
- No additional source files

**Interfaces:**
- Consumes: The updated catalog and focused regression tests.
- Produces: Verified source, test, type, and lint results.

- [ ] **Step 1: Run the full test suite**

Run:

```bash
pnpm test
```

Expected: Vitest exits successfully with zero failed tests.

- [ ] **Step 2: Run TypeScript compilation**

Run:

```bash
pnpm compile
```

Expected: `tsc --noEmit` exits successfully with zero diagnostics.

- [ ] **Step 3: Run ESLint**

Run:

```bash
pnpm lint
```

Expected: ESLint exits successfully with zero errors.

- [ ] **Step 4: Inspect the final working tree**

Run:

```bash
git diff --check
git status --short
```

Expected: No whitespace errors. The only intended source changes are `lib/openAiCompatibleCatalog.ts` and `lib/__tests__/openAiCompatibleCatalog.test.ts`; the approved spec and plan files remain present, and no unrelated user changes are overwritten.
