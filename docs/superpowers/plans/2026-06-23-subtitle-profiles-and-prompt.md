# Subtitle Profiles & Profile-Driven Prompt — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic web-page translation prompt on the subtitle path with a profile-driven subtitle prompt that adapts by site type (Educational / Media / Cinematic), and fix the empty first-chunk context.

**Architecture:** Profiles are data (a preset of 4 knobs per profile), not code branches. The content script resolves the profile from `window.location.hostname` (no new permission needed) and passes it in the `translateSubtitle` message. The background resolves knobs from the profile and routes the request to a new `buildSubtitleSystemPrompt`, selected over the existing web-page `buildSystemPrompt` by the presence of `subtitleKnobs` on the request. Web-page translation is untouched.

**Tech Stack:** TypeScript, WXT (browser extension framework), Vitest, `chrome.runtime` messaging.

## Global Constraints

Copied verbatim from the spec (`docs/superpowers/specs/2026-06-23-subtitle-profiles-and-prompt-design.md`):

- **No new manifest permission.** Manifest declares `['storage', 'activeTab', 'contextMenus', 'sidePanel', 'alarms']` (`wxt.config.ts:13`). `sender.tab.url` is therefore unreliable in the background — profile resolution happens in the content script via `window.location.hostname`.
- **Subtitles ignore the web `customSystemPrompt`.** When `subtitleKnobs` is present on a `TranslationRequest`, the service uses `buildSubtitleSystemPrompt` and ignores `request.customSystemPrompt`.
- **Web-page translation path is byte-for-byte unchanged.** Requests without `subtitleKnobs` continue through `buildSystemPrompt` + `customSystemPrompt` exactly as today.
- **Three profiles only:** `educational`, `media`, `cinematic`. Fallback for unmapped domains: `media`.
- **Four knobs only:** `register`, `faithfulness`, `brevity`, `profanity`. No reading-speed/timing knobs (roadmap #5).
- **JSON output contract is non-negotiable:** the subtitle prompt must contain the exact `{"translations": {...}}` instruction; the existing parser depends on it.
- **Non-interactive shell flags** (`cp -f`, `rm -f`, etc.) per `AGENTS.md`.
- **Test framework:** Vitest. Run a single test file with `pnpm vitest run <path> -t "<name>"`. Run the whole suite with `pnpm test`. Match the existing style in `services/__tests__/base.test.ts`.

---

## File Structure

| File | Responsibility | New? |
|---|---|---|
| `lib/subtitleProfiles.ts` | Profile enum, knob union types, `PROFILE_PRESETS`, `DOMAIN_PROFILE_MAP`, `resolveProfile(hostname)` — pure data + one resolver. No side effects. | ✅ |
| `lib/__tests__/subtitleProfiles.test.ts` | Unit tests for the above. | ✅ |
| `services/subtitlePrompt.ts` | `buildSubtitleSystemPrompt(targetLanguage, knobs, glossaryBlock?)` + private knob→instruction map. Pure function. | ✅ |
| `services/__tests__/subtitlePrompt.test.ts` | Unit tests for the above (per-profile content, knob coverage, JSON contract, no web-leak). | ✅ |
| `types/translation.ts` | Add `subtitleKnobs?: ProfileKnobs` to `TranslationRequest`. | edit |
| `types/messages.ts` | Add `profile?: SubtitleProfile` to `TranslateSubtitleMessage`. | edit |
| `services/openaiCompatible.ts` | In `translate()`, branch on `request.subtitleKnobs`: present → `buildSubtitleSystemPrompt` (ignore `customSystemPrompt`); absent → existing `buildSystemPrompt`. | edit |
| `content/subtitleCoordinator.ts` | Add `currentSubtitleProfile()` helper; include `profile` in the 3 `translateSubtitle` send sites. | edit |
| `services/background.ts` | Read `message.profile ?? 'media'`, resolve knobs, pass `subtitleKnobs` to `service.translate`. Seed chunk 0 with look-ahead cues. | edit |
| `services/__tests__/background.test.ts` | Add integration test: profile routes to subtitle prompt + differs by profile. Add regression test: first-chunk gets look-ahead ctx. | edit |
| `content/__tests__/subtitleCoordinator.test.ts` | Add test: outgoing `translateSubtitle` message carries `profile`. | edit |

---

## Task 1: Profile data + resolver

**Files:**
- Create: `lib/subtitleProfiles.ts`
- Test: `lib/__tests__/subtitleProfiles.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type SubtitleProfile = 'educational' | 'media' | 'cinematic'`
  - `type Register = 'formal' | 'neutral' | 'casual'`
  - `type Faithfulness = 'literal' | 'balanced' | 'idiomatic'`
  - `type Brevity = 'relaxed' | 'moderate' | 'terse'`
  - `type Profanity = 'preserve' | 'soften' | 'remove'`
  - `interface ProfileKnobs { register: Register; faithfulness: Faithfulness; brevity: Brevity; profanity: Profanity }`
  - `const PROFILE_PRESETS: Record<SubtitleProfile, ProfileKnobs>`
  - `const DOMAIN_PROFILE_MAP: Record<string, SubtitleProfile>`
  - `function resolveProfile(hostname: string): SubtitleProfile`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/subtitleProfiles.test.ts`:

```ts
/**
 * Tests for subtitle profile data + resolver.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveProfile,
  PROFILE_PRESETS,
  DOMAIN_PROFILE_MAP,
  type SubtitleProfile,
  type ProfileKnobs,
} from '@/lib/subtitleProfiles';

describe('resolveProfile', () => {
  it('returns educational for udemy.com', () => {
    expect(resolveProfile('udemy.com')).toBe('educational');
  });

  it('returns educational for coursera.org', () => {
    expect(resolveProfile('coursera.org')).toBe('educational');
  });

  it('returns educational for linkedin.com', () => {
    expect(resolveProfile('linkedin.com')).toBe('educational');
  });

  it('returns media for youtube.com', () => {
    expect(resolveProfile('youtube.com')).toBe('media');
  });

  it('returns cinematic for max.com', () => {
    expect(resolveProfile('max.com')).toBe('cinematic');
  });

  it('returns cinematic for hbomax.com', () => {
    expect(resolveProfile('hbomax.com')).toBe('cinematic');
  });

  it('falls back to media for an unmapped domain', () => {
    expect(resolveProfile('example.org')).toBe('media');
  });

  it('falls back to media for the empty string', () => {
    expect(resolveProfile('')).toBe('media');
  });
});

describe('PROFILE_PRESETS', () => {
  const ALL_PROFILES: SubtitleProfile[] = ['educational', 'media', 'cinematic'];

  it('has an entry for every profile', () => {
    for (const p of ALL_PROFILES) {
      expect(PROFILE_PRESETS[p]).toBeDefined();
    }
  });

  it('educational preset is literal-leaning', () => {
    expect(PROFILE_PRESETS.educational).toEqual({
      register: 'neutral',
      faithfulness: 'literal',
      brevity: 'relaxed',
      profanity: 'preserve',
    });
  });

  it('media preset is balanced defaults', () => {
    expect(PROFILE_PRESETS.media).toEqual({
      register: 'neutral',
      faithfulness: 'balanced',
      brevity: 'moderate',
      profanity: 'preserve',
    });
  });

  it('cinematic preset is casual + idiomatic', () => {
    expect(PROFILE_PRESETS.cinematic).toEqual({
      register: 'casual',
      faithfulness: 'idiomatic',
      brevity: 'moderate',
      profanity: 'preserve',
    });
  });
});

describe('DOMAIN_PROFILE_MAP', () => {
  it('keys are a subset of hostnames without scheme/path', () => {
    for (const key of Object.keys(DOMAIN_PROFILE_MAP)) {
      expect(key).not.toContain('/');
      expect(key).not.toContain(':');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/__tests__/subtitleProfiles.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/subtitleProfiles"` (module does not exist).

- [ ] **Step 3: Write minimal implementation**

Create `lib/subtitleProfiles.ts`:

```ts
/**
 * Subtitle profiles — maps supported subtitle sites to a named profile, and
 * each profile to a preset of translation knobs. Profiles are data, not code
 * branches: the subtitle prompt builder consumes the resolved knobs.
 *
 * See docs/superpowers/specs/2026-06-23-subtitle-profiles-and-prompt-design.md.
 */

/** The three subtitle site profiles. */
export type SubtitleProfile = 'educational' | 'media' | 'cinematic';

/** Tone/register of the translation. */
export type Register = 'formal' | 'neutral' | 'casual';

/** How closely the translation tracks the source wording. */
export type Faithfulness = 'literal' | 'balanced' | 'idiomatic';

/** How aggressively the translation trims for on-screen brevity. */
export type Brevity = 'relaxed' | 'moderate' | 'terse';

/** How to handle strong profanity. */
export type Profanity = 'preserve' | 'soften' | 'remove';

/** The four translation knobs a profile presets. */
export interface ProfileKnobs {
  register: Register;
  faithfulness: Faithfulness;
  brevity: Brevity;
  profanity: Profanity;
}

/** Preset knob values per profile. */
export const PROFILE_PRESETS: Record<SubtitleProfile, ProfileKnobs> = {
  educational: { register: 'neutral', faithfulness: 'literal',  brevity: 'relaxed',  profanity: 'preserve' },
  media:       { register: 'neutral', faithfulness: 'balanced', brevity: 'moderate', profanity: 'preserve' },
  cinematic:   { register: 'casual',  faithfulness: 'idiomatic', brevity: 'moderate', profanity: 'preserve' },
};

/**
 * Hostname → profile map. Hostnames only (no scheme, no path) — callers pass
 * `window.location.hostname`. This is intentionally a SEPARATE map from
 * `DOMAIN_CATEGORY_MAP` in content/utils/pageContext.ts: that map feeds
 * web-page category detection with coarse free-form strings; this one feeds
 * subtitle translation with a strict 3-value enum.
 */
export const DOMAIN_PROFILE_MAP: Record<string, SubtitleProfile> = {
  'udemy.com': 'educational',
  'coursera.org': 'educational',
  'linkedin.com': 'educational',
  'youtube.com': 'media',
  'max.com': 'cinematic',
  'hbomax.com': 'cinematic',
};

/**
 * Resolve a subtitle profile from a hostname. Unknown domains fall back to
 * `'media'` (balanced defaults).
 */
export function resolveProfile(hostname: string): SubtitleProfile {
  return DOMAIN_PROFILE_MAP[hostname] ?? 'media';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/__tests__/subtitleProfiles.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add lib/subtitleProfiles.ts lib/__tests__/subtitleProfiles.test.ts
git commit -m "feat(subtitle): add profile data + hostname resolver"
```

---

## Task 2: Profile-driven subtitle prompt builder

**Files:**
- Create: `services/subtitlePrompt.ts`
- Test: `services/__tests__/subtitlePrompt.test.ts`

**Interfaces:**
- Consumes: `ProfileKnobs` from `@/lib/subtitleProfiles` (Task 1).
- Produces:
  - `function buildSubtitleSystemPrompt(targetLanguage: string, knobs: ProfileKnobs, glossaryBlock?: string): string`

**Knob → instruction map (verbatim wording — these strings are asserted in tests):**

| Knob | Value | Instruction line |
|---|---|---|
| register | formal | `Use formal, polite register appropriate for professional or academic speech.` |
| register | casual | `Use natural, everyday conversational register — how people actually talk.` |
| register | neutral | *(omitted)* |
| faithfulness | literal | `Prefer precise, faithful translation — preserve technical terms and exact meaning over style.` |
| faithfulness | idiomatic | `Prefer idiomatic, natural phrasing in the target language over word-for-word translation.` |
| faithfulness | balanced | *(omitted)* |
| brevity | terse | `Be concise — trim filler words where it keeps the subtitle readable in time.` |
| brevity | moderate | *(omitted)* |
| brevity | relaxed | *(omitted)* |
| profanity | soften | `Soften strong profanity; tone down slurs.` |
| profanity | remove | `Remove strong profanity entirely.` |
| profanity | preserve | *(omitted)* |

**Fixed Part A identity block (verbatim):**
```
You are a professional subtitle translator for film, TV, and video.
The texts are short spoken lines, not web prose or documents. Translate them to {{targetLanguage}}.

Subtitle rules:
- Translate as natural spoken dialogue that a viewer reads at a glance while listening.
- Preserve the meaning and tone of the original line.
- Keep each translation roughly the same length as the source so it fits on screen.
- Maintain continuity of names and references across lines.
```

**Fixed Part D JSON contract (verbatim):**
```
Respond ONLY with valid JSON in this exact format: {"translations": {"id1": "...", "id2": "..."}}
The keys in "translations" must exactly match the input keys.
```

- [ ] **Step 1: Write the failing test**

Create `services/__tests__/subtitlePrompt.test.ts`:

```ts
/**
 * Tests for the profile-driven subtitle system prompt builder.
 */
import { describe, it, expect } from 'vitest';
import { buildSubtitleSystemPrompt } from '@/services/subtitlePrompt';
import { PROFILE_PRESETS } from '@/lib/subtitleProfiles';

describe('buildSubtitleSystemPrompt — fixed content', () => {
  const prompt = buildSubtitleSystemPrompt('Vietnamese', PROFILE_PRESETS.media);

  it('identifies the medium as spoken subtitles', () => {
    expect(prompt).toContain('subtitle translator');
    expect(prompt).toContain('spoken lines');
  });

  it('injects the target language and drops the placeholder', () => {
    expect(prompt).toContain('Vietnamese');
    expect(prompt).not.toContain('{{targetLanguage}}');
  });

  it('always carries the JSON output contract', () => {
    expect(prompt).toContain('Respond ONLY with valid JSON');
    expect(prompt).toContain('"translations"');
  });

  it('does not leak web-page-only rules', () => {
    expect(prompt.toLowerCase()).not.toContain('html');
    expect(prompt.toLowerCase()).not.toContain('mathematical');
    expect(prompt.toLowerCase()).not.toContain('url');
  });
});

describe('buildSubtitleSystemPrompt — per-profile knob instructions', () => {
  it('cinematic emits casual + idiomatic', () => {
    const prompt = buildSubtitleSystemPrompt('vi', PROFILE_PRESETS.cinematic);
    expect(prompt).toContain('how people actually talk');
    expect(prompt).toContain('idiomatic, natural phrasing');
  });

  it('educational emits literal', () => {
    const prompt = buildSubtitleSystemPrompt('vi', PROFILE_PRESETS.educational);
    expect(prompt).toContain('precise, faithful translation');
    // educational defaults are neutral/balanced/relaxed/preserve → those lines absent
    expect(prompt).not.toContain('how people actually talk');
    expect(prompt).not.toContain('idiomatic, natural phrasing');
  });

  it('media (all defaults) emits no knob instruction lines', () => {
    const prompt = buildSubtitleSystemPrompt('vi', PROFILE_PRESETS.media);
    expect(prompt).not.toContain('how people actually talk');
    expect(prompt).not.toContain('precise, faithful translation');
    expect(prompt).not.toContain('idiomatic, natural phrasing');
    expect(prompt).not.toContain('Be concise');
    expect(prompt).not.toContain('profanity');
  });
});

describe('buildSubtitleSystemPrompt — knob coverage', () => {
  const base = { register: 'neutral', faithfulness: 'balanced', brevity: 'relaxed', profanity: 'preserve' } as const;

  it('register: formal → formal line', () => {
    const p = buildSubtitleSystemPrompt('vi', { ...base, register: 'formal' });
    expect(p).toContain('formal, polite register');
  });

  it('register: casual → casual line', () => {
    const p = buildSubtitleSystemPrompt('vi', { ...base, register: 'casual' });
    expect(p).toContain('how people actually talk');
  });

  it('faithfulness: literal → literal line', () => {
    const p = buildSubtitleSystemPrompt('vi', { ...base, faithfulness: 'literal' });
    expect(p).toContain('precise, faithful translation');
  });

  it('faithfulness: idiomatic → idiomatic line', () => {
    const p = buildSubtitleSystemPrompt('vi', { ...base, faithfulness: 'idiomatic' });
    expect(p).toContain('idiomatic, natural phrasing');
  });

  it('brevity: terse → concise line', () => {
    const p = buildSubtitleSystemPrompt('vi', { ...base, brevity: 'terse' });
    expect(p).toContain('Be concise');
  });

  it('profanity: soften → soften line', () => {
    const p = buildSubtitleSystemPrompt('vi', { ...base, profanity: 'soften' });
    expect(p).toContain('Soften strong profanity');
  });

  it('profanity: remove → remove line', () => {
    const p = buildSubtitleSystemPrompt('vi', { ...base, profanity: 'remove' });
    expect(p).toContain('Remove strong profanity entirely');
  });
});

describe('buildSubtitleSystemPrompt — glossary', () => {
  it('appends glossary block when provided', () => {
    const glossary = 'Translation Glossary (always use these translations):\n- "React" → "React"';
    const p = buildSubtitleSystemPrompt('vi', PROFILE_PRESETS.media, glossary);
    expect(p).toContain('Translation Glossary');
    expect(p).toContain('"React"');
  });

  it('omits glossary entirely when not provided', () => {
    const p = buildSubtitleSystemPrompt('vi', PROFILE_PRESETS.media);
    expect(p).not.toContain('Glossary');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run services/__tests__/subtitlePrompt.test.ts`
Expected: FAIL — `Failed to resolve import "@/services/subtitlePrompt"`.

- [ ] **Step 3: Write minimal implementation**

Create `services/subtitlePrompt.ts`:

```ts
/**
 * Profile-driven system prompt for subtitle translation.
 *
 * Distinct from buildSystemPrompt() in base.ts (which serves the web-page
 * path): this prompt tells the model the texts are spoken subtitles and adapts
 * its instructions to the resolved ProfileKnobs. Web-page-only rules (HTML
 * preservation, math/formula preservation) are intentionally absent — they are
 * noise for spoken dialogue.
 *
 * See docs/superpowers/specs/2026-06-23-subtitle-profiles-and-prompt-design.md.
 */

import { getLanguageName } from '@/lib/languages';
import type { ProfileKnobs, Register, Faithfulness, Brevity, Profanity } from '@/lib/subtitleProfiles';

/** Fixed Part A — subtitle identity block. {{targetLanguage}} is substituted in. */
const SUBTITLE_IDENTITY = `You are a professional subtitle translator for film, TV, and video.
The texts are short spoken lines, not web prose or documents. Translate them to {{targetLanguage}}.

Subtitle rules:
- Translate as natural spoken dialogue that a viewer reads at a glance while listening.
- Preserve the meaning and tone of the original line.
- Keep each translation roughly the same length as the source so it fits on screen.
- Maintain continuity of names and references across lines.`;

/** Fixed Part D — JSON output contract (parser depends on this; must not change). */
const JSON_CONTRACT = `Respond ONLY with valid JSON in this exact format: {"translations": {"id1": "...", "id2": "..."}}
The keys in "translations" must exactly match the input keys.`;

/** Knob → instruction line. Default values are omitted (emit nothing). */
const REGISTER_LINE: Record<Exclude<Register, 'neutral'>, string> = {
  formal: 'Use formal, polite register appropriate for professional or academic speech.',
  casual: 'Use natural, everyday conversational register — how people actually talk.',
};

const FAITHFULNESS_LINE: Record<Exclude<Faithfulness, 'balanced'>, string> = {
  literal: 'Prefer precise, faithful translation — preserve technical terms and exact meaning over style.',
  idiomatic: 'Prefer idiomatic, natural phrasing in the target language over word-for-word translation.',
};

const BREVITY_LINE: Record<Exclude<Brevity, 'relaxed' | 'moderate'>, string> = {
  terse: 'Be concise — trim filler words where it keeps the subtitle readable in time.',
};

const PROFANITY_LINE: Record<Exclude<Profanity, 'preserve'>, string> = {
  soften: 'Soften strong profanity; tone down slurs.',
  remove: 'Remove strong profanity entirely.',
};

/** Build the profile-driven subtitle system prompt. */
export function buildSubtitleSystemPrompt(
  targetLanguage: string,
  knobs: ProfileKnobs,
  glossaryBlock?: string,
): string {
  const targetLanguageName = getLanguageName(targetLanguage);
  const displayTargetLanguage = targetLanguageName !== targetLanguage
    ? `${targetLanguageName} (${targetLanguage})`
    : targetLanguage;

  // Part A — identity.
  let prompt = SUBTITLE_IDENTITY.replace(/\{\{targetLanguage\}\}/g, displayTargetLanguage);

  // Part B — knob-driven instructions (only non-default lines).
  const knobLines: string[] = [];
  if (knobs.register !== 'neutral') {
    knobLines.push(REGISTER_LINE[knobs.register]);
  }
  if (knobs.faithfulness !== 'balanced') {
    knobLines.push(FAITHFULNESS_LINE[knobs.faithfulness]);
  }
  if (knobs.brevity !== 'relaxed' && knobs.brevity !== 'moderate') {
    knobLines.push(BREVITY_LINE[knobs.brevity]);
  }
  if (knobs.profanity !== 'preserve') {
    knobLines.push(PROFANITY_LINE[knobs.profanity]);
  }
  if (knobLines.length > 0) {
    prompt += '\n\n' + knobLines.join('\n');
  }

  // Part C — glossary.
  if (glossaryBlock) {
    prompt += '\n\n' + glossaryBlock;
  }

  // Part D — JSON contract.
  prompt += '\n\n' + JSON_CONTRACT;

  return prompt.trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run services/__tests__/subtitlePrompt.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add services/subtitlePrompt.ts services/__tests__/subtitlePrompt.test.ts
git commit -m "feat(subtitle): add profile-driven subtitle system prompt builder"
```

---

## Task 3: Thread `subtitleKnobs` through the service layer

**Files:**
- Modify: `types/translation.ts:24-37` (the `TranslationRequest` interface)
- Modify: `services/openaiCompatible.ts:43-62` (the `translate()` method's prompt selection)

**Interfaces:**
- Consumes: `ProfileKnobs` from `@/lib/subtitleProfiles` (Task 1); `buildSubtitleSystemPrompt` from `@/services/subtitlePrompt` (Task 2).
- Produces: `TranslationRequest` now has `subtitleKnobs?: ProfileKnobs`; `OpenAICompatibleService.translate` routes to the subtitle prompt when it is present.

- [ ] **Step 1: Write the failing test**

Append to `services/__tests__/openaiCompatible.test.ts` (read the file first to match its existing imports/helpers — it already has a `mockFetch` pattern; reuse it):

```ts
import { buildSubtitleSystemPrompt } from '@/services/subtitlePrompt';
import { PROFILE_PRESETS } from '@/lib/subtitleProfiles';

describe('OpenAICompatibleService.translate — subtitle prompt routing', () => {
  it('uses the subtitle prompt and ignores customSystemPrompt when subtitleKnobs is set', async () => {
    // Reuse the test file's existing service construction + mockFetch helper.
    // If the file constructs the service differently, match its pattern.
    mockFetch(JSON.stringify({ translations: { s1: 'Xin chào' } }));

    await service.translate({
      texts: new Map([['s1', 'Hello']]),
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      subtitleKnobs: PROFILE_PRESETS.cinematic,
      customSystemPrompt: 'IGNORE ME — web custom prompt',
    });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemPrompt = body.messages[0].content;

    // Subtitle identity present.
    expect(systemPrompt).toContain('subtitle translator');
    // Cinematic knob instruction present.
    expect(systemPrompt).toContain('idiomatic, natural phrasing');
    // Web custom prompt ignored.
    expect(systemPrompt).not.toContain('IGNORE ME');
    // Sanity: equals what buildSubtitleSystemPrompt produces.
    expect(systemPrompt).toBe(buildSubtitleSystemPrompt('Vietnamese', PROFILE_PRESETS.cinematic));
  });

  it('uses the web prompt and honors customSystemPrompt when subtitleKnobs is absent', async () => {
    mockFetch(JSON.stringify({ translations: { s1: 'Xin chào' } }));

    const webTemplate = 'Translate to {{targetLanguage}} ONLY. {{glossary}}\nRespond with JSON {"translations": {}}.';
    await service.translate({
      texts: new Map([['s1', 'Hello']]),
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      customSystemPrompt: webTemplate,
    });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemPrompt = body.messages[0].content;

    expect(systemPrompt).toContain('Translate to Vietnamese ONLY');
    expect(systemPrompt).not.toContain('subtitle translator');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run services/__tests__/openaiCompatible.test.ts -t "subtitle prompt routing"`
Expected: FAIL — the first test fails because `subtitleKnobs` is not a recognized field and the web `customSystemPrompt` ("IGNORE ME…") leaks into the prompt (TypeScript may also error on the unknown property, which is a valid failure).

- [ ] **Step 3: Add the type field**

Edit `types/translation.ts`. Inside `TranslationRequest` (after the `pageContext?: PageContext;` line), add:

```ts
  /** Page context for context-aware translation */
  pageContext?: PageContext;
  /** When set, the request is a subtitle translation: the service routes to
   *  buildSubtitleSystemPrompt() and ignores customSystemPrompt. */
  subtitleKnobs?: ProfileKnobs;
```

Also add the import at the top of `types/translation.ts`:

```ts
import type { PageContext } from './config';
import type { ProfileKnobs } from './subtitleProfiles';
```

- [ ] **Step 4: Route in the service**

Edit `services/openaiCompatible.ts`. At the top, add imports:

```ts
import { buildSystemPrompt, buildUserPrompt, parseTranslationResponse } from './base';
import { buildSubtitleSystemPrompt } from './subtitlePrompt';
```

Replace the system-prompt selection inside `translate()` (currently lines 45-50):

```ts
      const systemPrompt = buildSystemPrompt(
        request.targetLanguage,
        request.customSystemPrompt,
        request.glossaryBlock,
        request.pageContext,
      );
```

with:

```ts
      // Subtitle requests carry subtitleKnobs → use the profile-driven subtitle
      // prompt and ignore the web customSystemPrompt. Web-page requests fall
      // through to buildSystemPrompt exactly as before.
      const systemPrompt = request.subtitleKnobs
        ? buildSubtitleSystemPrompt(
            request.targetLanguage,
            request.subtitleKnobs,
            request.glossaryBlock,
          )
        : buildSystemPrompt(
            request.targetLanguage,
            request.customSystemPrompt,
            request.glossaryBlock,
            request.pageContext,
          );
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run services/__tests__/openaiCompatible.test.ts -t "subtitle prompt routing"`
Expected: PASS.

- [ ] **Step 6: Run the full openaiCompatible suite to confirm no regression**

Run: `pnpm vitest run services/__tests__/openaiCompatible.test.ts`
Expected: PASS (all pre-existing tests still green).

- [ ] **Step 7: Commit**

```bash
git add types/translation.ts services/openaiCompatible.ts services/__tests__/openaiCompatible.test.ts
git commit -m "feat(subtitle): route subtitle requests to subtitle prompt via subtitleKnobs"
```

---

## Task 4: Pass `profile` in the subtitle message + resolve in the content script

**Files:**
- Modify: `types/messages.ts:88-94` (the `TranslateSubtitleMessage` interface)
- Modify: `content/subtitleCoordinator.ts` (add helper + 3 send sites at lines 300, 381, 471)
- Test: `content/__tests__/subtitleCoordinator.test.ts`

**Interfaces:**
- Consumes: `resolveProfile`, `SubtitleProfile` from `@/lib/subtitleProfiles` (Task 1).
- Produces: `TranslateSubtitleMessage` now has `profile?: SubtitleProfile`; the coordinator includes it on every outbound `translateSubtitle` message.

- [ ] **Step 1: Write the failing test**

Append to `content/__tests__/subtitleCoordinator.test.ts` (read the file first to match its existing patterns for triggering coordinator code paths and capturing `chrome.runtime.sendMessage`). The test asserts the outgoing message carries `profile`:

```ts
describe('subtitle profile in outgoing translateSubtitle message', () => {
  it('includes the resolved profile on the translateSubtitle payload', async () => {
    // Trigger whichever coordinator entry point the existing tests use to reach
    // a chrome.runtime.sendMessage({ action: 'translateSubtitle', ... }) call.
    // (Match the existing test harness in this file — it already stubs
    // chrome.runtime.sendMessage and mocks the fetch response.)
    //
    // Stub the hostname to a cinematic domain and assert the message's profile.
    Object.defineProperty(window, 'location', {
      value: { hostname: 'max.com', href: 'https://max.com/movie' },
      writable: true,
    });

    await /* invoke the coordinator path that sends translateSubtitle,
              reusing the existing test helper from this file */;

    const sent = (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0]?.action === 'translateSubtitle',
    );
    expect(sent).toBeDefined();
    expect(sent[0].profile).toBe('cinematic');
  });
});
```

Note for the implementer: the placeholder `await /* invoke … */` above MUST be replaced with the actual coordinator invocation that the existing tests in this file already use (read the file's existing passing tests and copy the trigger). Do not leave the placeholder — that is a plan failure.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run content/__tests__/subtitleCoordinator.test.ts -t "resolved profile"`
Expected: FAIL — outgoing message has no `profile` field.

- [ ] **Step 3: Add the message field**

Edit `types/messages.ts`. Inside `TranslateSubtitleMessage`, after the `pageContext?: PageContext;` line, add:

```ts
  pageContext?: PageContext;
  /** Subtitle profile resolved by the content script from window.location.hostname.
   *  Background falls back to 'media' when absent (backward compat). */
  profile?: SubtitleProfile;
```

Also add the import near the top of `types/messages.ts`:

```ts
import type { SubtitleCue } from './subtitle';
import type { SubtitleProfile } from './subtitleProfiles';
```

- [ ] **Step 4: Add the coordinator helper + pass profile at send sites**

Edit `content/subtitleCoordinator.ts`. Add the import at the top:

```ts
import { resolveProfile, type SubtitleProfile } from '@/lib/subtitleProfiles';
```

Add a small helper near the other module-level helpers in the file (read the file to find the right spot — place it with the other small module functions):

```ts
/** Resolve the subtitle profile for the current page once per coordinator lifetime. */
function currentSubtitleProfile(): SubtitleProfile {
  return resolveProfile(window.location.hostname);
}
```

Then update each of the three `chrome.runtime.sendMessage({ action: 'translateSubtitle', ... })` call sites (lines ~300, ~381, ~471) to include `profile: currentSubtitleProfile(),` in the payload. Example for the first site:

```ts
    const response = await chrome.runtime.sendMessage({
      action: 'translateSubtitle',
      cues,
      sourceLanguage,
      targetLanguage: settings.targetLanguage,
      pageContext,
      profile: currentSubtitleProfile(),
    }) as { success: boolean; cues?: SubtitleCue[]; error?: string; sessionId?: number };
```

Apply the same one-line addition at the other two sites.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run content/__tests__/subtitleCoordinator.test.ts -t "resolved profile"`
Expected: PASS.

- [ ] **Step 6: Run the full coordinator suite to confirm no regression**

Run: `pnpm vitest run content/__tests__/subtitleCoordinator.test.ts`
Expected: PASS (all pre-existing tests still green).

- [ ] **Step 7: Commit**

```bash
git add types/messages.ts content/subtitleCoordinator.ts content/__tests__/subtitleCoordinator.test.ts
git commit -m "feat(subtitle): resolve profile in content script and pass in translateSubtitle message"
```

---

## Task 5: Background consumes `profile`, passes `subtitleKnobs`, fixes first-chunk context

**Files:**
- Modify: `services/background.ts` — `handleTranslateSubtitle` (line 384+) and the first-chunk call (line ~505)
- Test: `services/__tests__/background.test.ts` (existing `handleMessage — translateSubtitle` describe block)

**Interfaces:**
- Consumes: `TranslateSubtitleMessage.profile` (Task 4); `PROFILE_PRESETS`, `ProfileKnobs` from `@/lib/subtitleProfiles` (Task 1); `TranslationRequest.subtitleKnobs` (Task 3).
- Produces: subtitle translation requests now reach the LLM with `subtitleKnobs` set; chunk 0 receives look-ahead context.

- [ ] **Step 1: Write the failing tests**

Append to `services/__tests__/background.test.ts`, inside or next to the existing `describe('handleMessage — translateSubtitle', ...)` block (match its `mockFetch` + `handleMessage` + `body.messages[0].content` inspection pattern):

```ts
    it('routes cinematic profile to the subtitle prompt', async () => {
      mockFetch(JSON.stringify({ translations: { s1: 'Xin chào' } }));

      await handleMessage(
        {
          action: 'translateSubtitle',
          cues: [{ startTime: 0, endTime: 2, text: 'Hello' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          profile: 'cinematic',
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(body.messages[0].content).toContain('subtitle translator');
      expect(body.messages[0].content).toContain('idiomatic, natural phrasing');
    });

    it('routes educational profile to the subtitle prompt (literal)', async () => {
      mockFetch(JSON.stringify({ translations: { s1: 'Xin chào' } }));

      await handleMessage(
        {
          action: 'translateSubtitle',
          cues: [{ startTime: 0, endTime: 2, text: 'Hello' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          profile: 'educational',
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(body.messages[0].content).toContain('precise, faithful translation');
    });

    it('falls back to media profile when profile is absent (backward compat)', async () => {
      mockFetch(JSON.stringify({ translations: { s1: 'Xin chào' } }));

      await handleMessage(
        {
          action: 'translateSubtitle',
          cues: [{ startTime: 0, endTime: 2, text: 'Hello' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      // Media = all defaults → subtitle identity present but no knob lines.
      expect(body.messages[0].content).toContain('subtitle translator');
      expect(body.messages[0].content).not.toContain('idiomatic, natural phrasing');
      expect(body.messages[0].content).not.toContain('precise, faithful translation');
    });
```

Add a separate regression test for the first-chunk fix. This needs >CHUNK_SIZE (25) cues so a second chunk exists and the first chunk can borrow forward cues. Place it in the same describe block:

```ts
    it('seeds the first chunk with look-ahead context cues', async () => {
      // Build 30 cues so chunk 0 = cues[0..24] and look-ahead = cues[25..27].
      const cues = Array.from({ length: 30 }, (_, i) => ({
        startTime: i,
        endTime: i + 1,
        text: `Line ${i}`,
      }));
      // Mock returns a translation per input key the model is sent.
      mockFetch(JSON.stringify({
        translations: Object.fromEntries(
          // The first-chunk call sends ctx1..ctx3 (look-ahead) + s1.. for unique texts.
          // Return a translation for every key that appears; exact mapping asserted below.
          ['ctx1','ctx2','ctx3', ...Array.from({ length: 25 }, (_, i) => `s${i+1}`)].map((k) => [k, `T-${k}`]),
        ),
      }));

      await handleMessage(
        {
          action: 'translateSubtitle',
          cues,
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          profile: 'media',
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const firstCallBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      // The user prompt is messages[1].content — a JSON object of entries.
      const userPayload = JSON.parse(
        firstCallBody.messages[1].content.split('\n\n').slice(1).join('\n\n'),
      ) as Record<string, string>;

      // Look-ahead cues 25,26,27 must appear as ctx1,ctx2,ctx3.
      expect(userPayload.ctx1).toBe('Line 25');
      expect(userPayload.ctx2).toBe('Line 26');
      expect(userPayload.ctx3).toBe('Line 27');
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run services/__tests__/background.test.ts -t "routes cinematic profile"`
Expected: FAIL — the prompt sent is still the web prompt (no "subtitle translator", no "idiomatic, natural phrasing").

Run: `pnpm vitest run services/__tests__/background.test.ts -t "look-ahead context"`
Expected: FAIL — `ctx1` is either absent or equals `Line -3`-style (no forward context) because chunk 0 currently sends `[]`.

- [ ] **Step 3: Wire profile → knobs in the background**

Edit `services/background.ts`. Add imports near the top:

```ts
import { PROFILE_PRESETS, type SubtitleProfile, type ProfileKnobs } from '@/lib/subtitleProfiles';
```

In `handleTranslateSubtitle`, after `const subtitleGlossary = formatGlossary(...)` (around line 400), add profile resolution:

```ts
    const subtitleGlossary = formatGlossary(subtitleSettings.glossary ?? []);

    // Resolve translation knobs from the content-script-provided profile.
    // Unknown/absent profile falls back to 'media' (balanced defaults).
    const profile: SubtitleProfile = message.profile ?? 'media';
    const subtitleKnobs: ProfileKnobs = PROFILE_PRESETS[profile];
```

Then in `translateChunk`, add `subtitleKnobs` to the `service.translate({ ... })` call (around line 449). Find the existing call:

```ts
          const result = await service.translate({
            texts,
            sourceLanguage,
            targetLanguage,
            glossaryBlock: subtitleGlossary || undefined,
            customSystemPrompt: subtitleSettings.customSystemPrompt ?? null,
            pageContext,
          });
```

and change it to:

```ts
          const result = await service.translate({
            texts,
            sourceLanguage,
            targetLanguage,
            glossaryBlock: subtitleGlossary || undefined,
            // Subtitle path: subtitleKnobs routes to the subtitle prompt and
            // customSystemPrompt/pageContext are ignored by the service.
            subtitleKnobs,
          });
```

Note: `customSystemPrompt` and `pageContext` are deliberately removed from the subtitle call (the service ignores them when `subtitleKnobs` is set, and dropping them makes the routing unambiguous). The web-page translate path still passes them — that path is in a different function and is untouched.

- [ ] **Step 4: Fix the first-chunk context**

In the same file, find the synchronous first-chunk call (around line 505):

```ts
    const firstChunkResult = await translateChunk(firstChunkCues, []);
```

Replace `[]` with look-ahead cues:

```ts
    // Seed chunk 0 with look-ahead context (cues right AFTER the first chunk)
    // instead of empty context. The model already ignores ctx* translations
    // (see the `id.startsWith('ctx')` skip below), so this reuses the existing
    // context machinery — it just feeds forward cues for the opening chunk,
    // which otherwise translates context-blind.
    const firstChunkLookahead = cues.slice(CHUNK_SIZE, CHUNK_SIZE + CONTEXT_SIZE);
    const firstChunkResult = await translateChunk(firstChunkCues, firstChunkLookahead);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run services/__tests__/background.test.ts -t "routes cinematic profile"`
Run: `pnpm vitest run services/__tests__/background.test.ts -t "routes educational profile"`
Run: `pnpm vitest run services/__tests__/background.test.ts -t "falls back to media profile"`
Run: `pnpm vitest run services/__tests__/background.test.ts -t "look-ahead context"`
Expected: all PASS.

- [ ] **Step 6: Run the full background suite + semaphore/session suites**

Run: `pnpm vitest run services/__tests__/background.test.ts services/__tests__/background.subtitleSemaphore.test.ts services/__tests__/background.subtitleSession.test.ts services/__tests__/background.subtitleSessionIdentity.test.ts`
Expected: PASS (all pre-existing subtitle tests still green — confirms no regression in chunking/session/semaphore behavior).

- [ ] **Step 7: Commit**

```bash
git add services/background.ts services/__tests__/background.test.ts
git commit -m "feat(subtitle): consume profile → subtitleKnobs in background; seed first chunk with look-ahead"
```

---

## Task 6: Full-suite regression + web-page path guard

**Files:**
- Test: `services/__tests__/background.translate.test.ts` (existing web-page translate suite) — verify green
- No new code; this task is verification + an explicit guard test.

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: confidence that the web-page path is unaffected.

- [ ] **Step 1: Add an explicit web-page regression test**

Append to `services/__tests__/background.translate.test.ts` (the web-page translate suite), matching its existing `handleMessage({ action: 'translateText' | 'translate' ... })` pattern:

```ts
    it('web-page translate still uses buildSystemPrompt and honors customSystemPrompt', async () => {
      // Match the existing web-page translate trigger in this file (action name
      // and payload shape). The assertion: the system prompt contains the web
      // custom template text and does NOT contain the subtitle identity line.
      mockFetch(JSON.stringify({ translations: { s1: 'Xin chào' } }));

      await handleMessage(
        {
          // Use the exact action + payload the existing web-page tests in this
          // file use. If they use 'translateText' with a different shape, copy it.
          action: 'translateText',
          texts: new Map([['s1', 'Hello']]),
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          customSystemPrompt: 'WEB CUSTOM MARKER {{targetLanguage}}. {{glossary}} Respond with JSON {"translations": {}}.',
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(body.messages[0].content).toContain('WEB CUSTOM MARKER');
      expect(body.messages[0].content).not.toContain('subtitle translator');
    });
```

Note for the implementer: confirm the exact web-page `action` name and payload by reading the existing passing tests in `services/__tests__/background.translate.test.ts` and copy that shape — do not assume `translateText`. If the existing suite already has an equivalent custom-prompt test, this addition may be redundant and can be skipped (note that in the commit message).

- [ ] **Step 2: Run the web-page suite**

Run: `pnpm vitest run services/__tests__/background.translate.test.ts`
Expected: PASS.

- [ ] **Step 3: Run the ENTIRE test suite**

Run: `pnpm test`
Expected: PASS — every test file green. This is the final gate before claiming done.

- [ ] **Step 4: Build the extension**

Run: `pnpm build`
Expected: SUCCESS — no TypeScript errors, extension bundles. (If `pnpm build` is not the right command, check `package.json` scripts and use the build command there.)

- [ ] **Step 5: Commit**

```bash
git add services/__tests__/background.translate.test.ts
git commit -m "test(subtitle): guard web-page translate path unchanged"
```

---

## Self-Review

(Completed inline during plan writing.)

**1. Spec coverage:**
- Profile enum + presets + domain map + resolver → Task 1. ✅
- `buildSubtitleSystemPrompt` with 4 parts (identity, knobs, glossary, JSON) → Task 2. ✅
- `subtitleKnobs` on `TranslationRequest` + service routing + ignore custom prompt → Task 3. ✅
- `profile` on `TranslateSubtitleMessage` + content-script resolution (corrected from background after the no-`tabs`-permission finding) → Task 4. ✅
- Background consumes `profile`, passes `subtitleKnobs`, first-chunk look-ahead fix → Task 5. ✅
- Web-page path regression guard → Task 6. ✅
- All scope-boundaries (no continuity/UI/timing/cache) respected — none of those appear as tasks. ✅

**2. Placeholder scan:** One intentional placeholder remains in Task 4 Step 1 and Task 6 Step 1 — the coordinator/web-page *trigger invocation* and *action name*, which depend on existing test-harness details the implementer must read from the target test files. Both are flagged with explicit "do not leave the placeholder" instructions pointing at the exact files to read. This is unavoidable without reading those (long) test files in full here; the instruction is precise about what to copy. All code blocks (production + test assertions) are complete and concrete.

**3. Type consistency:**
- `ProfileKnobs` (Task 1) → imported in Task 2, Task 3 (`types/translation.ts`), Task 5. ✅
- `SubtitleProfile` (Task 1) → imported in Task 4 (`types/messages.ts`), Task 5. ✅
- `buildSubtitleSystemPrompt(targetLanguage, knobs, glossaryBlock?)` signature identical in Task 2 (definition), Task 3 (call). ✅
- `subtitleKnobs?: ProfileKnobs` field name identical in Task 3 (type), Task 5 (call). ✅
- `profile?: SubtitleProfile` field name identical in Task 4 (type), Task 5 (read `message.profile`). ✅
- `resolveProfile(hostname)` name identical in Task 1 (definition), Task 4 (call). ✅
- Knob instruction strings in Task 2 implementation match Task 2 test assertions verbatim (e.g. "idiomatic, natural phrasing", "precise, faithful translation"). ✅

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-23-subtitle-profiles-and-prompt.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
