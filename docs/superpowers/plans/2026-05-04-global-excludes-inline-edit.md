# Global Default Excludes & Inline Edit UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-configurable `globalExcludeSelectors` setting (defaulting to `['pre', 'code', '.code-block']`) that applies to all sites, and fix the site rules edit form UX to render inline below the rule being edited.

**Architecture:** Two independent changes sharing the same section UI. The data model adds one new field to `ExtensionSettings`. The runtime merges global excludes with per-site excludes at extraction time (content script + sectionTranslate). The UI adds a tag-input card at the top of SiteRulesSection and restructures the edit form to render inline within the rules list.

**Tech Stack:** TypeScript, React, Zustand, Vitest, WXT

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `types/config.ts` | Modify | Add `globalExcludeSelectors` field + default |
| `stores/settingsStore.ts` | Modify | Add `globalExcludeSelectors` to `extractSettings` |
| `lib/config.ts` | Modify | Migration for existing users without the field |
| `content/sectionTranslate.ts` | Modify | Merge global excludes with per-site excludes |
| `entrypoints/content.ts` | Modify | Merge global excludes with per-site excludes |
| `entrypoints/options/sections/SiteRulesSection.tsx` | Modify | Add GlobalExcludesCard + inline edit form |
| `lib/__tests__/siteRules.test.ts` | Create | Test mergeExcludeSelectors utility |
| `lib/siteRules.ts` | Modify | Add mergeExcludeSelectors helper |

---

## Task 1: Add `globalExcludeSelectors` to Data Model

**Files:**
- Modify: `types/config.ts:57-74` (SiteRule interface area) and `types/config.ts:239-274` (DEFAULT_SETTINGS)
- Modify: `stores/settingsStore.ts:117-143` (extractSettings)

- [ ] **Step 1: Add the field to `ExtensionSettings` interface**

In `types/config.ts`, add the new field after `siteRules`:

```typescript
// In ExtensionSettings interface, after line 169 (siteRules: SiteRule[];)
/** CSS selectors excluded from translation globally (merged with per-site excludes) */
globalExcludeSelectors: string[];
```

- [ ] **Step 2: Add default value to `DEFAULT_SETTINGS`**

In `types/config.ts`, add after `siteRules: []`:

```typescript
// In DEFAULT_SETTINGS, after line 261 (siteRules: [],)
globalExcludeSelectors: ['pre', 'code', '.code-block'],
```

- [ ] **Step 3: Add to `extractSettings` in settingsStore**

In `stores/settingsStore.ts`, add the field to the `extractSettings` function's return object (after `siteRules`):

```typescript
// After line 129: siteRules: state.siteRules,
globalExcludeSelectors: state.globalExcludeSelectors,
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to `globalExcludeSelectors`

- [ ] **Step 5: Commit**

```bash
git add types/config.ts stores/settingsStore.ts
git commit -m "feat: add globalExcludeSelectors to settings data model"
```

---

## Task 2: Add `mergeExcludeSelectors` Utility + Tests

**Files:**
- Modify: `lib/siteRules.ts`
- Create: `lib/__tests__/siteRules.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/siteRules.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { matchHostname, findMatchingRule, mergeExcludeSelectors } from '@/lib/siteRules';

describe('matchHostname', () => {
  it('matches exact hostname', () => {
    expect(matchHostname('example.com', 'example.com')).toBe(true);
  });

  it('matches wildcard pattern', () => {
    expect(matchHostname('sub.example.com', '*.example.com')).toBe(true);
  });

  it('does not match root against wildcard', () => {
    expect(matchHostname('example.com', '*.example.com')).toBe(false);
  });

  it('returns false for empty inputs', () => {
    expect(matchHostname('', 'example.com')).toBe(false);
    expect(matchHostname('example.com', '')).toBe(false);
  });
});

describe('mergeExcludeSelectors', () => {
  it('returns global excludes when no site excludes exist', () => {
    const result = mergeExcludeSelectors(['pre', 'code'], undefined);
    expect(result).toEqual(['pre', 'code']);
  });

  it('returns global excludes when site excludes is empty array', () => {
    const result = mergeExcludeSelectors(['pre', 'code'], []);
    expect(result).toEqual(['pre', 'code']);
  });

  it('merges global and site excludes without duplicates', () => {
    const result = mergeExcludeSelectors(['pre', 'code'], ['pre', '.sidebar']);
    expect(result).toEqual(['pre', 'code', '.sidebar']);
  });

  it('returns site excludes when global is empty', () => {
    const result = mergeExcludeSelectors([], ['.nav', 'footer']);
    expect(result).toEqual(['.nav', 'footer']);
  });

  it('returns empty array when both are empty', () => {
    const result = mergeExcludeSelectors([], []);
    expect(result).toEqual([]);
  });

  it('returns empty array when both are undefined/empty', () => {
    const result = mergeExcludeSelectors([], undefined);
    expect(result).toEqual([]);
  });

  it('handles case-sensitive selectors correctly', () => {
    const result = mergeExcludeSelectors(['PRE'], ['pre']);
    expect(result).toEqual(['PRE', 'pre']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/siteRules.test.ts 2>&1 | tail -20`
Expected: FAIL — `mergeExcludeSelectors` is not exported

- [ ] **Step 3: Implement `mergeExcludeSelectors`**

In `lib/siteRules.ts`, add after the `findMatchingRule` function (after line 30):

```typescript
/**
 * Merge global exclude selectors with per-site exclude selectors.
 * Returns a deduplicated union of both arrays. Global selectors come first.
 */
export function mergeExcludeSelectors(
  globalExcludes: string[],
  siteExcludes: string[] | undefined,
): string[] {
  if (!siteExcludes || siteExcludes.length === 0) return globalExcludes;
  if (globalExcludes.length === 0) return siteExcludes;

  const seen = new Set(globalExcludes);
  const merged = [...globalExcludes];
  for (const sel of siteExcludes) {
    if (!seen.has(sel)) {
      merged.push(sel);
      seen.add(sel);
    }
  }
  return merged;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/siteRules.test.ts 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/siteRules.ts lib/__tests__/siteRules.test.ts
git commit -m "feat: add mergeExcludeSelectors utility with tests"
```

---

## Task 3: Wire Global Excludes into Content Scripts

**Files:**
- Modify: `entrypoints/content.ts:151-157`
- Modify: `content/sectionTranslate.ts:29-33`

- [ ] **Step 1: Update `startTranslation` in content.ts**

In `entrypoints/content.ts`, update the import on line 22. Change:

```typescript
import { findMatchingRule, findEffectiveRule } from '@/lib/siteRules';
```

To:

```typescript
import { findMatchingRule, findEffectiveRule, mergeExcludeSelectors } from '@/lib/siteRules';
```

Then replace lines 151-157:

```typescript
  // Extract translatable pieces from the DOM, respecting site rules
  const hostname = window.location.hostname;
  const matchingRule = findEffectiveRule(hostname, settings.siteRules);
  allPieces = extractPieces(document.body, {
    includeSelectors: matchingRule?.includeSelectors,
    excludeSelectors: matchingRule?.excludeSelectors,
  });
```

With:

```typescript
  // Extract translatable pieces from the DOM, respecting site rules + global excludes
  const hostname = window.location.hostname;
  const matchingRule = findEffectiveRule(hostname, settings.siteRules);
  const effectiveExcludes = mergeExcludeSelectors(
    settings.globalExcludeSelectors ?? [],
    matchingRule?.excludeSelectors,
  );
  allPieces = extractPieces(document.body, {
    includeSelectors: matchingRule?.includeSelectors,
    excludeSelectors: effectiveExcludes,
  });
```

- [ ] **Step 2: Update `translateSection` in sectionTranslate.ts**

In `content/sectionTranslate.ts`, update import (line 10):

```typescript
import { findEffectiveRule, mergeExcludeSelectors } from '@/lib/siteRules';
```

Replace lines 29-33:

```typescript
  const hostname = window.location.hostname;
  const matchingRule = findEffectiveRule(hostname, settings.siteRules);
  const pieces = extractPieces(element, {
    excludeSelectors: matchingRule?.excludeSelectors,
  });
```

With:

```typescript
  const hostname = window.location.hostname;
  const matchingRule = findEffectiveRule(hostname, settings.siteRules);
  const effectiveExcludes = mergeExcludeSelectors(
    settings.globalExcludeSelectors ?? [],
    matchingRule?.excludeSelectors,
  );
  const pieces = extractPieces(element, {
    excludeSelectors: effectiveExcludes,
  });
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Run existing tests to ensure no regressions**

Run: `npx vitest run content/__tests__/sectionTranslate.test.ts content/__tests__/domWalker.test.ts 2>&1 | tail -20`
Expected: All existing tests pass

- [ ] **Step 5: Commit**

```bash
git add entrypoints/content.ts content/sectionTranslate.ts
git commit -m "feat: merge globalExcludeSelectors at extraction time"
```

---

## Task 4: Migration for Existing Users

**Files:**
- Modify: `lib/config.ts:26-36`

- [ ] **Step 1: Add migration logic in `loadSettings`**

In `lib/config.ts`, after the site rules injection block (after line 36), add:

```typescript
    // Migrate: inject default globalExcludeSelectors for existing users
    if (!stored.globalExcludeSelectors) {
      merged.globalExcludeSelectors = ['pre', 'code', '.code-block'];
    }
```

This ensures existing users who upgrade get the defaults even though their stored settings don't have the field yet. `deepMerge` already handles this via `DEFAULT_SETTINGS`, but this explicit check adds safety for edge cases where `deepMerge` might skip array fields.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/config.ts
git commit -m "feat: migrate existing users to globalExcludeSelectors defaults"
```

---

## Task 5: Global Excludes UI Card

**Files:**
- Modify: `entrypoints/options/sections/SiteRulesSection.tsx`

- [ ] **Step 1: Add `GlobalExcludesCard` component**

Add this component **before** the `RuleEditForm` function (e.g., after line 167, before line 170) in `SiteRulesSection.tsx`:

```tsx
const DEFAULT_GLOBAL_EXCLUDES = ['pre', 'code', '.code-block'];

function GlobalExcludesCard() {
  const globalExcludeSelectors = useSettingsStore((s) => s.globalExcludeSelectors);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [inputValue, setInputValue] = useState('');

  const handleAddSelector = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || globalExcludeSelectors.includes(trimmed)) {
      setInputValue('');
      return;
    }
    updateSettings({ globalExcludeSelectors: [...globalExcludeSelectors, trimmed] });
    setInputValue('');
  };

  const handleRemoveSelector = (selector: string) => {
    updateSettings({
      globalExcludeSelectors: globalExcludeSelectors.filter((s) => s !== selector),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSelector();
    }
  };

  const isDefault =
    globalExcludeSelectors.length === DEFAULT_GLOBAL_EXCLUDES.length &&
    DEFAULT_GLOBAL_EXCLUDES.every((s) => globalExcludeSelectors.includes(s));

  return (
    <Card variant="bordered">
      <FieldGroup
        label="Global Exclude Selectors"
        description="These CSS selectors are excluded from translation on all sites. Per-site rules add to these defaults."
      >
        <div className="flex flex-wrap gap-1.5 mb-2">
          {globalExcludeSelectors.map((selector) => (
            <span
              key={selector}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-xs font-mono text-zinc-300"
            >
              {selector}
              <button
                onClick={() => handleRemoveSelector(selector)}
                className="ml-0.5 text-zinc-500 hover:text-red-400 transition-colors"
                aria-label={`Remove ${selector}`}
              >
                ×
              </button>
            </span>
          ))}
          {globalExcludeSelectors.length === 0 && (
            <span className="text-xs text-zinc-500 italic">No global excludes — all elements will be translated.</span>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            id="global-exclude-input"
            type="text"
            placeholder="Add selector (e.g. .code-block)"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="font-mono flex-1"
          />
          <Button
            id="add-global-exclude-btn"
            variant="ghost"
            size="sm"
            onClick={handleAddSelector}
            disabled={!inputValue.trim()}
          >
            Add
          </Button>
        </div>
        {!isDefault && (
          <button
            onClick={() => updateSettings({ globalExcludeSelectors: [...DEFAULT_GLOBAL_EXCLUDES] })}
            className="mt-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Reset to defaults
          </button>
        )}
      </FieldGroup>
    </Card>
  );
}
```

- [ ] **Step 2: Render `GlobalExcludesCard` in the section**

In the `SiteRulesSection` component's return JSX, add the card at the top of the `<div className="space-y-4">` block (after line 73, before the Search & Add div):

```tsx
        {/* Global Exclude Selectors */}
        <GlobalExcludesCard />
```

- [ ] **Step 3: Verify it renders correctly**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add entrypoints/options/sections/SiteRulesSection.tsx
git commit -m "feat: add GlobalExcludesCard UI to Site Rules section"
```

---

## Task 6: Inline Edit Form UX

**Files:**
- Modify: `entrypoints/options/sections/SiteRulesSection.tsx`

- [ ] **Step 1: Move the edit form for existing rules to inline**

In `SiteRulesSection.tsx`, replace the current edit form block (lines 95-102):

```tsx
        {/* Edit Form */}
        {editingRule && (
          <RuleEditForm
            rule={editingRule}
            onSave={handleSaveRule}
            onCancel={() => { setEditingRule(null); setIsAdding(false); }}
          />
        )}
```

With only the "adding" case:

```tsx
        {/* Edit Form — top position only for new rules */}
        {editingRule && isAdding && (
          <RuleEditForm
            rule={editingRule}
            onSave={handleSaveRule}
            onCancel={() => { setEditingRule(null); setIsAdding(false); }}
          />
        )}
```

- [ ] **Step 2: Add inline edit form inside the rules list**

Inside the `filteredRules.map()` callback, after each rule row's closing `</div>` (the row div, around line 160), add the inline edit form.

Replace the map callback content. The current structure is:

```tsx
{filteredRules.map((rule, idx) => (
  <div
    key={rule.id}
    className="flex items-center justify-between px-4 py-3 hover:bg-zinc-800/30 transition-colors animate-stagger"
    style={{ '--stagger-delay': Math.min(idx, 5) } as React.CSSProperties}
  >
    {/* rule content */}
  </div>
))}
```

Wrap each item in a Fragment and add the inline form:

```tsx
{filteredRules.map((rule, idx) => (
  <div key={rule.id}>
    <div
      className="flex items-center justify-between px-4 py-3 hover:bg-zinc-800/30 transition-colors animate-stagger"
      style={{ '--stagger-delay': Math.min(idx, 5) } as React.CSSProperties}
    >
      {/* existing rule row content — unchanged */}
      <div className="flex items-center gap-3">
        {rule.alwaysTranslate ? (
          <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
        ) : rule.neverTranslate ? (
          <ShieldOff className="w-4 h-4 text-red-400 shrink-0" />
        ) : (
          <div className="w-4 h-4 shrink-0" />
        )}
        <div>
          <span className="text-sm text-zinc-200 font-mono">{rule.hostname}</span>
          {rule.builtIn && <Badge variant="info" className="ml-2">Built-in</Badge>}
          {rule.category && <Badge variant="info" className="ml-2"><Tag className="w-3 h-3 inline mr-1" />{rule.category}</Badge>}
          {(rule.includeSelectors?.length ?? 0) > 0 && <Badge variant="info" className="ml-2">{rule.includeSelectors.length} include</Badge>}
          {(rule.excludeSelectors?.length ?? 0) > 0 && <Badge variant="info" className="ml-2">{rule.excludeSelectors.length} exclude</Badge>}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditingRule(rule)}
          aria-label="Edit rule"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </Button>
        {!rule.builtIn && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDeleteRule(rule.id)}
            aria-label="Delete rule"
            className="hover:text-red-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
    {/* Inline edit form — renders below the rule being edited */}
    {editingRule?.id === rule.id && !isAdding && (
      <div className="px-4 py-3 bg-zinc-900/40 border-t border-zinc-800/50 animate-fade-in-up">
        <RuleEditForm
          rule={editingRule}
          onSave={handleSaveRule}
          onCancel={() => { setEditingRule(null); setIsAdding(false); }}
        />
      </div>
    )}
  </div>
))}
```

Note: The outer `key` moves from the inner `<div>` to the new wrapper `<div key={rule.id}>`.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Manual verification plan**

Open the extension options page → Site Rules section. Verify:
1. Global Excludes Card appears at the top with `pre`, `code`, `.code-block` chips
2. Clicking Edit on a rule in the list → form appears directly below that rule
3. Clicking Add Rule → form appears at the top (above the list)
4. Save/Cancel properly closes the inline form

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/sections/SiteRulesSection.tsx
git commit -m "fix: render rule edit form inline below the edited rule"
```

---

## Task 7: Run Full Test Suite

- [ ] **Step 1: Run all tests**

Run: `npx vitest run 2>&1 | tail -30`
Expected: All tests pass, no regressions

- [ ] **Step 2: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: global excludes + inline edit — final cleanup"
```
