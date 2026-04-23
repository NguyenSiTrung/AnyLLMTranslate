# Plan: Two-Layer Page Category Override System

## Phase 1: Types & Constants
<!-- execution: parallel -->

- [ ] Task 1: Create predefined categories constant (`lib/categories.ts`)
  <!-- files: lib/categories.ts -->
  - [ ] Define `PREDEFINED_CATEGORIES` array with ~23 curated categories
  - [ ] Export `PredefinedCategory` type
  - [ ] Write unit test: non-empty, unique entries

- [ ] Task 2: Extend SiteRule with category field (`types/config.ts`)
  <!-- files: types/config.ts, types/__tests__/config.test.ts -->
  - [ ] Add `category?: string` to `SiteRule` interface
  - [ ] Update config test: verify SiteRule accepts optional category

- [ ] Task 3: Add message types for category override (`types/messages.ts`)
  <!-- files: types/messages.ts -->
  - [ ] Add `setCategoryOverride` action type (Popup → Background)
  - [ ] Add `getPageCategory` action type (Popup → Content)
  - [ ] Add `CategoryInfo` response type (`{ autoDetected?, siteRule?, override?, effective? }`)

- [ ] Task: Conductor - Phase Verification 'Types & Constants' (Protocol in workflow.md)

## Phase 2: Backend — Category Store & Resolution
<!-- execution: parallel -->

- [ ] Task 1: Create tab-scoped category store (`services/categoryStore.ts`)
  <!-- files: services/categoryStore.ts, services/__tests__/categoryStore.test.ts -->
  - [ ] Implement `setCategoryOverride(tabId, category)` — set or delete from Map
  - [ ] Implement `getCategoryOverride(tabId)` — returns string | undefined
  - [ ] Implement `initTabCleanup()` — `chrome.tabs.onRemoved` listener
  - [ ] Write tests: set/get/clear per tab, cleanup on tab removal

- [ ] Task 2: Add category resolution function (`content/utils/pageContext.ts`)
  <!-- files: content/utils/pageContext.ts, content/utils/__tests__/pageContext.test.ts -->
  - [ ] Add `resolveCategory(autoDetected, siteRuleCategory, tabOverride)` — returns `tabOverride ?? siteRuleCategory ?? autoDetected`
  - [ ] Write tests: temp wins, siteRule wins, autoDetect fallback, all undefined → undefined

- [ ] Task 3: Handle category messages in background (`services/background.ts`)
  <!-- files: services/background.ts, entrypoints/background.ts -->
  <!-- depends: task1 -->
  - [ ] Import and use `setCategoryOverride`, `getCategoryOverride` from categoryStore
  - [ ] Handle `setCategoryOverride` message: store override, forward `categoryChanged` to content tab
  - [ ] Handle `getCategoryOverride` message: return current override for tab
  - [ ] Call `initTabCleanup()` in background entrypoint

- [ ] Task: Conductor - Phase Verification 'Backend — Category Store & Resolution' (Protocol in workflow.md)

## Phase 3: Content Script — Wire Category Override
<!-- execution: sequential -->

- [ ] Task 1: Apply category override in translation flow (`entrypoints/content.ts`)
  - [ ] Add module-level `let categoryOverride: string | undefined`
  - [ ] Handle `setCategoryOverride` message → update `categoryOverride` variable
  - [ ] Handle `getPageCategory` message → query auto-detect + siteRule + override → return `CategoryInfo`
  - [ ] In `translatePieces()`: after `extractPageContext()`, resolve category via `resolveCategory(pageContext.category, matchingRule?.category, categoryOverride)` and override `pageContext.category`
  - [ ] Ensure title, description, domain remain untouched

- [ ] Task: Conductor - Phase Verification 'Content Script — Wire Category Override' (Protocol in workflow.md)

## Phase 4: Popup UI — Category Dropdown
<!-- execution: sequential -->
<!-- depends: phase2, phase3 -->

- [ ] Task 1: Add category dropdown to popup (`entrypoints/popup/App.tsx`)
  - [ ] Add state: `categoryInfo` (loaded on popup open via `getPageCategory` message)
  - [ ] Add state: `customCategoryInput` for free-text entry
  - [ ] Add `CustomSelect` dropdown below "Page Category Detection" toggle
  - [ ] Options: `["Auto (detected: {X})", ...PREDEFINED_CATEGORIES, "Custom..."]`
  - [ ] On select: send `setCategoryOverride` to background via `chrome.tabs.sendMessage`
  - [ ] "Custom..." selection shows inline text input
  - [ ] Conditional visibility: only when `enableContextAwareTranslation` AND `enablePageCategoryDetection`
  - [ ] Disabled state on non-http pages

- [ ] Task 2: "Save as Rule" action in popup
  <!-- depends: task1 -->
  - [ ] Show "💾 Save as Rule" link when temporary override is active
  - [ ] On click: find/create SiteRule for `activeHostname` with current category
  - [ ] Clear temporary override after saving
  - [ ] Update `categoryInfo` state to reflect new source

- [ ] Task: Conductor - Phase Verification 'Popup UI — Category Dropdown' (Protocol in workflow.md)

## Phase 5: Settings UI — SiteRule Category Field
<!-- execution: sequential -->

- [ ] Task 1: Add category dropdown to RuleEditForm (`entrypoints/options/sections/SiteRulesSection.tsx`)
  - [ ] Add `FieldGroup` with category select in `RuleEditForm`
  - [ ] Options: `["None (use auto-detect)", ...PREDEFINED_CATEGORIES, "Custom..."]`
  - [ ] "None" maps to `undefined` (removes category from rule)
  - [ ] "Custom..." shows inline text input (max 50 chars)
  - [ ] Show category badge on rule list items when category is set

- [ ] Task 2: Auto-suggest for known domains
  - [ ] Import `DOMAIN_CATEGORY_MAP` from pageContext
  - [ ] When hostname matches a known domain, show hint: "Suggested: {category}"
  - [ ] User can click hint to apply suggestion

- [ ] Task: Conductor - Phase Verification 'Settings UI — SiteRule Category Field' (Protocol in workflow.md)

## Phase 6: Integration Tests & Polish
<!-- execution: sequential -->
<!-- depends: phase4, phase5 -->

- [ ] Task 1: End-to-end integration verification
  - [ ] Verify category override flows from popup → background → content → LLM prompt
  - [ ] Verify Save as Rule creates correct SiteRule entry
  - [ ] Verify category resolution priority (temp > siteRule > autoDetect)
  - [ ] Run full test suite: `pnpm test`
  - [ ] Run lint: `pnpm lint`
  - [ ] Run build: `pnpm build`

- [ ] Task: Conductor - Phase Verification 'Integration Tests & Polish' (Protocol in workflow.md)
