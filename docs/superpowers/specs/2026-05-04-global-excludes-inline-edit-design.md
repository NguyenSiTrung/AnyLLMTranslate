# Global Default Exclude Selectors & Inline Edit UX

**Date:** 2026-05-04
**Status:** Approved

---

## Problem Statement

### 1. Code blocks are translated on sites without explicit rules

The DOM walker (`domWalker.ts`) does not skip `<pre>`, `<code>`, or `.code-block` elements by default. Only sites with built-in rules (GitHub, StackOverflow, etc.) exclude them. On any other site, code content is sent for translation — which is almost always wrong and wastes LLM tokens.

### 2. Edit form scrolls away from context

When a user clicks "Edit" on a site rule deep in the list, `RuleEditForm` renders at the top of the Site Rules section. The user must manually scroll up to find the form. This is disorienting and breaks the editing flow.

---

## Feature 1: Global Default Exclude Selectors

### Data Model

New field in `ExtensionSettings` (`types/config.ts`):

```typescript
/** CSS selectors excluded from translation on all sites (merged with per-site excludes) */
globalExcludeSelectors: string[];
```

Default value in `DEFAULT_SETTINGS`:

```typescript
globalExcludeSelectors: ['pre', 'code', '.code-block'],
```

### Runtime Behavior

**Merge strategy:** Global excludes are **always additive**. The effective exclude list for any page is `[...globalExcludeSelectors, ...(siteRule?.excludeSelectors ?? [])]`.

**Files affected:**

- `content/sectionTranslate.ts` — When building `ExtractOptions`, fetch `globalExcludeSelectors` from settings and merge with any per-site rule's `excludeSelectors` before passing to `extractPieces()`.
- `content/domWalker.ts` — No changes needed. It already accepts `excludeSelectors` in `ExtractOptions` and applies them in `shouldSkipElement()`.

**Edge cases:**
- Duplicate selectors in global + site-specific: harmless, `shouldSkipElement` checks each selector independently.
- Empty global excludes: user has deliberately cleared them, no defaults injected.
- Built-in rules that already have `pre`/`code` in their excludes: the union just has duplicates, no functional change.

### UI Design

**Location:** Top of Site Rules section, above the search bar and rules list.

**Component:** A compact card titled **"Global Exclude Selectors"** with:
- Description text: _"These CSS selectors are excluded from translation on all sites. Per-site rules add to these defaults."_
- Tag/chip input: Each selector displayed as a removable chip. Typing a new selector and pressing Enter adds it.
- "Reset to defaults" text button to restore `['pre', 'code', '.code-block']`.

**Component name:** `GlobalExcludesCard` (inline in `SiteRulesSection.tsx` or extracted to its own file if complex).

### Settings Store

- `settingsStore.ts` — Add `globalExcludeSelectors` to the store shape and `updateSettings` support (already generic).
- `lib/config.ts` — Ensure migration handles existing users who don't have the field (default to `['pre', 'code', '.code-block']`).

---

## Feature 2: Inline Rule Edit Form

### Current Behavior (Problem)

```
┌─ Site Rules Section ─────────────────┐
│ [Search] [Add Rule]                  │
│ ┌─ RuleEditForm (ALWAYS HERE) ──┐    │  ← User must scroll up
│ └────────────────────────────────┘    │
│ Rule 1                          [✏️]  │
│ Rule 2                          [✏️]  │
│ Rule 3                          [✏️]  │  ← User clicks edit here
│ ...                                  │
└──────────────────────────────────────┘
```

### New Behavior

```
┌─ Site Rules Section ─────────────────┐
│ [Search] [Add Rule]                  │
│ Rule 1                          [✏️]  │
│ Rule 2                          [✏️]  │
│ Rule 3                          [✏️]  │  ← User clicks edit
│ ┌─ RuleEditForm (INLINE) ───────┐    │  ← Form expands below
│ │ hostname: *.example.com       │    │
│ │ include: ...  exclude: ...    │    │
│ │ [Cancel] [Save]               │    │
│ └────────────────────────────────┘    │
│ Rule 4                          [✏️]  │
│ ...                                  │
└──────────────────────────────────────┘
```

**For "Add Rule":** The form appears at the top (above the list), since there's no existing row to anchor to. This is the only case where top placement is used.

### Implementation

**Changes to `SiteRulesSection.tsx`:**

1. Remove the standalone `{editingRule && <RuleEditForm />}` block above the rules list.
2. Inside `filteredRules.map()`, after each rule row `<div>`, conditionally render:
   ```tsx
   {editingRule?.id === rule.id && !isAdding && (
     <RuleEditForm rule={editingRule} onSave={handleSaveRule} onCancel={...} />
   )}
   ```
3. Keep the top-positioned form only for `isAdding === true`:
   ```tsx
   {editingRule && isAdding && (
     <RuleEditForm rule={editingRule} onSave={handleSaveRule} onCancel={...} />
   )}
   ```
4. Add a subtle expand animation (CSS `animate-expand` or use existing `animate-fade-in-up`).

**No changes needed** to `RuleEditForm` itself — it's already a self-contained component.

---

## Files Changed Summary

| File | Change |
|------|--------|
| `types/config.ts` | Add `globalExcludeSelectors: string[]` to `ExtensionSettings`, add default |
| `lib/config.ts` | Migration: default `globalExcludeSelectors` for existing users |
| `stores/settingsStore.ts` | Include new field in store hydration |
| `content/sectionTranslate.ts` | Merge global excludes with per-site excludes |
| `entrypoints/options/sections/SiteRulesSection.tsx` | Add `GlobalExcludesCard`, move edit form inline |

---

## Out of Scope

- Changing the built-in rules to remove their `pre`/`code` excludes (they stay for explicitness).
- Global **include** selectors (not requested, YAGNI).
- Any changes to `domWalker.ts` (it already handles excludeSelectors correctly).
