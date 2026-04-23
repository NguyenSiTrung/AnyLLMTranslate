# Learnings: Two-Layer Page Category Override System

## Implementation Patterns

### 1. Tab-Scoped In-Memory Store
- `Map<tabId, string>` pattern works well for tab-scoped state in service workers
- `chrome.tabs.onRemoved` listener essential for cleanup
- Acceptable to lose state on SW restart — keep the API simple

### 2. Nullish Coalescing for Priority Chains
- `tabOverride ?? siteRuleCategory ?? autoDetected` is O(1) and readable
- Better than if/else chains or priority arrays for 3-level hierarchies

### 3. Message Passing Flow
- Popup → Background (setCategoryOverride) → Background forwards to Content (categoryChanged)
- Content → Popup (getPageCategory): async response with full CategoryInfo
- Keep message types in union discriminated by `action` field

### 4. UI Integration
- Popup dropdown appears conditionally below its parent toggle
- "Save as Rule" promotes temporary override to persistent SiteRule
- DOMAIN_CATEGORY_MAP provides auto-suggest for known domains in SiteRule editor
- Custom free-text capped at 50 chars for sanity

## Gotchas
- `DOMAIN_CATEGORY_MAP` was initially `const` (private) — needed `export` for SiteRule auto-suggest
- RuleEditForm had duplicate `onSave()` call — fixed during implementation
- Non-null assertions flagged by ESLint — use if-guards in tests instead

## Key Files
- `lib/categories.ts` — PREDEFINED_CATEGORIES constant
- `services/categoryStore.ts` — tab-scoped override store
- `content/utils/pageContext.ts` — resolveCategory() + DOMAIN_CATEGORY_MAP
- `services/background.ts` — message handlers
- `entrypoints/content.ts` — content script wiring
- `entrypoints/popup/App.tsx` — category dropdown + Save as Rule
- `entrypoints/options/sections/SiteRulesSection.tsx` — SiteRule category field
