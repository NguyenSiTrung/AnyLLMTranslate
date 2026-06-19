# Streaming & Learning Site Categories — Design

Date: 2026-06-19
Status: Approved (pending user spec review)

## Problem

The hardcoded `DOMAIN_CATEGORY_MAP` in `content/utils/pageContext.ts` is the
first-priority check in `detectCategory()`. It currently has a handful of
streaming/learning entries (`netflix.com`, `udemy.com`, `coursera.org`,
`youtube.com`) but omits the other major streaming movie/TV platforms and
online-learning platforms that users frequently translate subtitles/text on.

When a site is missing from the map, `detectCategory()` falls through to
meta-keyword / og:type / h1 / URL heuristics, which are unreliable for these
platforms (DRM streaming sites expose little usable metadata; learning sites'
meta tags are inconsistent). The result is a missing or wrong category for
context-aware translation on exactly the sites where subtitle translation
quality matters most.

## Goal

Extend `DOMAIN_CATEGORY_MAP` with the major Western and Chinese streaming
movie/TV platforms and the major online-learning platforms, all mapped to
existing `PREDEFINED_CATEGORIES`, so context-aware translation reliably
classifies these sites without relying on heuristics.

This is a **categories-only** change — no subtitle interception, no
`isOnWatchPage()` changes, no settings UI changes, no new handlers.

## Approach

Append entries directly to the existing flat `DOMAIN_CATEGORY_MAP`
(`Record<string, string>`) in `content/utils/pageContext.ts`. The map is already
the highest-priority signal in `detectCategory()`, so the new entries take
precedence over heuristics.

Rejected alternatives:
- Extracting streaming/learning entries into a separate `lib/streamingSites.ts`
  splits one cohesive lookup across two files with no benefit at this size.
- A richer per-site model (category + region + notes) is over-engineered for a
  flat string→category lookup that the consumer already uses as-is.

## Components

### A. `content/utils/pageContext.ts` — extend `DOMAIN_CATEGORY_MAP`

Append 18 new entries (37 currently present → 55 total). Group them under
comment headers within the existing object literal for readability, matching the
current loose grouping style.

**Streaming Entertainment (12 total, 11 new — `netflix.com` already exists):**

| Domain | Category |
|---|---|
| `netflix.com` *(existing)* | Streaming Entertainment |
| `disneyplus.com` | Streaming Entertainment |
| `hulu.com` | Streaming Entertainment |
| `primevideo.com` | Streaming Entertainment |
| `tv.apple.com` | Streaming Entertainment |
| `peacocktv.com` | Streaming Entertainment |
| `paramountplus.com` | Streaming Entertainment |
| `max.com` | Streaming Entertainment |
| `youku.com` | Streaming Entertainment |
| `iqiyi.com` | Streaming Entertainment |
| `v.qq.com` | Streaming Entertainment |
| `bilibili.com` | Streaming Entertainment |

**Online Education (9 total, 7 new — `udemy.com`, `coursera.org` already exist):**

| Domain | Category |
|---|---|
| `udemy.com` *(existing)* | Online Education |
| `coursera.org` *(existing)* | Online Education |
| `khanacademy.org` | Online Education |
| `edx.org` | Online Education |
| `pluralsight.com` | Online Education |
| `skillshare.com` | Online Education |
| `udacity.com` | Online Education |
| `duolingo.com` | Online Education |
| `lingoda.com` | Online Education |

### Category-string validity

Both category strings already exist in `PREDEFINED_CATEGORIES`
(`lib/categories.ts`):
- `'Streaming Entertainment'` — present.
- `'Online Education'` — present.

No change to `lib/categories.ts` is required. (The existing
`DOMAIN_CATEGORY_MAP` comment already documents that "Values MUST use Title Case
to match PREDEFINED_CATEGORIES in lib/categories.ts" — the new entries follow
that constraint.)

### Subdomain matching

The existing matcher
`domain === key || domain.endsWith('.' + key)` covers `www.`, regional, and
arbitrary subdomains automatically (e.g. `www.netflix.com`, `play.max.com`).
No per-subdomain entries are needed.

## Data flow

Unchanged. On page load (when category detection is enabled), `detectCategory()`
checks `DOMAIN_CATEGORY_MAP` first. For a newly-added domain like
`disneyplus.com`, it now returns `'Streaming Entertainment'` immediately
instead of falling through to unreliable heuristics. The value flows into
`pageContext.category`, through `resolveCategory()`, and into the translation
prompt.

## Error handling

None required — this is pure data. An entry with a typo'd domain simply won't
match (no crash); an entry with a non-`PREDEFINED_CATEGORIES` value would still
work as a free-form category string but would break the popup dropdown's
"Auto (Category)" display. The chosen values are all valid `PREDEFINED_CATEGORIES`,
so this is not a concern.

## Testing

Add a `describe('DOMAIN_CATEGORY_MAP')` block to
`content/utils/__tests__/pageContext.test.ts`. Import the exported
`DOMAIN_CATEGORY_MAP` directly and assert representative mappings against the
map data:

- Each new streaming domain maps to `'Streaming Entertainment'`.
- Each new learning domain maps to `'Online Education'`.
- A spot-check that the matcher would accept a `www.` subdomain (sanity check
  on the matching logic, since direct assertions on the map can't exercise the
  `endsWith` branch — covered by a small dedicated test using the real
  `detectCategory` path with a mocked hostname, or by asserting the matching
  predicate behavior directly).

Direct assertions against the exported map are preferred over `window.location`
mocking — consistent with how the existing tests sidestep `window.location`
difficulty. The full new set (all 18 new domains) is locked in so a future edit
can't silently drop an entry.

## Out of scope

- **Regional domain variants** (e.g. `iq.com` for iQiyi international,
  `youku.tv`, country-specific Netflix domains). Easy follow-up if needed; the
  `endsWith` matcher already handles subdomains of the listed apex domains.
- **Functional subtitle handlers** for these platforms. Netflix/Disney+/Youku/
  iQiyi use DRM-protected encrypted subtitle streams; building handlers is a
  separate, much larger reverse-engineering effort per platform.
- **`isOnWatchPage()` URL patterns** for these platforms — no behavioral
  change to subtitle activation.
- **`SUPPORTED_SUBTITLE_SITES` / settings UI** — no roadmap/tracking list
  additions.
- **Bilibili as `'Video Platform'`** — explicitly decided as
  `'Streaming Entertainment'` (it carries paid movies/series alongside UGC).
