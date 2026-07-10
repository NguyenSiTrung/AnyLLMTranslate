# Site Rules UI Redesign

**Date:** 2026-07-10  
**Issue:** ALT-27u  
**Status:** Approved (user chose A + B hybrid)

## Goal

Redesign the Settings → Site Rules tab for clearer hierarchy, scannability, and polish. No matching/API/behavior changes.

## Approach

**A (polish) + B (filters/stats):** Card-based rule list with mode accents, summary stats, and filter chips.

## Information architecture

1. **Section header** — title, description, teal accent (unchanged role).
2. **Zone 1 — Global protection** (collapsible): Smart Excludes + Global exclude selectors.
3. **Zone 2 — Per-site rules** (primary): stats strip, search + filter chips + Add, rule cards, edit panel.

## Rule cards

- Left accent / mode chip: Always (emerald), Never (rose), Default (zinc)
- Hostname (mono), built-in + category badges
- Meta: include/exclude selector counts
- Actions: Edit; Delete (custom only) with existing confirm modal

## Filters & stats

- Counts: total, always, never, built-in (from full list; filtered list used for display)
- Single-select chips: All | Always | Never | Default | Built-in | Custom
- Hostname search combines with active chip

## Edit UX

- Add: panel above list
- Edit: expand under card
- Sections: Match → Selectors → Mode → Category
- Delete confirm modal retained

## Out of scope

Bulk actions, import/export, modal editor, engine/schema changes.
