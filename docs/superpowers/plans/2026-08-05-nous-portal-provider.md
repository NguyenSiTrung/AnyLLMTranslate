# Nous Portal Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Add Nous Portal as a predefined direct API-key OpenAI-compatible provider in AnyLLMTranslate.

**Architecture:** Extend the existing static provider catalog with Nous Portal metadata and add the provider's inference host to the WXT manifest permissions. The existing generic client remains responsible for Bearer authentication, `/chat/completions`, model listing, and request handling.

**Tech Stack:** TypeScript, WXT, Vitest, Chrome Manifest V3.

## Global Constraints

- Use the direct Nous Inference API; do not add Hermes CLI, OAuth, subscription-proxy, or local-server behavior.
- Keep provider storage as `preset: 'custom'`; catalog IDs are selection metadata only.
- Base URL must remain `https://inference-api.nousresearch.com/v1` so the client appends `/chat/completions` correctly.
- Do not commit or push changes unless explicitly authorized.

---

### Task 1: Add and verify the Nous Portal catalog entry

**Files:**
- Modify: `lib/__tests__/openAiCompatibleCatalog.test.ts`
- Modify: `lib/openAiCompatibleCatalog.ts`
- Modify: `wxt.config.ts`

**Interfaces:**
- Consumes: `OpenAiCompatibleCatalogEntry`, `getCatalogEntryById`, `filterCatalog`, `inferCatalogId`, and the existing `manifest.host_permissions` array.
- Produces: a catalog entry with ID `nous-portal`, display name `Nous Portal`, base URL `https://inference-api.nousresearch.com/v1`, API-key requirement enabled, default model `Hermes-4-70B`, key URL `https://portal.nousresearch.com/api-keys`, model listing enabled, and a cloud category; the manifest also permits `https://inference-api.nousresearch.com/*`.

- [x] **Step 1: Write the failing catalog assertions**

Add these assertions to the existing catalog test after the other hosted-provider checks:

```ts
    expect(ids).toContain('nous-portal');
    expect(getCatalogEntryById('nous-portal')).toMatchObject({
      id: 'nous-portal',
      displayName: 'Nous Portal',
      baseUrl: 'https://inference-api.nousresearch.com/v1',
      requiresApiKey: true,
      defaultModel: 'Hermes-4-70B',
      getKeyUrl: 'https://portal.nousresearch.com/api-keys',
      supportsModelListing: true,
      category: 'cloud',
    });
    expect(filterCatalog('nous').map((provider) => provider.id)).toContain('nous-portal');
    expect(inferCatalogId('https://inference-api.nousresearch.com/v1/')).toBe('nous-portal');
    expect(getKeyUrlForProvider('https://inference-api.nousresearch.com/v1')).toBe(
      'https://portal.nousresearch.com/api-keys',
    );
```

- [x] **Step 2: Run the focused test and verify the expected failure**

Run:

```bash
npm test -- lib/__tests__/openAiCompatibleCatalog.test.ts
```

Expected: FAIL because `getCatalogEntryById('nous-portal')` is undefined and the catalog does not yet infer the Nous URL.

- [x] **Step 3: Add the minimal catalog entry**

Insert the following cloud provider entry before the local providers in `lib/openAiCompatibleCatalog.ts`:

```ts
  {
    id: 'nous-portal',
    displayName: 'Nous Portal',
    keywords: ['nous', 'nous research', 'nous portal', 'hermes'],
    baseUrl: 'https://inference-api.nousresearch.com/v1',
    requiresApiKey: true,
    placeholder: 'Your Nous API key',
    defaultModel: 'Hermes-4-70B',
    supportsModelListing: true,
    getKeyUrl: 'https://portal.nousresearch.com/api-keys',
    accent: 'cyan',
    monogram: 'NP',
    category: 'cloud',
  },
```

- [x] **Step 4: Add the direct inference host permission**

Add this entry to `manifest.host_permissions` in `wxt.config.ts`:

```ts
      'https://inference-api.nousresearch.com/*',
```

- [x] **Step 5: Run the focused test and verify it passes**

Run:

```bash
npm test -- lib/__tests__/openAiCompatibleCatalog.test.ts
```

Expected: PASS, including the new Nous metadata, filtering, URL inference, and key-link assertions.

- [x] **Step 6: Build and inspect the generated manifest**

Run:

```bash
npm run build
node -e "const m=require('./.output/chrome-mv3/manifest.json'); if (!m.host_permissions.includes('https://inference-api.nousresearch.com/*')) process.exit(1); console.log('Nous host permission present')"
```

Expected: the WXT build succeeds and the command prints `Nous host permission present`.

- [x] **Step 7: Run the full quality gates**

Run:

```bash
npm test
npm run compile
npm run lint
git status --short
```

Expected: all tests, TypeScript compilation, and lint pass; `git status` shows only the intended catalog, manifest, test, spec, and plan changes.
