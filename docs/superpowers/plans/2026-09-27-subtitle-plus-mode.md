# Subtitle Plus Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in subtitle translation mode that freezes one terminology set before translating, translates chunks in parallel against it, and reveals nothing until the whole track completes — without changing progressive behavior.

**Architecture:** Three phases per run — preflight (load-or-pre-scan a scoped film glossary), translate (worker pool over the existing chunk translator, configured for the Plus cache identity and the frozen block), commit (one terminal message that triggers native-caption blanking, renderer attach, and cue publication). Progressive and Plus never share a storage namespace, a cache key, a prompt slot, or a message payload; the progressive call sites keep their current arguments.

**Tech Stack:** TypeScript 5.9, WXT (MV3), React 19 (options page), plain DOM (content script), Vitest 3, Chrome extension APIs (`chrome.storage`, `chrome.runtime`, `chrome.tabs`).

**Spec:** `docs/superpowers/specs/2026-09-27-subtitle-plus-mode-design.md`

## Global Constraints

- **The progressive path must stay byte-for-byte unaffected**: identical storage keys read/written, identical cache keys, identical system-prompt string, identical message payloads, identical chunk ordering. Every task that touches shared code proves this with a test.
- **Absent means progressive.** `translationMode` absent/undefined → `'progressive'` everywhere (settings, message, resolver).
- Plus writes only to its own namespaces: storage key `anyllm-film-glossary-scoped`, cache prefix `subtitle-plus:`.
- Plus never merges per-chunk `properNouns` forward; the frozen set is authoritative for the run.
- Never silently claim Plus is active: every downgrade carries a machine-readable reason and surfaces a notice.
- No new npm dependencies. No changes to profiles, knobs, timing adaptation, line wrapping, the web-page path, or the PDF path.
- Commit per task with a Conventional Commits message. **Never `git push`.** Do not stage `.beads/embeddeddolt/`, `.beads/dolt/`, or `.beads/backup/`.
- Verification commands: `pnpm vitest run <path>` for a single file, `pnpm test:fast` for the lib+unit gate, `pnpm test` for the full suite (~40s), `pnpm compile` for `tsc --noEmit`.

## Out of scope

- The spec's §Evaluation (paired default-vs-Plus comparison) gates the *deferred* phases — the style brief and the review checkpoint. Do not build either here.
- The three pre-existing defects (`AnyLLMTranslate-d16`, `AnyLLMTranslate-7va`, `AnyLLMTranslate-7dr`) are deliberately not fixed. Plus scopes its own keys so it is correct without them.

---

### Task 1: Settings, message contract, and mode resolution

**Files:**
- Modify: `types/config.ts` (add `SubtitleTranslationMode`, two optional `SubtitleSettings` fields, one default)
- Modify: `types/messages.ts` (two optional request fields, two push message interfaces)
- Create: `lib/subtitlePlusEligibility.ts` (mode resolver only in this task)
- Test: `lib/__tests__/subtitlePlusEligibility.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `SubtitleTranslationMode`, `SubtitleSettings.translationMode`, `SubtitleSettings.plusHintDismissed`, `TranslateSubtitleMessage.translationMode`, `TranslateSubtitleMessage.completeTrack`, `SubtitlePlusProgressMessage`, `SubtitlePlusCompleteMessage`, `resolveSubtitleTranslationMode(settingsMode, override): SubtitleTranslationMode`.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/subtitlePlusEligibility.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SUBTITLE_SETTINGS, type SubtitleTranslationMode } from '@/types/config';
import { resolveSubtitleTranslationMode } from '@/lib/subtitlePlusEligibility';

describe('subtitle plus mode resolution', () => {
  it('defaults to progressive', () => {
    expect(DEFAULT_SUBTITLE_SETTINGS.translationMode).toBe('progressive');
    expect(DEFAULT_SUBTITLE_SETTINGS.plusHintDismissed).toBeUndefined();
  });

  it('treats an absent settings value as progressive', () => {
    expect(resolveSubtitleTranslationMode(undefined, undefined)).toBe('progressive');
  });

  it('lets the per-session override win over the settings value', () => {
    expect(resolveSubtitleTranslationMode('progressive', 'plus')).toBe('plus');
    expect(resolveSubtitleTranslationMode('plus', 'progressive')).toBe('progressive');
  });

  it('uses the settings value when no override is active', () => {
    const mode: SubtitleTranslationMode = 'plus';
    expect(resolveSubtitleTranslationMode(mode, undefined)).toBe('plus');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/__tests__/subtitlePlusEligibility.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/subtitlePlusEligibility"`.

- [ ] **Step 3: Add the settings type and default**

In `types/config.ts`, immediately before `export interface SubtitleSettings {` (line 465), add:

```ts
/**
 * Subtitle translation mode.
 * - 'progressive' (default): chunk 0 renders immediately, the rest stream in.
 * - 'plus': freeze one terminology set, translate in parallel, reveal on
 *   completion. Only applies to sources that hand over the complete track.
 * Absent/undefined always means 'progressive'.
 */
export type SubtitleTranslationMode = 'progressive' | 'plus';
```

Inside `SubtitleSettings`, after the `youtubeAsrResegment?: YoutubeAsrResegmentSettings;` field (line 509), add:

```ts
  /**
   * Whole-track quality mode for sources that provide the complete track at
   * activation. Undefined means 'progressive' (pre-Plus behaviour).
   */
  translationMode?: SubtitleTranslationMode;
  /** One-time Plus discoverability hint dismissal (absent = not dismissed). */
  plusHintDismissed?: boolean;
```

In `DEFAULT_SUBTITLE_SETTINGS` (line 795), after `youtubeAsrResegment: { ...DEFAULT_YOUTUBE_ASR_RESEGMENT_SETTINGS },` (line 811), add:

```ts
  translationMode: 'progressive',
```

- [ ] **Step 4: Add the message fields and push messages**

In `types/messages.ts`, inside `TranslateSubtitleMessage` (line 143), after `skipFilmPreScan?: boolean;` (line 161), add:

```ts
  /** Requested translation mode. Absent means 'progressive'. The background
   *  validates eligibility and may downgrade — it never trusts this alone. */
  translationMode?: SubtitleTranslationMode;
  /** Set only by the full-file activation path: the caller is handing over the
   *  complete track. Delta paths (manifest/DOM/MSE) never set this. */
  completeTrack?: boolean;
```

Add the type import at the top of `types/messages.ts` (merge with the existing `@/types/config` import if one is present, otherwise add):

```ts
import type { SubtitleTranslationMode } from '@/types/config';
```

After `SubtitleChunkFailedMessage` (line 244), add:

```ts
/** Plus mode: run progress (counts only — never cue data). */
export interface SubtitlePlusProgressMessage {
  action: 'SUBTITLE_PLUS_PROGRESS';
  sessionId: number;
  phase: 'translating';
  completedChunks: number;
  totalChunks: number;
}

/** Plus mode: terminal message, always sent so the coordinator is never left
 *  waiting. 'failed' means every chunk failed — keep original captions. */
export interface SubtitlePlusCompleteMessage {
  action: 'SUBTITLE_PLUS_COMPLETE';
  sessionId: number;
  outcome: 'complete' | 'failed';
  cues: SubtitleCue[];
  partial: boolean;
  failedChunkIndices: number[];
}
```

- [ ] **Step 5: Create the mode resolver**

Create `lib/subtitlePlusEligibility.ts`:

```ts
/**
 * Plus-mode decision helpers — PURE module (no I/O, no DOM).
 *
 * Plus is an opt-in whole-track mode for sources that hand over the complete
 * track at activation. Everything here is a pure decision so it can be tested
 * without a browser: mode resolution, eligibility, and the one-time hint.
 *
 * See docs/superpowers/specs/2026-09-27-subtitle-plus-mode-design.md.
 */

import type { SubtitleTranslationMode } from '@/types/config';

/** Effective mode: per-session override > settings value > 'progressive'. */
export function resolveSubtitleTranslationMode(
  settingsMode: SubtitleTranslationMode | undefined,
  override: SubtitleTranslationMode | undefined,
): SubtitleTranslationMode {
  return override ?? settingsMode ?? 'progressive';
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run lib/__tests__/subtitlePlusEligibility.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Typecheck and commit**

```bash
pnpm compile
git add types/config.ts types/messages.ts lib/subtitlePlusEligibility.ts lib/__tests__/subtitlePlusEligibility.test.ts
git commit -m "feat(subtitles): add Plus translation mode setting and message contract"
```

---

### Task 2: Scoped film-glossary key and storage

**Files:**
- Modify: `lib/subtitleFilmGlossary.ts` (add `scopedFilmGlossaryKey`)
- Modify: `services/filmGlossaryStore.ts` (add scoped namespace load/save)
- Test: `lib/__tests__/subtitleFilmGlossary.test.ts` (new file)
- Test: `services/__tests__/filmGlossaryStore.test.ts` (new file)

**Interfaces:**
- Consumes: `hashKnobs` from `lib/subtitleCacheKey.ts`; existing `contentHash`.
- Produces: `scopedFilmGlossaryKey(contentHash: string, targetLanguage: string, knobs: ProfileKnobs): string`; `SCOPED_FILM_GLOSSARY_STORAGE_KEY`; `loadScopedFilmGlossary(key: string): Promise<Record<string, string> | undefined>`; `saveScopedFilmGlossary(key: string, glossary: Record<string, string>): Promise<void>`.

- [ ] **Step 1: Write the failing key test**

Create `lib/__tests__/subtitleFilmGlossary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { canonicalizeCueCorpus, contentHash, scopedFilmGlossaryKey } from '@/lib/subtitleFilmGlossary';
import type { ProfileKnobs } from '@/lib/subtitleProfiles';
import type { SubtitleCue } from '@/types/subtitle';

const KNOBS: ProfileKnobs = {
  register: 'neutral',
  faithfulness: 'balanced',
  brevity: 'moderate',
  profanity: 'preserve',
};

const CUES: SubtitleCue[] = [
  { startTime: 0, endTime: 2, text: 'Alice meets the Rabbit' },
  { startTime: 2, endTime: 4, text: 'Alice meets the Rabbit' },
];

describe('film glossary canonicalization', () => {
  it('is order-insensitive and dedupes', () => {
    const reordered: SubtitleCue[] = [
      { startTime: 4, endTime: 6, text: 'alice meets the rabbit ' },
      { startTime: 0, endTime: 2, text: 'Alice meets the Rabbit' },
    ];
    expect(canonicalizeCueCorpus(reordered)).toBe(canonicalizeCueCorpus(CUES));
  });
});

describe('scopedFilmGlossaryKey', () => {
  it('is stable for the same corpus, language, and knobs', async () => {
    const hash = await contentHash(CUES);
    expect(scopedFilmGlossaryKey(hash, 'vi', KNOBS)).toBe(scopedFilmGlossaryKey(hash, 'vi', KNOBS));
  });

  it('changes when the target language changes', async () => {
    const hash = await contentHash(CUES);
    expect(scopedFilmGlossaryKey(hash, 'vi', KNOBS)).not.toBe(scopedFilmGlossaryKey(hash, 'ja', KNOBS));
  });

  it('changes when a knob changes', async () => {
    const hash = await contentHash(CUES);
    const literal = { ...KNOBS, faithfulness: 'literal' as const };
    expect(scopedFilmGlossaryKey(hash, 'vi', KNOBS)).not.toBe(scopedFilmGlossaryKey(hash, 'vi', literal));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/__tests__/subtitleFilmGlossary.test.ts`
Expected: FAIL — `scopedFilmGlossaryKey is not a function`.

- [ ] **Step 3: Implement the scoped key**

In `lib/subtitleFilmGlossary.ts`, add the import after the existing `SubtitleCue` type import:

```ts
import type { ProfileKnobs } from '@/lib/subtitleProfiles';
import { hashKnobs } from '@/lib/subtitleCacheKey';
```

Append at the end of the file:

```ts
/**
 * Storage key for a film glossary scoped to everything the pre-scan output
 * depends on: the corpus hash, the target language, and the resolved knobs.
 * Deliberately NOT the unscoped `contentHash` the progressive path uses —
 * a glossary extracted for one target language must never seed another.
 */
export function scopedFilmGlossaryKey(
  contentHash: string,
  targetLanguage: string,
  knobs: ProfileKnobs,
): string {
  return `${contentHash}:${targetLanguage}:${hashKnobs(knobs)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/__tests__/subtitleFilmGlossary.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing store test**

Create `services/__tests__/filmGlossaryStore.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FILM_GLOSSARY_STORAGE_KEY,
  SCOPED_FILM_GLOSSARY_STORAGE_KEY,
  loadFilmGlossary,
  loadScopedFilmGlossary,
  saveFilmGlossary,
  saveScopedFilmGlossary,
} from '@/services/filmGlossaryStore';

const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
    },
  },
});

describe('film glossary store', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  });

  it('round-trips a scoped glossary under its own namespace', async () => {
    await saveScopedFilmGlossary('hash:vi:knobs', { Alice: 'A-lít' });
    expect(await loadScopedFilmGlossary('hash:vi:knobs')).toEqual({ Alice: 'A-lít' });
    // Scoped writes never touch the progressive namespace.
    expect(mockStorage[FILM_GLOSSARY_STORAGE_KEY]).toBeUndefined();
    expect(mockStorage[SCOPED_FILM_GLOSSARY_STORAGE_KEY]).toEqual({
      'hash:vi:knobs': { Alice: 'A-lít' },
    });
  });

  it('misses for an unknown scoped key', async () => {
    expect(await loadScopedFilmGlossary('nope')).toBeUndefined();
  });

  it('leaves the unscoped namespace untouched by scoped writes', async () => {
    await saveFilmGlossary('plain', { Bob: 'Bóp' });
    await saveScopedFilmGlossary('scoped', { Alice: 'A-lít' });
    expect(await loadFilmGlossary('plain')).toEqual({ Bob: 'Bóp' });
    expect(await loadFilmGlossary('scoped')).toBeUndefined();
  });

  it('never throws when storage fails', async () => {
    const get = chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>;
    get.mockRejectedValueOnce(new Error('quota'));
    expect(await loadScopedFilmGlossary('x')).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm vitest run services/__tests__/filmGlossaryStore.test.ts`
Expected: FAIL — `SCOPED_FILM_GLOSSARY_STORAGE_KEY` is not exported.

- [ ] **Step 7: Implement the scoped store functions**

In `services/filmGlossaryStore.ts`, after `export const FILM_GLOSSARY_STORAGE_KEY = 'anyllm-film-glossary';` (line 14), add:

```ts
/** Plus-mode namespace. Separate from the progressive namespace so neither mode
 *  can read or overwrite the other's entries. */
export const SCOPED_FILM_GLOSSARY_STORAGE_KEY = 'anyllm-film-glossary-scoped';
```

Append at the end of the file:

```ts
/** Load a Plus-mode film glossary by its scoped key.
 *  Returns undefined on miss OR on any storage error (never throws). */
export async function loadScopedFilmGlossary(
  key: string,
): Promise<Record<string, string> | undefined> {
  try {
    const result = await chrome.storage.local.get(SCOPED_FILM_GLOSSARY_STORAGE_KEY);
    const all = result[SCOPED_FILM_GLOSSARY_STORAGE_KEY] as FilmGlossaryMap | undefined;
    return all?.[key];
  } catch {
    return undefined;
  }
}

/** Persist a Plus-mode film glossary by its scoped key. Overwrites. Never throws. */
export async function saveScopedFilmGlossary(
  key: string,
  glossary: Record<string, string>,
): Promise<void> {
  try {
    const result = await chrome.storage.local.get(SCOPED_FILM_GLOSSARY_STORAGE_KEY);
    const all = (result[SCOPED_FILM_GLOSSARY_STORAGE_KEY] as FilmGlossaryMap | undefined) ?? {};
    all[key] = glossary;
    await chrome.storage.local.set({ [SCOPED_FILM_GLOSSARY_STORAGE_KEY]: all });
  } catch {
    // Degrade silently: no persistence this session.
  }
}
```

- [ ] **Step 8: Run both test files**

Run: `pnpm vitest run lib/__tests__/subtitleFilmGlossary.test.ts services/__tests__/filmGlossaryStore.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 9: Commit**

```bash
git add lib/subtitleFilmGlossary.ts services/filmGlossaryStore.ts lib/__tests__/subtitleFilmGlossary.test.ts services/__tests__/filmGlossaryStore.test.ts
git commit -m "feat(subtitles): add scoped film-glossary key and storage namespace for Plus"
```

---

### Task 3: Plus cache identity

**Files:**
- Modify: `lib/subtitleCacheKey.ts` (add `PlusGlossarySnapshot`, `hashPlusGlossary`, `generateSubtitlePlusCacheKey`)
- Test: `lib/__tests__/subtitlePlusCacheKey.test.ts` (new file)

**Interfaces:**
- Consumes: `hashKnobs` (already in the file), `ProfileKnobs`.
- Produces: `PlusGlossarySnapshot`, `hashPlusGlossary(snapshot): string`, `generateSubtitlePlusCacheKey(text, sourceLanguage, targetLanguage, knobs, snapshot): Promise<string>`.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/subtitlePlusCacheKey.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  generateSubtitleCacheKey,
  generateSubtitlePlusCacheKey,
  hashGlossary,
  type GlossarySnapshot,
  type PlusGlossarySnapshot,
} from '@/lib/subtitleCacheKey';
import type { ProfileKnobs } from '@/lib/subtitleProfiles';

const KNOBS: ProfileKnobs = {
  register: 'neutral',
  faithfulness: 'balanced',
  brevity: 'moderate',
  profanity: 'preserve',
};

const PLUS_SNAPSHOT: PlusGlossarySnapshot = {
  globalEntries: [{ source: 'Rabbit', target: 'Con thỏ' }],
  namedListId: 'cast',
  namedListEntries: [{ source: 'Alice', target: 'A-lít' }],
  frozenPairs: [{ source: 'Dumbledore', target: 'Cụ Dumbledore' }],
};

describe('generateSubtitlePlusCacheKey', () => {
  it('is deterministic', async () => {
    const a = await generateSubtitlePlusCacheKey('hello', 'en', 'vi', KNOBS, PLUS_SNAPSHOT);
    const b = await generateSubtitlePlusCacheKey('hello', 'en', 'vi', KNOBS, PLUS_SNAPSHOT);
    expect(a).toBe(b);
  });

  it('changes when a frozen target changes', async () => {
    const changed: PlusGlossarySnapshot = {
      ...PLUS_SNAPSHOT,
      frozenPairs: [{ source: 'Dumbledore', target: 'Thầy Dumbledore' }],
    };
    const a = await generateSubtitlePlusCacheKey('hello', 'en', 'vi', KNOBS, PLUS_SNAPSHOT);
    const b = await generateSubtitlePlusCacheKey('hello', 'en', 'vi', KNOBS, changed);
    expect(a).not.toBe(b);
  });

  it('never collides with the progressive key for the same inputs', async () => {
    const progressiveSnapshot: GlossarySnapshot = {
      globalEntries: PLUS_SNAPSHOT.globalEntries,
      properNouns: ['Dumbledore'],
      namedListId: PLUS_SNAPSHOT.namedListId,
      namedListEntries: PLUS_SNAPSHOT.namedListEntries,
    };
    const plus = await generateSubtitlePlusCacheKey('hello', 'en', 'vi', KNOBS, PLUS_SNAPSHOT);
    const progressive = await generateSubtitleCacheKey('hello', 'en', 'vi', KNOBS, progressiveSnapshot);
    expect(plus).not.toBe(progressive);
  });

  it('keeps the progressive glossary hash shape unchanged', () => {
    const snapshot: GlossarySnapshot = { globalEntries: [], properNouns: ['Alice'] };
    expect(hashGlossary(snapshot)).toBe(hashGlossary({ globalEntries: [], properNouns: ['Alice'] }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/__tests__/subtitlePlusCacheKey.test.ts`
Expected: FAIL — `generateSubtitlePlusCacheKey` is not exported.

- [ ] **Step 3: Implement the Plus snapshot and key**

In `lib/subtitleCacheKey.ts`, after the `GlossarySnapshot` interface (line 23), add:

```ts
/**
 * Plus-mode glossary snapshot. Unlike the progressive snapshot, proper nouns
 * are hashed as source→target PAIRS, because the frozen target is what Plus
 * guarantees; a changed mapping must invalidate.
 */
export interface PlusGlossarySnapshot {
  globalEntries: Array<{ source: string; target: string }>;
  namedListId?: string | null;
  namedListEntries?: Array<{ source: string; target: string }>;
  frozenPairs: Array<{ source: string; target: string }>;
}
```

After `hashGlossary` (line 63), add:

```ts
/** Stable hex hash of a Plus glossary snapshot. Pairs are sorted by source then
 *  target so entry order does not affect the key. */
export function hashPlusGlossary(snapshot: PlusGlossarySnapshot): string {
  const pairs = (entries: Array<{ source: string; target: string }>) =>
    [...entries]
      .sort((a, b) =>
        a.source < b.source ? -1 : a.source > b.source ? 1 : a.target < b.target ? -1 : a.target > b.target ? 1 : 0,
      )
      .map((e) => `${e.source}=>${e.target}`)
      .join(';');
  return fnv1aHex(
    `${pairs(snapshot.globalEntries)}|${pairs(snapshot.frozenPairs)}|${snapshot.namedListId ?? ''}|${pairs(snapshot.namedListEntries ?? [])}`,
  );
}
```

After `generateSubtitleCacheKey` (line 78), add:

```ts
/**
 * Full Plus cache key: SHA-256('subtitle-plus:' + src + ':' + tgt + ':' + text
 * + ':' + knobsHash + ':' + glossaryHash). The `subtitle-plus:` namespace
 * guarantees Plus and progressive entries never collide, so the progressive
 * keys stay byte-identical to before.
 */
export async function generateSubtitlePlusCacheKey(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  knobs: ProfileKnobs,
  glossarySnapshot: PlusGlossarySnapshot,
): Promise<string> {
  const knobsHash = hashKnobs(knobs);
  const glossaryHash = hashPlusGlossary(glossarySnapshot);
  const input = `subtitle-plus:${sourceLanguage}:${targetLanguage}:${text}:${knobsHash}:${glossaryHash}`;
  return sha256Hex(input);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/__tests__/subtitlePlusCacheKey.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/subtitleCacheKey.ts lib/__tests__/subtitlePlusCacheKey.test.ts
git commit -m "feat(subtitles): add Plus cache identity with source-target pairs"
```

---

### Task 4: Frozen glossary formatter and prompt slot

**Files:**
- Modify: `lib/subtitleGlossary.ts` (add `formatFrozenGlossary`)
- Modify: `types/translation.ts` (add `frozenGlossaryBlock`)
- Modify: `services/subtitlePrompt.ts` (add the 6th parameter + Part C4)
- Modify: `services/openaiCompatible.ts` (pass the 6th argument)
- Test: `lib/__tests__/subtitlePlusFrozenGlossary.test.ts` (new file)
- Test: `services/__tests__/subtitlePlusPrompt.test.ts` (new file)

**Interfaces:**
- Consumes: `ProfileKnobs`, `PROFILE_PRESETS` (tests).
- Produces: `formatFrozenGlossary(frozen: Record<string, string>): string`; `TranslationRequest.frozenGlossaryBlock?: string`; `buildSubtitleSystemPrompt(targetLanguage, knobs, glossaryBlock?, rollingGlossaryBlock?, namedListGlossaryBlock?, frozenGlossaryBlock?)`.

- [ ] **Step 1: Write the failing formatter test**

Create `lib/__tests__/subtitlePlusFrozenGlossary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatFrozenGlossary } from '@/lib/subtitleGlossary';

describe('formatFrozenGlossary', () => {
  it('returns an empty string for an empty set', () => {
    expect(formatFrozenGlossary({})).toBe('');
  });

  it('formats one line per pair with the frozen copy', () => {
    expect(formatFrozenGlossary({ Alice: 'A-lít', Rabbit: 'Con thỏ' })).toBe(
      'Frozen terminology for this track (use these consistently):\n- "Alice" → "A-lít"\n- "Rabbit" → "Con thỏ"',
    );
  });

  it('skips blank sources and targets', () => {
    expect(formatFrozenGlossary({ ' ': 'x', Alice: '' })).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/__tests__/subtitlePlusFrozenGlossary.test.ts`
Expected: FAIL — `formatFrozenGlossary` is not exported.

- [ ] **Step 3: Implement the formatter**

Append to `lib/subtitleGlossary.ts`:

```ts
/** Format a frozen terminology set for prompt injection. Returns '' when empty.
 *  Distinct copy from the rolling glossary: these terms were decided before
 *  translation began, not accumulated from earlier chunks. */
export function formatFrozenGlossary(frozen: Record<string, string>): string {
  const entries = Object.entries(frozen).filter(([source, target]) => source.trim() && target.trim());
  if (entries.length === 0) return '';
  const lines = entries.map(([source, target]) => `- "${source}" → "${target}"`);
  return `Frozen terminology for this track (use these consistently):\n${lines.join('\n')}`;
}
```

- [ ] **Step 4: Write the failing prompt test**

Create `services/__tests__/subtitlePlusPrompt.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildSubtitleSystemPrompt } from '@/services/subtitlePrompt';
import { PROFILE_PRESETS } from '@/lib/subtitleProfiles';

const KNOBS = PROFILE_PRESETS.media;
const FROZEN = 'Frozen terminology for this track (use these consistently):\n- "Alice" → "A-lít"';
const ROLLING = 'Previously translated names in this content (use these consistently):\n- "Bob" → "Bóp"';

describe('buildSubtitleSystemPrompt frozen slot', () => {
  it('omits the frozen block when not provided (progressive path unchanged)', () => {
    const prompt = buildSubtitleSystemPrompt('vi', KNOBS, undefined, ROLLING);
    expect(prompt).not.toContain('Frozen terminology');
  });

  it('places the frozen block after the rolling block and before the JSON contract', () => {
    const prompt = buildSubtitleSystemPrompt('vi', KNOBS, undefined, ROLLING, undefined, FROZEN);
    expect(prompt).toContain(FROZEN);
    expect(prompt.indexOf(FROZEN)).toBeGreaterThan(prompt.indexOf(ROLLING));
    expect(prompt.indexOf(FROZEN)).toBeLessThan(prompt.indexOf('Respond ONLY with valid JSON'));
  });

  it('produces an identical string for the 5-argument call', () => {
    const five = buildSubtitleSystemPrompt('vi', KNOBS, 'G', ROLLING, 'N');
    const six = buildSubtitleSystemPrompt('vi', KNOBS, 'G', ROLLING, 'N', undefined);
    expect(six).toBe(five);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm vitest run services/__tests__/subtitlePlusPrompt.test.ts`
Expected: FAIL — the frozen block is absent from the prompt.

- [ ] **Step 6: Add the request field and the prompt slot**

In `types/translation.ts`, after `rollingGlossaryBlock?: string;` (line 64), add:

```ts
  /** Frozen terminology block for Plus mode. Injected after the rolling
   *  glossary block. Progressive requests never set it. */
  frozenGlossaryBlock?: string;
```

In `services/subtitlePrompt.ts`, extend the signature (line 53):

```ts
export function buildSubtitleSystemPrompt(
  targetLanguage: string,
  knobs: ProfileKnobs,
  glossaryBlock?: string,
  rollingGlossaryBlock?: string,
  namedListGlossaryBlock?: string,
  frozenGlossaryBlock?: string,
): string {
```

Immediately after the Part C3 block (`if (rollingGlossaryBlock) { ... }`) and before `// Part D — JSON contract.`, add:

```ts
  // Part C4 — frozen terminology (Plus mode only). Injected after the rolling
  // glossary because it is authoritative for the run, not accumulated.
  if (frozenGlossaryBlock) {
    prompt += '\n\n' + frozenGlossaryBlock;
  }
```

In `services/openaiCompatible.ts`, in the `buildSubtitleSystemPrompt` call (line 160), add the sixth argument:

```ts
        ? buildSubtitleSystemPrompt(
            request.targetLanguage,
            request.subtitleKnobs,
            request.glossaryBlock,
            request.rollingGlossaryBlock,
            request.namedListGlossaryBlock,
            request.frozenGlossaryBlock,
          )
```

- [ ] **Step 7: Run both test files**

Run: `pnpm vitest run lib/__tests__/subtitlePlusFrozenGlossary.test.ts services/__tests__/subtitlePlusPrompt.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 8: Commit**

```bash
git add lib/subtitleGlossary.ts types/translation.ts services/subtitlePrompt.ts services/openaiCompatible.ts lib/__tests__/subtitlePlusFrozenGlossary.test.ts services/__tests__/subtitlePlusPrompt.test.ts
git commit -m "feat(subtitles): add frozen terminology prompt slot"
```

---

### Task 5: Eligibility predicate and one-time hint

**Files:**
- Modify: `lib/subtitlePlusEligibility.ts`
- Test: `lib/__tests__/subtitlePlusEligibility.test.ts` (extend)

**Interfaces:**
- Consumes: `SUBTITLE_CHUNK_SIZE` from `lib/constants.ts`.
- Produces: `PLUS_MIN_CUES`, `PLUS_HINT_MIN_CUES`, `PlusDowngradeReason`, `resolvePlusEligibility(input): boolean`, `shouldOfferPlusHint(cueCount, dismissed): boolean`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/__tests__/subtitlePlusEligibility.test.ts` (add these imports to the existing import block):

```ts
import {
  PLUS_HINT_MIN_CUES,
  PLUS_MIN_CUES,
  resolvePlusEligibility,
  shouldOfferPlusHint,
} from '@/lib/subtitlePlusEligibility';
import { SUBTITLE_CHUNK_SIZE } from '@/lib/constants';
```

Then append:

```ts
describe('resolvePlusEligibility', () => {
  it('requires the plus mode, a declared complete track, and enough cues', () => {
    expect(
      resolvePlusEligibility({ translationMode: 'plus', completeTrack: true, cueCount: PLUS_MIN_CUES }),
    ).toBe(true);
  });

  it('rejects the progressive mode and the absent mode', () => {
    expect(
      resolvePlusEligibility({ translationMode: 'progressive', completeTrack: true, cueCount: 500 }),
    ).toBe(false);
    expect(resolvePlusEligibility({ completeTrack: true, cueCount: 500 })).toBe(false);
  });

  it('rejects a caller that did not declare a complete track', () => {
    expect(resolvePlusEligibility({ translationMode: 'plus', cueCount: 500 })).toBe(false);
  });

  it('rejects delta-shaped requests', () => {
    expect(
      resolvePlusEligibility({
        translationMode: 'plus',
        completeTrack: true,
        skipFilmPreScan: true,
        cueCount: 500,
      }),
    ).toBe(false);
  });

  it('rejects a track shorter than two chunks', () => {
    expect(
      resolvePlusEligibility({
        translationMode: 'plus',
        completeTrack: true,
        cueCount: PLUS_MIN_CUES - 1,
      }),
    ).toBe(false);
    expect(PLUS_MIN_CUES).toBe(2 * SUBTITLE_CHUNK_SIZE);
  });
});

describe('shouldOfferPlusHint', () => {
  it('is false below the threshold and when dismissed', () => {
    expect(shouldOfferPlusHint(PLUS_HINT_MIN_CUES - 1, undefined)).toBe(false);
    expect(shouldOfferPlusHint(PLUS_HINT_MIN_CUES, true)).toBe(false);
  });

  it('is true at or above the threshold when not dismissed', () => {
    expect(shouldOfferPlusHint(PLUS_HINT_MIN_CUES, undefined)).toBe(true);
    expect(shouldOfferPlusHint(PLUS_HINT_MIN_CUES + 500, false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/__tests__/subtitlePlusEligibility.test.ts`
Expected: FAIL — `resolvePlusEligibility` is not exported.

- [ ] **Step 3: Implement the predicate and hint**

Append to `lib/subtitlePlusEligibility.ts` (and add the `SUBTITLE_CHUNK_SIZE` import):

```ts
import { SUBTITLE_CHUNK_SIZE } from '@/lib/constants';

/** Minimum cue count for a Plus run: below two chunks there is nothing to
 *  parallelize and the frozen glossary cannot pay for its own latency. */
export const PLUS_MIN_CUES = 2 * SUBTITLE_CHUNK_SIZE;

/** Minimum cue count before offering the mode at all (~200 cues ≈ 7 minutes
 *  of dialogue). Short videos gain nothing and should not be prompted. */
export const PLUS_HINT_MIN_CUES = 200;

/** Why a Plus request did not run as Plus. Surfaced to the user, never silent. */
export type PlusDowngradeReason = 'ineligible' | 'empty-prep' | 'prep-failed';

export interface PlusEligibilityInput {
  translationMode?: SubtitleTranslationMode;
  completeTrack?: boolean;
  /** Set by the manifest/DOM/MSE delta paths. A delta request is never a
   *  complete track, even if a caller mislabels it. */
  skipFilmPreScan?: boolean;
  cueCount: number;
}

/** True when a request may start a Plus run. The background re-validates this
 *  rather than trusting the caller's mode field. */
export function resolvePlusEligibility(input: PlusEligibilityInput): boolean {
  return (
    input.translationMode === 'plus' &&
    input.completeTrack === true &&
    input.skipFilmPreScan !== true &&
    input.cueCount >= PLUS_MIN_CUES
  );
}

/** True when the one-time discoverability hint should be shown. */
export function shouldOfferPlusHint(cueCount: number, dismissed: boolean | undefined): boolean {
  return dismissed !== true && cueCount >= PLUS_HINT_MIN_CUES;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/__tests__/subtitlePlusEligibility.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/subtitlePlusEligibility.ts lib/__tests__/subtitlePlusEligibility.test.ts
git commit -m "feat(subtitles): add Plus eligibility predicate and hint threshold"
```

---

### Task 6: Parameterize the chunk translator (behavior-preserving refactor)

**Files:**
- Modify: `services/background.ts` (chunk options, cache-key branch, glossary block branch, merge guard)

**Interfaces:**
- Consumes: `generateSubtitlePlusCacheKey`, `PlusGlossarySnapshot` (Task 3).
- Produces: `ChunkTranslateOptions`; `translateChunk(chunkCues, contextCues, options?)`.

This task changes no behavior on its own. Its deliverable is the seam the next two tasks configure.

- [ ] **Step 1: Capture the green baseline**

Run: `pnpm vitest run services/__tests__/background.test.ts`
Expected: PASS. Record the test count — Step 5 must match it exactly.

- [ ] **Step 2: Add the options type and the mode/plus state**

In `services/background.ts`, extend the import on line 168:

```ts
import {
  generateSubtitleCacheKey,
  generateSubtitlePlusCacheKey,
  type GlossarySnapshot,
  type PlusGlossarySnapshot,
} from '@/lib/subtitleCacheKey';
```

Extend the import on line 170:

```ts
import { mergeProperNouns, formatRollingGlossary, formatFrozenGlossary } from '@/lib/subtitleGlossary';
```

Immediately after the `interface TranslationSession { ... }` block (line 243), add the chunk options type at module level so both the translator and the Plus runner share one shape:

```ts
/** Per-run configuration for the chunk translator. Progressive callers pass
 *  nothing, so their cache identity, prompt blocks, and glossary merge are
 *  unchanged. */
interface ChunkTranslateOptions {
  mode?: 'progressive' | 'plus';
  /** Plus only: frozen terminology (source→target), hashed as pairs. */
  frozen?: Record<string, string>;
  /** Plus only: pre-formatted frozen block for the prompt. */
  frozenBlock?: string;
}
```

- [ ] **Step 3: Branch the three seams inside translateChunk**

Change the signature (line 1385):

```ts
    const translateChunk = async (
      chunkCues: SubtitleCue[],
      contextCues: SubtitleCue[],
      options: ChunkTranslateOptions = {},
    ) => {
      const mode = options.mode ?? 'progressive';
```

After the `const glossarySnapshot = () => buildGlossarySnapshot(currentSettings, currentActiveList);` line (line 1401), add:

```ts
        const plusSnapshot = (): PlusGlossarySnapshot => ({
          globalEntries: (currentSettings.glossary ?? []).map((e) => ({ source: e.source, target: e.target })),
          namedListId: currentActiveList?.id ?? null,
          namedListEntries: (currentActiveList?.entries ?? []).map((e) => ({ source: e.source, target: e.target })),
          frozenPairs: Object.entries(options.frozen ?? {}).map(([source, target]) => ({ source, target })),
        });

        /** Cache identity for this run: Plus uses its own namespaced key so the
         *  two modes never share entries. */
        const cacheKeyFor = (text: string): Promise<string> =>
          mode === 'plus'
            ? generateSubtitlePlusCacheKey(text, sourceLanguage, targetLanguage, subtitleKnobs, plusSnapshot())
            : generateSubtitleCacheKey(text, sourceLanguage, targetLanguage, subtitleKnobs, glossarySnapshot());
```

Replace the cache **read** (line 1420) — `const subtitleKey = await generateSubtitleCacheKey(cue.text, sourceLanguage, targetLanguage, subtitleKnobs, glossarySnapshot());` — with:

```ts
          const subtitleKey = await cacheKeyFor(cue.text);
```

Replace the cache **write** (line 1529) — `const writeKey = await generateSubtitleCacheKey(originalText, sourceLanguage, targetLanguage, subtitleKnobs, glossarySnapshot());` — with:

```ts
                  const writeKey = await cacheKeyFor(originalText);
```

Replace the glossary block in the translate request (line 1501):

```ts
              // Progressive: the rolling glossary refines per chunk.
              // Plus: the frozen set is authoritative for the whole run.
              rollingGlossaryBlock:
                mode === 'plus' ? undefined : formatRollingGlossary(rollingGlossary) || undefined,
              frozenGlossaryBlock: mode === 'plus' ? options.frozenBlock : undefined,
```

Replace the merge block (line 1571):

```ts
            if (result.properNouns) {
              // Plus freezes terminology up front: per-chunk extraction must not
              // silently override the frozen decision mid-run.
              if (mode === 'progressive') {
                mergeProperNouns(rollingGlossary, result.properNouns, { lockedSources: currentLockedSources });
              }
              if (tabId !== undefined) {
                void writeNamedGlossarySuggestions(tabId, result.properNouns);
              }
            }
```

- [ ] **Step 4: Verify the progressive call sites are untouched**

Run: `rg -n "translateChunk\(" services/background.ts`
Expected: the two progressive call sites still pass exactly two arguments:
`services/background.ts:1591: const firstChunkResult = await translateChunk(firstChunkCues, firstChunkLookahead);` and the background-loop call `await translateChunk(chunkCues, contextCues);`.

- [ ] **Step 5: Verify no behavior change**

Run: `pnpm vitest run services/__tests__/background.test.ts`
Expected: PASS with the same count as Step 1.

Run: `pnpm test:fast`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/background.ts
git commit -m "refactor(subtitles): parameterize the chunk translator for Plus mode"
```

---

### Task 7: Plus preflight, ack, and downgrade

**Files:**
- Modify: `services/background.ts` (eligibility, preflight, ack/downgrade response)
- Test: `services/__tests__/background.plus.test.ts` (new file)

**Interfaces:**
- Consumes: `resolvePlusEligibility`, `PlusDowngradeReason`, `scopedFilmGlossaryKey`, `loadScopedFilmGlossary`, `saveScopedFilmGlossary`, `preScanNames`, `filterUnlockedProperNouns`, `formatFrozenGlossary`, `contentHash`.
- Produces: the Plus response contract `{ success: true; mode: 'plus'; sessionId: number; totalChunks: number; cues: [] }` and the downgrade contract `{ success: true; mode: 'progressive'; downgradeReason: PlusDowngradeReason; cues: SubtitleCue[] }`.

- [ ] **Step 1: Write the failing tests**

Create `services/__tests__/background.plus.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRIVACY_POLICY_VERSION } from '@/lib/privacyConsent';
import { SUBTITLE_CHUNK_SIZE } from '@/lib/constants';
import type { SubtitleCue } from '@/types/subtitle';

const mockStorage: Record<string, unknown> = {};
const ACCEPTED_CONSENT = { accepted: true, acceptedAt: 1, version: PRIVACY_POLICY_VERSION };
const SETTINGS_KEY = 'anyllm-translate-settings';

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({
        [key]:
          key === SETTINGS_KEY
            ? { ...(mockStorage[key] as object | undefined), privacyConsent: ACCEPTED_CONSENT }
            : mockStorage[key],
      })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
    },
    session: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
  tabs: { sendMessage: vi.fn().mockResolvedValue(undefined), onRemoved: { addListener: vi.fn() } },
  alarms: { create: vi.fn(), get: vi.fn(), clear: vi.fn(), onAlarm: { addListener: vi.fn(), removeListener: vi.fn() } },
});

const preScanNames = vi.fn();
vi.mock('@/services/subtitleNameScanner', () => ({
  preScanNames: (...args: unknown[]) => preScanNames(...args),
}));

const loadScoped = vi.fn();
const saveScoped = vi.fn();
vi.mock('@/services/filmGlossaryStore', () => ({
  loadFilmGlossary: vi.fn().mockResolvedValue(undefined),
  saveFilmGlossary: vi.fn().mockResolvedValue(undefined),
  loadScopedFilmGlossary: (...args: unknown[]) => loadScoped(...args),
  saveScopedFilmGlossary: (...args: unknown[]) => saveScoped(...args),
  FILM_GLOSSARY_STORAGE_KEY: 'anyllm-film-glossary',
  SCOPED_FILM_GLOSSARY_STORAGE_KEY: 'anyllm-film-glossary-scoped',
}));

// The subtitle cache store is IndexedDB, absent in jsdom — ByKey reads miss and
// writes are no-ops, matching the real module's behaviour here.
vi.mock('@/services/cacheManager', async (importOriginal) => {
  const actual = await importOriginal<typeof CacheManagerModule>();
  return {
    ...actual,
    getCachedTranslationByKey: vi.fn().mockResolvedValue(null),
    cacheTranslationByKey: vi.fn().mockResolvedValue(undefined),
  };
});

// Wall-clock sleeps (per-key throttle, chunk retry backoff, service backoff)
// are not what these tests assert. Substitute instant delays — dispatch order,
// retry counts, and breaker state are unchanged. Without this a 3-chunk run
// takes ~1s and the vi.waitFor default timeout (1000ms) fails.
vi.mock('@/services/providerPool', async (importOriginal) => {
  const actual = await importOriginal<typeof ProviderPoolModule>();
  class TestCoordinator extends actual.ProviderPoolCoordinator {
    constructor() {
      super({ delay: () => Promise.resolve() });
    }
  }
  return { ...actual, ProviderPoolCoordinator: TestCoordinator };
});
vi.mock('@/lib/subtitleRetry', async (importOriginal) => {
  const actual = await importOriginal<typeof SubtitleRetryModule>();
  return {
    ...actual,
    withRetry: (fn: () => Promise<unknown>, opts: Parameters<typeof actual.withRetry>[1]) =>
      actual.withRetry(fn, { ...opts, baseDelayMs: 0 }),
  };
});

// Also add these imports to the top of the file:
// import type * as CacheManagerModule from '@/services/cacheManager';
// import type * as ProviderPoolModule from '@/services/providerPool';
// import type * as SubtitleRetryModule from '@/lib/subtitleRetry';
// import { OpenAICompatibleService } from '@/services/openaiCompatible';

function mockFetch(content: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve({ id: 'test', choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] }),
    text: () => Promise.resolve(''),
  }));
}

function cuesOf(count: number): SubtitleCue[] {
  return Array.from({ length: count }, (_, i) => ({ startTime: i * 2, endTime: i * 2 + 2, text: `line ${i}` }));
}

const SENDER = { tab: { id: 11 } } as chrome.runtime.MessageSender;

describe('handleTranslateSubtitle — Plus preflight', () => {
  beforeEach(async () => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
    mockStorage[SETTINGS_KEY] = { translationMode: 'plus' };
    preScanNames.mockReset().mockResolvedValue({ Alice: 'A-lít' });
    loadScoped.mockReset().mockResolvedValue(undefined);
    saveScoped.mockReset().mockResolvedValue(undefined);
    mockFetch(JSON.stringify({ translations: { s1: 'x' }, properNouns: {} }));
    const { __resetSettingsCacheForTest, __resetTranslationServiceForTest, __resetSubtitleSessionCounterForTest, __resetSemaphoreForTest } = await import('../background');
    __resetSettingsCacheForTest();
    __resetTranslationServiceForTest();
    __resetSubtitleSessionCounterForTest();
    __resetSemaphoreForTest();
    OpenAICompatibleService.__setRetryBackoffForTest(true);
  });

  it('downgrades when the caller did not declare a complete track', async () => {
    const { handleMessage } = await import('../background');
    const res = (await handleMessage(
      { action: 'translateSubtitle', cues: cuesOf(SUBTITLE_CHUNK_SIZE * 2), sourceLanguage: 'en', targetLanguage: 'vi', translationMode: 'plus' },
      SENDER,
    )) as { mode?: string; downgradeReason?: string; cues?: SubtitleCue[] };

    expect(res.mode).toBe('progressive');
    expect(res.downgradeReason).toBe('ineligible');
    // The progressive response returns the WHOLE cue array (untranslated cues
    // keep source text), not just chunk 0.
    expect(res.cues?.length).toBe(SUBTITLE_CHUNK_SIZE * 2);
    // An ineligible Plus request is an ordinary progressive request: the
    // unscoped pre-scan still runs, and the scoped namespace is untouched.
    expect(preScanNames).toHaveBeenCalledTimes(1);
    expect(loadScoped).not.toHaveBeenCalled();
    expect(saveScoped).not.toHaveBeenCalled();
  });

  it('downgrades with empty-prep when the frozen set is empty', async () => {
    preScanNames.mockResolvedValue({});
    const { handleMessage } = await import('../background');
    const res = (await handleMessage(
      { action: 'translateSubtitle', cues: cuesOf(SUBTITLE_CHUNK_SIZE * 2), sourceLanguage: 'en', targetLanguage: 'vi', translationMode: 'plus', completeTrack: true },
      SENDER,
    )) as { mode?: string; downgradeReason?: string };

    expect(res.mode).toBe('progressive');
    expect(res.downgradeReason).toBe('empty-prep');
    expect(saveScoped).not.toHaveBeenCalled();
  });

  it('downgrades with prep-failed when the pre-scan throws', async () => {
    preScanNames.mockRejectedValue(new Error('boom'));
    const { handleMessage } = await import('../background');
    const res = (await handleMessage(
      { action: 'translateSubtitle', cues: cuesOf(SUBTITLE_CHUNK_SIZE * 2), sourceLanguage: 'en', targetLanguage: 'vi', translationMode: 'plus', completeTrack: true },
      SENDER,
    )) as { mode?: string; downgradeReason?: string };

    expect(res.mode).toBe('progressive');
    expect(res.downgradeReason).toBe('prep-failed');
  });

  it('acks a Plus run and never touches the progressive film-glossary namespace', async () => {
    const { handleMessage } = await import('../background');
    const res = (await handleMessage(
      { action: 'translateSubtitle', cues: cuesOf(SUBTITLE_CHUNK_SIZE * 2), sourceLanguage: 'en', targetLanguage: 'vi', translationMode: 'plus', completeTrack: true },
      SENDER,
    )) as { mode?: string; cues?: SubtitleCue[]; totalChunks?: number };

    expect(res.mode).toBe('plus');
    expect(res.cues).toEqual([]);
    expect(res.totalChunks).toBe(2);
    expect(preScanNames).toHaveBeenCalledTimes(1);
    expect(saveScoped).toHaveBeenCalledTimes(1);
    const [scopedKey] = saveScoped.mock.calls[0] as [string, Record<string, string>];
    expect(scopedKey).toContain(':vi:');
  });

  it('reuses a persisted scoped glossary instead of pre-scanning again', async () => {
    loadScoped.mockResolvedValue({ Alice: 'A-lít' });
    const { handleMessage } = await import('../background');
    const res = (await handleMessage(
      { action: 'translateSubtitle', cues: cuesOf(SUBTITLE_CHUNK_SIZE * 2), sourceLanguage: 'en', targetLanguage: 'vi', translationMode: 'plus', completeTrack: true },
      SENDER,
    )) as { mode?: string };

    expect(res.mode).toBe('plus');
    expect(preScanNames).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run services/__tests__/background.plus.test.ts`
Expected: FAIL — the response has no `mode` field and `preScanNames` is never called for a Plus request.

- [ ] **Step 3: Widen the response type**

`handleTranslateSubtitle` declares its return type inline as `Promise<{ success: boolean; cues?: SubtitleCue[]; error?: string; sessionId?: number }>` (line 1281). The new fields would be excess properties, so replace that inline type with a named interface declared next to `ChunkTranslateOptions`:

```ts
/** Response for a subtitle translation request. `mode`/`downgradeReason` are
 *  present only for Plus requests; `totalChunks` only on the Plus ack. */
interface TranslateSubtitleResponse {
  success: boolean;
  cues?: SubtitleCue[];
  error?: string;
  sessionId?: number;
  mode?: 'progressive' | 'plus';
  downgradeReason?: PlusDowngradeReason;
  totalChunks?: number;
}
```

and change the signature to `): Promise<TranslateSubtitleResponse> {`.

- [ ] **Step 4: Add eligibility and preflight to handleTranslateSubtitle**

In `services/background.ts`, extend the imports:

```ts
import {
  loadFilmGlossary,
  saveFilmGlossary,
  loadScopedFilmGlossary,
  saveScopedFilmGlossary,
} from '@/services/filmGlossaryStore';
import { scopedFilmGlossaryKey } from '@/lib/subtitleFilmGlossary';
import {
  resolvePlusEligibility,
  type PlusDowngradeReason,
} from '@/lib/subtitlePlusEligibility';
import { formatFrozenGlossary } from '@/lib/subtitleGlossary';
```

In `handleTranslateSubtitle`, immediately after the `const lockedSources = lockedSourceSet(activeList);` line (line 1305), add:

```ts
    // Plus mode: resolve eligibility and prepare the frozen terminology set
    // BEFORE responding. The response is either the Plus ack or a progressive
    // downgrade — never a post-ack mode change.
    const wantsPlus = message.translationMode === 'plus';
    let downgradeReason: PlusDowngradeReason | undefined;
    let plusRun: { frozen: Record<string, string>; block: string } | undefined;
```

Then, immediately after the `subtitleKnobs` resolution block (ends line 1322), insert:

```ts
    if (wantsPlus) {
      const eligible = resolvePlusEligibility({
        translationMode: message.translationMode,
        completeTrack: message.completeTrack,
        skipFilmPreScan: message.skipFilmPreScan,
        cueCount: cues.length,
      });
      if (!eligible) {
        downgradeReason = 'ineligible';
      } else {
        try {
          const scopedKey = scopedFilmGlossaryKey(
            await contentHash(cues),
            targetLanguage,
            subtitleKnobs,
          );
          let scoped = await loadScopedFilmGlossary(scopedKey);
          if (!scoped) {
            scoped = await preScanNames(service, sourceLanguage, targetLanguage, cues, subtitleKnobs);
            if (scoped && Object.keys(scoped).length > 0) {
              await saveScopedFilmGlossary(scopedKey, scoped);
            }
          }
          const frozen = filterUnlockedProperNouns(scoped ?? {}, lockedSources);
          if (Object.keys(frozen).length === 0) {
            downgradeReason = 'empty-prep';
          } else {
            plusRun = { frozen, block: formatFrozenGlossary(frozen) };
          }
        } catch {
          downgradeReason = 'prep-failed';
        }
      }
    }
```

Guard the existing progressive film-glossary block so a Plus run does not also run the unscoped pre-scan — change `if (!message.skipFilmPreScan) {` (line 1327) to:

```ts
    if (!plusRun && !message.skipFilmPreScan) {
```

- [ ] **Step 5: Return the ack or the downgrade tag**

In `handleTranslateSubtitle`, immediately after the `plusRun` block from Step 3, add the Plus short-circuit. It must run after the rolling-glossary seed and `buildGlossarySnapshot`/`translateChunk` definitions exist, so place it right before the `// Process first chunk synchronously` comment (line 1590):

```ts
    if (plusRun) {
      const totalChunks = Math.ceil(cues.length / CHUNK_SIZE);
      if (tabId !== undefined) {
        await writeNamedGlossarySuggestions(tabId, plusRun.frozen);
      }
      return {
        success: true,
        mode: 'plus',
        sessionId,
        totalChunks,
        cues: [],
      };
    }
```

The worker pool and terminal commit are Task 8; this task's deliverable is the response contract.

Tag the two progressive returns so a downgrade is visible — the early-return at line 1634 becomes:

```ts
      if (sessionGenerationFor(tabId) !== requestGeneration) {
        return {
          success: true,
          cues: translatedCues,
          sessionId,
          ...(downgradeReason ? { mode: 'progressive' as const, downgradeReason } : {}),
        };
      }
```

and the final return (line 1699) becomes:

```ts
    return {
      success: true,
      cues: translatedCues,
      sessionId,
      ...(downgradeReason ? { mode: 'progressive' as const, downgradeReason } : {}),
    };
```

- [ ] **Step 6: Run the new tests, then the regression suite**

Run: `pnpm vitest run services/__tests__/background.plus.test.ts`
Expected: PASS (5 tests).

Run: `pnpm vitest run services/__tests__/background.test.ts`
Expected: PASS with the same count as Task 6 Step 1 — the progressive responses are unchanged because `downgradeReason` is undefined unless a Plus request was made.

- [ ] **Step 7: Commit**

```bash
git add services/background.ts services/__tests__/background.plus.test.ts
git commit -m "feat(subtitles): Plus preflight with scoped glossary and ack/downgrade response"
```

---

### Task 8: Plus worker pool, progress, and terminal commit

**Files:**
- Modify: `services/background.ts` (replace the Task 7 short-circuit with the real run)
- Test: `services/__tests__/background.plus.test.ts` (extend)

**Interfaces:**
- Consumes: `ChunkTranslateOptions` (Task 6), the ack contract (Task 7), `MAX_CONCURRENT`, `registerTabSession`, `unregisterTabSession`, `activeSessions`, `sessionGenerationFor`, `ensureKeepaliveAlarm`, `clearKeepaliveAlarm`, `TranslationSession`.
- Produces: `SUBTITLE_PLUS_PROGRESS` per settled chunk and one terminal `SUBTITLE_PLUS_COMPLETE`.

- [ ] **Step 1: Write the failing tests**

Append to `services/__tests__/background.plus.test.ts` (imports: add `SUBTITLE_PLUS_COMPLETE` and `SUBTITLE_PLUS_PROGRESS` are not needed — assert on the sent message objects):

```ts
function sentActions(): string[] {
  return (chrome.tabs.sendMessage as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(
    (call) => (call[1] as { action?: string }).action ?? '',
  );
}

function sentMessages(action: string): Array<Record<string, unknown>> {
  return (chrome.tabs.sendMessage as unknown as { mock: { calls: unknown[][] } }).mock.calls
    .map((call) => call[1] as Record<string, unknown>)
    .filter((msg) => msg.action === action);
}

describe('handleTranslateSubtitle — Plus run', () => {
  beforeEach(async () => {
    // Same reset block as the preflight describe, plus a fetch that echoes each
    // requested id so every chunk succeeds.
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
    mockStorage[SETTINGS_KEY] = { translationMode: 'plus' };
    preScanNames.mockReset().mockResolvedValue({ Alice: 'A-lít' });
    loadScoped.mockReset().mockResolvedValue(undefined);
    saveScoped.mockReset().mockResolvedValue(undefined);
    vi.mocked(chrome.tabs.sendMessage).mockClear();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body?: string }) => {
      const body = JSON.parse(init.body ?? '{}') as { messages: Array<{ content: string }> };
      const userPrompt = body.messages[1]?.content ?? '';
      const ids = [...userPrompt.matchAll(/"?(s\d+)"?\s*:/g)].map((m) => m[1]);
      const translations: Record<string, string> = {};
      for (const id of ids) translations[id] = `vi-${id}`;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({
          id: 'test',
          choices: [{ message: { role: 'assistant', content: JSON.stringify({ translations, properNouns: {} }) }, finish_reason: 'stop' }],
        }),
        text: () => Promise.resolve(''),
      };
    }));
    const { __resetSettingsCacheForTest, __resetTranslationServiceForTest, __resetSubtitleSessionCounterForTest, __resetSemaphoreForTest } = await import('../background');
    __resetSettingsCacheForTest();
    __resetTranslationServiceForTest();
    __resetSubtitleSessionCounterForTest();
    __resetSemaphoreForTest();
    OpenAICompatibleService.__setRetryBackoffForTest(true);
  });

  it('sends the frozen block to every chunk, one progress per chunk, then one terminal message', async () => {
    const { handleMessage } = await import('../background');
    await handleMessage(
      { action: 'translateSubtitle', cues: cuesOf(SUBTITLE_CHUNK_SIZE * 2 + 1), sourceLanguage: 'en', targetLanguage: 'vi', translationMode: 'plus', completeTrack: true },
      SENDER,
    );

    await vi.waitFor(() => expect(sentActions()).toContain('SUBTITLE_PLUS_COMPLETE'), { timeout: 10_000 });

    const progress = sentMessages('SUBTITLE_PLUS_PROGRESS');
    expect(progress).toHaveLength(3);
    expect(progress.at(-1)).toMatchObject({ completedChunks: 3, totalChunks: 3, phase: 'translating' });

    const [terminal] = sentMessages('SUBTITLE_PLUS_COMPLETE');
    expect(terminal).toMatchObject({ outcome: 'complete', partial: false, failedChunkIndices: [] });
    expect((terminal.cues as SubtitleCue[]).length).toBe(SUBTITLE_CHUNK_SIZE * 2 + 1);

    // Every chunk prompt carried the frozen block; no rolling block was sent.
    const fetchMock = fetch as unknown as { mock: { calls: Array<[string, { body: string }]> } };
    for (const [, init] of fetchMock.mock.calls) {
      const system = (JSON.parse(init.body) as { messages: Array<{ content: string }> }).messages[0].content;
      if (system.includes('proper-noun extractor')) continue;
      expect(system).toContain('Frozen terminology for this track');
      expect(system).not.toContain('Previously translated names in this content');
    }
  });

  it('never sends progressive chunk deltas during a Plus run', async () => {
    const { handleMessage } = await import('../background');
    await handleMessage(
      { action: 'translateSubtitle', cues: cuesOf(SUBTITLE_CHUNK_SIZE * 2), sourceLanguage: 'en', targetLanguage: 'vi', translationMode: 'plus', completeTrack: true },
      SENDER,
    );
    await vi.waitFor(() => expect(sentActions()).toContain('SUBTITLE_PLUS_COMPLETE'), { timeout: 10_000 });
    expect(sentActions()).not.toContain('SUBTITLE_CHUNK_TRANSLATED');
    expect(sentActions()).not.toContain('SUBTITLE_CHUNK_FAILED');
  });

  it('commits with partial:true and source text when one chunk fails all retries', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body?: string }) => {
      const body = JSON.parse(init.body ?? '{}') as { messages: Array<{ content: string }> };
      const userPrompt = body.messages[1]?.content ?? '';
      // Chunk 1 covers cues 25-49, so only its prompt contains "line 30".
      // Content-based, not call-order-based: the pool runs chunks in parallel.
      if (userPrompt.includes('line 30')) throw new Error('network down');
      const ids = [...userPrompt.matchAll(/"?(s\d+)"?\s*:/g)].map((m) => m[1]);
      const translations: Record<string, string> = {};
      for (const id of ids) translations[id] = `vi-${id}`;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({
          id: 'test',
          choices: [{ message: { role: 'assistant', content: JSON.stringify({ translations, properNouns: {} }) }, finish_reason: 'stop' }],
        }),
        text: () => Promise.resolve(''),
      };
    }));

    const { handleMessage } = await import('../background');
    await handleMessage(
      { action: 'translateSubtitle', cues: cuesOf(SUBTITLE_CHUNK_SIZE * 2), sourceLanguage: 'en', targetLanguage: 'vi', translationMode: 'plus', completeTrack: true },
      SENDER,
    );
    await vi.waitFor(() => expect(sentActions()).toContain('SUBTITLE_PLUS_COMPLETE'), { timeout: 10_000 });

    const [terminal] = sentMessages('SUBTITLE_PLUS_COMPLETE');
    const cues = terminal.cues as SubtitleCue[];
    expect(terminal.partial).toBe(true);
    expect(terminal.outcome).toBe('complete');
    expect(terminal.failedChunkIndices).toEqual([1]);
    // The failed chunk keeps source text; the successful chunk carries the translation.
    expect(cues[SUBTITLE_CHUNK_SIZE].text).toBe(`line ${SUBTITLE_CHUNK_SIZE}`);
    expect(cues[0].text).toBe('vi-s1');
  });

  it('sends outcome:failed when every chunk fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const { handleMessage } = await import('../background');
    await handleMessage(
      { action: 'translateSubtitle', cues: cuesOf(SUBTITLE_CHUNK_SIZE * 2), sourceLanguage: 'en', targetLanguage: 'vi', translationMode: 'plus', completeTrack: true },
      SENDER,
    );
    await vi.waitFor(() => expect(sentActions()).toContain('SUBTITLE_PLUS_COMPLETE'), { timeout: 10_000 });
    const [terminal] = sentMessages('SUBTITLE_PLUS_COMPLETE');
    expect(terminal.outcome).toBe('failed');
  });

  it('sends no terminal message when the run is cancelled', async () => {
    // Gate every request so the cancel lands while chunks are genuinely in
    // flight; a fast mock would let the whole run finish first and make the
    // assertion vacuous.
    const gate: { release: () => void } = { release: () => {} };
    const wait = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    vi.stubGlobal('fetch', vi.fn(async () => {
      await wait;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({
          id: 'test',
          choices: [{ message: { role: 'assistant', content: JSON.stringify({ translations: {}, properNouns: {} }) }, finish_reason: 'stop' }],
        }),
        text: () => Promise.resolve(''),
      };
    }));

    const { handleMessage, __getActiveSessionCountForTest } = await import('../background');
    await handleMessage(
      { action: 'translateSubtitle', cues: cuesOf(SUBTITLE_CHUNK_SIZE * 4), sourceLanguage: 'en', targetLanguage: 'vi', translationMode: 'plus', completeTrack: true },
      SENDER,
    );
    await handleMessage({ action: 'CANCEL_SUBTITLE_SESSION' }, SENDER);
    gate.release();

    // Wait for the run to actually finish before asserting the absence of a
    // terminal message — otherwise a later terminal send would be missed.
    await vi.waitFor(() => expect(__getActiveSessionCountForTest()).toBe(0), { timeout: 10_000 });
    expect(sentActions()).not.toContain('SUBTITLE_PLUS_COMPLETE');
  });

  it('leaves the scoped namespace untouched on a progressive request', async () => {
    mockStorage[SETTINGS_KEY] = { translationMode: 'progressive' };
    const { handleMessage } = await import('../background');
    await handleMessage(
      { action: 'translateSubtitle', cues: cuesOf(SUBTITLE_CHUNK_SIZE), sourceLanguage: 'en', targetLanguage: 'vi' },
      SENDER,
    );
    expect(loadScoped).not.toHaveBeenCalled();
    expect(saveScoped).not.toHaveBeenCalled();
  });
});
```

Add one deterministic assertion to the first run test — every chunk receives the *same* system prompt, which is what "frozen" means (sequence-based assertions on which chunk saw what are racy under parallelism):

```ts
    const systems = fetchMock.mock.calls.map(
      ([, init]) => (JSON.parse(init.body) as { messages: Array<{ content: string }> }).messages[0].content,
    );
    expect(new Set(systems).size).toBe(1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run services/__tests__/background.plus.test.ts`
Expected: FAIL — no `SUBTITLE_PLUS_PROGRESS` / `SUBTITLE_PLUS_COMPLETE` messages are sent.

- [ ] **Step 3: Implement the worker pool and terminal commit**

First hoist the context window to module scope so the run helper can use it: move `const CONTEXT_SIZE = 3;` (line 1347, inside `handleTranslateSubtitle`) up next to `const CHUNK_SIZE = SUBTITLE_CHUNK_SIZE;` (line 665) and delete the inner declaration. This is a pure move — the three existing uses (lines 1594, 1644, 1645) keep the same name and value.

Then add the run helper immediately before `handleTranslateSubtitle`:

```ts
/**
 * Plus run: translate every chunk against the frozen terminology set with a
 * bounded worker pool, then send ONE terminal message. No cue data leaves the
 * background until that terminal message, so the overlay cannot show a
 * partially-prepared track. Cancellation (CANCEL_SUBTITLE_SESSION) stops
 * workers from claiming further chunks and suppresses the terminal message.
 */
function startPlusRun(args: {
  tabId: number;
  cues: SubtitleCue[];
  sessionId: number;
  requestGeneration: number;
  frozen: Record<string, string>;
  frozenBlock: string;
  translateChunk: (
    chunkCues: SubtitleCue[],
    contextCues: SubtitleCue[],
    options?: ChunkTranslateOptions,
  ) => Promise<SubtitleCue[]>;
}): void {
  const { tabId, cues, sessionId, requestGeneration } = args;
  const totalChunks = Math.ceil(cues.length / CHUNK_SIZE);
  const results = new Array<SubtitleCue[]>(totalChunks);
  const failedChunkIndices: number[] = [];
  let nextIndex = 0;
  let completedChunks = 0;

  const session: TranslationSession = {
    queue: [],
    // Plus ignores playback priority by design: "finish the file, then show it"
    // has no notion of a nearer chunk.
    setPriority: () => {},
    sessionId,
    cancelled: false,
  };
  activeSessions.set(tabId, session);
  registerTabSession(tabId, session);
  ensureKeepaliveAlarm();

  const worker = async (): Promise<void> => {
    for (;;) {
      if (session.cancelled) return;
      if (sessionGenerationFor(tabId) !== requestGeneration) {
        session.cancelled = true;
        return;
      }
      const i = nextIndex;
      nextIndex += 1;
      if (i >= totalChunks) return;

      const start = i * CHUNK_SIZE;
      const chunkCues = cues.slice(start, start + CHUNK_SIZE);
      const preceding = cues.slice(Math.max(0, start - CONTEXT_SIZE), start);
      const following = cues.slice(start + CHUNK_SIZE, start + CHUNK_SIZE + CONTEXT_SIZE);
      try {
        results[i] = await args.translateChunk(chunkCues, [...preceding, ...following], {
          mode: 'plus',
          frozen: args.frozen,
          frozenBlock: args.frozenBlock,
        });
      } catch (error) {
        console.warn('AnyLLMTranslate: Plus chunk translation failed', error);
        results[i] = chunkCues.map((cue) => ({ ...cue }));
        failedChunkIndices.push(i);
      }
      completedChunks += 1;
      try {
        chrome.tabs.sendMessage(tabId, {
          action: 'SUBTITLE_PLUS_PROGRESS',
          sessionId,
          phase: 'translating',
          completedChunks,
          totalChunks,
        });
      } catch {
        /* tab gone — nothing to update */
      }
    }
  };

  void (async () => {
    try {
      await Promise.all(
        Array.from({ length: Math.min(MAX_CONCURRENT, totalChunks) }, () => worker()),
      );
      if (session.cancelled) return;
      const flattened: SubtitleCue[] = [];
      for (const chunk of results) {
        if (chunk) flattened.push(...chunk);
      }
      failedChunkIndices.sort((a, b) => a - b);
      chrome.tabs.sendMessage(tabId, {
        action: 'SUBTITLE_PLUS_COMPLETE',
        sessionId,
        outcome: failedChunkIndices.length === totalChunks ? 'failed' : 'complete',
        cues: flattened,
        partial: failedChunkIndices.length > 0,
        failedChunkIndices,
      });
    } catch (error) {
      console.warn('AnyLLMTranslate: Plus run failed', error);
      try {
        chrome.tabs.sendMessage(tabId, {
          action: 'SUBTITLE_PLUS_COMPLETE',
          sessionId,
          outcome: 'failed',
          cues: [],
          partial: true,
          failedChunkIndices: [],
        });
      } catch {
        /* tab gone */
      }
    } finally {
      if (activeSessions.get(tabId) === session) activeSessions.delete(tabId);
      unregisterTabSession(tabId, session);
      clearKeepaliveAlarm();
    }
  })();
}
```

Then replace the Task 7 short-circuit body (the `if (plusRun) { ... return {...} }` block) with:

```ts
    if (plusRun) {
      const totalChunks = Math.ceil(cues.length / CHUNK_SIZE);
      if (tabId !== undefined) {
        await writeNamedGlossarySuggestions(tabId, plusRun.frozen);
        startPlusRun({
          tabId,
          cues,
          sessionId,
          requestGeneration,
          frozen: plusRun.frozen,
          frozenBlock: plusRun.block,
          translateChunk,
        });
      }
      return {
        success: true,
        mode: 'plus',
        sessionId,
        totalChunks,
        cues: [],
      };
    }
```

`startPlusRun` needs `CONTEXT_SIZE`, `CHUNK_SIZE`, `MAX_CONCURRENT`, `TranslationSession`, `activeSessions`, `registerTabSession`, `unregisterTabSession`, `sessionGenerationFor`, `ensureKeepaliveAlarm`, `clearKeepaliveAlarm` — all already module-level in `services/background.ts`.

- [ ] **Step 4: Run the Plus tests**

Run: `pnpm vitest run services/__tests__/background.plus.test.ts`
Expected: PASS (11 tests). The partial-failure test takes ~1.5s because the background retries the failing chunk twice with backoff.

- [ ] **Step 5: Run the regression suites**

Run: `pnpm vitest run services/__tests__/background.test.ts`
Expected: PASS with the same count as Task 6 Step 1.

Run: `pnpm test:fast`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/background.ts services/__tests__/background.plus.test.ts
git commit -m "feat(subtitles): Plus worker pool with progress and single terminal commit"
```

---

### Task 9: Plus run controller (pure, testable)

**Files:**
- Create: `content/subtitlePlusRun.ts`
- Test: `content/__tests__/subtitlePlusRun.test.ts` (new file)

**Interfaces:**
- Consumes: `SubtitleCue`.
- Produces: `PLUS_STALL_TIMEOUT_MS`, `PlusRunEffects`, `SubtitlePlusRun` with `start(sessionId, totalChunks)`, `handleProgress(msg)`, `handleComplete(msg)`, `stop()`, `isStalled()`, `failByStall()`, and `state` (`'idle' | 'running' | 'settled'`).

The controller is pure: it owns no timers and no DOM. The coordinator drives `isStalled()` from an interval and supplies the effects.

- [ ] **Step 1: Write the failing test**

Create `content/__tests__/subtitlePlusRun.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { SubtitlePlusRun, type PlusRunEffects } from '@/content/subtitlePlusRun';

function makeEffects() {
  return {
    cancel: vi.fn(),
    progress: vi.fn(),
    commit: vi.fn(),
    fail: vi.fn(),
  } satisfies PlusRunEffects;
}

describe('SubtitlePlusRun', () => {
  it('reports initial progress from the ack totals', () => {
    const effects = makeEffects();
    const run = new SubtitlePlusRun(effects);
    run.start(7, 4);
    expect(effects.progress).toHaveBeenCalledWith(0, 4);
    expect(run.state).toBe('running');
  });

  it('ignores messages from another session', () => {
    const effects = makeEffects();
    const run = new SubtitlePlusRun(effects);
    run.start(7, 2);
    run.handleProgress({ action: 'SUBTITLE_PLUS_PROGRESS', sessionId: 9, phase: 'translating', completedChunks: 1, totalChunks: 2 });
    expect(effects.progress).toHaveBeenCalledTimes(1); // only the start call
  });

  it('forwards progress and commits on a complete terminal message', () => {
    const effects = makeEffects();
    const run = new SubtitlePlusRun(effects);
    run.start(7, 2);
    run.handleProgress({ action: 'SUBTITLE_PLUS_PROGRESS', sessionId: 7, phase: 'translating', completedChunks: 1, totalChunks: 2 });
    expect(effects.progress).toHaveBeenLastCalledWith(1, 2);

    const cues = [{ startTime: 0, endTime: 1, text: 'vi' }];
    run.handleComplete({ action: 'SUBTITLE_PLUS_COMPLETE', sessionId: 7, outcome: 'complete', cues, partial: false, failedChunkIndices: [] });
    expect(effects.commit).toHaveBeenCalledWith(cues, false);
    expect(effects.fail).not.toHaveBeenCalled();
    expect(run.state).toBe('settled');
  });

  it('fails without committing on a failed terminal message', () => {
    const effects = makeEffects();
    const run = new SubtitlePlusRun(effects);
    run.start(7, 2);
    run.handleComplete({ action: 'SUBTITLE_PLUS_COMPLETE', sessionId: 7, outcome: 'failed', cues: [], partial: true, failedChunkIndices: [0, 1] });
    expect(effects.commit).not.toHaveBeenCalled();
    expect(effects.fail).toHaveBeenCalledWith('failed');
  });

  it('cancels the background run on stop and ignores later messages', () => {
    const effects = makeEffects();
    const run = new SubtitlePlusRun(effects);
    run.start(7, 2);
    run.stop();
    expect(effects.cancel).toHaveBeenCalledTimes(1);
    expect(effects.fail).toHaveBeenCalledWith('cancelled');
    run.handleComplete({ action: 'SUBTITLE_PLUS_COMPLETE', sessionId: 7, outcome: 'complete', cues: [], partial: false, failedChunkIndices: [] });
    expect(effects.commit).not.toHaveBeenCalled();
  });

  it('detects a stalled run and fails it once', () => {
    let now = 1_000;
    const effects = makeEffects();
    const run = new SubtitlePlusRun(effects, 10_000, () => now);
    run.start(7, 4);
    now += 9_000;
    expect(run.isStalled()).toBe(false);
    now += 2_000;
    expect(run.isStalled()).toBe(true);
    run.failByStall();
    expect(effects.fail).toHaveBeenCalledWith('timeout');
    expect(effects.cancel).toHaveBeenCalledTimes(1);
    expect(run.state).toBe('settled');
    run.failByStall();
    expect(effects.fail).toHaveBeenCalledTimes(1);
  });

  it('keeps the stall clock fresh while progress arrives', () => {
    let now = 0;
    const effects = makeEffects();
    const run = new SubtitlePlusRun(effects, 10_000, () => now);
    run.start(7, 4);
    now += 9_000;
    run.handleProgress({ action: 'SUBTITLE_PLUS_PROGRESS', sessionId: 7, phase: 'translating', completedChunks: 1, totalChunks: 4 });
    now += 9_000;
    expect(run.isStalled()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run content/__tests__/subtitlePlusRun.test.ts`
Expected: FAIL — `Failed to resolve import "@/content/subtitlePlusRun"`.

- [ ] **Step 3: Implement the controller**

Create `content/subtitlePlusRun.ts`:

```ts
/**
 * Plus run controller — pure state machine for one whole-track Plus run.
 *
 * Owns no timers, no DOM, and no chrome APIs: the coordinator supplies effects
 * and drives the stall check. That keeps the interesting behaviour (session
 * filtering, terminal handling, stop, stall detection) unit-testable without a
 * browser harness.
 *
 * See docs/superpowers/specs/2026-09-27-subtitle-plus-mode-design.md.
 */

import type { SubtitleCue } from '@/types/subtitle';
import type { SubtitlePlusCompleteMessage, SubtitlePlusProgressMessage } from '@/types/messages';

/** No progress push for this long means the run is dead (service worker
 *  recycled, tab suspended, terminal message lost). */
export const PLUS_STALL_TIMEOUT_MS = 45_000;

export interface PlusRunEffects {
  /** Ask the background to cancel the run. */
  cancel: () => void;
  /** Update the progress chrome (completed, total). */
  progress: (completedChunks: number, totalChunks: number) => void;
  /** Publish the prepared cues. */
  commit: (cues: SubtitleCue[], partial: boolean) => void;
  /** Give up and keep the original captions. */
  fail: (reason: 'failed' | 'timeout' | 'cancelled') => void;
}

export type PlusRunState = 'idle' | 'running' | 'settled';

export class SubtitlePlusRun {
  private sessionId: number | null = null;
  private lastActivityAt = 0;
  private _state: PlusRunState = 'idle';

  constructor(
    private readonly effects: PlusRunEffects,
    private readonly stallTimeoutMs: number = PLUS_STALL_TIMEOUT_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get state(): PlusRunState {
    return this._state;
  }

  /** Begin a run from the background's ack. */
  start(sessionId: number, totalChunks: number): void {
    this.sessionId = sessionId;
    this.lastActivityAt = this.now();
    this._state = 'running';
    this.effects.progress(0, totalChunks);
  }

  handleProgress(message: SubtitlePlusProgressMessage): void {
    if (this._state !== 'running' || message.sessionId !== this.sessionId) return;
    this.lastActivityAt = this.now();
    this.effects.progress(message.completedChunks, message.totalChunks);
  }

  handleComplete(message: SubtitlePlusCompleteMessage): void {
    if (this._state !== 'running' || message.sessionId !== this.sessionId) return;
    this._state = 'settled';
    if (message.outcome === 'failed') {
      this.effects.fail('failed');
      return;
    }
    this.effects.commit(message.cues, message.partial);
  }

  /** The user pressed Stop. */
  stop(): void {
    if (this._state !== 'running') return;
    this._state = 'settled';
    this.effects.cancel();
    this.effects.fail('cancelled');
  }

  isStalled(): boolean {
    return this._state === 'running' && this.now() - this.lastActivityAt > this.stallTimeoutMs;
  }

  /** Called by the coordinator when isStalled() is true. Idempotent. */
  failByStall(): void {
    if (!this.isStalled()) return;
    this._state = 'settled';
    this.effects.cancel();
    this.effects.fail('timeout');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run content/__tests__/subtitlePlusRun.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add content/subtitlePlusRun.ts content/__tests__/subtitlePlusRun.test.ts
git commit -m "feat(subtitles): add Plus run controller state machine"
```

---

### Task 10: Wire Plus into the subtitle coordinator

**Files:**
- Modify: `content/subtitleCoordinator.ts` (mode state, eligibility signalling, deferred hide/attach, Plus lifecycle, watchdog, progress chrome, mode override)

**Interfaces:**
- Consumes: `resolveSubtitleTranslationMode` (Task 1), `SubtitlePlusRun` (Task 9), `shouldOfferPlusHint` (Task 5), the ack/downgrade response (Task 7), the two push messages (Task 8).
- Produces: `applySubtitleModeOverride(mode | null)`, `getSubtitleModeOverride()`, and a Plus-aware `activateOverlayWithParsedCues`.

This task adds no new automated harness. The coordinator's existing suite is the regression gate; the new behavior is covered as follows:

| Behavior | Covered by |
|---|---|
| Session filtering, terminal handling, stop, stall detection | Task 9 unit tests |
| Mode resolution, eligibility, downgrade reasons | Task 5 unit tests |
| Progress counts from the ack's `totalChunks` | Task 9 `start()` test |
| Deferred native-caption hide and renderer attach | **Task 12 smoke checklist only** |
| Mode override re-activation from `state.interceptOriginalCues` | **Task 12 smoke checklist only** |

The two smoke-only rows are the cost of not extending the coordinator's browser harness in this plan. Do not weaken existing assertions to make the suite pass; if the suite fails, the wiring is wrong.

- [ ] **Step 1: Capture the green baseline**

Run: `pnpm vitest run content/__tests__/subtitleCoordinator.test.ts`
Expected: PASS. Record the count — Step 7 must match it.

- [ ] **Step 2: Add mode state and the override accessors**

In `content/subtitleCoordinator.ts`, in the state object next to `subtitleKnobOverride` (line 426), add:

```ts
  /** Per-session Plus-mode override (mini studio). Undefined = follow settings. */
  subtitleModeOverride: SubtitleTranslationMode | undefined,
```

In the state initializer next to `subtitleKnobOverride: undefined,` (line 521), add:

```ts
  subtitleModeOverride: undefined,
```

In the coordinator's teardown, next to `state.subtitleKnobOverride = undefined;` (line ~3493), add:

```ts
  state.subtitleModeOverride = undefined;
```

Add the import:

```ts
import type { SubtitleSettings, SubtitleTranslationMode } from '@/types/config';
import { resolveSubtitleTranslationMode, shouldOfferPlusHint } from '@/lib/subtitlePlusEligibility';
import { SubtitlePlusRun } from '@/content/subtitlePlusRun';
```

Next to `applySubtitleKnobOverride` (line 4414), add:

```ts
/** Apply a per-session translation-mode override (mini studio). */
export function applySubtitleModeOverride(mode: SubtitleTranslationMode | null | undefined): void {
  state.subtitleModeOverride = mode ?? undefined;
}

/** Read the current per-session mode override. */
export function getSubtitleModeOverride(): SubtitleTranslationMode | undefined {
  return state.subtitleModeOverride;
}

/** Effective mode for this tab: override > settings > progressive. */
function currentTranslationMode(settings: SubtitleSettings): SubtitleTranslationMode {
  return resolveSubtitleTranslationMode(settings.translationMode, state.subtitleModeOverride);
}
```

The coordinator does not cache settings on `state` — they are passed as parameters — so `currentTranslationMode` takes `SubtitleSettings` and is called as `currentTranslationMode(settings.subtitleSettings)` at its one call site.

- [ ] **Step 3: Send the mode and complete-track signal**

In `activateOverlayWithParsedCues`, in the `chrome.runtime.sendMessage({ action: 'translateSubtitle', ... })` call (line 1259), add after `sessionId,`:

```ts
      translationMode: currentTranslationMode(settings.subtitleSettings),
      completeTrack: true,
```

Only this function sets `completeTrack`. Do not add it to `translateManifestBatch` (line 1784), `translateDomCueTexts` (line 1619), `translateMseCueTexts` (line 2033), or any other `translateSubtitle` sender.

- [ ] **Step 4: Defer native-caption hiding and renderer attach in Plus**

In `activateOverlayWithParsedCues`, guard the two pre-request blocks. The native-hide block (lines 1229-1234) becomes:

```ts
  // Plus keeps the site's own captions visible while it prepares: nothing is
  // published until the terminal message, so hiding them would leave the user
  // with no subtitles at all. Progressive hides immediately, as today.
  const plusMode = currentTranslationMode(settings.subtitleSettings) === 'plus';
  if (!plusMode) {
    const domSource = handler?.getDomCueSource?.();
    if (domSource) {
      hideNativeCaptions(domSource.captionWindowSelector, 'display');
    } else {
      applyNativeCaptionHideForHandler(handler);
    }
  }
```

The renderer-attach block (lines 1236-1246) becomes:

```ts
  if (!state.isOverlayMode) {
    const savedPrefs = await initializeControls();
    if (isStaleActivation()) return unblockStaleIntercept();
    state.isOverlayMode = true;
    if (!plusMode) {
      const overlayConfig = buildSubtitleOverlayConfig(settings.subtitleSettings, savedPrefs);
      const attached = await initializeActiveRenderer(cues, overlayConfig);
      if (!attached) scheduleRendererAttachmentRetry();
      if (isStaleActivation()) return unblockStaleIntercept();
    }
  } else if (!plusMode) {
    updateActiveRendererCues(cues);
  }
```

- [ ] **Step 5: Handle the ack, progress, terminal, and watchdog**

Replace the `showSubtitleToast('Preparing subtitles (indexing names on first view)...', true);` line (line 1251) and the response handling (lines 1257-1300) with:

```ts
  const mode = currentTranslationMode(settings.subtitleSettings);
  showSubtitleToast(
    mode === 'plus'
      ? 'Preparing full translation…'
      : 'Preparing subtitles (indexing names on first view)...',
    true,
  );
  const pageContext = await buildSubtitlePageContext();
  if (isStaleActivation() || !stillOwnsSession()) return unblockStaleIntercept();

  try {
    const response = (await chrome.runtime.sendMessage({
      action: 'translateSubtitle',
      hostname: window.location.hostname,
      cues,
      sourceLanguage,
      targetLanguage: settings.targetLanguage,
      pageContext,
      profile: currentSubtitleProfile(),
      knobOverrides: state.subtitleKnobOverride,
      sessionId,
      translationMode: mode,
      completeTrack: true,
    })) as {
      success: boolean;
      cues?: SubtitleCue[];
      error?: string;
      sessionId?: number;
      mode?: SubtitleTranslationMode;
      downgradeReason?: string;
      totalChunks?: number;
    };

    if (isStaleActivation() || !stillOwnsSession()) return unblockStaleIntercept();
    // `cues` is kept in the guard for the progressive path: a response without
    // cues is a failure there. The Plus ack carries `cues: []`, which is
    // truthy, so it passes through to the mode branch below.
    if (!response?.success || !response.cues) {
      console.warn('AnyLLMTranslate: Translation failed', response?.error);
      if (intercept) {
        sendTranslatedSubtitle({ requestId: intercept.requestId, vttContent: intercept.originalBody });
      }
      cleanupActiveOverlay();
      hideSubtitleToast();
      showSubtitleToast('Subtitle translation failed.');
      return false;
    }

    if (response.sessionId !== undefined) {
      state.activeSubtitleSessionId = response.sessionId;
    }

    if (response.mode === 'plus' && response.sessionId !== undefined && response.totalChunks) {
      startPlusRunUi({
        sessionId: response.sessionId,
        totalChunks: response.totalChunks,
        intercept,
        stillOwnsSession,
      });
      return true;
    }

    if (response.downgradeReason) {
      showSubtitleToast(downgradeNotice(response.downgradeReason));
    }

    if (intercept) {
      sendTranslatedSubtitle({
        requestId: intercept.requestId,
        vttContent: blankNativeSubtitleBody(intercept.originalBody),
      });
    }
    updateTranslatedCues(response.cues ?? []);
    hideSubtitleToast();
    showSubtitleToast('Subtitles processing...');
    return true;
  } catch (error) {
    if (isStaleActivation() || !stillOwnsSession()) return unblockStaleIntercept();
    console.warn('AnyLLMTranslate: activateOverlayWithParsedCues error', error);
    if (intercept) {
      sendTranslatedSubtitle({ requestId: intercept.requestId, vttContent: intercept.originalBody });
    }
    cleanupActiveOverlay();
    hideSubtitleToast();
    showSubtitleToast('Subtitle translation failed.');
    return false;
  }
```

Add the two helpers next to `activateOverlayWithParsedCues`:

```ts
/** One-line explanation for a downgraded Plus request. */
function downgradeNotice(reason: string): string {
  switch (reason) {
    case 'empty-prep':
      return 'No terms found to freeze — using standard mode.';
    case 'prep-failed':
      return 'Could not prepare the term list — using standard mode.';
    default:
      return 'Full-track mode is not available here — using standard mode.';
  }
}

/** Drive the Plus progress chrome, watchdog, and commit path. */
function startPlusRunUi(args: {
  sessionId: number;
  totalChunks: number;
  intercept?: { requestId: string; originalBody: string };
  stillOwnsSession: () => boolean;
}): void {
  const commitCues = (translated: SubtitleCue[], partial: boolean) => {
    if (!args.stillOwnsSession()) return;
    if (args.intercept) {
      sendTranslatedSubtitle({
        requestId: args.intercept.requestId,
        vttContent: blankNativeSubtitleBody(args.intercept.originalBody),
      });
    }
    updateTranslatedCues(translated);
    hideMiniProgress();
    hideSubtitleToast();
    showSubtitleToast(partial ? 'Subtitles ready — some lines were not translated.' : 'Subtitles ready.');
  };

  const run = new SubtitlePlusRun({
    cancel: cancelBackgroundSubtitleSession,
    progress: (completed, total) => {
      updateMiniProgress({
        translated: completed,
        total,
        status: 'translating',
        label:
          completed === 0
            ? 'Preparing full translation…'
            : `Preparing full translation… ${completed}/${total}`,
        onStop: () => run.stop(),
      });
    },
    commit: commitCues,
    fail: (reason) => {
      hideMiniProgress();
      hideSubtitleToast();
      if (reason === 'cancelled') return;
      showSubtitleToast(
        reason === 'timeout'
          ? 'Full-track preparation timed out — showing original captions.'
          : 'Full-track translation failed — showing original captions.',
      );
    },
  });

  run.start(args.sessionId, args.totalChunks);

  const watchdog = window.setInterval(() => {
    if (run.state !== 'running') {
      window.clearInterval(watchdog);
      return;
    }
    run.failByStall();
  }, 5_000);
}
```

- [ ] **Step 6: Route the two push messages into the active run**

The coordinator needs a module-level handle for the active Plus run. Change `startPlusRunUi` to store it:

```ts
let activePlusRun: SubtitlePlusRun | null = null;
```

and inside `startPlusRunUi`, after `run.start(...)`:

```ts
  activePlusRun = run;
```

In the message listener (`handleExtensionMessage`, line 3321), before the `SUBTITLE_CHUNK_TRANSLATED` branch, add:

```ts
    if (msg.action === 'SUBTITLE_PLUS_PROGRESS') {
      activePlusRun?.handleProgress(message as SubtitlePlusProgressMessage);
      return;
    }
    if (msg.action === 'SUBTITLE_PLUS_COMPLETE') {
      const complete = message as SubtitlePlusCompleteMessage;
      activePlusRun?.handleComplete(complete);
      if (activePlusRun?.state === 'settled') activePlusRun = null;
      return;
    }
```

Add the type imports:

```ts
import type { SubtitlePlusCompleteMessage, SubtitlePlusProgressMessage } from '@/types/messages';
```

Clear the handle on teardown next to `state.subtitleModeOverride = undefined;` in the coordinator's cleanup (line 3494 area):

```ts
  activePlusRun = null;
```

- [ ] **Step 7: Verify**

Run: `pnpm vitest run content/__tests__/subtitleCoordinator.test.ts`
Expected: PASS with the same count as Step 1.

Run: `pnpm vitest run content/__tests__/subtitlePlusRun.test.ts`
Expected: PASS.

Run: `pnpm compile`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add content/subtitleCoordinator.ts
git commit -m "feat(subtitles): wire Plus lifecycle into the subtitle coordinator"
```

---

### Task 11: Mini studio mode control and the one-time hint

**Files:**
- Modify: `content/playerChrome/prefs.ts` (snapshot fields + `loadMiniStudioSnapshot`)
- Modify: `content/playerChrome/miniStudioView.ts` (new section + select)
- Modify: `content/playerChrome/miniStudio.ts` (hydrate + change handler + hint)
- Modify: `content/subtitleCoordinator.ts` (two read-only accessors for the mini studio)
- Test: `content/__tests__/playerChrome.test.ts` (extend)

**Interfaces:**
- Consumes: `applySubtitleModeOverride`, `getSubtitleModeOverride` (Task 10), `shouldOfferPlusHint` (Task 5).
- Produces: `MiniStudioView.modeSelect: HTMLSelectElement`.

- [ ] **Step 1: Write the failing test**

In `content/__tests__/playerChrome.test.ts`, add a test following the file's existing `buildMiniStudioView` usage:

```ts
import { buildMiniStudioView } from '@/content/playerChrome/miniStudioView';

it('exposes a translation-mode select with Progressive and Plus options', () => {
  const view = buildMiniStudioView();
  expect(view.modeSelect).toBeInstanceOf(HTMLSelectElement);
  expect(view.modeSelect.dataset.action).toBe('mode');
  const values = [...view.modeSelect.options].map((o) => o.value);
  expect(values).toEqual(['progressive', 'plus']);
  expect(view.modeSelect.value).toBe('progressive');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run content/__tests__/playerChrome.test.ts`
Expected: FAIL — `view.modeSelect` is undefined.

- [ ] **Step 3: Add the section and the select**

In `content/playerChrome/miniStudioView.ts`, add to the `MiniStudioView` interface after `glossary: HTMLSelectElement;`:

```ts
  modeSelect: HTMLSelectElement;
```

In `buildMiniStudioView`, add a section to the `panel.innerHTML` template immediately after the Glossary section's closing `</div>` and before the footer button:

```html
    <div class="section">
      <h3 class="section-title">Translation mode</h3>
      <div class="row">
        <label for="anyllm-ms-mode">Mode</label>
      </div>
    </div>
```

After `rows[5]?.appendChild(glossary.root);` add:

```ts
  // Row 6 is the Translation-mode row (the section was appended after Glossary,
  // so the existing 0-5 indices are unchanged).
  const modeSelect = buildSelect({ id: 'anyllm-ms-mode', action: 'mode' });
  rows[6]?.appendChild(modeSelect.root);
  fillSelect(modeSelect.select, ['progressive', 'plus'], 'progressive');
```

Add `modeSelect: modeSelect.select,` to the returned object.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run content/__tests__/playerChrome.test.ts`
Expected: PASS.

- [ ] **Step 5: Expose source availability from the coordinator**

In `content/subtitleCoordinator.ts`, next to `getSubtitleModeOverride` (Task 10), add:

```ts
/** True when the active source can run Plus: a complete parsed cue array from
 *  the full-file activation path, not an incremental tier. Advisory only — the
 *  background re-validates eligibility. */
export function isPlusSourceAvailable(): boolean {
  if (state.interceptOriginalCues.length < PLUS_MIN_CUES) return false;
  return state.activeSource !== 'dom' && state.activeSource !== 'mse' && state.activeSource !== 'manifest';
}

/** Cue count of the active complete track (0 when none). */
export function getActiveTrackCueCount(): number {
  return state.interceptOriginalCues.length;
}
```

Add `PLUS_MIN_CUES` to the `@/lib/subtitlePlusEligibility` import from Task 10.

- [ ] **Step 6: Add the snapshot fields**

In `content/playerChrome/prefs.ts`, extend `MiniStudioSnapshot` after `activeListId: string | null;`:

```ts
  /** Settings-level translation mode (the per-session override is read live). */
  mode: SubtitleTranslationMode;
  /** True when the active source provides a complete track. */
  plusAvailable: boolean;
  /** Cue count of the active complete track (0 when none). */
  cueCount: number;
  /** Persisted dismissal of the one-time Plus hint. */
  plusHintDismissed: boolean;
```

In the context-invalidated early return, add:

```ts
      mode: 'progressive',
      plusAvailable: false,
      cueCount: 0,
      plusHintDismissed: true,
```

In the populated return, add:

```ts
    mode: ss.translationMode ?? 'progressive',
    plusAvailable: isPlusSourceAvailable(),
    cueCount: getActiveTrackCueCount(),
    plusHintDismissed: ss.plusHintDismissed === true,
```

Add the imports (`SubtitleTranslationMode` from `@/types/config`; `isPlusSourceAvailable`, `getActiveTrackCueCount` from `@/content/subtitleCoordinator`).

Also add the dismissal writer next to `setActiveGlossaryList` (line 180):

```ts
/** Persist the one-time Plus hint dismissal. updateSettings deep-merges, so
 *  other subtitle settings are preserved. */
export async function setPlusHintDismissed(): Promise<void> {
  if (isContextInvalidated()) return;
  await updateSettings({ subtitleSettings: { plusHintDismissed: true } });
}
```

- [ ] **Step 7: Wire hydrate, change, and the hint**

In `content/playerChrome/miniStudio.ts`, import:

```ts
import { applySubtitleModeOverride, getSubtitleModeOverride } from '@/content/subtitleCoordinator';
import { shouldOfferPlusHint } from '@/lib/subtitlePlusEligibility';
```

Next to the glossary hydration (line 145), add:

```ts
  view.modeSelect.value = getSubtitleModeOverride() ?? snap.mode ?? 'progressive';
  view.modeSelect.disabled = !snap.plusAvailable;
  view.modeSelect.title = snap.plusAvailable
    ? ''
    : 'This player streams captions progressively';
```

Next to the glossary change listener (line 262), add:

```ts
  view.modeSelect.addEventListener('change', () => {
    applySubtitleModeOverride(view.modeSelect.value === 'plus' ? 'plus' : 'progressive');
  });
```

For the one-time hint, add a module-level `let plusHintShownThisPage = false;` next to the other module state, then inside the hydrate function after the mode select is populated:

```ts
  if (!plusHintShownThisPage && shouldOfferPlusHint(snap.cueCount, snap.plusHintDismissed)) {
    plusHintShownThisPage = true;
    showSubtitleToast(
      'This video can use full-track quality mode — open the player panel to switch.',
      false,
    );
    // Persist immediately: the hint is one-time per install, so the toast's
    // existing close button is the dismissal action and it never reappears.
    void setPlusHintDismissed();
  }
```

Import `setPlusHintDismissed` from `@/content/playerChrome/prefs` alongside the existing prefs imports, and `showSubtitleToast` from `@/content/subtitleToast` if the mini studio does not already import it.

- [ ] **Step 8: Verify**

Run: `pnpm vitest run content/__tests__/playerChrome.test.ts`
Expected: PASS.

Run: `pnpm compile`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add content/playerChrome/prefs.ts content/playerChrome/miniStudioView.ts content/playerChrome/miniStudio.ts content/subtitleCoordinator.ts content/__tests__/playerChrome.test.ts
git commit -m "feat(subtitles): add Plus mode control to the in-player mini studio"
```

---

### Task 12: Options toggle, guarantee suite, and smoke checklist

**Files:**
- Modify: `entrypoints/options/sections/subtitles/CaptionQualityCard.tsx` (global toggle)
- Test: `entrypoints/options/sections/__tests__/captionQualityPlus.test.tsx` (new file)
- Test: `lib/__tests__/subtitlePlusGuarantee.test.ts` (new file)

**Interfaces:**
- Consumes: `SubtitleSettings.translationMode` (Task 1), the guarantee properties from every earlier task.
- Produces: the user-facing global default and the regression proof.

- [ ] **Step 1: Write the failing options test**

Create `entrypoints/options/sections/__tests__/captionQualityPlus.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CaptionQualityCard } from '../subtitles/CaptionQualityCard';
import { DEFAULT_SUBTITLE_SETTINGS } from '@/types/config';

vi.stubGlobal('chrome', {
  runtime: { sendMessage: vi.fn().mockResolvedValue({ success: true, entryCount: 0, totalBytes: 0 }), onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
});

describe('CaptionQualityCard Plus toggle', () => {
  it('renders off by default and reports the change', () => {
    const onUpdate = vi.fn();
    render(
      <CaptionQualityCard settings={{ ...DEFAULT_SUBTITLE_SETTINGS }} disabled={false} onUpdate={onUpdate} />,
    );
    const toggle = screen.getByLabelText('Full-track quality mode');
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(onUpdate).toHaveBeenCalledWith({ translationMode: 'plus' });
  });

  it('renders on when the setting is plus', () => {
    render(
      <CaptionQualityCard
        settings={{ ...DEFAULT_SUBTITLE_SETTINGS, translationMode: 'plus' }}
        disabled={false}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Full-track quality mode')).toBeChecked();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run entrypoints/options/sections/__tests__/captionQualityPlus.test.tsx`
Expected: FAIL — no control labelled "Full-track quality mode".

- [ ] **Step 3: Add the toggle**

In `entrypoints/options/sections/subtitles/CaptionQualityCard.tsx`, inside `<DisabledDimmer disabled={disabled}>` after the existing ASR block's closing `</div>`, add:

```tsx
          <div className="flex items-start justify-between gap-3 pt-3 border-t border-zinc-800/60">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-zinc-200">Full-track quality mode</p>
              <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                Freeze one term list for the whole track, translate it in parallel, and show
                nothing until it is ready. More consistent names and terms; waits for the whole
                track; uses extra AI calls. Only applies to players that provide the full track.
              </p>
            </div>
            <Toggle
              id="subtitle-plus-mode-enable"
              ariaLabel="Full-track quality mode"
              checked={settings.translationMode === 'plus'}
              disabled={disabled}
              onChange={(checked) => {
                onUpdate({ translationMode: checked ? 'plus' : 'progressive' });
              }}
            />
          </div>
```

- [ ] **Step 4: Run the options test**

Run: `pnpm vitest run entrypoints/options/sections/__tests__/captionQualityPlus.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the guarantee test**

Create `lib/__tests__/subtitlePlusGuarantee.test.ts`:

```ts
/**
 * The Plus project's hard acceptance criterion: with the mode off, absent, or
 * downgraded, the progressive path is byte-for-byte unaffected.
 */
import { describe, expect, it } from 'vitest';
import {
  generateSubtitleCacheKey,
  type GlossarySnapshot,
} from '@/lib/subtitleCacheKey';
import { buildSubtitleSystemPrompt } from '@/services/subtitlePrompt';
import { PROFILE_PRESETS } from '@/lib/subtitleProfiles';
import { resolveSubtitleTranslationMode } from '@/lib/subtitlePlusEligibility';

const KNOBS = PROFILE_PRESETS.media;

describe('progressive path guarantee', () => {
  it('keeps the progressive cache key for a fixed fixture', async () => {
    const snapshot: GlossarySnapshot = {
      globalEntries: [{ source: 'Rabbit', target: 'Con thỏ' }],
      properNouns: ['Alice'],
      namedListId: 'cast',
      namedListEntries: [{ source: 'Alice', target: 'A-lít' }],
    };
    // Captured from the pre-Plus implementation. If this value changes, the
    // progressive cache identity changed and the guarantee is broken.
    const expected = '__CAPTURED_KEY__';
    const actual = await generateSubtitleCacheKey('Hello world', 'en', 'vi', KNOBS, snapshot);
    expect(actual).toBe(expected);
  });

  it('keeps the progressive prompt free of Plus blocks', () => {
    const prompt = buildSubtitleSystemPrompt('vi', KNOBS, undefined, 'rolling block');
    expect(prompt).not.toContain('Frozen terminology');
  });

  it('resolves every absent/unknown combination to progressive', () => {
    expect(resolveSubtitleTranslationMode(undefined, undefined)).toBe('progressive');
  });
});
```

The `'__CAPTURED_KEY__'` marker must be replaced with the real hash before the test can pass. The command below is an *independent* implementation of the same algorithm (FNV-1a over the knob string, FNV-1a over the glossary string, SHA-256 over the `subtitle:` input), so it yields the value the pre-Plus code produced — which is exactly what the test pins:

```bash
node -e "
const { webcrypto } = require('node:crypto');
(async () => {
  const enc = new TextEncoder();
  const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
  const knobs = fnv('neutral|balanced|moderate|preserve');
  const glossary = fnv('Rabbit=>Con thỏ|Alice|cast|Alice=>A-lít');
  const input = 'subtitle:en:vi:Hello world:' + knobs + ':' + glossary;
  const digest = await webcrypto.subtle.digest('SHA-256', enc.encode(input));
  console.log([...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''));
})();
"
```

Paste the printed 64-character hash in place of `'__CAPTURED_KEY__'`, then run the test.

- [ ] **Step 6: Run the guarantee test and the full gates**

Run: `pnpm vitest run lib/__tests__/subtitlePlusGuarantee.test.ts`
Expected: PASS (3 tests).

Run: `pnpm test`
Expected: PASS, 0 failures.

Run: `pnpm compile`
Expected: no errors.

- [ ] **Step 7: Smoke checklist (manual, browser)**

Run: `pnpm build`, then load `.output/chrome-mv3` as an unpacked extension and verify each item. Record the result of each line in the task notes.

1. Options → Subtitles shows **Full-track quality mode**, off by default.
2. Progressive (toggle off): a YouTube video with captions renders translated cues within seconds of activating subtitles, exactly as before this change.
3. Progressive: no progress bar labelled "Preparing full translation…" appears.
4. Turn the toggle on, reload the video, activate subtitles: the site's captions stay visible while the progress bar counts up; no translated cue appears before the bar disappears.
5. On completion: the overlay appears with the whole track translated; the progress bar is gone.
6. Press **Stop** mid-preparation: the progress bar disappears, the site's captions keep working, no overlay appears.
7. Open a DOM-scraped source (HBO Max or Youku): the mini studio mode select is disabled with the reason, and progressive translation still works.
8. Mini studio: switching the mode while the overlay is active re-activates with the new mode.
9. Popup → Review suggestions shows the frozen names after a Plus run.

- [ ] **Step 8: Commit**

```bash
git add entrypoints/options/sections/subtitles/CaptionQualityCard.tsx entrypoints/options/sections/__tests__/captionQualityPlus.test.tsx lib/__tests__/subtitlePlusGuarantee.test.ts
git commit -m "feat(subtitles): expose the Plus mode toggle and pin the progressive guarantee"
```