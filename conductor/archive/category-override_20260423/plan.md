# Plan: Two-Layer Page Category Override System

## Phase 1: Types & Constants
<!-- execution: parallel -->

- [x] Task 1: Create predefined categories constant (`lib/categories.ts`)
  <!-- files: lib/categories.ts -->
  - [x] Define `PREDEFINED_CATEGORIES` array with ~23 curated categories
  - [x] Export `PredefinedCategory` type
  - [x] Write unit test: non-empty, unique entries

- [x] Task 2: Extend SiteRule with category field (`types/config.ts`)
  <!-- files: types/config.ts, types/__tests__/config.test.ts -->
  - [x] Add `category?: string` to `SiteRule` interface
  - [x] Update config test: verify SiteRule accepts optional category

- [x] Task 3: Add message types for category override (`types/messages.ts`)
  <!-- files: types/messages.ts -->
  - [x] Add `setCategoryOverride` action type (Popup → Background)
  - [x] Add `getPageCategory` action type (Popup → Content)
  - [x] Add `CategoryInfo` response type (`{ autoDetected?, siteRule?, override?, effective? }`)

- [x] Task: Conductor - Phase Verification 'Types & Constants' (Protocol in workflow.md)

## Phase 2: Backend — Category Store & Resolution
<!-- execution: parallel -->

- [x] Task 1: Create tab-scoped category store (`services/categoryStore.ts`)
  <!-- files: services/categoryStore.ts, services/__tests__/categoryStore.test.ts -->
  - [x] Implement `setCategoryOverride(tabId, category)` — set or delete from Map
  - [x] Implement `getCategoryOverride(tabId)` — returns string | undefined
  - [x] Implement `initTabCleanup()` — `chrome.tabs.onRemoved` listener
  - [x] Write tests: set/get/clear per tab, cleanup on tab removal

- [x] Task 2: Add category resolution function (`content/utils/pageContext.ts`)
  <!-- files: content/utils/pageContext.ts, content/utils/__tests__/pageContext.test.ts -->
  - [x] Add `resolveCategory(autoDetected, siteRuleCategory, tabOverride)` — returns `tabOverride ?? siteRuleCategory ?? autoDetected`
  - [x] Write tests: temp wins, siteRule wins, autoDetect fallback, all undefined → undefined

- [x] Task 3: Handle category messages in background (`services/background.ts`)
  <!-- files: services/background.ts, entrypoints/background.ts -->
  <!-- depends: task1 -->
  - [x] Import and use `setCategoryOverride`, `getCategoryOverride` from categoryStore
  - [x] Handle `setCategoryOverride` message: store override, forward `categoryChanged` to content tab
  - [x] Handle `getCategoryOverride` message: return current override for tab
  - [x] Call `initTabCleanup()` in background entrypoint

- [x] Task: Conductor - Phase Verification 'Backend — Category Store & Resolution' (Protocol in workflow.md)

## Phase 3: Content Script — Wire Category Override
<!-- execution: sequential -->

- [x] Task 1: Apply category override in translation flow (`entrypoints/content.ts`)
  - [x] Add module-level `let categoryOverride: string | undefined`
  - [x] Handle `setCategoryOverride` message → update `categoryOverride` variable
  - [x] Handle `getPageCategory` message → query auto-detect + siteRule + override → return `CategoryInfo`
  - [x] In `translatePieces()`: after `extractPageContext()`, resolve category via `resolveCategory(pageContext.category, matchingRule?.category, categoryOverride)` and override `pageContext.category`
  - [x] Ensure title, description, domain remain untouched

- [x] Task: Conductor - Phase Verification 'Content Script — Wire Category Override' (Protocol in workflow.md)

## Phase 4: Popup UI — Category Dropdown
<!-- execution: sequential -->
<!-- depends: phase2, phase3 -->

- [x] Task 1: Add category dropdown to popup (`entrypoints/popup/App.tsx`)
  - [x] Add state: `categoryInfo` (loaded on popup open via `getPageCategory` message)
  - [x] Add state: `customCategoryInput` for free-text entry
  - [x] Add `CustomSelect` dropdown below "Page Category Detection" toggle
  - [x] Options: `["Auto (detected: {X})", ...PREDEFINED_CATEGORIES, "Custom..."]`
  - [x] On select: send `setCategoryOverride` to background via `chrome.tabs.sendMessage`
  - [x] "Custom..." selection shows inline text input
  - [x] Conditional visibility: only when `enableContextAwareTranslation` AND `enablePageCategoryDetection`
  - [x] Disabled state on non-http pages

- [x] Task 2: "Save as Rule" action in popup
  <!-- depends: task1 -->
  - [x] Show "💾 Save as Rule" link when temporary override is active
  - [x] On click: find/create SiteRule for `activeHostname` with current category
  - [x] Clear temporary override after saving
  - [x] Update `categoryInfo` state to reflect new source

- [x] Task: Conductor - Phase Verification 'Popup UI — Category Dropdown' (Protocol in workflow.md)

## Phase 5: Settings UI — SiteRule Category Field
<!-- execution: sequential -->

- [x] Task 1: Add category dropdown to RuleEditForm (`entrypoints/options/sections/SiteRulesSection.tsx`)
  - [x] Add `FieldGroup` with category select in `RuleEditForm`
  - [x] Options: `["None (use auto-detect)", ...PREDEFINED_CATEGORIES, "Custom..."]`
  - [x] "None" maps to `undefined` (removes category from rule)
  - [x] "Custom..." shows inline text input (max 50 chars)
  - [x] Show category badge on rule list items when category is set

- [x] Task 2: Auto-suggest for known domains
  - [x] Import `DOMAIN_CATEGORY_MAP` from pageContext
  - [x] When hostname matches a known domain, show hint: "Suggested: {category}"
  - [x] User can click hint to apply suggestion

- [x] Task: Conductor - Phase Verification 'Settings UI — SiteRule Category Field' (Protocol in workflow.md)

## Phase 6: Integration Tests & Polish
<!-- execution: sequential -->
<!-- depends: phase4, phase5 -->

- [x] Task 1: End-to-end integration verification
  - [x] Verify category override flows from popup → background → content → LLM prompt
  - [x] Verify Save as Rule creates correct SiteRule entry
  - [x] Verify category resolution priority (temp > siteRule > autoDetect)
  - [x] Run full test suite: `pnpm test` — 697 tests pass
  - [x] Run lint: `pnpm lint` — 0 errors
  - [x] Run build: `pnpm build` — 639.81 KB

- [x] Task: Conductor - Phase Verification 'Integration Tests & Polish' (Protocol in workflow.md)
