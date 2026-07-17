# Key Rate Limits UX — Design Spec

**Issue:** AnyLLMTranslate-apl  
**Date:** 2026-07-17  
**Status:** Approved for implementation planning  
**Scope:** Options → Providers → Edit provider → Keys tab (`ProviderKeyRow`)

## Problem

Per-key concurrency and throttle settings are hard to discover and hard to use:

1. **Hidden behind overflow menu** — “Advanced limits” only appears in the ⋯ dropdown (hover/focus), so most users never find them.
2. **Double progressive disclosure** — menu toggle then a nested “Concurrency & throttle” accordion.
3. **Weak detail UX** — three raw number fields with long, overlapping help text; no presets; no summary when collapsed.
4. **No visibility of current limits** — users cannot see `20/min · 1× · 500ms` without hunting through menus.

Safe defaults already exist in product (`DEFAULT_KEY_MAX_RPM = 20`, `DEFAULT_KEY_CONCURRENCY_LIMIT = 1`, `DEFAULT_KEY_INTERVAL_MS = 500`). The UI should surface and explain them, not bury them.

## Goals

- Make rate limits a **first-class, scannable** part of each key card.
- **Collapsed by default** with a live summary; one click to expand and edit.
- Offer **presets + fine-tune** for power users.
- Keep ⋯ menu for **structural actions only** (move / remove).
- Improve copy: short, non-redundant, units clear.

## Non-goals

- Changing the throttle/concurrency engine in `providerPool` (behavior stays as today).
- Provider-level Advanced tab throttle settings.
- Global `maxRpm` in Advanced section.
- Changing default numeric constants unless UI reset explicitly applies Safe.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Collapsed vs always open | **B — Collapsed with summary + one-click expand** |
| Expanded controls | **A — Presets + fine-tune fields** |
| ⋯ menu contents | **A — Move up / Move down / Remove only** |
| Layout | **Approach 1 — Summary strip under API key + Label** |

## Design

### Placement

On each key card (`ProviderKeyRow`), after **API key** and **Label**, before connection-test progress/results.

### Collapsed summary row (default)

Full-width disclosure control:

| Left | Center | Right |
|------|--------|--------|
| **Rate limits** | Live summary of committed values | Chevron |

**Summary format**

| Field | Value &gt; 0 | Value = 0 |
|-------|-------------|-----------|
| `maxRpm` | `{n}/min` | `Unlimited rate` |
| `concurrencyLimit` | `{n} at once` | `No concurrency cap` |
| `interval` | `{n} ms gap` | `No gap` |

- Join with middle dots: ` · `
- Example (Safe): `20/min · 1 at once · 500 ms gap`
- Example (Unlimited): `Unlimited rate · No concurrency cap · No gap`
- Single line; if extremely narrow, CSS truncate + `title` with full string

**Interaction**

- Entire row is one button (not chevron-only).
- Toggles expand/collapse.
- `aria-expanded`, `aria-controls`, region labelled by the trigger.
- Keyboard: Enter / Space.
- No second nested accordion labelled “Concurrency & throttle”.

### Expanded body

Order:

1. One help sentence:  
   > Limits how fast this key hits the API. Presets are a starting point — tweak the numbers if you need to.
2. Preset chips.
3. Three fine-tune fields (grid: 1 col narrow, 3 col wide).
4. **Reset to Safe** text button.

### Presets

Selecting a chip writes all three fields immediately (drafts + commit).

| Preset | maxRpm | concurrencyLimit | interval (ms) | Intent |
|--------|--------|------------------|---------------|--------|
| **Safe** | 20 | 1 | 500 | Product defaults; reduce 429s |
| **Balanced** | 40 | 2 | 250 | Faster bulk/PDF, still cautious |
| **Aggressive** | 60 | 4 | 100 | High throughput; rate-limit risk |
| **Unlimited** | 0 | 0 | 0 | No per-key throttle |

**Chip selection state**

- Highlight chip when current values **exactly** match that preset.
- If values match none → no chip selected; show subtle **Custom** label (text only, not a chip).

### Fine-tune fields

| Label | Suffix | Description | Compact hint |
|-------|--------|-------------|--------------|
| Max rate | `req/min` | Requests this key may start per minute | `0 = unlimited · 0–600` |
| Max concurrent | `at once` | In-flight requests at the same time | `0 = global cap only · 0–20` |
| Min gap | `ms` | Wait after one request before the next | `0 = off · 0–60000 · 1000 ms = 1 s` |

**Validation (unchanged clamps)**

- maxRpm: 0–600  
- concurrencyLimit: 0–20  
- interval: 0–60000  

**Commit model**

- Number inputs: local draft while typing; commit on blur (existing pattern).
- Presets and **Reset to Safe**: apply values and commit immediately.
- Summary reflects committed values; after blur, drafts sync to committed.

### Overflow menu (⋯)

Only:

- Move up (if reorder available)
- Move down (if reorder available)
- Remove

Remove “Advanced limits” / “Hide limits” from the menu.

### Remove

- Nested `AdvancedDisclosure` labelled “Concurrency & throttle” around these fields (single disclosure = summary strip).
- Hover-only discovery path for rate limits.

## Component / file impact (expected)

| File | Change |
|------|--------|
| `entrypoints/options/components/ProviderKeyRow.tsx` | Primary UI rework |
| Possibly extract small helpers | Summary formatter, preset match — colocate or tiny util if tests prefer pure functions |
| `entrypoints/options/sections/__tests__/ProvidersSection.test.tsx` and/or component tests | Update for new affordances |
| New unit tests | Summary string + active-preset matching |

No storage schema change: still `PoolKey.maxRpm`, `concurrencyLimit`, `interval`.

## Accessibility

- Summary row is a real `<button>` with `aria-expanded` / `aria-controls`.
- Expanded region `role="region"` + `aria-labelledby`.
- Preset chips: `role="radiogroup"` + `role="radio"` (or toggle buttons with `aria-pressed`) so only one active match is clear; Custom is not in the group.
- Focus management: expand does not steal focus from fields when user is editing; opening via keyboard moves focus into the region only if product pattern already does similar disclosures that way — prefer not trapping focus.

## Testing

1. **Unit:** summary formatter for default, unlimited, mixed custom.
2. **Unit:** `matchRateLimitPreset(values) → 'safe' | 'balanced' | 'aggressive' | 'unlimited' | null`.
3. **Component / section:**  
   - Rate limits not in ⋯ menu.  
   - Summary visible when collapsed.  
   - Click expands fields + presets.  
   - Selecting Safe writes 20/1/500.  
   - Editing one field clears active preset (Custom).  
   - Reset to Safe restores defaults.

## Success criteria

- User can see current per-key limits without opening a menu.
- One click reveals controls; no double accordion.
- Presets cover Safe → Unlimited without reading long docs.
- Power users can still set arbitrary values in range.
- Existing throttle behavior unchanged for same numeric config.

## Open questions

None — all product choices locked in design discussion.
