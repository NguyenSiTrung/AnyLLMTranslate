# Subtitle Profiles & Profile-Driven Prompt — Design

Date: 2026-06-23
Status: Approved (pending user spec review)

## Problem

Subtitle translation currently reuses the **generic web-page translation prompt**
(`DEFAULT_SYSTEM_PROMPT_TEMPLATE` in `services/base.ts:29`). That prompt is written
for HTML pages — it instructs the model to "preserve HTML tags," "do not translate
code, URLs, email addresses," and "preserve mathematical formulas." None of that
applies to spoken subtitles, and nothing tells the model these are short spoken
lines of dialogue. As a result the same translation strategy is applied to an
HBO Max film, a Udemy lecture, and a YouTube video, even though the ideal
translation for each is genuinely different:

- **Udemy / Coursera** (educational lectures) → precise, terminology-consistent,
  literal-leaning translation the learner can trust.
- **YouTube** (mixed media) → balanced, natural translation.
- **HBO Max** (films / TV) → natural cinematic dialogue, preserving tone and
  register.

There is no mechanism today to differentiate subtitle behavior by site type. The
two real category signals that exist — the hardcoded `DOMAIN_CATEGORY_MAP`
(`content/utils/pageContext.ts:21`) and the generic `pageContext.category`
(`"Streaming Entertainment"` for all streaming domains) — carry no information
that the subtitle pipeline uses to change its translation strategy.

A secondary issue: the first subtitle chunk (cues 0–24) is translated with
**empty context** (`translateChunk(firstChunkCues, [])` at
`services/background.ts:505`). The opening lines of a film or lecture establish
tone and terminology, yet they are translated with less context than any other
chunk.

## Goal

Introduce a **profile system** for subtitles that maps each supported subtitle
site to one of three profiles — Educational, Media, Cinematic — and drive a
new **subtitle-specific prompt** from each profile's preset of translation
knobs. Replace the generic web-page prompt on the subtitle path only; leave the
web-page translation path untouched.

This sub-project merges two roadmap items into one:

- **Roadmap #1** — Profile system foundation (category enum, domain→profile map,
  knob vocabulary, plumbing).
- **Roadmap #2** — Subtitle-specific prompt engine + first-chunk context fix.

Merging them ships the foundation and its highest-leverage consumer together,
so the sub-project is not "dead plumbing" on its own.

## Approach

Profiles are **data, not code branches**. A profile is a named preset of knob
values. Resolution turns a hostname into a profile, then into a set of knobs,
which a new subtitle prompt builder consumes. There is one subtitle pipeline;
the three profiles differ only in the knob values they feed it.

Three profiles, each a preset of four shared knobs (Register, Faithfulness,
Brevity, Profanity):

| Profile | register | faithfulness | brevity | profanity | Sites |
|---|---|---|---|---|---|
| **Educational** | neutral | literal | relaxed | preserve | udemy.com, coursera.org, linkedin.com |
| **Media** | neutral | balanced | moderate | preserve | youtube.com (+ fallback for unmapped) |
| **Cinematic** | casual | idiomatic | moderate | preserve | max.com, hbomax.com |

### Knob vocabulary (4 knobs)

- **Register** — `formal` | `neutral` | `casual`
- **Faithfulness** — `literal` | `balanced` | `idiomatic`
- **Brevity** — `relaxed` | `moderate` | `terse`
- **Profanity** — `preserve` | `soften` | `remove`

This is a deliberately tight set. It cleanly differentiates the three profiles
now and leaves a clean extension seam for the future user-facing override UI
(roadmap #4), where those same knobs become editable per-tab and globally.
Reading-speed / CPS / line-wrapping are deliberately **not** knobs here — they
are post-processing concerns belonging to roadmap #5.

### Rejected alternatives

- **Hard fork per profile (separate strategies per category).** Over-engineered:
  it would maintain N parallel strategies while the actual difference between
  profiles is just different *defaults on the same knobs*. Makes the future
  per-knob UI harder. Rejected.
- **2-knob vocabulary (Register + Faithfulness only).** Too coarse — Cinematic
  vs Media would differ only on faithfulness, and profanity handling (a real
  concern for film subtitles) would have no home until later. Rejected.
- **6-knob vocabulary (add Terminology precision + Reading-speed as prompt
  hints).** More expressive, but reading-speed overlaps with brevity in prompt
  instructions and risks muddled model behavior; terminology precision is
  already expressed by `faithfulness: literal`. Rejected for now.
- **Pure organizational metadata (no behavior change).** Defers the actual value
  the user is after. Rejected — the behavioral difference is the point.

## Components

### A. `lib/subtitleProfiles.ts` — profile data + resolver (new file)

Pure data and one resolver function. No side effects, no I/O.

```ts
export type SubtitleProfile = 'educational' | 'media' | 'cinematic';

export type Register     = 'formal' | 'neutral' | 'casual';
export type Faithfulness = 'literal' | 'balanced' | 'idiomatic';
export type Brevity      = 'relaxed' | 'moderate' | 'terse';
export type Profanity    = 'preserve' | 'soften' | 'remove';

export interface ProfileKnobs {
  register: Register;
  faithfulness: Faithfulness;
  brevity: Brevity;
  profanity: Profanity;
}

export const PROFILE_PRESETS: Record<SubtitleProfile, ProfileKnobs> = {
  educational: { register: 'neutral', faithfulness: 'literal',  brevity: 'relaxed',  profanity: 'preserve' },
  media:       { register: 'neutral', faithfulness: 'balanced', brevity: 'moderate', profanity: 'preserve' },
  cinematic:   { register: 'casual',  faithfulness: 'idiomatic', brevity: 'moderate', profanity: 'preserve' },
};

export const DOMAIN_PROFILE_MAP: Record<string, SubtitleProfile> = {
  'udemy.com': 'educational',
  'coursera.org': 'educational',
  'linkedin.com': 'educational',
  'youtube.com': 'media',
  'max.com': 'cinematic',
  'hbomax.com': 'cinematic',
};

/** Resolve a profile from a hostname. Unknown domains fall back to 'media'. */
export function resolveProfile(hostname: string): SubtitleProfile {
  return DOMAIN_PROFILE_MAP[hostname] ?? 'media';
}
```

The map is intentionally a separate concern from the existing
`DOMAIN_CATEGORY_MAP` in `content/utils/pageContext.ts`. That map feeds
web-page category detection and uses coarse free-form strings
(`"Streaming Entertainment"`); this map feeds subtitle translation and uses a
strict 3-value enum. They are not the same concept and must not be unified.

### B. `services/subtitlePrompt.ts` — profile-driven subtitle prompt (new file)

```ts
export function buildSubtitleSystemPrompt(
  targetLanguage: string,
  knobs: ProfileKnobs,
  glossaryBlock?: string,
): string
```

The prompt is composed of four parts:

**Part A — Fixed subtitle identity** (identical for all profiles; tells the
model the medium):

```
You are a professional subtitle translator for film, TV, and video.
The texts are short spoken lines, not web prose or documents. Translate them to {{targetLanguage}}.

Subtitle rules:
- Translate as natural spoken dialogue that a viewer reads at a glance while listening.
- Preserve the meaning and tone of the original line.
- Keep each translation roughly the same length as the source so it fits on screen.
- Maintain continuity of names and references across lines.
```

**Part B — Knob-driven instructions.** Each non-default knob value maps to a
one-line instruction. Default values emit no line, so an all-neutral profile
produces a minimal prompt:

| Knob | Value | Instruction |
|---|---|---|
| register | formal | "Use formal, polite register appropriate for professional or academic speech." |
| register | casual | "Use natural, everyday conversational register — how people actually talk." |
| register | neutral | *(omitted)* |
| faithfulness | literal | "Prefer precise, faithful translation — preserve technical terms and exact meaning over style." |
| faithfulness | idiomatic | "Prefer idiomatic, natural phrasing in the target language over word-for-word translation." |
| faithfulness | balanced | *(omitted)* |
| brevity | terse | "Be concise — trim filler words where it keeps the subtitle readable in time." |
| brevity | moderate | *(omitted)* |
| brevity | relaxed | *(omitted)* |
| profanity | soften | "Soften strong profanity; tone down slurs." |
| profanity | remove | "Remove strong profanity entirely." |
| profanity | preserve | *(omitted)* |

**Part C — Glossary** — the existing `{{glossary}}` slot. Same `formatGlossary`
output (`lib/glossary.ts`) appended when a glossary block is provided, omitted
otherwise.

**Part D — JSON output contract** (lifted verbatim from the existing prompt; the
parser depends on it and must not change):

```
Respond ONLY with valid JSON in this exact format: {"translations": {"id1": "...", "id2": "..."}}
The keys in "translations" must exactly match the input keys.
```

**Deliberately omitted from the subtitle prompt** (vs. the web-page prompt): the
"preserve HTML tags / attributes / structure" rule, the "do not translate code,
URLs, email addresses" rule, and the "preserve mathematical formulas" rule. None
apply to spoken subtitles and their presence in the current generic prompt is
active noise on the subtitle path.

### C. `services/openaiCompatible.ts` — prompt routing

Extend `TranslationRequest` (`types/translation.ts`) with an optional field:

```ts
subtitleKnobs?: ProfileKnobs;
```

In the service layer (`OpenAICompatibleService.translate`), the system prompt is
selected by presence of this field. (`services/base.ts` is not edited: its
`buildSystemPrompt` / `buildUserPrompt` serve the web-page path only, and the
subtitle prompt builder is a separate module. The existing `buildUserPrompt`
— "Translate the following texts. The source language is X." + JSON entries —
is reused unchanged for subtitles, since the per-request format is identical.)

- `subtitleKnobs` present → call `buildSubtitleSystemPrompt(...)` with the knobs.
  The global `customSystemPrompt` is **ignored** for subtitle requests (per the
  approved coexistence decision — subtitles ignore the web custom prompt).
- `subtitleKnobs` absent → existing `buildSystemPrompt(...)` path, honoring
  `customSystemPrompt` exactly as today. Web-page translation is byte-for-byte
  unaffected.

This is the single routing seam between the two prompt worlds; it keeps the
regression risk confined to the subtitle path.

### D. Profile resolution in the content script + first-chunk fix

**Why resolve in the content script, not the background:** the manifest
(`wxt.config.ts:13`) declares permissions `['storage', 'activeTab', 'contextMenus',
'sidePanel', 'alarms']` — there is **no `"tabs"` permission**. Without it,
`sender.tab.url` in the background service worker is `undefined` for passive
message routing (`activeTab` is a transient grant and does not cover this case).
So the background cannot reliably learn the page's hostname from the sender.
The content script, however, always has `window.location.hostname`, and it is
the originator of every `translateSubtitle` message
(`content/subtitleCoordinator.ts:300, 381, 471`). Resolving the profile in the
content script and passing it in the message is therefore the only approach
that works without adding a new permission, and it keeps the pure
`resolveProfile` resolver as the single source of truth.

Changes:

1. **Message field.** Add `profile?: SubtitleProfile` to
   `TranslateSubtitleMessage` (`types/messages.ts:88`). The background reads
   `message.profile ?? 'media'` as a defensive fallback.

2. **Content script resolution.** In `content/subtitleCoordinator.ts`, resolve
   the profile once via `resolveProfile(window.location.hostname)` at the three
   `translateSubtitle` send sites (lines 300, 381, 471) and include it in the
   payload. To avoid repetition, a single helper
   `currentSubtitleProfile(): SubtitleProfile` wraps the call.

3. **Background consumption.** In `handleTranslateSubtitle`
   (`services/background.ts:384`), read `message.profile ?? 'media'`, look up
   `PROFILE_PRESETS[profile]`, and pass the resolved `ProfileKnobs` through
   `translateChunk` into the `service.translate({ ...subtitleKnobs })` call
   (around `background.ts:449`). The DOM-scrape path (HBO Max) flows through
   the same message — its coordinator send site (`subtitleCoordinator.ts:471`)
   also resolves and passes the profile — so it inherits the cinematic profile
   automatically.

4. **First-chunk context fix.** At `services/background.ts:505`, replace
   `translateChunk(firstChunkCues, [])` with a seed of **look-ahead cues**:
   `translateChunk(firstChunkCues, cues.slice(CHUNK_SIZE, CHUNK_SIZE + CONTEXT_SIZE))`.
   The model already ignores `ctx` translations (`background.ts:461`), so this
   reuses the existing context machinery — it just feeds *forward* cues for
   chunk 0 instead of nothing. Full bidirectional look-ahead across all chunks
   is roadmap #2's scope; this is the targeted fix for the worst context-blind
   spot (the opening of a film/lecture).

## Data flow

```
content script (subtitleCoordinator)
   │ resolveProfile(window.location.hostname) → SubtitleProfile
   │
   └──translateSubtitle { cues, ..., profile }──▶ background.handleTranslateSubtitle
                                                     │
                                                     ├─ message.profile ?? 'media'
                                                     ├─ PROFILE_PRESETS[profile] → ProfileKnobs
                                                     │
                                                     └─ translateChunk(cues, context)
                                                             │
                                                             └─ service.translate({
                                                                  texts, sourceLanguage, targetLanguage,
                                                                  subtitleKnobs,   ← routes to subtitle prompt
                                                                  glossaryBlock,
                                                                })
```

Web-page translation path is untouched and continues to call `service.translate`
without `subtitleKnobs`, selecting `buildSystemPrompt` + honoring
`customSystemPrompt`.

## Scope boundaries (what this sub-project is NOT)

- ❌ No continuity work — no rolling glossary, no per-chunk proper-noun
  carryover, no `voice` field wiring. (Roadmap #2)
- ❌ No look-ahead beyond chunk 0 — only the first-chunk fix uses forward cues;
  the rest of the pipeline still uses the existing 3-preceding-context model.
  (Full bidirectional look-ahead = roadmap #2)
- ❌ No user-facing UI — no popup/options changes, no profile picker, no knob
  overrides. Profiles resolve silently from hostname. (Roadmap #4)
- ❌ No timing / CPS / wrapping — timings stay verbatim. (Roadmap #5)
- ❌ No cache changes — cache key unchanged. (Roadmap #6)
- ✅ Web-page translation path untouched — `buildSystemPrompt` +
  `customSystemPrompt` behave exactly as today.
- ✅ DOM-scrape path (HBO Max) benefits automatically — it routes through the
  same `translateChunk` → new subtitle prompt → cinematic profile.

## Testing strategy

Grounded in the existing vitest setup (`vitest.config.ts`, `content/__tests__/`,
`services/__tests__/`).

1. **Unit — `lib/subtitleProfiles.ts`** (new test file): `resolveProfile`
   returns the mapped profile for each known domain; returns `'media'` fallback
   for an unknown domain; `PROFILE_PRESETS` has all three profiles with every
   knob value inside its union.

2. **Unit — `services/subtitlePrompt.ts`** (new test file): for each of the 3
   profiles, the built prompt contains the expected knob instruction lines
   (cinematic → casual + idiomatic; educational → literal; media → no extra
   knob lines) and **always** contains the JSON contract and the "spoken
   dialogue" identity line. Verify the glossary block appends when provided and
   omits when not. Verify no web-page-only rules (HTML tags / formulas) leak in.

3. **Unit — knob coverage in `buildSubtitleSystemPrompt`**: each non-default
   knob value (formal, casual, literal, idiomatic, terse, soften, remove)
   produces its instruction line; each default value (neutral, balanced,
   moderate, relaxed, preserve) produces no line.

4. **Integration — `handleTranslateSubtitle`** (extend existing background tests
   or add new): mock the translation service, send a subtitle request with
   `profile: 'educational'` vs `profile: 'cinematic'`, and assert the service
   receives the subtitle prompt (not the web prompt) and that the prompt differs
   by profile (educational prompt contains "precise, faithful"; cinematic prompt
   contains "idiomatic").

5. **Integration — content-script resolution**: a coordinator test asserting
   that the `translateSubtitle` message sent to the background includes the
   resolved `profile` field. This can be exercised by stubbing
   `window.location.hostname` to `udemy.com` / `max.com` and asserting the
   outgoing message's `profile`.

6. **Regression — first-chunk context**: assert chunk 0 now receives forward
   cues as `ctx` entries (not `[]`). Assert chunks 1+ still receive preceding
   cues as today (unchanged behavior).

7. **Regression — web-page path unchanged**: a `translateText` test confirms the
   web path still uses `buildSystemPrompt` and honors `customSystemPrompt`. This
   is the key guard against the main regression risk of this sub-project.

## Files touched

| File | Change | New? |
|---|---|---|
| `lib/subtitleProfiles.ts` | Profile enum, knob types, presets, domain map, `resolveProfile` | ✅ new |
| `services/subtitlePrompt.ts` | `buildSubtitleSystemPrompt`, knob→instruction map | ✅ new |
| `types/translation.ts` | Add `subtitleKnobs?: ProfileKnobs` to `TranslationRequest` | edit |
| `types/messages.ts` | Add `profile?: SubtitleProfile` to `TranslateSubtitleMessage` | edit |
| `services/openaiCompatible.ts` | Select subtitle vs web prompt by presence of `subtitleKnobs`; ignore `customSystemPrompt` for subtitles | edit |
| `content/subtitleCoordinator.ts` | Add `currentSubtitleProfile()` helper; resolve + pass `profile` at the 3 `translateSubtitle` send sites (lines 300, 381, 471) | edit |
| `services/background.ts` | Read `message.profile ?? 'media'`, resolve knobs, pass through `translateChunk` → service; chunk-0 look-ahead fix (~10 lines near line 505) | edit |
| `lib/__tests__/subtitleProfiles.test.ts`, `services/__tests__/subtitlePrompt.test.ts` | New unit tests above | ✅ new |
| `services/__tests__/background.test.ts`, `content/__tests__/subtitleCoordinator.test.ts` | Integration + regression tests above | edit |

Net new production logic ≈ 130 lines (profiles, prompt builder, routing, content-script helper). This is deliberately small — a foundation layer.

## Success criteria

- HBO Max subtitles translate with cinematic register; Udemy with educational;
  YouTube with media — confirmed by profile resolving correctly and the prompt
  reflecting the knobs.
- Web-page translation is byte-for-byte unaffected (regression test green).
- The subtitle prompt is provably free of web-page-only rules (HTML /
  formulas).
- First chunk of any subtitle no longer translates context-blind.

## Roadmap context

This is the first of seven sub-projects for the broader subtitle-optimization
effort. Subsequent sub-projects (each its own spec → plan → implementation
cycle):

2. Context & continuity — look-ahead, rolling proper-noun glossary, `voice` wiring.
3. Per-film proper-noun extraction.
4. User-facing style override controls (the knobs this sub-project defines become editable).
5. Reading-speed & timing adaptation (CPS, wrapping, timing extension; Max DOM timing fix).
6. Context-aware cache & robustness (cache-key revision, per-cue retry).
