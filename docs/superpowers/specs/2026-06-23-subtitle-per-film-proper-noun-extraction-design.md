# Subtitle Per-Film Proper-Noun Extraction — Design

Date: 2026-06-23
Status: Approved (pending user spec review)

## Problem

Sub-projects 1 and 2 shipped the profile system, profile-driven prompt,
bidirectional look-ahead, and a per-session rolling proper-noun glossary. Two
gaps remain in name handling:

1. **Chunk 0 is still name-blind.** The rolling glossary (`lib/subtitleGlossary.ts`)
   accumulates names *as chunks translate*, but it starts empty. Sub-project 1's
   look-ahead context for chunk 0 (`services/background.ts:544`) shows a few
   forward cues for *context*, but it does not pre-translate the names that
   appear later in the film. So a character named in chunk 40 is unknown to
   chunks 0–39 on a first viewing — exactly the worst spot, the opening of a
   film or lecture.

2. **Cross-session total loss.** The rolling glossary lives in the closure of
   `handleTranslateSubtitle` (`services/background.ts:419`) and dies when the
   session ends. Re-watching, re-translating, resuming after a browser restart,
   or navigating chapters restarts from an empty glossary every time. Every
   re-view pays the full name-inconsistency tax again, even though the film's
   names never change.

The user's global glossary (`lib/glossary.ts`) is static and user-managed — it
does not adapt to the content being translated, and is the wrong place to
encode per-film knowledge.

## Goal

Introduce a **per-film proper-noun glossary** that is extracted once per unique
film, persisted, and used to seed every chunk — including chunk 0 — so the
opening of a film translates with knowledge of names that only appear later,
and re-translation reuses the previously-extracted names without paying again.

This is the third of seven sub-projects in the broader subtitle-optimization
effort.

## Approach

A **pre-scan + persist** model:

1. Before chunk 0 translates, run one dedicated LLM call that extracts proper
   nouns from the full (deduplicated) source corpus.
2. Persist the result keyed by a **content hash** of the cue corpus, so the
   same film reuses its names across sessions.
3. Seed the existing per-session rolling glossary with the persisted names, so
   chunk 0 (and every subsequent chunk) translates with the full name list.
4. The existing per-chunk `properNouns` extraction and rolling-glossary merge
   continue to run during translation, *refining* the seed (last-write-wins on
   the same key).

The film glossary is an **additive layer** — it does not replace the rolling
glossary, the user's global glossary, or the web-page translation path.

### Glossary resolution order at translate time

Each chunk's prompt receives glossary blocks appended in this order:

1. User's global glossary (`formatGlossary`, `lib/glossary.ts`) — unchanged.
2. Film glossary — NEW: enters via the rolling-glossary seed (below).
3. Rolling glossary (`formatRollingGlossary`, `lib/subtitleGlossary.ts`) —
   unchanged behavior, but now seeded at session start.
4. JSON output contract — unchanged.

### Why seed the rolling glossary from the film glossary

The rolling glossary already merges per-chunk extractions via `mergeProperNouns`
(`lib/subtitleGlossary.ts:7`) and formats them via `formatRollingGlossary`. If
we seed it with the pre-scan result at session start — by calling
`mergeProperNouns` on a fresh empty `Map` with the film glossary — then
(a) chunk 0 already has every name the film will use, (b) the `MAX_ROLLING_GLOSSARY`
cap is enforced uniformly (the pre-scan itself is capped at the same budget so
it cannot overflow), and (c) the existing merge logic handles refinements the
chunks extract later (same-key overwrite = most recent translation wins). One
merge codepath, not two. The film glossary is a seed, not an authority.

### Rejected alternatives

- **Persist-only (no pre-scan).** Keeps extracting per-chunk as today but
  persists the accumulated glossary. Zero extra calls, but chunk 0 stays blind
  on first viewing and late names stay unknown to early chunks. Fails the
  headline goal. Rejected.
- **Pre-scan only (drop the rolling merge).** Dedicated extraction up front,
  persisted, seeds chunks — but stop merging per-chunk `properNouns` afterward.
  Loses names the pre-scan missed (the pre-scan is one pass over a possibly
  token-capped corpus) and cannot refine. Rejected.
- **Pre-scan in parallel with chunk 0.** Saves the one round-trip of latency,
  but chunk 0 — the chunk that benefits most — translates without the name
  list. Defeats the purpose for exactly the worst chunk. Rejected.
- **People + places only.** Tighter scope, but the per-chunk extractor (the
  existing `properNouns` contract at `services/subtitlePrompt.ts:30`) already
  catches brands and technical terms. A different scope would produce two
  vocabularies that don't reconcile cleanly. Rejected.
- **All proper nouns.** Over-extracts fictional/made-up words, bloats past the
  `MAX_ROLLING_GLOSSARY = 100` budget, dilutes prompt quality. Rejected.

### Decisions (recorded from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Extraction model | Pre-scan + persist | Solves chunk-0 blindness, cross-session, and forward knowledge of late names in one model. |
| Storage key | Content hash of cue corpus | Survives URL/quality changes, resume, re-watch, cross-site moves. No `tabs` permission needed. |
| Name scope | Same as existing `properNouns` contract | Pre-scan output and ongoing per-chunk output are interchangeable — one vocabulary. |
| Cache interaction | Separate storage namespace | Zero regression risk to the translation cache; the two concerns are independent. (Roadmap #6 owns the translation cache key.) |
| Pre-scan timing | Blocking before chunk 0 | Chunk 0 is no longer blind; cache hit on re-translation makes it instant. |

## Components

### A. `lib/subtitleFilmGlossary.ts` — canonicalization + content hash (new file)

Pure helpers. No I/O, no side effects.

```ts
/** Canonicalize the cue corpus into a stable string for hashing.
 *  Lowercases, trims, strips [Speaker] voice prefixes, dedupes, sorts — so
 *  the same film always hashes the same regardless of cue order, whitespace,
 *  or re-fetch. */
export function canonicalizeCueCorpus(cues: SubtitleCue[]): string

/** SHA-256 (hex) of the canonicalized corpus. Uses WebCrypto
 *  (crypto.subtle.digest), available in service workers. */
export async function contentHash(cues: SubtitleCue[]): Promise<string>
```

**Why canonicalize before hashing.** The same film fetched twice may differ in
cue ordering, leading/trailing whitespace, or timing-cue noise. Without
canonicalization those produce different hashes → cache misses → wasted
pre-scan calls and name drift. Canonical form = lowercase + trim + strip voice
prefix + dedupe + sort. The voice prefix (`[Speaker]`) is stripped because it
is a display concern, not content identity.

### B. `services/subtitleNameScanner.ts` — pre-scan LLM call + prompt (new file)

A single LLM call that extracts proper nouns from the full source corpus.
Intentionally separate from `services/subtitlePrompt.ts` (the per-chunk
translator prompt) because the task is different: the pre-scan *extracts
names*, it does not translate lines.

```ts
/** Run a single LLM call to extract proper nouns from the full source corpus.
 *  Returns {source: target} map. Pure of storage — caller persists.
 *  Never throws: returns {} on any failure (malformed response, network error,
 *  empty result) so callers can treat it as a no-op seed. */
export async function preScanNames(
  service: TranslationService,
  sourceLanguage: string,
  targetLanguage: string,
  cues: SubtitleCue[],
  knobs: ProfileKnobs,
): Promise<Record<string, string>>
```

The pre-scan prompt tells the model: "Here is the full transcript. List every
proper noun (character names, places, brands, technical terms) and its
translation to {{targetLanguage}}." It carries the profile knobs so, e.g., a
Cinematic pre-scan prefers an idiomatic nickname over a formal transliteration.
It receives the **deduplicated** source corpus (not raw cues) to bound token
cost, capped at a token/char budget for very long films (names introduced past
the cap are still caught by the rolling glossary).

Output contract: `{"properNouns": {"SourceName": "TranslatedName"}}` — parsed
by the existing `extractProperNouns` (`services/subtitleResponse.ts`), reusing
its robust multi-fallback parser.

The pre-scan is instructed to return at most `MAX_ROLLING_GLOSSARY` (100)
entries — the same budget the rolling glossary enforces — so the seed fits
within the cap when merged. (Belt-and-suspenders: `mergeProperNouns` also
enforces the cap, so even a misbehaving pre-scan cannot overflow the map; extra
entries are simply dropped.)

### C. `services/filmGlossaryStore.ts` — storage seam (new file)

Thin wrapper over `chrome.storage.local` under namespace
`anyllm-film-glossary`.

```ts
/** Load a persisted film glossary by content hash. Returns undefined on miss
 *  or storage error (never throws). */
export async function loadFilmGlossary(
  contentHash: string,
): Promise<Record<string, string> | undefined>

/** Persist a film glossary keyed by content hash. Overwrites. Never throws. */
export async function saveFilmGlossary(
  contentHash: string,
  glossary: Record<string, string>,
): Promise<void>
```

**Why a separate file from `services/cacheManager.ts`.** `cacheManager` is
IndexedDB-backed, keyed by (text + langs), and tightly coupled to the
translation cache's LRU/eviction/TTL logic. Film glossaries are a different
shape (keyed by content hash, no TTL — a film's names don't expire), a different
lifecycle, and a different concern. Mixing them would violate the same
separation principle sub-project 1 applied when keeping `DOMAIN_PROFILE_MAP`
apart from `DOMAIN_CATEGORY_MAP`.

### D. `services/background.ts` — orchestration seam (edit)

In `handleTranslateSubtitle`, after `profile` / `subtitleKnobs` resolution
(~line 411) and **before** the rolling glossary is created (~line 419):

1. Compute `contentHash(cues)`.
2. `loadFilmGlossary(contentHash)` — storage hit?
   - **Hit** → use the persisted map.
   - **Miss** → `await preScanNames(...)`; `saveFilmGlossary(contentHash, result)`.
3. Seed the rolling glossary **through `mergeProperNouns`** (call it on a fresh
   empty `Map` with the film glossary) before chunk 0 runs. Seeding via the same
   merge function — not `new Map(entries)` — enforces the `MAX_ROLLING_GLOSSARY`
   cap uniformly and keeps one codepath for entering names into the map.

The pre-scan runs **before chunk 0** (blocking). On a cache hit it is
~instant (one storage read); on a miss it is one LLM round-trip, reflected in
a toast update ("Indexing names...").

Every failure degrades gracefully (see Error handling): a failed pre-scan is
caught and treated as an empty film glossary, so chunk 0 proceeds with an
unseeded rolling glossary — exactly today's behavior.

### E. `content/subtitleCoordinator.ts` — toast copy (edit)

Minimal: update the "Translating subtitles progressively..." toast to surface
the pre-scan phase. No new message fields — the content hash is derivable in
the background from the cues it already receives, so there is no need to
resolve it in the content script and no `tabs` permission concern.

### F. `services/subtitlePrompt.ts` — none

The film glossary enters the prompt via the existing `rollingGlossaryBlock`
slot (because the rolling glossary is seeded from it). One slot, one
codepath. No prompt edits.

## Data flow

```
translateSubtitle { cues, sourceLanguage, targetLanguage, profile }
        │
        ├─ contentHash = sha256(canonicalizeCueCorpus(cues))      ← NEW
        │
        ├─ filmGlossary = await loadFilmGlossary(contentHash)     ← NEW
        │   ├─ HIT  → use persisted {source: target}
        │   └─ MISS → await preScanNames(service, ..., cues, knobs)
        │              └─ saveFilmGlossary(contentHash, result)
        │
        ├─ rollingGlossary = new Map(); mergeProperNouns(rollingGlossary, filmGlossary)  ← NEW seed
        │
        └─ existing pipeline (unchanged):
             chunk 0 (now seeded) → background chunks 1+ →
               per-chunk properNouns extracted → mergeProperNouns → carry forward
```

Web-page translation path is untouched: it never sets `subtitleKnobs`, so it
never reaches the film-glossary code. This is the same routing seam
sub-project 1 established.

## Error handling

The pre-scan is an **optimization**, not a correctness gate. Every failure
mode degrades gracefully to sub-project 2 behavior — never blocks translation.

| Failure | Response | User impact |
|---|---|---|
| Pre-scan LLM call fails / times out | Catch, log, treat as empty film glossary. Proceed with unseeded rolling glossary. | Names accumulate from chunk 0 onward as before. No crash. |
| Pre-scan returns malformed JSON | `extractProperNouns` multi-fallback parser; all fallbacks fail → empty glossary. | Same as above. |
| `chrome.storage.local` read/write fails | Catch, log, in-memory only for this session. | No persistence this session; next viewing re-scans. |
| `crypto.subtle` unavailable | Defensive fallback (skip caching, treat every session as a miss). Service workers have WebCrypto, so this is belt-and-suspenders. | Pre-scan re-runs each session instead of caching. |
| Corpus exceeds model context window | Cap the corpus fed to the pre-scan at a token/char budget. Names introduced late are caught by the rolling glossary. | Late names handled by existing machinery. |
| Empty cue set / single-cue film | Hash still computes; pre-scan on 1 cue is cheap and valid. | No special handling needed. |
| Pre-scan returns 0 names | Persist `{}` (a real cache hit next time — no re-scan). | Correct and cheap. |

### Cache-poison avoidance

A pre-scan that returns a *wrong* name translation would persist and poison
every future viewing of that film. Mitigations:

1. The rolling glossary's `mergeProperNouns` is **last-write-wins**, so per-chunk
   extractions during the actual translation override any pre-scan error for
   that key. The film glossary is a seed, not an authority.
2. Same-key overwrite means if chunk 5 sees "Dumbledore" in dialogue and the
   pre-scan got it wrong, chunk 5's extraction wins from that point on.
3. No TTL (names don't expire) but also **no forced authority** — a stale
   pre-scan can never override live translation context.

### Concurrency

- **Within a session:** the pre-scan runs once, up front, blocking. Chunk 0
  waits for it; the background chunk loop (chunks 1+) starts only after chunk 0
  returns, so the rolling glossary is already seeded by then. No locking needed.
- **Cross-session:** two tabs translating the same film compute the same content
  hash and may both pre-scan. Storage `set` is last-write-wins; both write the
  same shape of data. Worst case: a redundant pre-scan call. No corruption.
  Not worth a lock.

## Scope boundaries (what this sub-project is NOT)

- ❌ No translation-cache-key change — film glossaries live in a separate
  namespace. (Roadmap #6 owns the translation cache key.)
- ❌ No user-facing UI — no popup/options changes, no film-glossary viewer or
  editor. Profiles still resolve silently from hostname. (Roadmap #4)
- ❌ No timing / CPS / wrapping. (Roadmap #5)
- ❌ No change to the per-chunk `properNouns` JSON contract or the rolling
  glossary's merge behavior — the film glossary is purely a seed and a
  persistence layer.
- ❌ No eviction of old film glossaries in this sub-project — `chrome.storage.local`
  has generous quotas and film glossaries are small (~100 entries × ~40 chars).
  A management/cleanup UI is a later concern.
- ✅ Web-page translation path untouched — `buildSystemPrompt` +
  `customSystemPrompt` behave exactly as today.
- ✅ DOM-scrape path (HBO Max) benefits automatically — it routes through the
  same `handleTranslateSubtitle` and computes its content hash from the scraped
  cues like any other path.

## Testing strategy

Grounded in the existing vitest setup, mirroring sub-projects 1+2.

**New unit tests:**

1. **`lib/__tests__/subtitleFilmGlossary.test.ts`**
   - `canonicalizeCueCorpus`: same cues in different order → same string;
     whitespace trimmed; voice prefixes stripped; dedup works; empty cue set →
     canonical empty string.
   - `contentHash`: deterministic (same input → same hash); different corpora →
     different hashes; returns a hex string of expected length.

2. **`services/__tests__/subtitleNameScanner.test.ts`**
   - Mock the translation service; assert `preScanNames` sends a request with
     the pre-scan prompt (not the chunk-translator prompt) and the deduplicated
     corpus.
   - Assert it parses `properNouns` from the response via `extractProperNouns`.
   - Malformed/empty response → returns `{}` (not throw).
   - Profile knobs flow into the pre-scan prompt (cinematic vs educational
     produce different prompt text).

3. **`services/__tests__/filmGlossaryStore.test.ts`**
   - `loadFilmGlossary`: hit returns the map; miss returns undefined; storage
     error returns undefined (not throw).
   - `saveFilmGlossary`: round-trips; overwrites an existing key.

**Integration tests (extend `services/__tests__/background.test.ts`):**

4. **Pre-scan runs before chunk 0, and chunk 0 is seeded.** Mock the service;
   send `translateSubtitle`; assert the service receives two calls in order:
   (a) the pre-scan call, (b) chunk 0's translate call. Assert chunk 0's
   `rollingGlossaryBlock` contains a name from the pre-scan result. Headline
   correctness test.

5. **Cache hit skips the pre-scan.** Seed `filmGlossaryStore` for the computed
   hash; send `translateSubtitle`; assert the service receives only chunk calls
   — no pre-scan — and chunk 0's rolling glossary block still contains the
   persisted names.

6. **Pre-scan failure degrades gracefully.** Make `preScanNames` reject; assert
   `handleTranslateSubtitle` still returns `{success: true}`, chunk 0 translates
   (with empty rolling glossary), and nothing was persisted.

7. **Persistence write happens on miss.** After a successful pre-scan miss,
   assert `saveFilmGlossary` was called with the content hash and the extracted
   names.

**Regression tests:**

8. **Web-page path unchanged** — existing `translateText` test still uses
   `buildSystemPrompt` + honors `customSystemPrompt`; extend to assert no
   film-glossary storage reads/writes occur on the web path.

9. **Rolling glossary behavior during session unchanged** — chunks 1+ still
   merge per-chunk `properNouns` and carry forward; the only change is the seed
   at session start.

## Files touched

| File | Change | New? |
|---|---|---|
| `lib/subtitleFilmGlossary.ts` | `canonicalizeCueCorpus`, `contentHash` | ✅ new |
| `services/subtitleNameScanner.ts` | `preScanNames` + dedicated pre-scan prompt | ✅ new |
| `services/filmGlossaryStore.ts` | `loadFilmGlossary`, `saveFilmGlossary` | ✅ new |
| `services/background.ts` | content-hash → load-or-pre-scan → seed rolling glossary; toast copy | edit |
| `content/subtitleCoordinator.ts` | toast copy during pre-scan | edit |
| `lib/__tests__/subtitleFilmGlossary.test.ts`, `services/__tests__/subtitleNameScanner.test.ts`, `services/__tests__/filmGlossaryStore.test.ts` | new unit tests | ✅ new |
| `services/__tests__/background.test.ts` | integration + regression tests | edit |

Net new production logic ≈ 150 lines.

## Success criteria

- A film's first-ever translation: chunk 0 renders after one pre-scan
  round-trip, and its translations already use consistent names drawn from the
  full film.
- Re-translating the same film (same day, next week, after a browser restart):
  chunk 0 renders with **no pre-scan delay** (cache hit) and the same consistent
  names.
- Pre-scan failure never blocks translation — degrades silently to sub-project 2
  behavior.
- The web-page translation path is byte-for-byte unaffected (regression test
  green).
- Film glossary storage is isolated from the translation cache (no key
  collision, no eviction interaction).

## Roadmap context

This is the third of seven sub-projects for the broader subtitle-optimization
effort. Subsequent sub-projects (each its own spec → plan → implementation
cycle):

4. User-facing style override controls (the knobs sub-project 1 defines become
   editable).
5. Reading-speed & timing adaptation (CPS, wrapping, timing extension; Max DOM
   timing fix).
6. Context-aware cache & robustness (cache-key revision, per-cue retry).
