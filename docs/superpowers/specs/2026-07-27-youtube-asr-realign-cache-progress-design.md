# Design: YouTube ASR AI Re-align Cache, Progress & Manager

**Date:** 2026-07-27  
**Status:** Approved for planning  
**Related:** `youtube-asr-resegment_20260709`, `lib/youtubeAsrResegment.ts`, `CaptionQualityCard.tsx`, `services/filmGlossaryStore.ts`, `services/cacheManager.ts`

## Problem

1. **No progress UX** — Caption quality (local improve + AI re-align) runs as a silent pre-translate step. Users only see generic translation progress afterward. AI re-align can take multiple LLM batches and fail-open to local rules with only `console.warn`.
2. **No persistence** — AI re-align is not cached. Every reload / re-intercept re-runs the LLM and burns tokens, even when the ASR body is unchanged.
3. **No user control** — There is no way to see which videos have saved re-aligns, delete one, clear all, or force a fresh AI run.

Local rule resegment is cheap CPU and stays out of the management UI in v1 (may still recompute each load).

## Goals

1. Persist **AI** re-align results per YouTube video track so reload does not re-call the LLM when input is unchanged.
2. Show runtime progress: re-align stage, batch `i/n` (+ %), and cache hit/miss.
3. Let users manage the cache: list entries, open on YouTube, delete one, clear all, force re-run.
4. Surface a compact summary on **Caption quality** and a full manager card on the **Subtitles** tab.

## Non-Goals (v1)

- Caching **local-only** resegment output (recompute is fast enough).
- Non-YouTube platforms.
- In-manager editing of cue text.
- Export/import or sync of re-align cache.
- Folding provider/model into the cache key (document that model switches do not auto-invalidate in v1; force re-run is the escape hatch).
- A separate “Cache AI re-align” master toggle (v1: always cache on successful AI re-align when AI is enabled).

## Product decisions (locked)

| Decision | Choice |
|---|---|
| What to cache | AI re-align output only |
| Storage | Dedicated IndexedDB store (not `chrome.storage.local`, not translation cache) |
| Summary UI | Caption quality card: count + size + Manage + Clear all |
| Full manager | Subtitles tab → **Saved caption re-aligns** card |
| Entry richness | Thumb, title, language, cue count, size, created, last used, YouTube link, Delete, Force re-run |
| Runtime progress | Full detail: stage + batch % + cache hit/miss badge |
| Missing `videoId` | Skip cache read/write; AI may still run |
| Partial AI failure | Fail-open to local; **do not** save partial cache |

---

## Architecture

```
YouTube ASR intercept
  → parse cues
  → local resegment (baseline / fail-open)
  → if AI enabled:
        cache lookup(ai:videoId:lang:contentHash)
          hit  → cues + progress "Using saved re-align"
          miss → AI batches w/ progress "Re-aligning i/n"
                 success → save entry → cues
                 fail    → local cues + notice
  → translateSubtitle (existing; keys use post-resegment text)
```

### Modules

| Module | Responsibility |
|---|---|
| `lib/youtubeAsrRealignCacheKey.ts` (pure) | Build key, content hash input, LRU candidate selection helpers, display formatters |
| `services/youtubeAsrRealignStore.ts` | IDB get/set/list/delete/clear, size accounting, LRU eviction, never-throw fail-open |
| `services/openaiCompatible.ts` / background | AI batches; emit or return batch progress; unchanged prompt/parse |
| `content/subtitleCoordinator.ts` | Lookup → AI/single-flight → save; drive progress stages before translate |
| `content/miniProgress.ts` / `subtitleToast.ts` | Pre-translate stage copy + optional % |
| `CaptionQualityCard.tsx` | Summary strip |
| `SavedCaptionRealignsCard.tsx` (new) | Full manager on Subtitles tab |
| Messages | List/delete/clear/stats + optional progress events for AI batches |

Reuse patterns from:

- **Translation cache** (`services/cacheManager.ts`) — IDB + size + LRU ideas  
- **Film glossary** (`services/filmGlossaryStore.ts`) — never-throw storage seam, separate namespace  
- **Subtitles UX cards** — bordered `Card` + `DisabledDimmer` when master subtitles off  

Do **not** mix ASR re-align entries into the translation cache store or bulk “Clear translation cache” without an explicit separate action (Clear all on the re-align manager only clears this store).

---

## Storage

### Store

- IndexedDB via `idb-keyval` (or same style as `cacheManager`)
- DB/store name distinct, e.g. `anyllm-asr-realign-cache`
- Extension origin only (background and options page access; content talks via messages)

### Entry shape

```ts
interface YoutubeAsrRealignCacheEntry {
  key: string;                 // ai:{videoId}:{language}:{contentHash}
  videoId: string;
  language: string;
  mode: 'ai';
  title?: string;              // best-effort page/track title
  thumbnailUrl?: string;       // https://i.ytimg.com/vi/{id}/mqdefault.jpg
  youtubeUrl?: string;         // https://www.youtube.com/watch?v={id}
  cueCount: number;
  byteSize: number;            // serialized payload estimate for UI + budget
  contentHash: string;         // hash of raw ASR input (units or cues)
  createdAt: number;           // ms
  lastUsedAt: number;          // ms; bumped on hit
  cues: SubtitleCue[];         // re-aligned output
}
```

### Cache key

```
ai:{videoId}:{language}:{contentHash}
```

- `contentHash`: stable hash over the **raw ASR input** used for AI (timed units preferred; else raw cues), not the local-resegment output alone — so caption body changes miss correctly.
- Language: track language code as used today in the coordinator.
- v1 does **not** include provider/model in the key. Document in UI helper text: changing models does not invalidate; use **Force re-run**.

### Lifecycle

| Event | Behavior |
|---|---|
| AI success | Upsert entry; set `createdAt` on first write; refresh meta; compute `byteSize` |
| Cache hit | Return `cues`; bump `lastUsedAt` (debounced OK) |
| Cache miss | Run AI |
| AI fail / empty / parse fail | No write; local fail-open |
| Delete one | Remove key |
| Force re-run | Delete key (and optional in-memory single-flight cancel); next watch misses |
| Clear all | Clear store only |
| Over budget | Before write, LRU-evict by oldest `lastUsedAt` until under caps |

### Caps (defaults; tunable constants)

- Max **entries**: 50  
- Max **approx bytes**: 32 MB (serialized value accounting, same spirit as translation cache)  
- Eviction: LRU on `lastUsedAt`, never throws mid-pipeline if eviction fails (skip save)

### Metadata best-effort

- `videoId`: from `AvailableSubtitleTrack.videoId` / discovery payload; required for cache  
- `title`: `document.title` stripped of common YouTube suffixes, or track label if available  
- `thumbnailUrl` / `youtubeUrl`: derived from `videoId` with fixed URL patterns (no network fetch required for thumb URL string)

If title is missing, UI shows `videoId`.

---

## Runtime pipeline

### Coordinator (content)

After parse + local `applyYoutubeAsrResegment`:

1. If `!asrEnable || !asrAiEnable || !youtube ASR` → existing behavior; no re-align progress chrome beyond today.
2. Resolve `videoId`. If missing → AI path without cache (progress still shown).
3. `contentHash` + `key` from pure helper.
4. `GET_ASR_REALIGN_CACHE` (or store accessed only in background — prefer **all IDB in background** so content stays message-based).
5. **Hit:** set cues, progress stage `realign-cached`, proceed to translate.
6. **Miss:** stage `realigning`; call `RESEGMENT_YOUTUBE_ASR` with progress; on success `SAVE_ASR_REALIGN_CACHE` with meta+cues; on failure toast fail-open and keep local cues.
7. Translate as today.

### Single-flight

In-memory map in background (or coordinator): `key → Promise<cues>` so concurrent intercepts for the same key share one AI run and one write.

### AI batch progress

Extend `RESEGMENT_YOUTUBE_ASR` handling so the service loop can report:

```ts
{ phase: 'realigning'; current: number; total: number }
```

Delivery options (pick one in plan; prefer simplest that works with existing ports):

- Progress messages to the requesting tab (`ASR_REALIGN_PROGRESS`), or  
- Long-lived port for the resegment call  

Coordinator maps to mini-progress / toast: `Re-aligning captions… 2/5` and percent `round(100 * current/total)`.

### Progress copy (user-visible)

| Stage | Copy |
|---|---|
| Cache hit | `Using saved re-align` (brief, then translation progress) |
| AI running | `Re-aligning captions… {i}/{n}` + % |
| AI → translate | Existing translating mini-progress |
| AI failed | `AI re-align failed · using local rules` then translate |
| Local only (AI off) | No extra stage |

Reuse `content/miniProgress.ts` and/or `content/subtitleToast.ts`; no permanent new host DOM beyond existing chrome.

---

## UI

### Caption quality card (summary)

Under AI re-align toggle:

- Text: `N saved · ~X MB` or `No saved re-aligns yet`
- **Manage** — scrolls/focuses **Saved caption re-aligns** on the same Subtitles page  
- **Clear all** — confirm modal; calls clear API; refreshes summary  

Dimmed with the rest of the card when master subtitle translation is off.

### Saved caption re-aligns card (Subtitles tab)

New bordered card below / near Caption quality:

- Header: title + short description (“AI re-aligned YouTube captions saved on this device”)
- Toolbar: sort (Last used default | Newest), **Clear all**
- List rows:
  - Thumbnail (`mqdefault`, broken-image placeholder)
  - Title (fallback `videoId`)
  - Meta line: language · cue count · size · created · last used
  - Link: Open on YouTube (new tab)
  - Actions: **Delete**, **Force re-run** (deletes entry; helper text: applies next time you open the video with AI re-align on)
- Empty state: explain entries appear after a successful AI re-align on a YouTube auto-caption track
- Loading / error: non-blocking; retry control if list fetch fails

Live refresh: options page listens for a `ASR_REALIGN_CACHE_UPDATED` broadcast or re-fetches on focus/visibility.

### Advanced / translation cache

No change required to “Clear translation cache”. Optional one-line cross-link in Advanced is out of scope unless trivial.

### Settings keys

No new user-facing enable flag in v1. Internal constants only for caps.

---

## Messaging API (background)

| Action | Purpose |
|---|---|
| `RESEGMENT_YOUTUBE_ASR` | Existing; add progress signaling |
| `GET_ASR_REALIGN_CACHE` | `{ key }` → entry or miss |
| `SAVE_ASR_REALIGN_CACHE` | `{ entry without bump rules }` |
| `LIST_ASR_REALIGN_CACHE` | → summaries[] (no full cues needed for list; optional omit cues for payload size) |
| `DELETE_ASR_REALIGN_CACHE` | `{ key }` |
| `CLEAR_ASR_REALIGN_CACHE` | wipe store |
| `ASR_REALIGN_CACHE_STATS` | `{ entryCount, totalBytes }` for summary strip |
| `ASR_REALIGN_PROGRESS` | event to tab during AI |
| `ASR_REALIGN_CACHE_UPDATED` | event after mutate (options refresh) |

List responses should return **summaries** (meta without `cues`) to keep options UI light. Full cues only on get-for-playback path.

---

## Error handling

| Case | Behavior |
|---|---|
| IDB read/write error | Miss / no-op save; log once; continue |
| Quota / eviction failure | Skip save; AI result still used in-session |
| Missing videoId | No cache; AI + progress still work |
| Content hash change | Natural miss |
| Corrupt entry | Delete or treat as miss |
| Options list failure | Empty + error line, not a blank crash |

---

## Testing

### Pure unit

- Key builder + content hash stability / sensitivity to cue text and timing  
- LRU eviction ordering  
- Meta URL helpers (`thumbnailUrl`, `youtubeUrl`)  
- Display formatters (size, relative time if any)

### Store (mocked idb)

- set/get hit, miss, delete, clear  
- list summaries omit cues  
- stats counts/bytes  
- eviction under max entries / max bytes  
- never-throw on underlying failures  

### Coordinator / background integration (mocked chrome + store)

- Hit skips `resegmentYoutubeAsr`  
- Miss calls AI, saves on success  
- Fail does not save; uses local cues  
- Progress stages emitted in order  
- Single-flight coalesces duplicate keys  
- Missing videoId does not throw  

### UI

- Caption quality summary reflects stats  
- Manager list, delete one, clear all confirm, empty state  
- Force re-run removes row  
- Manage jumps to full card  

### Regression

- Local-only path (AI off) unchanged  
- Translation cache keys still use post-resegment text  
- Human / non-ASR YouTube tracks never enter this store  

---

## Success criteria

1. Same YouTube ASR video + AI on + unchanged captions → second load shows **Using saved re-align** and does not call the LLM for resegment.  
2. User can list saved entries with rich meta, open YouTube, delete one, clear all, and force re-run.  
3. During miss, UI shows **Re-aligning captions… i/n** (and %); then normal translate progress.  
4. AI failure still fail-opens to local with a short user-visible notice.  
5. Local-only improve remains fast with no mandatory new chrome.  
6. Translation cache and film glossary stores are unaffected by re-align clear.  
7. Tests cover pure key/hash, store, coordinator cache hit/miss, and manager UI smoke.

## Implementation notes

- Prefer background-owned IDB so content scripts never touch IDB directly (consistent with other privileged stores).  
- Keep `lib/youtubeAsrResegment.ts` pure; hashing helpers can live beside it or in a small pure cache-key module.  
- Caption quality and manager cards should follow existing Subtitles section decomposition (`entrypoints/options/sections/subtitles/*`).  
- TDD per project workflow: pure + store tests before wiring coordinator/UI.  

## Open follow-ups (explicitly deferred)

- Cache local resegment (optional micro-optimization).  
- Include model/provider in key or settings “invalidate on model change”.  
- Opt-out toggle “Save AI re-aligns”.  
- Search/filter in manager when entry counts grow.  
