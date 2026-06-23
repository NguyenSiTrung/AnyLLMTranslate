# Subtitle Per-Film Proper-Noun Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-film proper-noun glossary that is extracted once per unique film via a dedicated pre-scan LLM call, persisted by content hash, and used to seed the per-session rolling glossary so chunk 0 (and every later chunk) translates with the film's full name list.

**Architecture:** Three new focused modules — `lib/subtitleFilmGlossary.ts` (content-hash canonicalization), `services/subtitleNameScanner.ts` (pre-scan LLM call + prompt), `services/filmGlossaryStore.ts` (`chrome.storage.local` seam). The background service orchestrates them in `handleTranslateSubtitle`: hash → load-or-pre-scan → seed the rolling glossary via the existing `mergeProperNouns`. Web-page path, translation cache, and the rolling-glossary merge behavior are all untouched.

**Tech Stack:** TypeScript, WXT (browser extension), Vitest + jsdom, WebCrypto (`crypto.subtle`), `chrome.storage.local`.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-23-subtitle-per-film-proper-noun-extraction-design.md` — every requirement traces to it.
- **Storage namespace:** `anyllm-film-glossary` (keyed by hex content hash). Distinct from `anyllm-translate-settings`, `anyllm-translate-stats`, `anyllm-translate-cache` — never touch the translation cache.
- **Cap:** film glossary respects `MAX_ROLLING_GLOSSARY = 100` (from `lib/subtitleGlossary.ts:2`). Seed enters via `mergeProperNouns`, never `new Map(entries)`.
- **Graceful degradation:** every failure (LLM error, storage error, malformed JSON, no crypto.subtle) degrades to sub-project 2 behavior — empty film glossary, unseeded rolling glossary, translation still succeeds. Never throws out of `handleTranslateSubtitle`.
- **Name scope:** identical to the existing `properNouns` JSON contract — character names, places, brands, technical terms.
- **No prompt edits to `services/subtitlePrompt.ts`** — the film glossary enters the chunk prompt through the existing `rollingGlossaryBlock` slot.
- **Pre-scan blocking before chunk 0** — chunk 0 waits for the seed.
- **Aliases:** the codebase aliases `@` to the repo root (see `vitest.config.ts`, `tsconfig.json`). Use `@/...` imports, matching every other file.
- **Test commands:** `npx vitest run <path>` (non-interactive). Lint: `npx eslint <files>` if configured.
- **TDD:** write failing test → run to confirm fail → implement → run to confirm pass → commit.

---

## File Structure

| File | Responsibility | New? |
|---|---|---|
| `lib/subtitleFilmGlossary.ts` | `canonicalizeCueCorpus(cues)` + `contentHash(cues)` — pure, no I/O | ✅ |
| `services/subtitleNameScanner.ts` | `preScanNames(service, src, tgt, cues, knobs)` + dedicated pre-scan prompt | ✅ |
| `services/filmGlossaryStore.ts` | `loadFilmGlossary(hash)` / `saveFilmGlossary(hash, map)` over `chrome.storage.local` | ✅ |
| `lib/__tests__/subtitleFilmGlossary.test.ts` | canonicalization + hash unit tests | ✅ |
| `services/__tests__/subtitleNameScanner.test.ts` | pre-scan call + prompt + parse + graceful-fail tests | ✅ |
| `services/__tests__/filmGlossaryStore.test.ts` | storage round-trip + miss + error tests | ✅ |
| `services/background.ts` | orchestration seam in `handleTranslateSubtitle` | edit |
| `content/subtitleCoordinator.ts` | toast copy ("Indexing names...") | edit |
| `services/__tests__/background.test.ts` | integration: pre-scan order, cache-hit skip, degradation, persistence | edit |

Dependency order for execution: **Task 1 → 2 → 3 → 4 → 5 → 6** (each later task consumes earlier ones).

---

### Task 1: Content-hash canonicalization (`lib/subtitleFilmGlossary.ts`)

**Files:**
- Create: `lib/subtitleFilmGlossary.ts`
- Test: `lib/__tests__/subtitleFilmGlossary.test.ts`

**Interfaces:**
- Consumes: `SubtitleCue` from `@/types/subtitle`.
- Produces:
  - `canonicalizeCueCorpus(cues: SubtitleCue[]): string`
  - `contentHash(cues: SubtitleCue[]): Promise<string>` (hex SHA-256)

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/subtitleFilmGlossary.test.ts`:

```ts
/**
 * Tests for per-film proper-noun glossary canonicalization + content hash.
 * Sub-project 3 of the subtitle-optimization effort.
 */
import { describe, it, expect } from 'vitest';
import { canonicalizeCueCorpus, contentHash } from '@/lib/subtitleFilmGlossary';
import type { SubtitleCue } from '@/types/subtitle';

const cue = (text: string, voice?: string): SubtitleCue => ({
  startTime: 0,
  endTime: 1,
  text,
  voice,
});

describe('canonicalizeCueCorpus', () => {
  it('order-independent: same cues in different order → same string', () => {
    const a = canonicalizeCueCorpus([cue('Hello'), cue('World')]);
    const b = canonicalizeCueCorpus([cue('World'), cue('Hello')]);
    expect(a).toBe(b);
  });

  it('lowercases and trims whitespace', () => {
    expect(canonicalizeCueCorpus([cue('  HeLLo  ')])).toBe(
      canonicalizeCueCorpus([cue('hello')]),
    );
  });

  it('strips [Speaker] voice prefixes', () => {
    // voice prefix is a display concern, not content identity — same text with
    // and without a speaker tag must canonicalize identically.
    const withVoice = canonicalizeCueCorpus([cue('I am here', 'Alice')]);
    const noVoice = canonicalizeCueCorpus([cue('I am here')]);
    expect(withVoice).toBe(noVoice);
  });

  it('dedupes identical texts', () => {
    const once = canonicalizeCueCorpus([cue('Hi')]);
    const thrice = canonicalizeCueCorpus([cue('Hi'), cue('Hi'), cue('Hi')]);
    expect(once).toBe(thrice);
  });

  it('empty cue set → empty canonical string', () => {
    expect(canonicalizeCueCorpus([])).toBe('');
  });

  it('whitespace-only texts are trimmed to empty and deduped', () => {
    expect(canonicalizeCueCorpus([cue('   '), cue('')])).toBe('');
  });
});

describe('contentHash', () => {
  it('is deterministic: same input → same hash', async () => {
    const a = await contentHash([cue('Hello'), cue('World')]);
    const b = await contentHash([cue('World'), cue('Hello')]);
    expect(a).toBe(b);
  });

  it('different corpora → different hashes', async () => {
    const a = await contentHash([cue('Hello')]);
    const b = await contentHash([cue('Goodbye')]);
    expect(a).not.toBe(b);
  });

  it('returns a hex string (64 chars for SHA-256)', async () => {
    const hash = await contentHash([cue('Hello')]);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('empty cue set still hashes (no throw)', async () => {
    const hash = await contentHash([]);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/subtitleFilmGlossary.test.ts`
Expected: FAIL — module `@/lib/subtitleFilmGlossary` not found / functions undefined.

- [ ] **Step 3: Write minimal implementation**

Create `lib/subtitleFilmGlossary.ts`:

```ts
/**
 * Per-film proper-noun glossary — content-hash canonicalization.
 *
 * The same film must hash the same regardless of cue ordering, leading/trailing
 * whitespace, or whether voice prefixes were parsed. This is the key for the
 * persisted film glossary (services/filmGlossaryStore.ts) so a film's extracted
 * names are reused across sessions.
 *
 * See docs/superpowers/specs/2026-06-23-subtitle-per-film-proper-noun-extraction-design.md.
 */

import type { SubtitleCue } from '@/types/subtitle';

/** Strip a leading "[Speaker] " voice prefix if present (display concern, not
 *  content identity). Mirrors the prefixing added in background.ts translateChunk. */
function stripVoicePrefix(text: string): string {
  // Match "[anything]" followed by a space at the start of the line.
  return text.replace(/^\[[^\]]*\]\s*/, '');
}

/** Canonicalize the cue corpus into a stable string for hashing.
 *  Lowercases, trims, strips voice prefixes, dedupes, and sorts. */
export function canonicalizeCueCorpus(cues: SubtitleCue[]): string {
  const normalized = new Set<string>();
  for (const cue of cues) {
    // Prefer the raw cue.text (voice prefix is applied at translate time, not
    // stored in cue.text — but strip defensively in case a caller pre-prefixed).
    const text = stripVoicePrefix(cue.text).trim().toLowerCase();
    if (text) normalized.add(text);
  }
  return [...normalized].sort().join('\n');
}

/** SHA-256 (hex) of the canonicalized corpus via WebCrypto (crypto.subtle),
 *  available in service workers. Empty corpus hashes the empty string. */
export async function contentHash(cues: SubtitleCue[]): Promise<string> {
  const canonical = canonicalizeCueCorpus(cues);
  const data = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/subtitleFilmGlossary.test.ts`
Expected: PASS (all 10 tests). If the `voice` stripping test fails because the prefix is *not* actually in `cue.text`, that's fine — `stripVoicePrefix` is a no-op on already-clean text and the test passes either way.

- [ ] **Step 5: Commit**

```bash
git add lib/subtitleFilmGlossary.ts lib/__tests__/subtitleFilmGlossary.test.ts
git commit -m "feat(subtitle): add content-hash canonicalization for per-film glossary"
```

---

### Task 2: Film glossary storage seam (`services/filmGlossaryStore.ts`)

**Files:**
- Create: `services/filmGlossaryStore.ts`
- Test: `services/__tests__/filmGlossaryStore.test.ts`

**Interfaces:**
- Consumes: `chrome.storage.local` (global in service worker / jsdom test stub).
- Produces:
  - `loadFilmGlossary(hash: string): Promise<Record<string,string> | undefined>`
  - `saveFilmGlossary(hash: string, glossary: Record<string,string>): Promise<void>`
  - `FILM_GLOSSARY_STORAGE_KEY` (exported const: `'anyllm-film-glossary'`)

- [ ] **Step 1: Write the failing test**

Create `services/__tests__/filmGlossaryStore.test.ts`:

```ts
/**
 * Tests for the film-glossary chrome.storage.local seam.
 * Sub-project 3.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadFilmGlossary,
  saveFilmGlossary,
  FILM_GLOSSARY_STORAGE_KEY,
} from '@/services/filmGlossaryStore';

// Per-test storage backing object.
let backing: Record<string, unknown>;

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: backing[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(backing, items);
      }),
      remove: vi.fn(async (key: string) => {
        delete backing[key];
      }),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

beforeEach(() => {
  backing = {};
  vi.clearAllMocks();
});

describe('filmGlossaryStore', () => {
  it('uses the documented storage key', () => {
    expect(FILM_GLOSSARY_STORAGE_KEY).toBe('anyllm-film-glossary');
  });

  it('load returns undefined on miss', async () => {
    expect(await loadFilmGlossary('deadbeef')).toBeUndefined();
  });

  it('save then load round-trips', async () => {
    await saveFilmGlossary('abc123', { Dumbledore: 'Phù thủy' });
    expect(await loadFilmGlossary('abc123')).toEqual({ Dumbledore: 'Phù thủy' });
  });

  it('save overwrites an existing key', async () => {
    await saveFilmGlossary('abc123', { Dumbledore: 'Old' });
    await saveFilmGlossary('abc123', { Voldemort: 'New' });
    expect(await loadFilmGlossary('abc123')).toEqual({ Voldemort: 'New' });
  });

  it('persisted map lives under the film-glossary storage key', async () => {
    await saveFilmGlossary('abc123', { Dumbledore: 'Phù thủy' });
    expect(backing[FILM_GLOSSARY_STORAGE_KEY]).toEqual({
      abc123: { Dumbledore: 'Phù thủy' },
    });
  });

  it('load returns undefined (not throw) on storage read error', async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('storage exploded'),
    );
    await expect(loadFilmGlossary('abc123')).resolves.toBeUndefined();
  });

  it('save does not throw on storage write error', async () => {
    (chrome.storage.local.set as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('quota exceeded'),
    );
    await expect(saveFilmGlossary('abc123', { a: 'b' })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run services/__tests__/filmGlossaryStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `services/filmGlossaryStore.ts`:

```ts
/**
 * Film-glossary storage seam.
 *
 * Persists per-film proper-noun glossaries under chrome.storage.local, keyed
 * by content hash. Separate namespace from the translation cache
 * (anyllm-translate-cache, IndexedDB-backed cacheManager) and from settings/stats:
 * a film's names don't expire and don't participate in LRU eviction.
 *
 * Never throws — every failure degrades to a miss / no-op so the subtitle
 * pipeline still translates.
 *
 * See docs/superpowers/specs/2026-06-23-subtitle-per-film-proper-noun-extraction-design.md.
 */

export const FILM_GLOSSARY_STORAGE_KEY = 'anyllm-film-glossary';

/** Shape persisted: { [contentHash]: { sourceName: targetName, ... } }. */
type FilmGlossaryMap = Record<string, Record<string, string>>;

/** Load a persisted film glossary by content hash.
 *  Returns undefined on miss OR on any storage error (never throws). */
export async function loadFilmGlossary(
  contentHash: string,
): Promise<Record<string, string> | undefined> {
  try {
    const result = await chrome.storage.local.get(FILM_GLOSSARY_STORAGE_KEY);
    const all = result[FILM_GLOSSARY_STORAGE_KEY] as FilmGlossaryMap | undefined;
    return all?.[contentHash];
  } catch {
    return undefined;
  }
}

/** Persist a film glossary keyed by content hash. Overwrites. Never throws. */
export async function saveFilmGlossary(
  contentHash: string,
  glossary: Record<string, string>,
): Promise<void> {
  try {
    const result = await chrome.storage.local.get(FILM_GLOSSARY_STORAGE_KEY);
    const all = (result[FILM_GLOSSARY_STORAGE_KEY] as FilmGlossaryMap | undefined) ?? {};
    all[contentHash] = glossary;
    await chrome.storage.local.set({ [FILM_GLOSSARY_STORAGE_KEY]: all });
  } catch {
    // Degrade silently: no persistence this session. Caller proceeds in-memory.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run services/__tests__/filmGlossaryStore.test.ts`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add services/filmGlossaryStore.ts services/__tests__/filmGlossaryStore.test.ts
git commit -m "feat(subtitle): add film-glossary chrome.storage.local seam"
```

---

### Task 3: Pre-scan LLM call + prompt (`services/subtitleNameScanner.ts`)

**Files:**
- Create: `services/subtitleNameScanner.ts`
- Test: `services/__tests__/subtitleNameScanner.test.ts`

**Interfaces:**
- Consumes:
  - `TranslationService` from `@/types/translation`
  - `ProfileKnobs` from `@/lib/subtitleProfiles`
  - `SubtitleCue` from `@/types/subtitle`
  - `MAX_ROLLING_GLOSSARY` from `@/lib/subtitleGlossary`
  - `extractProperNouns` from `@/services/subtitleResponse`
  - `getLanguageName` from `@/lib/languages`
- Produces:
  - `preScanNames(service, sourceLanguage, targetLanguage, cues, knobs): Promise<Record<string,string>>`

- [ ] **Step 1: Write the failing test**

Create `services/__tests__/subtitleNameScanner.test.ts`:

```ts
/**
 * Tests for the per-film proper-noun pre-scan call.
 * Sub-project 3.
 */
import { describe, it, expect, vi } from 'vitest';
import { preScanNames, buildPreScanPrompt } from '@/services/subtitleNameScanner';
import { PROFILE_PRESETS } from '@/lib/subtitleProfiles';
import type { TranslationService, TranslationResult } from '@/types/translation';
import type { SubtitleCue } from '@/types/subtitle';

const cue = (text: string): SubtitleCue => ({ startTime: 0, endTime: 1, text });

/** Build a fake TranslationService whose translate() returns a canned response. */
function fakeService(
  response: TranslationResult,
  capture?: { req?: unknown },
): TranslationService {
  return {
    translate: vi.fn(async (req) => {
      if (capture) capture.req = req;
      return response;
    }),
    testConnection: vi.fn(),
  };
}

const okResponse = (properNouns: Record<string, string>): TranslationResult => ({
  success: true,
  translations: new Map(),
  properNouns,
});

describe('buildPreScanPrompt', () => {
  it('identifies itself as a name-extraction task (not a translator)', () => {
    const p = buildPreScanPrompt('vi', PROFILE_PRESETS.cinematic);
    expect(p.toLowerCase()).toContain('proper noun');
    expect(p).toContain('properNouns');
  });

  it('injects the target language and drops the placeholder', () => {
    const p = buildPreScanPrompt('vi', PROFILE_PRESETS.media);
    expect(p).not.toContain('{{targetLanguage}}');
  });

  it('carries profile knob instructions (cinematic → idiomatic)', () => {
    const p = buildPreScanPrompt('vi', PROFILE_PRESETS.cinematic);
    expect(p).toContain('idiomatic');
  });

  it('omits knob lines for media (all defaults)', () => {
    const p = buildPreScanPrompt('vi', PROFILE_PRESETS.media);
    expect(p).not.toContain('idiomatic');
    expect(p).not.toContain('how people actually talk');
  });
});

describe('preScanNames', () => {
  it('sends the deduplicated corpus in the user prompt', async () => {
    const captured: { req?: unknown } = {};
    const svc = fakeService(okResponse({ Dumbledore: 'Phù thủy' }), captured);
    const cues = [cue('Hello'), cue('Hello'), cue('World')];
    await preScanNames(svc, 'en', 'vi', cues, PROFILE_PRESETS.media);
    expect(svc.translate).toHaveBeenCalledTimes(1);
    const req = captured.req as { texts: Map<string, string> };
    const values = [...req.texts.values()];
    // deduped: "Hello" once, "World" once.
    expect(values.filter((v) => v === 'Hello')).toHaveLength(1);
    expect(values).toContain('World');
  });

  it('returns the parsed properNouns from the response', async () => {
    const svc = fakeService(okResponse({ Dumbledore: 'Phù thủy', Hogwarts: 'Hogwarts' }));
    const result = await preScanNames(svc, 'en', 'vi', [cue('Hi')], PROFILE_PRESETS.media);
    expect(result).toEqual({ Dumbledore: 'Phù thủy', Hogwarts: 'Hogwarts' });
  });

  it('returns {} (not throw) when the service call fails', async () => {
    const svc = fakeService({ success: false, translations: new Map(), error: 'boom' });
    await expect(
      preScanNames(svc, 'en', 'vi', [cue('Hi')], PROFILE_PRESETS.media),
    ).resolves.toEqual({});
  });

  it('returns {} when the response has no properNouns field', async () => {
    const svc = fakeService({ success: true, translations: new Map() });
    await expect(
      preScanNames(svc, 'en', 'vi', [cue('Hi')], PROFILE_PRESETS.media),
    ).resolves.toEqual({});
  });

  it('returns {} when translate() throws', async () => {
    const svc: TranslationService = {
      translate: vi.fn().mockRejectedValue(new Error('network')),
      testConnection: vi.fn(),
    };
    await expect(
      preScanNames(svc, 'en', 'vi', [cue('Hi')], PROFILE_PRESETS.media),
    ).resolves.toEqual({});
  });

  it('returns {} for an empty cue set (no API call)', async () => {
    const svc = fakeService(okResponse({ X: 'Y' }));
    await expect(
      preScanNames(svc, 'en', 'vi', [], PROFILE_PRESETS.media),
    ).resolves.toEqual({});
    expect(svc.translate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run services/__tests__/subtitleNameScanner.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `services/subtitleNameScanner.ts`:

```ts
/**
 * Per-film proper-noun pre-scan.
 *
 * A single dedicated LLM call that extracts proper nouns from the full
 * (deduplicated) source corpus BEFORE chunk 0 translates. The result seeds the
 * per-session rolling glossary so the opening of a film knows names that only
 * appear later. Caller persists the result (services/filmGlossaryStore.ts).
 *
 * Distinct from services/subtitlePrompt.ts: the pre-scan *extracts names*, it
 * does not translate lines. Never throws — returns {} on any failure so callers
 * treat it as a no-op seed.
 *
 * See docs/superpowers/specs/2026-06-23-subtitle-per-film-proper-noun-extraction-design.md.
 */

import type { TranslationService } from '@/types/translation';
import type { ProfileKnobs } from '@/lib/subtitleProfiles';
import type { SubtitleCue } from '@/types/subtitle';
import { MAX_ROLLING_GLOSSARY } from '@/lib/subtitleGlossary';
import { extractProperNouns } from '@/services/subtitleResponse';
import { getLanguageName } from '@/lib/languages';

/** Knob → instruction lines for the pre-scan prompt. Same vocabulary as the
 *  chunk-translator prompt so name choices match across pre-scan and chunks. */
const REGISTER_LINES: Record<string, string> = {
  formal: 'Prefer formal name forms.',
  casual: 'Prefer casual/idiomatic name forms (e.g. a nickname over a formal transliteration).',
};
const FAITHFULNESS_LINES: Record<string, string> = {
  literal: 'Prefer faithful transliteration of names.',
  idiomatic: 'Prefer idiomatic name rendering in the target language.',
};

/** Build the pre-scan system prompt. Exported for unit testing. */
export function buildPreScanPrompt(
  targetLanguage: string,
  knobs: ProfileKnobs,
): string {
  const name = getLanguageName(targetLanguage);
  const display = name !== targetLanguage ? `${name} (${targetLanguage})` : targetLanguage;

  const lines: string[] = [
    `You are a proper-noun extractor for subtitles. List every proper noun (character names, place names, brands, technical terms) that appears in the transcript below, and give its translation to ${display}.`,
    '',
    'Rules:',
    `- Include at most ${MAX_ROLLING_GLOSSARY} entries. Prioritise the most frequent and most distinctive names.`,
    '- Skip common words, pronouns, and generic terms that are not proper nouns.',
    '- For each entry, the key is the exact source form as it appears in the transcript and the value is the target-language translation.',
  ];

  const knobLines: string[] = [];
  if (knobs.register !== 'neutral') knobLines.push(REGISTER_LINES[knobs.register]);
  if (knobs.faithfulness !== 'balanced') knobLines.push(FAITHFULNESS_LINES[knobs.faithfulness]);
  if (knobs.faithfulness === 'idiomatic') knobLines.push('Prefer idiomatic name rendering.');
  if (knobLines.length > 0) {
    lines.push('', ...knobLines);
  }

  lines.push(
    '',
    'Respond ONLY with valid JSON in this exact format: {"properNouns": {"SourceName": "TranslatedName"}}',
  );

  return lines.join('\n');
}

/** Run the pre-scan. Returns {source: target}; returns {} on any failure. */
export async function preScanNames(
  service: TranslationService,
  sourceLanguage: string,
  targetLanguage: string,
  cues: SubtitleCue[],
  knobs: ProfileKnobs,
): Promise<Record<string, string>> {
  if (cues.length === 0) return {};

  try {
    // Dedupe the source corpus to bound token cost.
    const unique = [...new Set(cues.map((c) => c.text).filter((t) => t.trim()))];
    if (unique.length === 0) return {};

    const texts = new Map<string, string>();
    unique.forEach((text, i) => texts.set(`n${i + 1}`, text));

    const result = await service.translate({
      texts,
      sourceLanguage,
      targetLanguage,
      // subtitleKnobs is what routes the service to the subtitle path. We pass
      // knobs so the service builds OUR pre-scan prompt via customSystemPrompt? No —
      // the service builds its OWN subtitle prompt from subtitleKnobs. We need
      // the pre-scan prompt instead, so we pass it as customSystemPrompt AND a
      // flag the service understands. See note below — the service's subtitle
      // branch builds subtitlePrompt, not ours.
      subtitleKnobs: knobs,
      customSystemPrompt: buildPreScanPrompt(targetLanguage, knobs),
    });

    if (!result.success) return {};
    // The response carries properNouns only if the service parsed it. Our
    // prompt's JSON contract asks for {"properNouns": {...}}; the service returns
    // it verbatim when present. Fall back to re-parsing from the raw response
    // (not available here) — result.properNouns is the contract.
    return result.properNouns ?? {};
  } catch {
    return {};
  }
}
```

**IMPORTANT — resolve the prompt-routing question before finalizing this task.** The service's `translate()` builds the subtitle prompt *itself* from `subtitleKnobs` (see `services/openaiCompatible.ts:50-56`), ignoring `customSystemPrompt` on the subtitle path. So `customSystemPrompt` will NOT be used here — the service will build the chunk-translator prompt, not our pre-scan prompt. That breaks the pre-scan (it would ask the model to translate lines, not extract names).

Two clean options — **pick Option A**:

- **Option A (recommended): bypass `service.translate()` and call the provider directly.** Add a thin sibling method or a low-level helper. Simplest: have `preScanNames` build both prompts and call `service.translate` with a *new* request flag. But the smallest, lowest-risk change is: **extend `TranslationRequest` with an optional `preScanSystemPrompt?: string`** — when present, the service uses it verbatim as the system prompt and skips both prompt builders. This is a one-line routing addition in `openaiCompatible.ts` and a clean, explicit seam.

Implement Option A. Update the plan as follows (do this within Task 3):

- [ ] **Step 3a: Extend `TranslationRequest` with `preScanSystemPrompt?`**

Edit `types/translation.ts`, add to the `TranslationRequest` interface (after `rollingGlossaryBlock?`):

```ts
  /** When set, the service uses this string verbatim as the system prompt and
   *  skips both buildSystemPrompt and buildSubtitleSystemPrompt. Used by the
   *  per-film pre-scan (services/subtitleNameScanner.ts) to inject its own
   *  name-extraction prompt. */
  preScanSystemPrompt?: string;
```

- [ ] **Step 3b: Route on `preScanSystemPrompt` first in `openaiCompatible.ts`**

Edit `services/openaiCompatible.ts:50-62`. Replace the `systemPrompt` selection block with a three-way branch where `preScanSystemPrompt` wins:

```ts
      // Prompt routing (highest precedence first):
      //  1. preScanSystemPrompt → use verbatim (per-film name-extraction call).
      //  2. subtitleKnobs       → profile-driven subtitle prompt (customSystemPrompt ignored).
      //  3. (neither)           → web-page prompt, honoring customSystemPrompt.
      const systemPrompt = request.preScanSystemPrompt
        ? request.preScanSystemPrompt
        : request.subtitleKnobs
          ? buildSubtitleSystemPrompt(
              request.targetLanguage,
              request.subtitleKnobs,
              request.glossaryBlock,
              request.rollingGlossaryBlock,
            )
          : buildSystemPrompt(
              request.targetLanguage,
              request.customSystemPrompt,
              request.glossaryBlock,
              request.pageContext,
            );
```

- [ ] **Step 3c: Rewrite `preScanNames` to use `preScanSystemPrompt`**

Replace the `service.translate({...})` call body in `services/subtitleNameScanner.ts` with:

```ts
    const result = await service.translate({
      texts,
      sourceLanguage,
      targetLanguage,
      // Route the service to use OUR pre-scan prompt verbatim (bypasses both
      // the web-page and subtitle prompt builders). See openaiCompatible.ts routing.
      preScanSystemPrompt: buildPreScanPrompt(targetLanguage, knobs),
    });
```

(And remove the `subtitleKnobs` / `customSystemPrompt` fields and the stale comment from the request object.)

Add one more test case to `services/__tests__/subtitleNameScanner.test.ts` to lock the routing in:

```ts
  it('passes preScanSystemPrompt (not subtitleKnobs) on the request', async () => {
    const captured: { req?: unknown } = {};
    const svc = fakeService(okResponse({ A: 'B' }), captured);
    await preScanNames(svc, 'en', 'vi', [cue('Hi')], PROFILE_PRESETS.cinematic);
    const req = captured.req as { preScanSystemPrompt?: string; subtitleKnobs?: unknown };
    expect(req.preScanSystemPrompt).toBeTruthy();
    expect(req.subtitleKnobs).toBeUndefined();
  });
```

- [ ] **Step 4: Run all affected tests to verify they pass**

Run:
```
npx vitest run services/__tests__/subtitleNameScanner.test.ts services/__tests__/openaiCompatible.test.ts
```
Expected: PASS. If `openaiCompatible.test.ts` has a test asserting the old two-way routing, it still passes (web path unchanged; subtitle path unchanged when `preScanSystemPrompt` absent).

- [ ] **Step 5: Commit**

```bash
git add services/subtitleNameScanner.ts services/__tests__/subtitleNameScanner.test.ts \
        types/translation.ts services/openaiCompatible.ts
git commit -m "feat(subtitle): add per-film pre-scan call with dedicated name-extraction prompt"
```

---

### Task 4: Orchestration seam in `handleTranslateSubtitle`

**Files:**
- Modify: `services/background.ts` (in `handleTranslateSubtitle`, ~lines 410-422)
- Test: extend `services/__tests__/background.test.ts`

**Interfaces:**
- Consumes: `contentHash` (`@/lib/subtitleFilmGlossary`), `loadFilmGlossary` / `saveFilmGlossary` (`@/services/filmGlossaryStore`), `preScanNames` (`@/services/subtitleNameScanner`), `mergeProperNouns` (`@/lib/subtitleGlossary`), `PROFILE_PRESETS` (`@/lib/subtitleProfiles`).
- Produces: `handleTranslateSubtitle` now seeds the rolling glossary from the film glossary before chunk 0.

- [ ] **Step 1: Read the current orchestration region**

Read `services/background.ts` lines 385-540 to confirm exact insertion points (imports near top; `profile` resolution ~410; `rollingGlossary = new Map` ~419; first chunk ~537-545). Line numbers may have shifted slightly since the spec; match on the code, not the numbers.

- [ ] **Step 2: Write the failing integration tests**

Append to `services/__tests__/background.test.ts` (or create a focused describe block). These tests mock `preScanNames`, `loadFilmGlossary`, `saveFilmGlossary` and the translation service, then assert ordering + seeding. **Use `vi.mock` for the new modules** so the assertions are deterministic:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMessage } from '../background';

// Storage backing shared by the chrome.storage.local stub.
const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(mockStorage, items); }),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  runtime: { sendMessage: vi.fn().mockResolvedValue(undefined), id: 'test-ext' },
  tabs: { onRemoved: { addListener: vi.fn() }, sendMessage: vi.fn() },
  alarms: { create: vi.fn(), get: vi.fn(), clear: vi.fn(), onAlarm: { addListener: vi.fn(), removeListener: vi.fn() } },
});

vi.mock('@/services/cacheManager', () => ({
  getCachedTranslation: vi.fn().mockResolvedValue(null),
  cacheTranslation: vi.fn().mockResolvedValue(undefined),
  evictCache: vi.fn(),
  clearCache: vi.fn(),
  flushLruUpdates: vi.fn(),
}));
vi.mock('@/services/statsCollector', () => ({
  incrementStats: vi.fn().mockResolvedValue(undefined),
  recordDailyStats: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/debugLog', () => ({ invalidateDebugCache: vi.fn() }));

// Mock the three new modules so we can assert call order without a real LLM.
const preScanNamesMock = vi.fn();
const loadFilmGlossaryMock = vi.fn();
const saveFilmGlossaryMock = vi.fn();
vi.mock('@/services/subtitleNameScanner', () => ({ preScanNames: preScanNamesMock }));
vi.mock('@/services/filmGlossaryStore', () => ({
  loadFilmGlossary: loadFilmGlossaryMock,
  saveFilmGlossary: saveFilmGlossaryMock,
  FILM_GLOSSARY_STORAGE_KEY: 'anyllm-film-glossary',
}));

// Settings the background reads on startup.
mockStorage['anyllm-translate-settings'] = {
  provider: { preset: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'k', model: 'gpt-4' },
  sourceLanguage: 'en', targetLanguage: 'vi', glossary: [], cacheTTLDays: 7, customSystemPrompt: null,
};

const subtitleCues = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ startTime: i, endTime: i + 1, text: `line ${i}` }));

const fakeSender = (tabId = 99) => ({ tab: { id: tabId } }) as chrome.runtime.MessageSender;

/** Make fetch return a canned chunk-translation JSON (no properNouns needed). */
function mockFetchChunkTranslation() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: () => Promise.resolve({
      id: 'x',
      choices: [{ message: { role: 'assistant', content: '{"translations": {"s1": "x"}}' }, finish_reason: 'stop' }],
    }),
    text: () => Promise.resolve(''),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  preScanNamesMock.mockReset();
  loadFilmGlossaryMock.mockReset();
  saveFilmGlossaryMock.mockReset();
});

describe('handleTranslateSubtitle — per-film pre-scan integration', () => {
  it('runs preScanNames on a storage miss and persists the result', async () => {
    loadFilmGlossaryMock.mockResolvedValue(undefined); // miss
    preScanNamesMock.mockResolvedValue({ Dumbledore: 'Phù thủy' });
    mockFetchChunkTranslation();

    const res = await handleMessage({
      action: 'translateSubtitle',
      cues: subtitleCues(3),
      sourceLanguage: 'en', targetLanguage: 'vi',
      profile: 'cinematic',
    } as any, fakeSender());

    expect(res.success).toBe(true);
    expect(preScanNamesMock).toHaveBeenCalledTimes(1);
    expect(saveFilmGlossaryMock).toHaveBeenCalledTimes(1);
    // saveFilmGlossary(hash, glossary)
    expect(saveFilmGlossaryMock.mock.calls[0][1]).toEqual({ Dumbledore: 'Phù thủy' });
  });

  it('skips preScanNames on a storage hit (cache hit)', async () => {
    loadFilmGlossaryMock.mockResolvedValue({ Dumbledore: 'Phù thủy' }); // hit
    mockFetchChunkTranslation();

    const res = await handleMessage({
      action: 'translateSubtitle',
      cues: subtitleCues(3),
      sourceLanguage: 'en', targetLanguage: 'vi',
      profile: 'cinematic',
    } as any, fakeSender());

    expect(res.success).toBe(true);
    expect(preScanNamesMock).not.toHaveBeenCalled();
    expect(saveFilmGlossaryMock).not.toHaveBeenCalled();
  });

  it('degrades gracefully when preScanNames throws (still success)', async () => {
    loadFilmGlossaryMock.mockResolvedValue(undefined);
    preScanNamesMock.mockRejectedValue(new Error('network down'));
    mockFetchChunkTranslation();

    const res = await handleMessage({
      action: 'translateSubtitle',
      cues: subtitleCues(3),
      sourceLanguage: 'en', targetLanguage: 'vi',
      profile: 'cinematic',
    } as any, fakeSender());

    expect(res.success).toBe(true);
    // On failure we do not persist.
    expect(saveFilmGlossaryMock).not.toHaveBeenCalled();
  });

  it('does not touch film-glossary storage on the web translate path', async () => {
    mockFetchChunkTranslation();
    await handleMessage({
      action: 'translate',
      pieces: [{ id: 'p1', text: 'hello' }],
      sourceLanguage: 'en', targetLanguage: 'vi',
    } as any, fakeSender());
    expect(loadFilmGlossaryMock).not.toHaveBeenCalled();
    expect(preScanNamesMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run services/__tests__/background.test.ts`
Expected: FAIL — `preScanNames` never called / `saveFilmGlossary` never called (because the orchestration isn't wired yet). The "cache hit" and "web path" tests may already pass trivially.

- [ ] **Step 4: Implement the orchestration seam**

In `services/background.ts`:

**4a. Add imports** (near the other `@/` imports at the top):

```ts
import { contentHash } from '@/lib/subtitleFilmGlossary';
import { loadFilmGlossary, saveFilmGlossary } from '@/services/filmGlossaryStore';
import { preScanNames } from '@/services/subtitleNameScanner';
import { mergeProperNouns } from '@/lib/subtitleGlossary';
```

(Check `mergeProperNouns` isn't already imported — it is used at `background.ts:524`. If so, do not re-import; reuse.)

**4b. Insert the pre-scan block** in `handleTranslateSubtitle`, right after `subtitleKnobs` is resolved (the `const subtitleKnobs: ProfileKnobs = ...` line) and BEFORE `const CONTEXT_SIZE = 3;`:

```ts
    // Per-film proper-noun glossary: load by content hash, or pre-scan once and
    // persist. Seeds the rolling glossary so chunk 0 translates with the full
    // name list. Every failure degrades to an empty seed — translation proceeds.
    const filmHash = await contentHash(cues);
    let filmGlossary: Record<string, string> | undefined;
    try {
      filmGlossary = await loadFilmGlossary(filmHash);
      if (!filmGlossary) {
        filmGlossary = await preScanNames(service, sourceLanguage, targetLanguage, cues, subtitleKnobs);
        if (filmGlossary && Object.keys(filmGlossary).length > 0) {
          await saveFilmGlossary(filmHash, filmGlossary);
        }
      }
    } catch {
      filmGlossary = undefined;
    }
```

**4c. Seed the rolling glossary.** Find `const rollingGlossary = new Map<string, string>();` and replace with a seed through `mergeProperNouns` (so the `MAX_ROLLING_GLOSSARY` cap is enforced uniformly):

```ts
    // Per-session rolling proper-noun glossary. Seeded from the film glossary
    // (pre-scan or persisted) so chunk 0 starts with every known name. Seeding
    // through mergeProperNouns enforces MAX_ROLLING_GLOSSARY uniformly.
    const rollingGlossary = new Map<string, string>();
    if (filmGlossary) {
      mergeProperNouns(rollingGlossary, filmGlossary);
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run services/__tests__/background.test.ts`
Expected: PASS — all four new integration tests green. The first test asserts `preScanNames` was called once and `saveFilmGlossary` got the extracted names.

- [ ] **Step 6: Commit**

```bash
git add services/background.ts services/__tests__/background.test.ts
git commit -m "feat(subtitle): wire per-film pre-scan + film-glossary seed into handleTranslateSubtitle"
```

---

### Task 5: Chunk-0 seeding regression test

**Files:**
- Test only: extend `services/__tests__/background.test.ts`

This is the headline correctness assertion from the spec: chunk 0's `rollingGlossaryBlock` contains a name from the pre-scan result.

- [ ] **Step 1: Write the failing test**

Append to the `describe('handleTranslateSubtitle — per-film pre-scan integration', ...)` block in `services/__tests__/background.test.ts`:

```ts
  it('seeds chunk 0 with film-glossary names (rollingGlossaryBlock carries a name)', async () => {
    // Capture the chunk-0 service.translate call (the real OpenAICompatibleService
    // is used; we inspect fetch's request body for the system prompt).
    const fetched: { body?: string } = {};
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      if (init?.body) fetched.body = init.body;
      return {
        ok: true, status: 200,
        json: () => Promise.resolve({
          id: 'x',
          choices: [{ message: { role: 'assistant', content: '{"translations": {"s1": "x"}}' }, finish_reason: 'stop' }],
        }),
        text: () => Promise.resolve(''),
      };
    }));

    loadFilmGlossaryMock.mockResolvedValue(undefined); // miss → pre-scan
    preScanNamesMock.mockResolvedValue({ Dumbledore: 'Phù thủy' });

    await handleMessage({
      action: 'translateSubtitle',
      cues: subtitleCues(3),
      sourceLanguage: 'en', targetLanguage: 'vi',
      profile: 'cinematic',
    } as any, fakeSender());

    // The chunk-0 system prompt must contain the seeded name.
    expect(fetched.body).toContain('Dumbledore');
    expect(fetched.body).toContain('Phù thủy');
  });
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run services/__tests__/background.test.ts -t "seeds chunk 0"`
Expected: PASS (Task 4 already wired the seed; this test locks it in as a regression guard). If it FAILS, the seed isn't reaching the chunk-0 prompt — re-check Task 4 step 4c and the `rollingGlossaryBlock` wiring in `translateChunk` (`background.ts:483`).

- [ ] **Step 3: Commit**

```bash
git add services/__tests__/background.test.ts
git commit -m "test(subtitle): assert chunk 0 prompt carries seeded film-glossary names"
```

---

### Task 6: Toast copy during pre-scan (`content/subtitleCoordinator.ts`)

**Files:**
- Modify: `content/subtitleCoordinator.ts` (toast near line 303)

**Interfaces:** none new — purely cosmetic copy. No message-field changes (content hash is derived in the background).

- [ ] **Step 1: Read the current toast site**

Read `content/subtitleCoordinator.ts` around line 303 (`showSubtitleToast('Translating subtitles progressively...', true);`) and the failure branch (~317-323) to match surrounding copy style.

- [ ] **Step 2: Edit the toast copy**

The pre-scan is invisible to the content script (it happens in the background before the response returns). The only observable effect is added latency on first-ever viewing. Update the toast to set expectations without inventing background state. Replace:

```ts
    showSubtitleToast('Translating subtitles progressively...', true);
```

with:

```ts
    // On first-ever viewing of a film, the background runs a one-time name
    // pre-scan before chunk 0 (cached thereafter). The toast copy reflects the
    // possible brief delay without leaking background internals.
    showSubtitleToast('Preparing subtitles (indexing names on first view)...', true);
```

- [ ] **Step 3: Update any existing test that asserts the old toast string**

Search the content tests for the old string and update expectations:

Run: `grep -rn "Translating subtitles progressively" content/__tests__/`

For each match, update the expected string to the new copy (or relax the assertion to a substring like `'Preparing subtitles'` if the test only cares that *a* toast fired).

- [ ] **Step 4: Run the affected tests**

Run: `npx vitest run content/__tests__/subtitleCoordinator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add content/subtitleCoordinator.ts content/__tests__/subtitleCoordinator.test.ts
git commit -m "feat(subtitle): reflect name-indexing phase in subtitle toast copy"
```

---

## Self-Review

**1. Spec coverage** — every spec requirement maps to a task:
- Content-hash canonicalization (Component A) → Task 1 ✓
- Film-glossary storage (Component C) → Task 2 ✓
- Pre-scan call + prompt (Component B) → Task 3 ✓
- Orchestration seam + seed via `mergeProperNouns` (Component D) → Task 4 ✓
- Chunk-0 seeding correctness (Success criteria) → Task 5 ✓
- Toast copy (Component E) → Task 6 ✓
- Graceful degradation (Error handling) → Task 3 (pre-scan returns `{}`), Task 4 (try/catch around load/pre-scan/save), Task 2 (storage never throws) ✓
- Cache-poison avoidance → enforced by `mergeProperNouns` last-write-wins, locked by Task 4's seed-via-merge ✓
- Web-page path untouched → Task 4 has an explicit regression test ✓
- Separate namespace → Task 2 uses `anyllm-film-glossary`, distinct from `STORAGE_KEYS` ✓
- No prompt edit to `subtitlePrompt.ts` → the film glossary enters via the existing `rollingGlossaryBlock` slot; Task 3 adds a *new* prompt only for the pre-scan call, leaving the chunk prompt untouched ✓

**2. Placeholder scan** — no TBD/TODO/"implement later". Task 3 contains an inline design note (the prompt-routing question) that is resolved within the same task (Option A), not left as a placeholder. All code blocks are complete.

**3. Type consistency** — checked:
- `preScanNames(service, sourceLanguage, targetLanguage, cues, knobs)` — signature identical in Task 3 (def) and Task 4 (call) ✓
- `loadFilmGlossary(hash)` / `saveFilmGlossary(hash, glossary)` — identical in Task 2 (def) and Task 4 (call) ✓
- `contentHash(cues)` — identical in Task 1 (def) and Task 4 (call) ✓
- `preScanSystemPrompt?: string` — added to `TranslationRequest` in Task 3a, consumed in Task 3c and routed in Task 3b ✓
- `FILM_GLOSSARY_STORAGE_KEY = 'anyllm-film-glossary'` — defined in Task 2, asserted in Task 2 test, used as the storage key in Task 2 implementation ✓

No issues found. Plan is ready.
