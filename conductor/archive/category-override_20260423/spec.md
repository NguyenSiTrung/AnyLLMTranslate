# Spec: Two-Layer Page Category Override System

## Overview

Add a two-layer category system to AnyLLMTranslate that lets users manually select a page category for translation context, with both temporary (popup) and persistent (SiteRule) mechanisms. The category override only replaces the `category` field in page context — title, description, and domain remain auto-extracted.

## Functional Requirements

### FR-1: Predefined Category List (Fixed + Custom)
- Maintain a curated list of ~23 predefined page categories (Software Development, News, Academic Research, etc.)
- Support a "Custom..." option allowing free-text category input (max 50 chars, trimmed)
- Categories are stored as plain strings — no enum, no migration needed

### FR-2: SiteRule Category Extension (Persistent)
- Extend `SiteRule` interface with optional `category?: string` field
- When a SiteRule has a `category` set, it overrides auto-detect for that hostname
- Category dropdown appears in the Site Rules edit form (Options page)
- Auto-suggest from `DOMAIN_CATEGORY_MAP` when hostname matches a known domain

### FR-3: Temporary Category Override (Tab-Scoped)
- Popup shows a category dropdown below the existing "Page Category Detection" toggle
- User can select a category for the current page — effective immediately
- Override is tab-scoped: survives page reload, cleared on tab close
- Stored in background service worker memory (`Map<tabId, string>`)
- Only visible when both `enableContextAwareTranslation` AND `enablePageCategoryDetection` are enabled

### FR-4: Category Resolution Priority
- Priority order (highest → lowest):
  1. Temporary popup override (tab-scoped)
  2. SiteRule.category (persistent per-domain)
  3. Auto-detect (DOMAIN_CATEGORY_MAP + heuristics)
  4. No category
- Only the `category` field is overridden — title, description, domain remain from page context

### FR-5: "Save as Rule" Shortcut
- When a temporary override is active, show a "💾 Save as Rule" link in the popup
- Clicking it creates/updates a SiteRule for `activeHostname` with the current category
- Clears the temporary override (SiteRule now handles it permanently)

## Non-Functional Requirements

- **No migration required** — `SiteRule.category` is optional, existing rules work unchanged
- **Token cost** — category adds ~20 tokens per request (same as existing auto-detect)
- **Performance** — `resolveCategory()` is O(1) (nullish coalescing)
- **SW restart tolerance** — temporary overrides are lost on service worker restart (acceptable by design)

## Acceptance Criteria

- [ ] User can select a predefined or custom category from the popup dropdown
- [ ] Selected category overrides auto-detect for the current tab only
- [ ] Override survives page reload within the same tab
- [ ] Override is cleared when tab is closed
- [ ] User can "Save as Rule" to promote temporary override to permanent SiteRule
- [ ] SiteRule edit form includes a category dropdown with predefined + custom options
- [ ] Auto-suggest appears when hostname matches a known domain in DOMAIN_CATEGORY_MAP
- [ ] Category resolution follows priority: temp > siteRule > autoDetect
- [ ] Page context title, description, domain remain unchanged when category is overridden
- [ ] Category dropdown is hidden when context-aware translation or category detection is disabled
- [ ] All existing tests continue to pass
- [ ] New tests cover resolveCategory(), categoryStore, and UI interactions

## Out of Scope

- LLM-based category detection (current heuristic approach is sufficient)
- Per-page (URL-based) category rules (hostname-level granularity is enough)
- Category analytics/statistics
- Syncing temporary overrides across devices
