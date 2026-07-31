# LLM-Assisted Site Rule Suggestions from URL

**Date:** 2026-07-31  
**Issue:** AnyLLMTranslate-6ui  
**Status:** Approved (design)

## Goal

On **Settings → Site Rules**, when adding or editing a rule, the user can paste a page URL. The extension captures page structure (prefer an open tab’s live DOM; otherwise fetch the URL), sends a compact outline to the user’s configured translation LLM, and fills a **full draft site rule**. The user always reviews and edits before save. Nothing is auto-persisted.

## Decisions

| Decision | Choice |
|----------|--------|
| Outcome | Full rule draft (hostname + includes + excludes + optional mode/category) |
| Content source | Hybrid: open tab DOM outline preferred; background fetch fallback |
| Apply UX | Review then apply into the existing rule form; explicit Save |
| LLM | Same translation provider/model/API key as translation |
| Fallback | Local heuristics when provider missing or LLM fails |
| UI placement | Inline strip inside existing Add/Edit rule form (Approach A) |

## Non-goals (v1)

- Bulk URL import
- Auto-apply without review
- Separate assistant model configuration
- Live “preview translate with these selectors” on the page
- Runtime matching/engine changes
- Storing page content beyond the in-flight request

## User flow

1. User opens **Settings → Site Rules** and clicks **Add rule** (or **Edit** on an existing rule).
2. In the rule form, a **Suggest from URL** block appears above step 1 (Match).
3. User pastes `https://example.com/some-page` and clicks **Suggest with AI**.
4. Status shows capture source: *Using open tab* or *Fetched URL (may miss dynamic content)*.
5. Form fields fill with a draft: hostname pattern, include/exclude selectors, optional mode/category.
6. User edits freely (chips, hostname, mode, category).
7. User clicks **Add rule** / **Save changes** — only then is the rule written to settings.

## Architecture

### Components

| Piece | Role |
|--------|------|
| `RuleEditForm` in `SiteRulesSection` | URL input, Suggest button, loading/error/status, merge draft into form state |
| Options → Background message | `SUGGEST_SITE_RULE` request/response |
| Background orchestrator | Hybrid capture → outline → heuristic draft → optional LLM refine → validate |
| Tab capture path | Matching open tab → content script `GET_DOM_OUTLINE` → live DOM outline |
| Fetch path | No matching tab → background `fetch(url)` → parse HTML to same outline shape |
| Heuristic fallback | Outline → basic include/exclude/hostname without LLM |
| LLM call | Translation provider pool; dedicated JSON-only prompt |

### Data flow

```
Options UI
  → SUGGEST_SITE_RULE { url }
Background
  1. Parse/normalize URL (http/https only)
  2. Find open tab with same hostname (prefer https; active tab wins ties)
  3a. Tab hit  → content GET_DOM_OUTLINE → outline + source: "tab"
  3b. No tab   → fetch HTML → parse outline + source: "fetch"
  4. Build heuristic draft from outline
  5. If provider ready → LLM refine outline → draft
     Else / on LLM error → heuristic draft + warning
  6. Validate hostname + selectors → response
Options UI
  → Merge draft into form (user reviews, then saves)
```

### DOM outline (compact, privacy-minded)

Do **not** send a full HTML dump or long article body. Build a capped structural outline:

- `url`, `hostname`, `title`
- Candidate nodes: tag, id, classes (capped), role, short text sample, approximate text length, depth
- Prefer content-ish regions (`main`, `article`, `[role=main]`, large text containers) and chrome (`nav`, `aside`, `footer`, `header`, `pre`, `code`, sidebars)
- Hard caps: max node count and max string lengths before any LLM call

### Draft response shape

```ts
interface SuggestSiteRuleDraft {
  hostname: string;              // e.g. "example.com" or "*.example.com"
  includeSelectors: string[];
  excludeSelectors: string[];
  alwaysTranslate?: boolean;
  neverTranslate?: boolean;
  category?: string;
  /** How page structure was captured (not whether LLM ran). */
  source: 'tab' | 'fetch';
  warnings?: string[];           // e.g. 'heuristic_only', SPA/fetch limits, no API key
  rationale?: string;            // short optional explanation for UI
}
```

**v1 `source` + warnings rules:**

- `source` is always the **capture** path: `tab` | `fetch`
- Success with LLM: `source` set; no `heuristic_only` warning
- Success without LLM (heuristic draft from a captured outline): same `source`, plus `warnings` including `heuristic_only`
- Capture failure (no outline): error response, no draft, form unchanged

### Message contract (sketch)

```ts
// request
{ action: 'SUGGEST_SITE_RULE'; url: string }

// success
{
  action: 'SUGGEST_SITE_RULE',
  ok: true,
  draft: {
    hostname: string,
    includeSelectors: string[],
    excludeSelectors: string[],
    alwaysTranslate?: boolean,
    neverTranslate?: boolean,
    category?: string,
    source: 'tab' | 'fetch',
    warnings?: string[],
    rationale?: string,
  }
}

// failure
{ action: 'SUGGEST_SITE_RULE', ok: false, error: string }
```

Exact typing should follow existing `types/messages.ts` patterns.

## UI

### Placement

Optional helper strip at the top of the existing **New site rule** / **Edit site rule** card, above step 1 (Match). No separate wizard modal.

### Layout

- Label: **Suggest from URL**
- Text field for URL
- Button: **Suggest with AI** (disabled until URL looks valid)
- Helper: “Uses your translation provider. Prefer having the page open in a tab for better selectors.”
- Status/error line under the controls
- Optional one-line rationale when present

### States

| State | UI |
|--------|-----|
| Idle | URL field + Suggest (disabled until valid-looking http/https URL) |
| Loading | Button spinner; field disabled; “Analyzing page…” |
| Success (tab) | “Using open tab · Draft applied — review before save” |
| Success (fetch) | “Fetched URL (may miss dynamic content) · Draft applied” |
| Success (heuristic only) | “Basic draft (LLM unavailable) · Review carefully” + capture source if known |
| Error | Inline error; form fields unchanged |
| Partial | Draft applied + warning text/chips |

### Draft merge rules

When a draft arrives into form state:

| Field | Rule |
|-------|------|
| Hostname | On **Add**: always set from draft. On **Edit**: set only if hostname is empty; otherwise keep existing hostname (user can paste over manually). |
| Include selectors | Replace with draft list |
| Exclude selectors | Replace with draft list |
| Mode (always/never) | Only change if currently Default **and** draft sets a mode; v1 LLM should usually leave Default |
| Category | Only set if currently none/empty |
| Rationale | Show under status; not persisted on the `SiteRule` |

Save remains the existing **Add rule** / **Save changes** path. Never auto-save.

### Edit vs Add

- Primary entry: **Add rule**
- Also available on **Edit** so users can refresh selectors for a hostname from a sample URL

## LLM prompt behavior

- System/user prompt asks for **JSON only** matching the draft fields
- Input is the capped DOM outline + URL/title/hostname — not full page text
- Guidance: prefer stable selectors (semantic tags, roles, short ids/classes); avoid ephemeral hashed classes when better alternatives exist; exclude nav/chrome/code; include main readable content
- Hostname: prefer apex host or a single `*.domain` pattern when subdomains clearly share layout; do not invent unrelated hosts
- Temperature low; max tokens modest (selector lists are small)
- On parse failure or empty usable selectors after sanitize → heuristic draft + warning

## Validation & safety

- Accept only `http:` / `https:` URLs
- No persistence of outline/HTML beyond the request lifetime
- Sanitize LLM selectors: trim, dedupe, max length, max count, reject empty; drop obviously invalid tokens
- Do not execute returned selectors during suggest (save/runtime paths unchanged)
- Surface that the feature uses the translation API (token/cost awareness)
- Existing rule for same hostname: soft warning optional in v1; no silent merge; Save uses current add/edit behavior

## Errors & edge cases

| Case | Behavior |
|------|----------|
| Invalid URL / non-http(s) | Client-side validation; no request |
| No matching tab + fetch fails | Error; form unchanged |
| Fetch HTML with almost no structure | Weak heuristic draft + warning, or error if nothing usable |
| SPA / JS-heavy via fetch | Warning; suggest opening the page in a tab |
| Login-walled page | Tab path if user is logged in; fetch may get login shell → warning |
| No provider / no API key | Heuristic draft + clear warning |
| LLM timeout / bad JSON | Heuristic fallback + warning |
| Built-in rule edit | Suggestions only touch in-form draft until Save (same as today) |
| Huge pages | Outline hard-capped before LLM |
| All LLM selectors dropped | Heuristic fallback |

## Testing

- Unit: URL normalize; hostname pattern choice; outline → heuristic draft; LLM JSON parse/validate/sanitize
- Unit: hybrid source selection (tab vs fetch) with mocks
- Component: `RuleEditForm` suggest states and draft merge rules (Add vs Edit hostname)
- Background: message contract + fallback paths
- No full browser e2e crawl required for v1 if orchestrator is well covered

## Implementation notes (for planning)

Likely touch points (non-exhaustive):

- `entrypoints/options/sections/SiteRulesSection.tsx` — UI strip + merge
- `types/messages.ts` — `SUGGEST_SITE_RULE` (+ content outline message)
- `services/background.ts` / background entry — orchestrator + fetch + LLM
- Content script message handler — `GET_DOM_OUTLINE` builder
- New lib modules e.g. `lib/siteRuleSuggest/` for outline parse, heuristics, prompt, sanitize (keep `SiteRulesSection` from growing further)
- Tests under `lib/__tests__/` and options/background test patterns

Reuse patterns from existing LLM helper actions where possible (`DETECT_PAGE_CATEGORY_LLM`, `getNamedGlossarySuggestions`): background-mediated provider calls, structured JSON, graceful degradation.

## Rollout

- Ship in Site Rules UI with helper copy only (no feature flag required)
- No settings schema migration (draft is ephemeral until user saves a normal `SiteRule`)
