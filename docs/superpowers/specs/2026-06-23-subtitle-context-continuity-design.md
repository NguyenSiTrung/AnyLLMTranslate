# Subtitle Context & Continuity — Design

Date: 2026-06-23
Status: Approved (pending user spec review)

## Problem

Sub-project 1 shipped the profile system, profile-driven prompt, and a targeted
first-chunk look-ahead fix. Three context and continuity gaps remain in the
subtitle pipeline:

1. **Chunks 1+ translate with backward-only context.** The background chunk
   loop (`services/background.ts`) feeds each chunk the 3 preceding cues as
   `ctx` entries, but no forward context. Only chunk 0 got a forward look-ahead
   fix in sub-project 1. Mid-film and end-of-film chunks still translate
   context-blind on one side.

2. **No cross-chunk name consistency.** When a character named "Ainsley" appears
   in chunk 3 and the model translates it as "Ainsley", chunk 12 may translate
   the same name differently ("Ensley") because no proper-noun carryover
   exists. The user's global glossary (`lib/glossary.ts`) is static and
   user-managed; it does not adapt to the content being translated.

3. **Speaker identity is parsed but never used.** The `SubtitleCue` type has a
   `voice?: string` field (`types/subtitle.ts:12`), but the VTT parser
   (`lib/subtitleParser.ts`) never populates it. WebVTT `<v Speaker>` cue
   tags are silently left in the cue text as raw markup. The translation
   prompt has no awareness of who is speaking, which matters for dialogue-heavy
   content where tone and register vary by character.

## Goal

Address all three gaps in a single sub-project:

- Extend bidirectional look-ahead to all chunks (not just chunk 0).
- Build a rolling proper-noun glossary that accumulates across chunks within a
  subtitle session and feeds back into subsequent chunk prompts for name
  consistency.
- Parse VTT `<v Speaker>` voice tags, strip them from cue text, and surface
  speaker identity in the translation prompt.

## Approach

### 1. Bidirectional look-ahead

The existing context machinery (`ctx`-prefixed IDs in the `texts` Map, ignored
in the response) already supports arbitrary context entries. Extending to
bidirectional is a ~2-line change in the background chunk loop: concatenate
preceding and following cues into the `contextCues` array.

Chunk 0 already receives forward look-ahead and has no preceding context (it is
the start). Middle chunks go from 3 context cues to 6 (3 before + 3 after).
The last chunk has no following cues, which is handled naturally by
`Array.slice` returning an empty array.

No prompt changes are needed. The model already ignores `ctx` translations.

### 2. Rolling proper-noun glossary

**Extraction method: inline in the same JSON response.** The subtitle prompt's
JSON contract is extended to request an optional `properNouns` field alongside
`translations`:

```json
{
  "translations": {"s1": "...", "s2": "..."},
  "properNouns": {"John": "Juan", "MIT": "MIT"}
}
```

This costs zero extra API calls. The model already processes the text and knows
which words are proper nouns. If a model does not produce the `properNouns`
field, the rolling glossary simply does not update for that chunk, and
translations are unaffected (the field is parsed independently from
`translations`).

**Scope: per subtitle session.** The `handleTranslateSubtitle` function creates
a new closure per call, and `translateChunk` is a closure over its local scope.
A local `Map<string, string>` for the rolling glossary is naturally per-session:
born when the subtitle translation starts, accumulates across chunks (first
chunk + background loop share the same closure), and dies when the function
exits. This aligns with the existing session lifecycle (cleared on SPA
navigation, track change, tab close). Per-tab or global scope would
cross-contaminate names between different videos.

**Cap: 100 entries.** Proper nouns are relatively rare and tend to repeat. When
the cap is reached, new entries are ignored (simple, predictable). This prevents
unbounded growth for long content.

**Prompt injection:** The rolling glossary appears as a separate section in the
subtitle system prompt, after the user's global glossary (Part C) and before the
JSON contract (Part D):

```
Previously translated names in this content (use these consistently):
- "John" → "Juan"
```

### 3. Voice field wiring

**Parser change:** In `parseVttCueBlock` (`lib/subtitleParser.ts`), extract
`<v Speaker Name>` from cue text, store in `cue.voice`, and strip the tag from
`cue.text`:

```
<v John> Hello world  →  voice: "John", text: "Hello world"
```

VTT also supports `<v>` without a name (anonymous voice tag); these are stripped
but produce `voice: undefined` (no speaker context to convey).

**Prompt change:** A fixed line is added to Part A of the subtitle system prompt:

```
When a line is prefixed with [Speaker Name], that identifies who is speaking.
Use this to maintain dialogue flow and speaker-appropriate tone.
Do not translate or repeat the speaker name in the output.
```

**Background change:** In `translateChunk`, when building the `texts` Map for
the LLM, prefix each entry with `[voice]` when `cue.voice` is present. This
applies to both translatable cues and context cues:

```
[John] Hello world
```

Cache operations continue using the original `cue.text` (no prefix), so caching
is unaffected. The deduplication via `uniqueTexts` still uses original text, so
the same line spoken by different speakers is translated once (the voice is
context, not content).

## Components

### A. `lib/subtitleGlossary.ts` — rolling glossary utilities (new file)

Pure data operations on a `Map<string, string>`. No side effects, no I/O.

```ts
/** Maximum entries in the rolling proper-noun glossary. */
export const MAX_ROLLING_GLOSSARY = 100;

/** Merge extracted proper nouns into the rolling glossary map.
 *  Stops adding when the map reaches MAX_ROLLING_GLOSSARY entries. */
export function mergeProperNouns(
  glossary: Map<string, string>,
  properNouns: Record<string, string>,
): void

/** Format the rolling glossary as a prompt section. Returns '' when empty. */
export function formatRollingGlossary(glossary: Map<string, string>): string
```

`formatRollingGlossary` produces:

```
Previously translated names in this content (use these consistently):
- "John" → "Juan"
```

### B. `services/subtitlePrompt.ts` — prompt + response parsing (edit)

Three changes:

1. **Voice instruction line** added to Part A (fixed identity block):

   ```
   When a line is prefixed with [Speaker Name], that identifies who is speaking.
   Use this to maintain dialogue flow and speaker-appropriate tone.
   Do not translate or repeat the speaker name in the output.
   ```

2. **Rolling glossary parameter** added to `buildSubtitleSystemPrompt`:

   ```ts
   export function buildSubtitleSystemPrompt(
     targetLanguage: string,
     knobs: ProfileKnobs,
     glossaryBlock?: string,
     rollingGlossaryBlock?: string,
   ): string
   ```

   The rolling glossary block is injected after the user's global glossary
   (Part C) and before the JSON contract (Part D). Omitted when empty.

3. **JSON contract extended** to request `properNouns`:

   ```
   Respond ONLY with valid JSON in this exact format: {"translations": {"id1": "...", "id2": "..."}, "properNouns": {"SourceName": "TranslatedName"}}

   The keys in "translations" must exactly match the input keys.
   In "properNouns", include proper nouns (character names, place names, brands, technical terms) from the source texts and their translations.
   ```

### C. `services/subtitleResponse.ts` — proper-noun extraction (new file)

```ts
/** Extract the properNouns field from a subtitle translation response.
 *  Returns undefined when the field is absent or malformed. */
export function extractProperNouns(responseText: string): Record<string, string> | undefined
```

This re-parses the response JSON and extracts the `properNouns` field. Called
only on the subtitle path. `parseTranslationResponse` in `base.ts` is unchanged.

### D. `lib/subtitleParser.ts` — VTT voice tag parsing (edit)

In `parseVttCueBlock`, before returning the cue:

```ts
const voiceMatch = text.match(/^<v(?:\s+([^>]+))?>/i);
const voice = voiceMatch?.[1]?.trim();
const cleanText = voiceMatch ? text.slice(voiceMatch[0].length).trim() : text;
```

The `<v>` tag is stripped from `cue.text` in all cases. `cue.voice` is set only
when a speaker name is present (not for anonymous `<v>` tags).

### E. `types/translation.ts` — TranslationResult extension (edit)

```ts
export interface TranslationResult {
  // ... existing fields ...
  /** Proper nouns extracted from the response (subtitle path only). */
  properNouns?: Record<string, string>;
}
```

### F. `services/openaiCompatible.ts` — proper-noun extraction on subtitle path (edit)

After `parseTranslationResponse`, when `request.subtitleKnobs` is present, call
`extractProperNouns(responseText)` and attach the result to the
`TranslationResult`. Web-page path is unaffected.

### G. `services/background.ts` — bidirectional context, rolling glossary, voice prefixing (edit)

1. **Bidirectional context:** In the background chunk loop, replace
   `const contextCues = cues.slice(Math.max(0, i - CONTEXT_SIZE), i)` with:

   ```ts
   const precedingCues = cues.slice(Math.max(0, i - CONTEXT_SIZE), i);
   const followingCues = cues.slice(i + CHUNK_SIZE, i + CHUNK_SIZE + CONTEXT_SIZE);
   const contextCues = [...precedingCues, ...followingCues];
   ```

2. **Rolling glossary:** Initialize `const rollingGlossary = new Map<string, string>()`
   at the top of `handleTranslateSubtitle`. In `translateChunk`:
   - Before calling `service.translate()`, format the rolling glossary via
     `formatRollingGlossary(rollingGlossary)` and pass it as
     `rollingGlossaryBlock` to `buildSubtitleSystemPrompt` (through the
     `TranslationRequest`).
   - After a successful translation, if `result.properNouns` is present, call
     `mergeProperNouns(rollingGlossary, result.properNouns)`.

   The `TranslationRequest` type needs a new optional field
   `rollingGlossaryBlock?: string` that the service passes through to
   `buildSubtitleSystemPrompt`.

3. **Voice prefixing:** In `translateChunk`, when building the `texts` Map:
   - For translatable cues: prefix `text` with `[${cue.voice}]` when
     `cue.voice` is present.
   - For context cues: prefix `ctxCue.text` with `[${ctxCue.voice}]` when
     `ctxCue.voice` is present.
   - Cache operations continue using the original (unprefixed) `cue.text`.

### H. `types/translation.ts` — TranslationRequest extension (edit)

```ts
export interface TranslationRequest {
  // ... existing fields ...
  /** Rolling proper-noun glossary block for subtitle continuity. */
  rollingGlossaryBlock?: string;
}
```

### I. `services/openaiCompatible.ts` — pass rolling glossary to prompt builder (edit)

In the subtitle branch of `translate()`:

```ts
buildSubtitleSystemPrompt(
  request.targetLanguage,
  request.subtitleKnobs,
  request.glossaryBlock,
  request.rollingGlossaryBlock,
)
```

## Data flow

```
content script (subtitleCoordinator)
   │ resolveProfile(hostname) → SubtitleProfile  (unchanged from sub-project 1)
   │
   └──translateSubtitle { cues, ..., profile }──▶ background.handleTranslateSubtitle
                                                     │
                                                     ├─ rollingGlossary = new Map()  ← per-session
                                                     │
                                                     └─ translateChunk(cues, context)  ← now bidirectional
                                                             │
                                                             ├─ format rolling glossary → rollingGlossaryBlock
                                                             ├─ prefix texts with [voice] when cue.voice present
                                                             │
                                                             └─ service.translate({
                                                                  texts,                    ← voice-prefixed
                                                                  subtitleKnobs,
                                                                  glossaryBlock,            ← user's global glossary
                                                                  rollingGlossaryBlock,     ← accumulated names
                                                                })
                                                                     │
                                                                     ├─ buildSubtitleSystemPrompt(..., rollingGlossaryBlock)
                                                                     │    ← includes voice instruction + extended JSON contract
                                                                     │
                                                                     └─ parseTranslationResponse(responseText, expectedIds)
                                                                        + extractProperNouns(responseText)
                                                                             │
                                                                             └─ mergeProperNouns(rollingGlossary, properNouns)
                                                                                ← feeds next chunk's prompt
```

## Scope boundaries (what this sub-project is NOT)

- No per-film proper-noun extraction (pre-translation pass to build a full
  glossary before translating). That is roadmap #3.
- No user-facing UI for the rolling glossary (viewing, editing, clearing).
  That is roadmap #4.
- No reading-speed / CPS / line-wrapping / timing changes. That is roadmap #5.
- No cache-key changes. The cache continues to use the original (unprefixed)
  cue text as the key. That is roadmap #6.
- No changes to the web-page translation path. `parseTranslationResponse` and
  `buildSystemPrompt` are untouched.

## Files touched

| File | Change | New? |
|---|---|---|
| `lib/subtitleGlossary.ts` | `mergeProperNouns`, `formatRollingGlossary`, `MAX_ROLLING_GLOSSARY` | new |
| `services/subtitleResponse.ts` | `extractProperNouns` | new |
| `lib/subtitleParser.ts` | Parse `<v Speaker>` in `parseVttCueBlock`, strip from text, set `cue.voice` | edit |
| `services/subtitlePrompt.ts` | Voice instruction line, `rollingGlossaryBlock` param, extended JSON contract | edit |
| `types/translation.ts` | `rollingGlossaryBlock?` on `TranslationRequest`, `properNouns?` on `TranslationResult` | edit |
| `services/openaiCompatible.ts` | Pass `rollingGlossaryBlock` to prompt builder, extract `properNouns` on subtitle path | edit |
| `services/background.ts` | Bidirectional context, rolling glossary accumulation, voice prefixing in `translateChunk` | edit |
| `lib/__tests__/subtitleGlossary.test.ts` | Unit tests for merge/format/cap | new |
| `services/__tests__/subtitleResponse.test.ts` | Unit tests for `extractProperNouns` | new |
| `lib/__tests__/subtitleParser.test.ts` | VTT voice tag parsing tests | new |
| `services/__tests__/subtitlePrompt.test.ts` | Extend: voice instruction, rolling glossary section, extended JSON contract | edit |
| `services/__tests__/background.test.ts` | Extend: bidirectional context, rolling glossary accumulation, voice prefixing | edit |

Net new production logic ≈ 80 lines (glossary utils, response extraction, voice
parsing). Edits to existing files ≈ 30 lines. This is a continuity layer built
on the foundation from sub-project 1.

## Testing strategy

1. **Unit — `lib/subtitleGlossary.test.ts`** (new): `mergeProperNouns` adds
   entries, caps at 100, ignores new entries when full. `formatRollingGlossary`
   produces the expected text format, returns `''` for empty map.

2. **Unit — `services/subtitleResponse.test.ts`** (new):
   `extractProperNouns` returns the map when `properNouns` is present and
   well-formed; returns `undefined` when absent, malformed, or not an object.

3. **Unit — `lib/subtitleParser.test.ts`** (new): VTT with `<v John>` produces
   `cue.voice = "John"` and `cue.text` without the tag. VTT with anonymous `<v>`
   produces `cue.voice = undefined` and stripped text. VTT without voice tags
   produces `cue.voice = undefined`. SRT parsing is unaffected (no voice tags
   in SRT).

4. **Unit — `services/subtitlePrompt.test.ts`** (extend): prompt includes voice
   instruction line. Prompt includes rolling glossary section when
   `rollingGlossaryBlock` is provided, omits when not. JSON contract mentions
   `properNouns`.

5. **Integration — `services/__tests__/background.test.ts`** (extend): chunk 1+
   receives both preceding and following cues as `ctx` entries (not just
   preceding). Rolling glossary accumulates across chunks (chunk 2's prompt
   includes names from chunk 1's response). Voice-prefixed texts reach the LLM
   when `cue.voice` is set. Cache uses original (unprefixed) text.

6. **Regression — web-page path unchanged:** `parseTranslationResponse` and
   `buildSystemPrompt` produce the same output as before. Web-page
   `TranslationRequest` without `subtitleKnobs` does not trigger proper-noun
   extraction or rolling glossary.

## Success criteria

- Every chunk (not just chunk 0) translates with both preceding and following
  context.
- A proper noun translated in chunk N is translated consistently in chunk N+1
  because the rolling glossary feeds it into the prompt.
- VTT cues with `<v Speaker>` tags have the tag stripped from display text and
  the speaker identity surfaced to the model via `[Speaker]` prefix.
- Web-page translation is byte-for-byte unaffected (regression test green).
- Cache behavior is unchanged (cache key uses original cue text, not
  voice-prefixed).

## Roadmap context

This is the second of seven sub-projects for the broader subtitle-optimization
effort:

1. ~~Profile system foundation + subtitle-specific prompt + first-chunk fix~~
   (merged to master).
2. **Context & continuity — look-ahead, rolling proper-noun glossary, voice
   wiring.** (This spec.)
3. Per-film proper-noun extraction.
4. User-facing style override controls (the knobs from sub-project 1 become
   editable).
5. Reading-speed & timing adaptation (CPS, wrapping, timing extension; Max DOM
   timing fix).
6. Context-aware cache & robustness (cache-key revision, per-cue retry).
