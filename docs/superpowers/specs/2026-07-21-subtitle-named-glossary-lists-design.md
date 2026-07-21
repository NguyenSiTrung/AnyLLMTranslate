# Subtitle Named Glossary Lists — Design

Date: 2026-07-21  
Status: Approved (pending user spec file review)

## Problem

Subtitle name consistency already has three layers:

1. **Global Custom terms** (`settings.glossary`) — user-managed, all modes  
2. **Per-film proper-noun glossary** — LLM pre-scan, keyed by cue content hash, no UI  
3. **Rolling glossary** — per-session, per-chunk `properNouns`, memory only  

Gaps:

- Users cannot **own** a durable pack of names for a show/course without dumping everything into global Custom terms.  
- Auto film glossary is invisible and not correctable; rolling merge is last-write-wins and can undo a good translation.  
- Auto-detecting series/episode IDs across Netflix, HBO Max, Youku, WeTV, iQIYI is fragile and incomplete in current handlers (mostly episode `videoId` only; several stubs; no iQIYI handler).  

Users want: **named lists they control**, select which list applies on subtitle sites, and **suggest → edit → push** terms into that list — without platform series detection.

## Goal

Ship **user-named glossary lists** for the subtitle path:

- User creates lists with a custom name (e.g. `三体`, `CS50`).  
- On subtitle sites, user **selects** which list applies (or None).  
- Default when nothing chosen this session: **last list used on this site** (decision C).  
- User can **add / edit / delete** terms and **push** auto-suggestions into the active list.  
- Active list entries are **locked** — film seed and rolling merges must not overwrite them.  

Out of scope for v1: auto series/episode/title binding, applying named lists to web-page translation, forced pre-play review, community share packs.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Identity | User-named lists only | Reliable across DRM sites; no false series merges |
| Default selection | **C** — last list for this site | Multi-show balance without forced picker |
| Scope | Subtitle translate path only | Matches binge/course pain; keeps web path unchanged |
| Authority order | Named (locked) > global > film seed > rolling | User wins; auto remains assistive |
| Suggest source | Reuse pre-scan + rolling | No extra LLM call required |
| Series auto-detect | Not in v1 | Handlers lack stable series keys; title is weak |

## Approach comparison

| Approach | Summary | Verdict |
|----------|---------|---------|
| 1. Session overlay only | Lists exist; no real per-site memory | Rejected — fails C |
| **2. Named lists + per-site memory + subtitle apply** | Full product below | **Chosen** |
| 3. Show OS (auto title, pin matrix, share) | Approach 2 + fragile extras | Deferred |

## Architecture

### Glossary resolution at subtitle translate time

```text
1. Active named list (LOCKED)     ← new
2. Global Custom terms            ← existing formatGlossary
3. Film glossary seed → rolling   ← existing
4. Per-chunk properNouns merge    ← existing; skip locked keys
```

Prompt blocks (subtitle system prompt), in order:

1. Personal dictionary `"«name»"` block (omit if None / empty)  
2. Global glossary block  
3. Rolling proper-noun block  
4. JSON contract (unchanged)

### Session flow

```text
Subtitle session start
  → hostname = normalizeSubtitleSiteHost(...)
  → activeListId = resolveActiveSubtitleListId(lists, subtitleListBySite, hostname)
  → background loads locked Map from namedGlossaryLists[id]
  → seed rolling from film glossary (unlocked keys only where conflict)
  → each chunk: merge properNouns excluding locked keys
  → cache key includes named list id + entry snapshot
```

### Per-site memory (C)

```text
activeListId =
  subtitleListBySite[hostname]  if that list id still exists
  else null  (None)

User selects list  → subtitleListBySite[hostname] = listId
User selects None  → remove subtitleListBySite[hostname]
List deleted       → prune all map entries pointing at that id
```

## Data model

### Types

```ts
/** User-owned named glossary pack (subtitle-scoped in v1). */
export interface NamedGlossaryList {
  id: string;                 // crypto.randomUUID()
  name: string;               // trimmed, 1–64 chars
  entries: GlossaryEntry[];   // reuse { id, source, target }
  updatedAt: number;          // ms epoch
}

/** hostname → listId */
export type SubtitleListBySite = Record<string, string>;
```

### Settings fields (`ExtensionSettings`)

| Field | Default | Notes |
|-------|---------|-------|
| `namedGlossaryLists` | `[]` | Full pack storage |
| `subtitleListBySite` | `{}` | Per-site last selection |

Include both in portable settings export (same policy as `glossary`).

### Caps

| Cap | Value |
|-----|-------|
| Max lists | 50 |
| Max entries per list | 200 |
| Name length | 1–64 |
| Duplicate source in one list | Case-insensitive reject/merge via existing `findDuplicateSource` |
| Site map | Prune on list delete; no hard host cap required in v1 |

### Hostname normalization

```ts
normalizeSubtitleSiteHost(hostname: string): string
// lowercase, strip trailing ".", strip leading "www." only
// "www.youku.com" → "youku.com"
// "play.hbomax.com" → "play.hbomax.com"
```

### Pure helpers (new module, e.g. `lib/namedGlossaryLists.ts`)

- `normalizeSubtitleSiteHost`  
- `resolveActiveSubtitleListId(lists, bySite, hostname)`  
- `getNamedListById`  
- `formatNamedListGlossary(list)` → prompt block string  
- `pruneSubtitleListBySite(bySite, lists)`  
- `pushEntriesIntoList(list, entries, caps)` → result with dups/cap errors  
- Lock-aware merge helper or thin wrapper around `mergeProperNouns` that drops locked keys from incoming  

## Runtime integration

### Background subtitle path (`services/background.ts`)

On session init (alongside existing film glossary load):

1. Read `namedGlossaryLists` + `subtitleListBySite`.  
2. Resolve `activeListId` from message hostname (content must send hostname or full URL host).  
3. Build `lockedGlossary: Map<string, string>` from list entries.  
4. Format personal block; pass into `buildSubtitleSystemPrompt` (new param).  
5. When seeding/merging film + rolling: **do not overwrite locked keys**.  
6. Optional v1 polish: when formatting global glossary for this session, omit entries whose source matches a locked source (avoid contradictory pairs).  

### Prompt (`services/subtitlePrompt.ts`)

```ts
buildSubtitleSystemPrompt(
  targetLanguage,
  knobs,
  glossaryBlock?,           // global
  rollingGlossaryBlock?,
  namedListGlossaryBlock?,  // NEW — injected before global
)
```

Named block copy:

```text
Personal dictionary "«name»" (always use these translations; do not alter):
- "source" → "target"
```

### Cache (`lib/subtitleCacheKey.ts`)

Extend glossary snapshot:

```ts
{
  globalEntries: { source, target }[];
  properNouns: string[];
  namedListId: string | null;
  namedListEntries: { source, target }[];  // or sorted pair hash only
}
```

Any edit to active list entries or switching list id must change the cache key.

### Mid-session list switch

1. Persist site map.  
2. Update session locked map (new session id or in-place patch).  
3. **v1:** already-rendered cues stay; **forward** chunks use new list.  
4. Toast: dictionary switched. Optional “Retranslate from here” is **v1.1**.

### Content / coordinator

- Pass hostname (normalized or raw; normalize in one place) with translate-subtitle session.  
- Listen for settings/list changes if popup switches list while video plays.  
- No change to cue timing/overlay hot path beyond optional UI chip.

## Suggestions → push

### Candidate sources (no new LLM required)

1. Film pre-scan map for current content hash (if present)  
2. Current rolling glossary  
3. (Optional v1.1) term under cursor / selected cue text  

### Rules

- Dedupe by case-insensitive source  
- Exclude sources already in active list (or mark “already in list”)  
- Cap suggest UI at ~30 (frequency / distinctiveness if available; else insertion order)  
- User edits target before push  
- Push disabled when active list is None — hint: select or create a list  
- On push: update `namedGlossaryLists`, `updatedAt`, persist; refresh locked map immediately  

## UI

### Options → Custom terms

```text
Custom terms
├─ Global                 (existing)
└─ Named lists            (new)
     [+ New list]  search
     rows: name · N terms · Open · ⋯ (Rename | Export | Delete)
```

List detail reuses `GlossaryEntryList` / add form / CSV·JSON import-export helpers from `lib/glossary.ts`.

Delete list with entries: confirm. Then prune `subtitleListBySite`.

### Popup (subtitle-capable context)

```text
Subtitle dictionary
  [ 三体 ▼ ]     None | lists | + New list…
  Using last choice for youku.com
  [ Review suggestions ]  [ Edit list ]
```

Gate visibility: subtitles enabled and page is a known/generic subtitle host (avoid clutter on plain articles).

### In-page chip (should-have; popup is v1 minimum)

On subtitle controls: `📖 三体 ▾` / `📖 Dict ▾` when None — same dropdown data as popup.

### Suggestions panel

Non-blocking modal/drawer: checkboxes + editable targets + “Push N selected”.  
Never auto-block playback. Soft badge “N names · Review” only when candidates exist and a list is active is optional polish.

### Quick-add from cue

Nice-to-have v1 / v1.1: “Add to dictionary…” with source prefilled, target input, list defaulting to active.

## Error handling

| Case | Behavior |
|------|----------|
| Missing list id in site map | Treat as None; clear stale map entry on read/write path |
| Settings read failure | Translate without personal block |
| Over cap on push/create | Reject with user-visible error; no partial corrupt write |
| Empty list selected | Valid; no personal prompt block until entries exist |
| Concurrent Options + popup edits | Settings store last-write-wins; session refreshes on change if listener present |

## Performance

| Concern | Assessment |
|---------|------------|
| Latency | Local list load only; **no** mandatory extra LLM call |
| Prompt size | One list, capped 200; omit when None/empty |
| Cache | Correct invalidation may increase retranslate after edits (intentional) |
| Hot path | Overlay/timing loop untouched |

This is a **quality / UX** feature, not a throughput feature. Target: time-to-first-cue unchanged vs today when list resolves from storage and translation cache hits.

## Testing

### Pure unit

- Host normalization  
- `resolveActiveSubtitleListId` (hit / miss / deleted / empty)  
- Lock-aware merge  
- Prompt block order and omission  
- Cache key sensitivity to list id and entries  
- Caps, duplicates, prune-on-delete  
- Defaults / migration fill for new settings keys  

### Background / integration style

- Session with active list injects personal block  
- Rolling cannot overwrite locks  
- Push updates settings and live locks  
- None selected ≡ current behavior (regression)  

### UI

- Named list CRUD in Options  
- Popup selector reflects per-site resolution and writes map  

## Rollout phases

| Phase | Deliverable | Ship value |
|-------|-------------|------------|
| 1 | Types, defaults, pure helpers, lock merge, prompt + cache wire | Engine ready |
| 2 | Options named-list management | Users can build packs |
| 3 | Popup selector + per-site memory (C) | **Minimum lovable product** |
| 4 | Suggestions review + push | Suggest → modify → push loop |
| 5 | In-page chip + quick-add from cue | Binge polish |

## Non-goals (v1)

- Auto series / episode / title identity  
- Named lists on web-page or PDF paths  
- Forced pre-play name review wizard  
- Cloud/community pack marketplace  
- Automatic full-track retranslate on every list edit  

## Success criteria

1. With None selected, subtitle behavior matches pre-feature baseline.  
2. User can create a named list, select it on a subtitle site, and see locked terms honored in subsequent chunks.  
3. Returning to the same site restores last list without re-picking (C).  
4. Suggestions can be edited and pushed into the active list without a second pre-scan call.  
5. Cache does not serve translations computed under a different list/entry set.  
6. Rolling/film auto names never overwrite locked personal entries.

## Future (explicitly later)

- Optional “Suggest list name from page title” (label only)  
- Platform `seriesKey` auto-bind when handlers grow identity APIs  
- Apply named list to web translate  
- “Retranslate from here” on list switch  
- Per-list notes/color, soft host pin rules beyond last-used  

## Related code (current baseline)

- `lib/glossary.ts` — global format/import/export  
- `lib/subtitleGlossary.ts` — rolling merge/format (`MAX_ROLLING_GLOSSARY = 100`)  
- `lib/subtitleFilmGlossary.ts` + `services/filmGlossaryStore.ts` — content-hash film glossary  
- `services/subtitleNameScanner.ts` — pre-scan  
- `services/subtitlePrompt.ts` — subtitle system prompt  
- `lib/subtitleCacheKey.ts` — cache fingerprint  
- `entrypoints/options/sections/DictionarySection.tsx` — Custom terms UI  
- `services/background.ts` — subtitle session orchestration  
