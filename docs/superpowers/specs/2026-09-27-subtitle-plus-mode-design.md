# Subtitle Plus Mode — Full-Track Quality Translation

**Date:** 2026-09-27
**Status:** Approved (pending user spec review)
**Beads issue:** `AnyLLMTranslate-3sj`
**Related designs:** [Per-film proper-noun extraction](./2026-06-23-subtitle-per-film-proper-noun-extraction-design.md) · [Subtitle context & continuity](./2026-06-23-subtitle-context-continuity-design.md) · [Subtitle cache & retry](./2026-06-24-subtitle-cache-and-retry-design.md) · [Subtitle Studio](./2026-07-10-subtitle-studio-design.md)
**Related defects (filed separately, deliberately not fixed here):** `AnyLLMTranslate-d16` (film-glossary key scope) · `AnyLLMTranslate-7va` (subtitle cache key hashes name sources only) · `AnyLLMTranslate-7dr` (uncapped pre-scan corpus)

## Summary

Add an **opt-in** subtitle translation mode for sources that hand us the **complete track at activation** (YouTube timedtext, WeTV / Netflix / Disney+ / Coursera / Udemy VTT intercepts, HLS/DASH manifest concatenation). In this mode the pipeline:

1. **freezes** one terminology set (proper nouns, terms, glossary) before any cue is translated,
2. translates chunks **in parallel** against that frozen set,
3. **reveals nothing until the whole track is translated**.

The mode is a user-selectable toggle. With it off — or absent, or on an ineligible source, or when preparation fails — the extension behaves exactly as it does today. That is a hard acceptance criterion, not an aspiration: the progressive path must be **byte-for-byte unaffected** in storage keys, cache keys, message payloads, and prompt content.

## Problem

### 1. Cross-chunk terminology is order-dependent today

The rolling proper-noun glossary (`lib/subtitleGlossary.ts`) is seeded once from the film glossary, then refined per chunk: each chunk's inline `properNouns` are merged **in the order chunks are processed** (`services/background.ts:1571`). Two consequences:

- Chunk 0 knows the names the pre-scan found, but every later chunk sees a *different, growing* snapshot, so a term first extracted in chunk 40 is unknown to chunks 1–39.
- The background chunk loop is a **playback-priority queue**: `setPriority` moves the chunk nearest the playhead to the front. Seeking therefore changes *which* chunks translate first and, with them, the order in which names enter the glossary. The consistency guarantee degrades exactly when the viewer uses the player.

There is no point at which the extension says "here is the terminology for this track, and every cue will be translated against it."

### 2. No user control over the latency/consistency trade

Today every full-file source gets the same behaviour: chunk 0 renders as fast as one round-trip allows, the rest stream in. A viewer who would rather wait a few minutes for a uniform result has no way to ask for it, and the extension cannot tell them what the wait would buy.

### 3. Reveal timing is coupled to translation order

The full-file path blanks the site's native caption body and shows the overlay as soon as chunk 0 returns (`content/subtitleCoordinator.ts:1284`). There is no way to say "prepare first, then show", because there is no notion of a run that has a completion point.

## Goal

For eligible sources, an opt-in mode that produces one terminology decision per term and applies it to every cue, trading first-cue latency for whole-track consistency — with the progressive path provably untouched.

## Non-goals

- ❌ **Not** a single request translating the whole film.
- ❌ **Not** a post-translation audit or repair pass in v1.
- ❌ **Not** a document-level style/tone/register brief in v1 (deferred; the preflight result shape leaves room for one).
- ❌ **Not** a blocking review checkpoint in v1 (deferred to a follow-up sub-project).
- ❌ **Not** a fix for the three pre-existing defects above. Plus scopes its own keys and storage so it is correct *without* them.
- ❌ No per-site setting, no new persistent job store, no resume snapshot.
- ❌ No change to profiles, knobs, timing adaptation, line wrapping, the user's glossary model, the web-page path, or the PDF path.
- ❌ No increase to the global concurrency cap. (Per-session concurrency does change — see §Concurrency and ordering.)

## Approach

Three phases per run: **preflight → translate → commit**.

### Preflight (freeze)

1. Resolve the mode and validate eligibility (the pure predicate in §H.1).
2. Compute the track's content hash (existing `contentHash`, `lib/subtitleFilmGlossary.ts`) and derive a **scoped key**: `contentHash + targetLanguage + hashKnobs(knobs)`.
3. Load that key from the **Plus namespace**; on a miss, run the existing pre-scan (`preScanNames`, `services/subtitleNameScanner.ts`) and persist a **non-empty** result.
4. Apply precedence: the active named list's entries are authoritative and are **not** overridable (`filterUnlockedProperNouns`, `lib/namedGlossaryLists.ts`). The frozen set is everything else.
5. **If the frozen set is empty, do not run Plus.** Fall back to progressive with an explicit notice. A frozen empty glossary removes the mode's only benefit while still paying its latency — this is a deliberate guard, not an edge case.

### Translate (parallel, frozen)

Chunks stay exactly as they are today — `SUBTITLE_CHUNK_SIZE` (25) cues, the same ±3-cue bidirectional `ctx` context, the same cache-first lookup, the same chunk-level retry. Three things change:

- Every chunk receives the **same frozen glossary block**; nothing is added to it mid-run.
- Per-chunk `properNouns` in the response are **not** merged forward (the frozen set is authoritative for the run). They are still written to the session suggestion store so the existing popup review surface keeps working.
- Chunk order no longer gates anything: chunks are claimed by a bounded worker pool instead of a playback-priority queue.

**`translateChunk` must be parameterized, not reused verbatim.** Today it is hardwired to `generateSubtitleCacheKey` (`services/background.ts:1420`, `:1529`), to `formatRollingGlossary(rollingGlossary)` (`:1501`), and to `mergeProperNouns(rollingGlossary, result.properNouns)` (`:1571`). Plus needs a different cache-key function, a different glossary block, and no forward merge. Extract those three as an options parameter; the progressive caller passes today's values (progressive key function, rolling-glossary block, merge enabled) so its behaviour and cache keys are unchanged.

Per-cue cache entries are still written per chunk as they complete, so an interrupted run resumes cheaply and a re-watch is instant.

### Commit (all-or-nothing reveal)

The run has one terminal event. Only then does the coordinator blank the site's native caption body and publish the complete cue array. A failed chunk commits with source text for its cues and sets a partial flag so the UI can say so.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Mode shape | UI toggle, stored as an enum `'progressive' \| 'plus'` | Mirrors `PdfAutoOpenMode`; leaves room for a third mode (review checkpoint) without a migration. |
| Default | `'progressive'`; **absent field means `'progressive'`** | An old settings object, or any caller that does not know the field, must behave exactly as today. |
| Scope of the mode | Global default + per-session override in the mini studio | Follows the existing `state.subtitleKnobOverride` lifecycle; no per-site axis. |
| What gets frozen | Proper nouns / terms only | Serves the stated goal. Tone is already owned by the profile knobs; two authorities would dilute both. |
| Style brief | Deferred to a later sub-project, gated on evaluation | Not the mechanism that produces consistency; adds a call plus prompt tokens per chunk. |
| Checkpoint | Deferred; when built it must be **pre**-translation (prep → confirm → translate) | A post-run review only affects the next viewing, because the glossary was frozen before this one. |
| Storage identity | Plus uses its own namespaces and its own cache key function | This is what makes "progressive is byte-for-byte unaffected" provable rather than asserted. |
| Delivery during preparation | Keep the site's existing captions; show the existing mini-progress bar with its Stop button | Zero new chrome; matches the ASR re-align precedent, which already implements "cancel → keep original captions, print no overlay". |
| Discoverability | One-time, dismissible hint; only for tracks above a length threshold | Per-video prompting would nag, and a mis-tap spends tokens. |

## Rejected alternatives

- **Whole film in one request.** Unbounded context and output, unreliable structured output, no partial-failure isolation.
- **Delivery-only change** (wait for the same progressive translation, then show it). No consistency gain; pays the latency for nothing.
- **Two-model draft + refine.** Doubles translation work, introduces model-dependent rewrites, no evidence it beats a frozen glossary plus chunk context.
- **Post-translation audit/repair in v1.** Re-reading 60–100 chunks of output is expensive and risks rewriting correct dialogue. `checkGlossaryMismatches` is a source-term/target-term presence check, not a cross-cue drift detector, so it cannot carry this alone.
- **Mandatory review checkpoint in v1.** The existing review surface is a React modal in the popup; the in-player mini studio is plain DOM. A blocking in-player form is new UI plus guaranteed friction.
- **Fixing the three defects inside this project.** More correct long-term, but it changes progressive behaviour in the cases where that behaviour is wrong today — which breaks the guarantee this design is built around.
- **A separate offline "compile" job with its own storage.** Duplicates the content-hash store, the translation cache, session cancellation, and the progress chrome.
- **Per-site mode settings.** "Is this track complete?" is a runtime property of the source, not of the site.
- **Per-cue retry loops.** Token/request overhead with inconsistent context; keep the existing chunk-level retry.

## Components

### A. `types/config.ts` — the setting

```ts
export type SubtitleTranslationMode = 'progressive' | 'plus';

export interface SubtitleSettings {
  // …existing fields…
  /** Whole-track quality mode for sources that provide the complete track at
   *  activation. Absent/undefined means 'progressive' (pre-Plus behaviour). */
  translationMode?: SubtitleTranslationMode;
  /** One-time Plus discoverability hint dismissal (absent = not dismissed). */
  plusHintDismissed?: boolean;
}
```

`DEFAULT_SUBTITLE_SETTINGS` gains `translationMode: 'progressive'`. No migration: absent already means progressive, and `loadSettings` deep-merges defaults.

### B. `types/messages.ts` — the request field and the two new pushes

```ts
export interface TranslateSubtitleMessage {
  // …existing fields…
  /** Requested mode. Absent means 'progressive'. The background validates
   *  eligibility and may downgrade; it never trusts this alone. */
  translationMode?: SubtitleTranslationMode;
  /** Set only by the full-file activation path: the caller is handing over the
   *  complete track. Delta paths (manifest/DOM/MSE) never set this. */
  completeTrack?: boolean;
}
```

Two additive push messages (the existing `SUBTITLE_CHUNK_TRANSLATED` transport is **not** reused, so progressive semantics stay untouched):

```ts
export interface SubtitlePlusProgressMessage {
  action: 'SUBTITLE_PLUS_PROGRESS';
  sessionId: number;
  phase: 'translating';
  completedChunks: number;
  totalChunks: number;
}

export interface SubtitlePlusCompleteMessage {
  action: 'SUBTITLE_PLUS_COMPLETE';
  sessionId: number;
  /** 'complete' = publish these cues. 'failed' = every chunk failed; keep
   *  original captions. Sent in both cases so the coordinator always has a
   *  terminal signal. */
  outcome: 'complete' | 'failed';
  /** Complete translated cue array, in original order (source text for any
   *  failed chunk). */
  cues: SubtitleCue[];
  /** True when at least one chunk failed and kept source text. */
  partial: boolean;
  /** Chunk indices that failed, so the notice can name the affected section. */
  failedChunkIndices: number[];
}
```

**Protocol ordering (this is the part to get right).** Preflight runs *inside* the request/response cycle, before the background answers. The response is therefore exactly one of two things:

- **ack** — preflight succeeded and the run continues asynchronously:
  `{ success: true, mode: 'plus', sessionId, totalChunks, cues: [] }`. `totalChunks` is known synchronously (`ceil(cues.length / SUBTITLE_CHUNK_SIZE)`) and is what the coordinator passes as the mini-progress `total` during the preparing phase, before the first progress push arrives.
- **downgrade** — a normal progressive result: `{ success: true, mode: 'progressive', downgradeReason, cues: […chunk 0…] }`.

A request is never held open for the whole run — a 60–100-chunk run outlives a service-worker-safe message channel — and preflight never runs after the ack, so a post-ack failure has no missing delivery channel. The terminal payload carries the whole array (comparable in size to the inbound request the coordinator already sends).

### C. `lib/subtitleFilmGlossary.ts` — scoped key (pure)

```ts
/** Storage/cache key for a film glossary scoped to everything the pre-scan
 *  output depends on: the corpus, the target language, and the knobs. */
export function scopedFilmGlossaryKey(
  contentHash: string,
  targetLanguage: string,
  knobs: ProfileKnobs,
): string;
```

Reuses `hashKnobs` from `lib/subtitleCacheKey.ts`. Existing `contentHash` is untouched.

### D. `services/filmGlossaryStore.ts` — Plus namespace

Add `loadScopedFilmGlossary(key)` / `saveScopedFilmGlossary(key, map)` under a **new** storage key (`anyllm-film-glossary-scoped`), never throwing, exactly mirroring the existing pair. The existing `anyllm-film-glossary` namespace and its functions are untouched, so progressive reads and writes are unchanged. An un-scoped legacy entry is a miss for Plus — never a hit.

### E. `lib/subtitleCacheKey.ts` — Plus cache identity

New, parallel to the existing pair (which is **not** modified in any way, including its signature):

```ts
export interface PlusGlossarySnapshot {
  globalEntries: Array<{ source: string; target: string }>;
  namedListId?: string | null;
  namedListEntries?: Array<{ source: string; target: string }>;
  /** Frozen terminology as pairs — the target matters in Plus. */
  frozenPairs: Array<{ source: string; target: string }>;
}

export async function generateSubtitlePlusCacheKey(
  text: string, sourceLanguage: string, targetLanguage: string,
  knobs: ProfileKnobs, snapshot: PlusGlossarySnapshot,
): Promise<string>;
```

Namespaced `subtitle-plus:` so it can never collide with progressive entries. Two properties matter:

- **The mode belongs in the key** because Plus output legitimately differs from progressive output for the same cue (frozen glossary, no rolling refinement). Sharing entries between modes would be wrong.
- **Targets are hashed**, unlike the progressive snapshot (`AnyLLMTranslate-7va`), so a changed term mapping invalidates correctly in the mode whose entire selling point is term consistency.

### F. `lib/subtitleGlossary.ts` — frozen formatter (pure)

```ts
/** Format a frozen terminology set for prompt injection. Returns '' when empty. */
export function formatFrozenGlossary(frozen: Record<string, string>): string;
```

`Record<string, string>` because that is what the pre-scan and `filterUnlockedProperNouns` already produce — no conversion boundary for the planner to invent.

Copy: "Frozen terminology for this track (use these consistently):" — distinct from the rolling glossary's "Previously translated names in this content", because in Plus these are not previously translated, they are decided up front.

### G. `services/openaiCompatible.ts` + `services/subtitlePrompt.ts` — one new prompt slot

Add an optional `frozenGlossaryBlock?: string` to the subtitle translate request, appended as **Part C4** after the rolling glossary block in `buildSubtitleSystemPrompt` (`services/subtitlePrompt.ts:53`, called from `services/openaiCompatible.ts:160`). The progressive path never sets it, so its prompt string is byte-identical. No other prompt assembly changes.

### H. `services/background.ts` — the Plus branch

Inside `handleTranslateSubtitle`, before the existing progressive flow:

1. **Eligibility** (pure helper, e.g. `resolvePlusEligibility(message)` in `lib/`): `translationMode === 'plus'` **and** `completeTrack === true` **and** `cues.length >= 2 * SUBTITLE_CHUNK_SIZE` **and** the request is not a delta request. A caller that mislabels a delta batch is downgraded, not trusted.
2. **Preflight** as in §Approach, *before* responding. Wrap everything in try/catch; a storage or LLM failure downgrades to progressive with `'prep-failed'`, an empty frozen set with `'empty-prep'`.
3. **Respond once**, either the Plus ack (`mode: 'plus'`, `totalChunks`, `cues: []`) or the progressive downgrade (`mode: 'progressive'`, `downgradeReason: 'ineligible' | 'empty-prep' | 'prep-failed'`). Nothing about the mode decision happens after this point.
4. **Frozen block** built once from the preflight result, injected into every chunk via `frozenGlossaryBlock`.
5. **Worker pool:** `MAX_CONCURRENT` workers (3) claim chunk indices from a shared cursor; each calls the **parameterized** `translateChunk` in Plus configuration (Plus cache-key function, frozen block, no forward merge). It still acquires its own semaphore slot, checks the cache, retries, records usage, and writes per-cue cache entries exactly as it does today. `setPriority` is never used. `ensureKeepaliveAlarm()` is active for the run so the service worker survives it.
6. **Progress:** one `SUBTITLE_PLUS_PROGRESS` after each settled chunk (counts only, no cues). The preparing phase needs no push — the ack already carried `totalChunks`.
7. **Commit:** when all workers settle, always send `SUBTITLE_PLUS_COMPLETE` — `outcome: 'complete'` with the assembled array, `partial`, and `failedChunkIndices`; or `outcome: 'failed'` when every chunk failed. The terminal message is unconditional so the coordinator is never left waiting.
8. **Cancel:** reuse `CANCEL_SUBTITLE_SESSION`; a cancelled run stops claiming chunks, sends no terminal message, and unregisters its session. The coordinator treats cancellation as the terminal state (it issued the cancel).
9. **Session suggestions:** keep writing per-chunk `properNouns` to the suggestion store (review surface), without merging them into the frozen set.

### I. `content/subtitleCoordinator.ts` — mode plumbing and the Plus lifecycle

- **Effective mode:** `state.subtitleModeOverride ?? settings.subtitleSettings.translationMode ?? 'progressive'`, with the override following the existing `subtitleKnobOverride` lifecycle (per-tab, cleared on teardown).
- **Eligibility signalling:** only the full-file activation path sets `completeTrack: true`. `translateManifestBatch` and the DOM/MSE paths never do.
- **Plus branch of `activateOverlayWithParsedCues`.** The function's pre-request steps must be split, because today it hides native captions and attaches the overlay *before* sending the request (`content/subtitleCoordinator.ts:1229-1247`). In Plus mode:
  - **keep** the state seeding (`state.interceptOriginalCues`, `state.translatedCues = [...cues]`) — it is the commit fallback and the re-activation source;
  - **skip** `hideNativeCaptions(...)` / `applyNativeCaptionHideForHandler(...)` until commit, so the site's own captions stay visible during preparation;
  - **skip** `initializeActiveRenderer(cues, overlayConfig)` until commit (this is what would show source cues in our overlay and mount the mini studio). The only chrome during preparation is the mini-progress bar with its Stop button — that is the deliberate trade for a mode whose premise is "nothing is shown yet";
  - **still** run `initializeControls()` and set `state.isOverlayMode = true` so the post-commit path is the ordinary one.
- **Commit path:** attach the renderer exactly as the progressive path does (`initializeActiveRenderer` with `scheduleRendererAttachmentRetry` on failure), blank the native caption body (`blankNativeSubtitleBody` on the intercept path), then `updateTranslatedCues(fullArray)`.
- **Plus lifecycle:** after the ack, expect `SUBTITLE_PLUS_PROGRESS` (matching `sessionId`) to update counts, and the terminal `SUBTITLE_PLUS_COMPLETE` (matching `sessionId`) to commit or, with `outcome: 'failed'`, keep original captions and show a retry-hint notice. A stale `sessionId` is dropped.
- **Stop / navigation / track change:** cancel via `cancelBackgroundSubtitleSession`, keep or restore original captions, hide the progress chrome, no commit.
- **Mode changes in the mini studio:** changing the mode cancels any in-flight session for the tab and re-activates with the new mode from `state.interceptOriginalCues` (re-activation is already a supported operation). On incremental sources, where no complete array exists, the change applies to the next activation.
- **Downgrade handling:** a `mode: 'progressive'` response carrying `downgradeReason` renders progressively and shows the matching one-line notice. Never silently imply Plus is active.

### J. `content/miniProgress.ts` — no change

The component already accepts an explicit `label` override and already renders a Stop button. Plus passes `status: 'translating'` with `total: totalChunks` (from the ack) and `label: 'Preparing full translation…'` during preflight, then `label: 'Preparing full translation… 34/82'` as progress arrives. Passing the real `total` matters: the component hides itself when `total === 0`, so a placeholder zero would make the bar invisible exactly when the user needs it. If the labels prove awkward in review, a dedicated status can be added then — not pre-emptively.

### K. UI surfaces

- **Options → Subtitles (Subtitle Studio):** a toggle in the caption-quality card — "Full-track quality mode" with the honest description: *more consistent; waits for the whole track; uses extra AI calls*. Default off.
- **In-player mini studio:** a mode select next to the existing glossary select, offering Progressive / Plus for this video. When the source is ineligible, the control renders disabled with the reason ("This player streams captions progressively"). The mini studio is plain DOM, so this replicates `DisabledDimmer`'s dimmed/disabled styling rather than reusing the React component.
- **One-time hint:** when an eligible track longer than the threshold (~200 cues) is detected and `plusHintDismissed` is false, offer the mode once with a dismiss action. The decision is a pure helper (`shouldOfferPlusHint(cueCount, dismissed)`, same module as the eligibility predicate) so the threshold is testable without UI. Dismissal is persisted; the mini studio control remains the permanent path.

## Data flow

```
activateOverlayWithParsedCues (full track)
   │  translationMode='plus', completeTrack=true
   │  (native captions NOT hidden; overlay NOT attached; renderer NOT created)
   ▼
background.handleTranslateSubtitle
   ├─ eligibility? ── no ──▶ progressive response (mode:'progressive', reason:'ineligible')
   ├─ PREFLIGHT
   │    scopedKey = scopedFilmGlossaryKey(hash, tgt, knobs)
   │    frozen = loadScoped(scopedKey) ?? preScanNames(...) → saveScoped
   │    frozen = filterUnlockedProperNouns(frozen, lockedSources)
   │    empty? ──▶ progressive response (reason:'empty-prep')
   ├─ RESPOND: ack { mode:'plus', sessionId, totalChunks, cues: [] }
   │      └─ coordinator: show progress bar 0/totalChunks, keep site captions
   ├─ TRANSLATE  (worker pool ≤ MAX_CONCURRENT, frozen block on every chunk)
   │    chunk i ──▶ SUBTITLE_PLUS_PROGRESS(completed/total)   … no cue data leaves the background
   └─ TERMINAL (always sent)
        SUBTITLE_PLUS_COMPLETE { outcome, cues[], partial, failedChunkIndices }
             │
             ├─ outcome 'complete' ─▶ blank native body → attach renderer → publish cues → notice if partial
             └─ outcome 'failed'   ─▶ keep original captions → notice with retry hint
```

## Error handling

The mode is an optimization. Every failure degrades to progressive or to original captions, never to a stalled player.

| Situation | Behavior |
|---|---|
| Preflight succeeds, all chunks succeed | Commit the complete array. |
| Preflight returns an empty set | Downgrade to progressive + notice ("No terms found to freeze — using standard mode"). |
| Preflight call or storage fails | Downgrade to progressive + notice. |
| Some chunks fail after retries | Commit with `outcome: 'complete'`, source text for those cues, `partial: true`, and a notice naming the section derived from `failedChunkIndices`. |
| Every chunk fails | Terminal `outcome: 'failed'`; no cues published; original captions remain; notice with a retry hint. |
| Terminal message never arrives (SW killed, tab suspended) | A run-level watchdog in the coordinator cancels after a bounded period with no progress push, keeps original captions, and shows the failure notice. The user is never left with a spinning bar. |
| User presses Stop | Cancel, keep original captions, no commit, progress hidden. |
| Navigation / track change mid-run | Cancel via the existing lifecycle; stale `sessionId` messages are dropped. |
| Service worker restarts mid-run | The run dies; nothing is committed. Already-translated chunks are cached, so a re-trigger is cheap. |
| Tab reload mid-run | Same as above. |
| Source is incremental (DOM / MSE / manifest deltas) | Mode ignored; progressive runs; the control explains why. |
| Caller mislabels a delta batch as a complete track | Eligibility predicate rejects it on shape; progressive runs. |

## Concurrency and ordering

- **Pool size = `MAX_CONCURRENT` (3).** Per-session concurrency rises from 1 (today's sequential loop) to at most 3. The global cap is unchanged, so multiple tabs cannot exceed it, but a single Plus run can now occupy all three slots.
- **Actual throughput depends on the pool.** Per-key defaults (1 in flight, 500 ms interval) throttle real parallelism, so the wall-clock win ranges from large to negligible depending on configuration. The design does not promise a speedup.
- **Determinism is preserved:** cue indices are fixed, results are written to their index, and the commit is order-independent. Parallelism never touches the glossary, the cache keys, or the display order.
- **The deliberate trade:** freezing loses the rolling glossary's mid-run self-correction. A pre-scan that mistranslates an ambiguous name can no longer be corrected by a later chunk's live dialogue. Plus buys uniformity at the cost of automatic correction. A user-reviewed checkpoint (follow-up) is the intended answer, not a mid-run merge.

## Cache and storage identity (the guarantee)

Progressive behaviour is preserved by construction:

| Concern | Progressive | Plus |
|---|---|---|
| Film glossary namespace | `anyllm-film-glossary` (untouched) | `anyllm-film-glossary-scoped` (new) |
| Film glossary key | `contentHash` (untouched) | `contentHash + targetLanguage + hashKnobs` |
| Cache key function | `generateSubtitleCacheKey` + `GlossarySnapshot` (untouched, same signature) | `generateSubtitlePlusCacheKey` + `PlusGlossarySnapshot` (new) |
| Cache namespace | `subtitle:` (untouched) | `subtitle-plus:` |
| Prompt assembly | identical string (no new slot set) | adds Part C4 only when present |
| Message payloads | identical (new fields omitted) | new fields + two new pushes |
| Chunk loop | playback-priority queue (untouched) | worker pool |

Regression tests prove it: golden cache-key values, an assertion that a progressive run reads/writes no Plus storage key, and an assertion that the progressive prompt string is unchanged.

**Cost of the split, stated honestly:** because the two modes never share a film glossary or a cache entry, switching modes re-prepares once per (track, target language, knobs) and re-translates uncached cues. That cost is bounded, occurs only on an explicit mode change, and is the price of the guarantee above.

## Testing strategy

**Unit (new):**

1. `lib/__tests__/subtitleFilmGlossary.test.ts` — `scopedFilmGlossaryKey`: same corpus + language + knobs → same key; changing any one of the three → different key; knob order does not matter.
2. `lib/__tests__/subtitleCacheKey.test.ts` — `generateSubtitlePlusCacheKey`: deterministic; `subtitle-plus:` namespaced; changing a frozen **target** changes the key; existing `generateSubtitleCacheKey` golden values unchanged.
3. `lib/__tests__/subtitleGlossary.test.ts` — `formatFrozenGlossary`: empty → `''`; non-empty → one line per pair with the frozen copy.
4. Eligibility predicate — pure, table-driven: complete track + plus → eligible; plus without `completeTrack` → ineligible; short cue array → ineligible; delta-shaped request → ineligible; absent mode → progressive. `shouldOfferPlusHint`: below threshold → false; at/above threshold and not dismissed → true; dismissed → false.

**Integration (`services/__tests__/background.test.ts`):**

5. Plus run: preflight call precedes the response; **every** chunk receives the frozen block; per-chunk `properNouns` never appear in a later chunk's block; one `SUBTITLE_PLUS_COMPLETE` with `outcome: 'complete'` and the full array; `SUBTITLE_CHUNK_TRANSLATED` is never sent.
6. Preflight empty → progressive response with `downgradeReason: 'empty-prep'` and no Plus push messages.
7. Preflight throws → progressive response with `'prep-failed'`.
8. Partial failure → terminal `outcome: 'complete'`, `partial: true`, `failedChunkIndices` listing the failed chunks, failed cues carrying source text.
9. Every chunk fails → terminal `outcome: 'failed'` is still sent (the run always has a terminal signal).
10. Cancel mid-run → no terminal message; session unregistered.
11. Scoped storage: a run with a different target language does not reuse another language's frozen set.
12. Regression: a progressive run reads/writes no scoped key, sends no new message field, and produces identical cache keys for identical inputs.

**Coordinator (`content/__tests__/subtitleCoordinator.test.ts`):**

13. Plus activation does not hide native captions and does not attach the renderer before the terminal message; the commit path attaches it and blanks the native body.
14. Progress messages drive the mini-progress counts from the ack's `totalChunks`; Stop cancels and keeps original captions.
15. A stale `sessionId` terminal message is dropped after navigation.
16. The run-level watchdog cancels a stalled run (no progress push within the bound) and shows the failure notice.
17. Ineligible source + mode `'plus'` → progressive with the control disabled and a reason.

## Files touched

| File | Change | New? |
|---|---|---|
| `types/config.ts` | `SubtitleTranslationMode`, two optional settings fields, default | edit |
| `types/messages.ts` | `translationMode`, `completeTrack`, two push messages | edit |
| `lib/subtitleFilmGlossary.ts` | `scopedFilmGlossaryKey` | edit |
| `lib/subtitleCacheKey.ts` | `PlusGlossarySnapshot`, `generateSubtitlePlusCacheKey` (existing pair untouched) | edit |
| `lib/subtitleGlossary.ts` | `formatFrozenGlossary` | edit |
| `lib/subtitlePlusEligibility.ts` | eligibility predicate, `shouldOfferPlusHint`, downgrade reasons (pure) | ✅ new |
| `services/filmGlossaryStore.ts` | scoped load/save under a new namespace | edit |
| `services/subtitlePrompt.ts`, `services/openaiCompatible.ts` | optional `frozenGlossaryBlock` → Part C4 | edit |
| `services/background.ts` | Plus branch: eligibility, preflight, worker pool, progress, commit, cancel | edit |
| `content/subtitleCoordinator.ts` | mode resolution, `completeTrack`, Plus lifecycle, deferred hide/attach, run watchdog, downgrade notices | edit |
| `content/playerChrome/miniStudioView.ts` + controller | per-session mode control with disabled state | edit |
| `entrypoints/options/sections/SubtitlesSection.tsx` | global toggle + copy | edit |
| Unit + integration tests (above) | new/edited | ✅ new + edit |

Net new production logic ≈ 400–500 lines. `content/miniProgress.ts` is intentionally untouched.

## Success criteria

1. **Progressive is untouched.** With the mode off, absent, ineligible, or downgraded: identical storage reads/writes, identical cache keys (golden test), identical prompt string, identical message payloads, identical chunk ordering. Regression tests green.
2. **Plus is one decision per term.** Every chunk in a run receives the same frozen block; no per-chunk extraction is merged forward; a changed target in the frozen set changes the cache identity.
3. **Nothing is revealed early.** No translated cue reaches the overlay before the commit message; the site's captions stay visible during preparation; the native body is blanked only at commit.
4. **The user can always get out.** Stop cancels and leaves original captions; a failed or empty preflight never leaves the player in a translated-nothing state.
5. **Honest labelling.** The mode's description states the wait and the extra calls; downgrades are surfaced, never silent.
6. **Eligibility is enforced server-side of the message.** A mislabelled delta request cannot start a Plus run.

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Pre-scan quality and context limits (`AnyLLMTranslate-7dr`) | A truncated pre-scan silently yields `{}`; Plus would then downgrade on long tracks, which is exactly where it is most wanted. | Empty-set guard downgrades instead of burning a run; the defect is filed and should be fixed before wide release of Plus. |
| Provider throttling erases the concurrency win | Per-key limits can serialize a 3-worker pool, so the user waits longer for the same result. | Do not promise a speedup in the UI; the mode's value proposition is consistency, not speed. |
| Frozen glossary loses mid-run self-correction | A wrong name is applied uniformly instead of being corrected later. | Deliberate trade, documented; the review checkpoint is the intended remedy; evaluation (below) decides whether the trade holds. |
| Cache/storage scope drift | Two namespaces and two key functions could diverge over time. | Shared pure helpers (`hashKnobs`, `contentHash`); the guarantee is enforced by regression tests, not convention. |

## Evaluation (gates the deferred phases)

Before building the style brief or the checkpoint, run a small paired comparison on representative tracks (mixed genres and language pairs, several ambiguous-name cases): default vs Plus, measuring term-consistency (same source term → same target across the track), partial-failure handling, and wall-clock time.

- If Plus shows no meaningful consistency gain over progressive, stop at v1 and do not add the extra passes.
- If drift remains in specific categories, a bounded style brief is the next candidate — not an audit pass.
- If users report wanting to correct names, promote the checkpoint ahead of the style brief.

## Roadmap context

This is a sub-project of the subtitle-quality effort, following the profile, continuity, film-glossary, cache/retry, and studio sub-projects.

**Follow-ups, each its own spec → plan → implementation cycle:**

1. **Opt-in review checkpoint** — preflight → confirm/edit → translate, using the existing named-list lock semantics so reviewed terms become authoritative.
2. **Document-level style brief** — one bounded preparation call feeding a short advisory block; gated on the evaluation above.
3. **The three filed defects** — `AnyLLMTranslate-d16`, `AnyLLMTranslate-7va`, `AnyLLMTranslate-7dr`, fixed on their own merits so the progressive path benefits too.