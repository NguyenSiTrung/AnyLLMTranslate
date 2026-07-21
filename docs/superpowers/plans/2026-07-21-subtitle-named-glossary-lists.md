# Subtitle Named Glossary Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create named glossary packs, pick which pack applies on subtitle sites (default = last list for this site), lock those terms over auto film/rolling names, and push auto-suggestions into the active list.

**Architecture:** Store `namedGlossaryLists` + `subtitleListBySite` on `ExtensionSettings`. Pure helpers resolve the active list from hostname. Background subtitle sessions inject a personal dictionary prompt block and lock-merge so rolling/film cannot overwrite user terms. Cache keys include the named-list snapshot. Options manages packs; popup selects the active pack (per-site memory). Suggestions reuse existing pre-scan/rolling data — no new LLM call.

**Tech Stack:** TypeScript, Vitest, React (Options + Popup), chrome.storage via existing `lib/config` + `stores/settingsStore`, existing subtitle path in `services/background.ts` / `services/subtitlePrompt.ts` / `lib/subtitleCacheKey.ts`.

**Spec:** `docs/superpowers/specs/2026-07-21-subtitle-named-glossary-lists-design.md`

## Global Constraints

- Subtitle path only in v1 — do not apply named lists to web/PDF/selection translate
- No auto series/episode/title detection
- Default selection = last list for this site (decision C); None when no memory / deleted list
- Authority: named locked > global glossary > film seed > rolling
- Caps: 50 lists, 200 entries/list, name length 1–64
- Hostname: lowercase, strip trailing `.`, strip leading `www.` only
- Reuse `GlossaryEntry` and `lib/glossary.ts` import/export helpers
- TDD: failing test → implement → pass → commit per task
- Keep None-selected behavior byte-identical to today’s subtitle path (no personal block)

## File map

| File | Responsibility |
|------|----------------|
| `types/config.ts` | `NamedGlossaryList`, settings fields, defaults |
| `types/messages.ts` | Optional `hostname` / list fields on subtitle messages if needed |
| `types/translation.ts` | `namedListGlossaryBlock?` on `TranslationRequest` |
| `lib/namedGlossaryLists.ts` | **NEW** pure helpers (resolve, format, push, prune, caps) |
| `lib/subtitleGlossary.ts` | Lock-aware merge (or wrapper) |
| `lib/subtitleCacheKey.ts` | Snapshot includes named list |
| `services/subtitlePrompt.ts` | Inject named block before global |
| `services/openaiCompatible.ts` | Pass new prompt arg |
| `services/background.ts` | Session resolve + lock + prompt + cache snapshot |
| `stores/settingsStore.ts` | `extractSettings` includes new fields |
| `entrypoints/options/sections/AdvancedSection.tsx` | `PORTABLE_KEYS` |
| `entrypoints/options/sections/DictionarySection.tsx` (+ components) | Named lists CRUD UI |
| `entrypoints/popup/components/QuickSettings.tsx` (+ small helper) | List selector when subtitles on |
| `content/subtitleCoordinator.ts` | Pass hostname on `translateSubtitle` |
| Tests under `lib/__tests__/`, `services/__tests__/`, options/popup component tests | |

---

### Task 1: Types + defaults + settings plumbing

**Files:**
- Modify: `types/config.ts` (after `GlossaryEntry`, in `ExtensionSettings`, in `DEFAULT_SETTINGS`)
- Modify: `stores/settingsStore.ts` (`extractSettings`)
- Modify: `entrypoints/options/sections/AdvancedSection.tsx` (`PORTABLE_KEYS`)
- Test: `lib/__tests__/namedGlossaryLists.defaults.test.ts` (or fold into Task 2 tests if preferred — prefer asserting defaults via importing `DEFAULT_SETTINGS`)

**Interfaces:**
- Produces:
  ```ts
  export interface NamedGlossaryList {
    id: string;
    name: string;
    entries: GlossaryEntry[];
    updatedAt: number;
  }
  export type SubtitleListBySite = Record<string, string>;
  // ExtensionSettings.namedGlossaryLists: NamedGlossaryList[]
  // ExtensionSettings.subtitleListBySite: SubtitleListBySite
  ```

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/namedGlossarySettings.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '@/types/config';

describe('named glossary settings defaults', () => {
  it('ships empty named lists and empty per-site map', () => {
    expect(DEFAULT_SETTINGS.namedGlossaryLists).toEqual([]);
    expect(DEFAULT_SETTINGS.subtitleListBySite).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/namedGlossarySettings.test.ts -v`  
Expected: FAIL (property missing on `DEFAULT_SETTINGS`)

- [ ] **Step 3: Minimal implementation**

In `types/config.ts` after `GlossaryEntry`:

```ts
/** User-owned named glossary pack (subtitle-scoped in v1). */
export interface NamedGlossaryList {
  id: string;
  name: string;
  entries: GlossaryEntry[];
  updatedAt: number;
}

/** hostname → named list id (last selection per site). */
export type SubtitleListBySite = Record<string, string>;
```

On `ExtensionSettings` after `glossary`:

```ts
  /** Named glossary packs for subtitle personal dictionaries. */
  namedGlossaryLists: NamedGlossaryList[];
  /** Last selected named list id per subtitle site hostname. */
  subtitleListBySite: SubtitleListBySite;
```

In `DEFAULT_SETTINGS`:

```ts
  glossary: [],
  namedGlossaryLists: [],
  subtitleListBySite: {},
```

In `stores/settingsStore.ts` `extractSettings`, add:

```ts
    glossary: state.glossary,
    namedGlossaryLists: state.namedGlossaryLists,
    subtitleListBySite: state.subtitleListBySite,
```

In `AdvancedSection.tsx` `PORTABLE_KEYS`, add `'namedGlossaryLists', 'subtitleListBySite'` next to `'glossary'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/__tests__/namedGlossarySettings.test.ts -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add types/config.ts stores/settingsStore.ts entrypoints/options/sections/AdvancedSection.tsx lib/__tests__/namedGlossarySettings.test.ts
git commit -m "feat(settings): add named glossary list types and defaults"
```

---

### Task 2: Pure helpers — host, resolve, format, caps, push, prune

**Files:**
- Create: `lib/namedGlossaryLists.ts`
- Create: `lib/__tests__/namedGlossaryLists.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const MAX_NAMED_GLOSSARY_LISTS = 50;
  export const MAX_NAMED_LIST_ENTRIES = 200;
  export const MAX_NAMED_LIST_NAME_LENGTH = 64;

  export function normalizeSubtitleSiteHost(hostname: string): string
  export function resolveActiveSubtitleListId(
    lists: NamedGlossaryList[],
    bySite: SubtitleListBySite,
    hostname: string,
  ): string | null
  export function getNamedListById(
    lists: NamedGlossaryList[],
    id: string | null | undefined,
  ): NamedGlossaryList | undefined
  export function formatNamedListGlossary(list: NamedGlossaryList): string
  export function pruneSubtitleListBySite(
    bySite: SubtitleListBySite,
    lists: NamedGlossaryList[],
  ): SubtitleListBySite
  export function setSiteListSelection(
    bySite: SubtitleListBySite,
    hostname: string,
    listId: string | null,
  ): SubtitleListBySite
  export type PushEntriesResult =
    | { ok: true; list: NamedGlossaryList }
    | { ok: false; error: 'duplicate' | 'cap' | 'empty' | 'invalid-name' };
  export function createNamedList(
    lists: NamedGlossaryList[],
    name: string,
    now?: number,
  ): { ok: true; lists: NamedGlossaryList[]; list: NamedGlossaryList } | { ok: false; error: 'cap' | 'invalid-name' }
  export function pushEntriesIntoList(
    list: NamedGlossaryList,
    incoming: Array<{ source: string; target: string }>,
    now?: number,
  ): PushEntriesResult
  export function lockedSourceSet(list: NamedGlossaryList | undefined): Set<string>
  // locked keys: lowercase trimmed source for membership; preserve original spellings in maps separately
  export function entriesToLockMap(list: NamedGlossaryList | undefined): Map<string, string>
  // Map key = original source string as stored (first wins); lookup helpers use case-insensitive match in merge filter
  export function filterUnlockedProperNouns(
    properNouns: Record<string, string>,
    lockedSources: Set<string>, // lowercase
  ): Record<string, string>
  export function omitGlobalEntriesCoveredByNamed(
    global: GlossaryEntry[],
    lockedSources: Set<string>,
  ): GlossaryEntry[]
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import {
  normalizeSubtitleSiteHost,
  resolveActiveSubtitleListId,
  formatNamedListGlossary,
  pruneSubtitleListBySite,
  setSiteListSelection,
  createNamedList,
  pushEntriesIntoList,
  filterUnlockedProperNouns,
  omitGlobalEntriesCoveredByNamed,
  MAX_NAMED_LIST_ENTRIES,
} from '@/lib/namedGlossaryLists';
import type { NamedGlossaryList } from '@/types/config';

const list = (over: Partial<NamedGlossaryList> = {}): NamedGlossaryList => ({
  id: 'L1',
  name: '三体',
  entries: [{ id: 'e1', source: '叶文洁', target: 'Ye Wenjie' }],
  updatedAt: 1,
  ...over,
});

describe('normalizeSubtitleSiteHost', () => {
  it('lowercases, strips www and trailing dot', () => {
    expect(normalizeSubtitleSiteHost('WWW.Youku.com.')).toBe('youku.com');
    expect(normalizeSubtitleSiteHost('play.hbomax.com')).toBe('play.hbomax.com');
  });
});

describe('resolveActiveSubtitleListId', () => {
  it('returns site memory when list exists, else null', () => {
    const lists = [list()];
    expect(resolveActiveSubtitleListId(lists, { 'youku.com': 'L1' }, 'www.youku.com')).toBe('L1');
    expect(resolveActiveSubtitleListId(lists, { 'youku.com': 'GONE' }, 'youku.com')).toBeNull();
    expect(resolveActiveSubtitleListId(lists, {}, 'youku.com')).toBeNull();
  });
});

describe('formatNamedListGlossary', () => {
  it('formats personal dictionary block and empty list as empty string', () => {
    expect(formatNamedListGlossary(list())).toContain('Personal dictionary "三体"');
    expect(formatNamedListGlossary(list())).toContain('"叶文洁" → "Ye Wenjie"');
    expect(formatNamedListGlossary(list({ entries: [] }))).toBe('');
  });
});

describe('setSiteListSelection / prune', () => {
  it('sets, clears None, and prunes deleted lists', () => {
    let map = setSiteListSelection({}, 'www.youku.com', 'L1');
    expect(map).toEqual({ 'youku.com': 'L1' });
    map = setSiteListSelection(map, 'youku.com', null);
    expect(map).toEqual({});
    expect(pruneSubtitleListBySite({ a: 'L1', b: 'X' }, [list()])).toEqual({ a: 'L1' });
  });
});

describe('createNamedList / pushEntriesIntoList', () => {
  it('creates, pushes, rejects dups and caps', () => {
    const created = createNamedList([], '  CS50  ');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.list.name).toBe('CS50');

    const pushed = pushEntriesIntoList(created.list, [
      { source: 'MIT', target: 'MIT' },
      { source: 'mit', target: 'dup' },
    ]);
    // first wins or second rejected — assert no case-insensitive dup sources
    expect(pushed.ok).toBe(true);
    if (!pushed.ok) return;
    expect(pushed.list.entries.filter((e) => e.source.toLowerCase() === 'mit')).toHaveLength(1);

    const full: NamedGlossaryList = {
      ...created.list,
      entries: Array.from({ length: MAX_NAMED_LIST_ENTRIES }, (_, i) => ({
        id: `id${i}`,
        source: `s${i}`,
        target: `t${i}`,
      })),
    };
    const cap = pushEntriesIntoList(full, [{ source: 'new', target: 'x' }]);
    expect(cap).toEqual({ ok: false, error: 'cap' });
  });
});

describe('lock filters', () => {
  it('drops locked proper nouns and omits covered global entries', () => {
    const locked = new Set(['elsa']);
    expect(filterUnlockedProperNouns({ Elsa: '艾莎', Anna: '安娜' }, locked)).toEqual({
      Anna: '安娜',
    });
    expect(
      omitGlobalEntriesCoveredByNamed(
        [
          { id: '1', source: 'Elsa', target: 'wrong' },
          { id: '2', source: 'Olaf', target: 'Olaf' },
        ],
        locked,
      ).map((e) => e.source),
    ).toEqual(['Olaf']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run lib/__tests__/namedGlossaryLists.test.ts -v`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `lib/namedGlossaryLists.ts`**

Implement all exports above. Rules:
- `normalizeSubtitleSiteHost`: `hostname.trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '')`
- `resolveActiveSubtitleListId`: normalize host → lookup map → if id in lists return id else null
- `formatNamedListGlossary`: empty entries → `''`; else header + `- "s" → "t"` lines (same arrow style as `formatGlossary`)
- `pushEntriesIntoList`: skip empty source/target; case-insensitive skip if source exists; if adding would exceed cap return `{ ok: false, error: 'cap' }`; assign `crypto.randomUUID()` for new entry ids; bump `updatedAt`
- `createNamedList`: trim name; reject empty / >64; reject if lists.length >= 50
- `filterUnlockedProperNouns`: drop keys whose `source.trim().toLowerCase()` is in locked set
- `entriesToLockMap`: `Map` of source→target from list entries (skip empty)
- `lockedSourceSet`: lowercase trimmed sources

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run lib/__tests__/namedGlossaryLists.test.ts -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/namedGlossaryLists.ts lib/__tests__/namedGlossaryLists.test.ts
git commit -m "feat(glossary): pure helpers for named subtitle lists"
```

---

### Task 3: Lock-aware rolling merge

**Files:**
- Modify: `lib/subtitleGlossary.ts`
- Create: `lib/__tests__/subtitleGlossary.test.ts`

**Interfaces:**
- Produces: extend `mergeProperNouns` with optional third arg OR add:

```ts
export function mergeProperNouns(
  glossary: Map<string, string>,
  properNouns: Record<string, string>,
  options?: { lockedSources?: Set<string> },
): void
```

Locked check: case-insensitive on source. Existing two-arg callers unchanged.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mergeProperNouns } from '@/lib/subtitleGlossary';

describe('mergeProperNouns locks', () => {
  it('does not overwrite or add locked sources', () => {
    const g = new Map<string, string>([['Elsa', 'UserElsa']]);
    mergeProperNouns(g, { Elsa: 'AutoElsa', Anna: '安娜' }, { lockedSources: new Set(['elsa']) });
    expect(g.get('Elsa')).toBe('UserElsa');
    expect(g.get('Anna')).toBe('安娜');
  });

  it('keeps prior behavior without locks', () => {
    const g = new Map<string, string>([['Elsa', 'old']]);
    mergeProperNouns(g, { Elsa: 'new' });
    expect(g.get('Elsa')).toBe('new');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL** (options ignored / not accepted)

- [ ] **Step 3: Implement optional `lockedSources` in `mergeProperNouns`**

```ts
export function mergeProperNouns(
  glossary: Map<string, string>,
  properNouns: Record<string, string>,
  options?: { lockedSources?: Set<string> },
): void {
  const locked = options?.lockedSources;
  for (const [source, target] of Object.entries(properNouns)) {
    if (!target) continue;
    if (locked?.has(source.trim().toLowerCase())) continue;
    if (glossary.size >= MAX_ROLLING_GLOSSARY && !glossary.has(source)) continue;
    glossary.set(source, target);
  }
}
```

Note: locked keys already in the map (seeded from named list) must not be overwritten; the `locked?.has` skip handles incoming. Do **not** remove existing locked keys.

- [ ] **Step 4: Run tests — PASS**

Run: `pnpm exec vitest run lib/__tests__/subtitleGlossary.test.ts -v`

- [ ] **Step 5: Commit**

```bash
git add lib/subtitleGlossary.ts lib/__tests__/subtitleGlossary.test.ts
git commit -m "feat(subtitle): lock-aware proper-noun merge"
```

---

### Task 4: Cache key snapshot includes named list

**Files:**
- Modify: `lib/subtitleCacheKey.ts`
- Modify: `lib/__tests__/subtitleCacheKey.test.ts`

**Interfaces:**
- Change:

```ts
export interface GlossarySnapshot {
  globalEntries: Array<{ source: string; target: string }>;
  properNouns: string[];
  /** Active named list id, or null/omit when None. */
  namedListId?: string | null;
  /** Active named list entries (order-normalized in hash). */
  namedListEntries?: Array<{ source: string; target: string }>;
}
```

`hashGlossary` must fold `namedListId` + sorted `namedListEntries` into the FNV input. Missing fields ≡ empty (backward compatible for tests using old snapshots).

- [ ] **Step 1: Extend tests**

Add to `subtitleCacheKey.test.ts`:

```ts
  it('changes when named list id or entries change', () => {
    const base: GlossarySnapshot = { globalEntries: [], properNouns: [] };
    const withId: GlossarySnapshot = {
      ...base,
      namedListId: 'L1',
      namedListEntries: [{ source: 'A', target: 'B' }],
    };
    const withId2: GlossarySnapshot = {
      ...base,
      namedListId: 'L2',
      namedListEntries: [{ source: 'A', target: 'B' }],
    };
    const edited: GlossarySnapshot = {
      ...base,
      namedListId: 'L1',
      namedListEntries: [{ source: 'A', target: 'C' }],
    };
    expect(hashGlossary(withId)).not.toBe(hashGlossary(base));
    expect(hashGlossary(withId)).not.toBe(hashGlossary(withId2));
    expect(hashGlossary(withId)).not.toBe(hashGlossary(edited));
    // order-independent entries
    expect(
      hashGlossary({
        ...base,
        namedListId: 'L1',
        namedListEntries: [
          { source: 'p', target: 'q' },
          { source: 'a', target: 'b' },
        ],
      }),
    ).toBe(
      hashGlossary({
        ...base,
        namedListId: 'L1',
        namedListEntries: [
          { source: 'a', target: 'b' },
          { source: 'p', target: 'q' },
        ],
      }),
    );
  });
```

- [ ] **Step 2: Run — FAIL** (hash ignores named fields)

- [ ] **Step 3: Update `hashGlossary`**

```ts
export function hashGlossary(snapshot: GlossarySnapshot): string {
  const globalSorted = [...snapshot.globalEntries]
    .sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0))
    .map((e) => `${e.source}=>${e.target}`)
    .join(';');
  const nounsSorted = [...snapshot.properNouns].sort().join(';');
  const namedId = snapshot.namedListId ?? '';
  const namedSorted = [...(snapshot.namedListEntries ?? [])]
    .sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0))
    .map((e) => `${e.source}=>${e.target}`)
    .join(';');
  return fnv1aHex(`${globalSorted}|${nounsSorted}|${namedId}|${namedSorted}`);
}
```

- [ ] **Step 4: Run full cache key tests — PASS**

Run: `pnpm exec vitest run lib/__tests__/subtitleCacheKey.test.ts -v`

- [ ] **Step 5: Commit**

```bash
git add lib/subtitleCacheKey.ts lib/__tests__/subtitleCacheKey.test.ts
git commit -m "feat(cache): include named glossary list in subtitle cache key"
```

---

### Task 5: Prompt block + TranslationRequest wiring

**Files:**
- Modify: `services/subtitlePrompt.ts`
- Modify: `types/translation.ts`
- Modify: `services/openaiCompatible.ts`
- Create or modify: `services/__tests__/subtitlePrompt.test.ts` (create if missing)

**Interfaces:**
- Produces:

```ts
// subtitlePrompt.ts
export function buildSubtitleSystemPrompt(
  targetLanguage: string,
  knobs: ProfileKnobs,
  glossaryBlock?: string,
  rollingGlossaryBlock?: string,
  namedListGlossaryBlock?: string,
): string

// TranslationRequest
namedListGlossaryBlock?: string;
```

Order inside prompt: identity → knobs → **named** → global → rolling → JSON contract.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildSubtitleSystemPrompt } from '@/services/subtitlePrompt';
import { PROFILE_PRESETS } from '@/lib/subtitleProfiles';

describe('buildSubtitleSystemPrompt named list', () => {
  it('places personal dictionary before global glossary', () => {
    const prompt = buildSubtitleSystemPrompt(
      'vi',
      PROFILE_PRESETS.media,
      'Translation Glossary (always use these translations):\n- "G" → "g"',
      'Previously translated names in this content (use these consistently):\n- "R" → "r"',
      'Personal dictionary "Pack" (always use these translations; do not alter):\n- "P" → "p"',
    );
    const iNamed = prompt.indexOf('Personal dictionary "Pack"');
    const iGlobal = prompt.indexOf('Translation Glossary');
    const iRolling = prompt.indexOf('Previously translated names');
    expect(iNamed).toBeGreaterThan(-1);
    expect(iNamed).toBeLessThan(iGlobal);
    expect(iGlobal).toBeLessThan(iRolling);
  });

  it('omits named section when block absent', () => {
    const prompt = buildSubtitleSystemPrompt('vi', PROFILE_PRESETS.media);
    expect(prompt).not.toContain('Personal dictionary');
  });
});
```

- [ ] **Step 2: Run — FAIL** (4th data block ignored / param missing)

- [ ] **Step 3: Implement**

In `buildSubtitleSystemPrompt`, after knobs and **before** global glossary:

```ts
  if (namedListGlossaryBlock) {
    prompt += '\n\n' + namedListGlossaryBlock;
  }
  if (glossaryBlock) {
    prompt += '\n\n' + glossaryBlock;
  }
  if (rollingGlossaryBlock) {
    prompt += '\n\n' + rollingGlossaryBlock;
  }
```

Add `namedListGlossaryBlock?: string` to `TranslationRequest` with JSDoc: injected before global glossary on subtitle path.

In `openaiCompatible.ts`:

```ts
        ? buildSubtitleSystemPrompt(
            request.targetLanguage,
            request.subtitleKnobs,
            request.glossaryBlock,
            request.rollingGlossaryBlock,
            request.namedListGlossaryBlock,
          )
```

Update any unit test that snapshots full prompt arity if needed (`openaiCompatible.test.ts` rolling glossary case still works — new arg optional).

- [ ] **Step 4: Run**

```bash
pnpm exec vitest run services/__tests__/subtitlePrompt.test.ts services/__tests__/openaiCompatible.test.ts -v
```

Expected: PASS (fix openai tests if they assert exact prompt string without named block — should still pass)

- [ ] **Step 5: Commit**

```bash
git add services/subtitlePrompt.ts types/translation.ts services/openaiCompatible.ts services/__tests__/subtitlePrompt.test.ts
git commit -m "feat(subtitle): inject named list glossary into system prompt"
```

---

### Task 6: Background session — resolve list, lock, snapshot, translate

**Files:**
- Modify: `types/messages.ts` (`TranslateSubtitleMessage`)
- Modify: `content/subtitleCoordinator.ts` (all `action: 'translateSubtitle'` payloads)
- Modify: `services/background.ts` (`handleTranslateSubtitle`)
- Modify: `services/__tests__/background.test.ts` and/or add `services/__tests__/background.namedGlossary.test.ts`

**Interfaces:**
- Message addition:

```ts
  /** Page hostname for per-site named list resolution. */
  hostname?: string;
```

Coordinator always sends `hostname: window.location.hostname` (raw; background normalizes).

Background algorithm (inside `handleTranslateSubtitle` after `loadSettings`):

```ts
const host = normalizeSubtitleSiteHost(message.hostname ?? hostFromSender(sender) ?? '');
const activeList = getNamedListById(
  subtitleSettings.namedGlossaryLists ?? [],
  resolveActiveSubtitleListId(
    subtitleSettings.namedGlossaryLists ?? [],
    subtitleSettings.subtitleListBySite ?? {},
    host,
  ),
);
const lockedSources = lockedSourceSet(activeList);
const lockedMap = entriesToLockMap(activeList);
const namedBlock = activeList ? formatNamedListGlossary(activeList) : '';

// global glossary: omit entries covered by named locks
const globalForPrompt = omitGlobalEntriesCoveredByNamed(
  subtitleSettings.glossary ?? [],
  lockedSources,
);
const subtitleGlossary = formatGlossary(globalForPrompt);

// rolling seed: start with locked entries so chunk 0 sees them in rolling too? 
// Spec: named is separate prompt block. Still seed rolling with film only,
// using lock filter — do NOT put named into rolling (avoids double + unlock confusion).
// Film seed:
if (filmGlossary) {
  mergeProperNouns(rollingGlossary, filterUnlockedProperNouns(filmGlossary, lockedSources), {
    lockedSources,
  });
}
// On chunk properNouns:
mergeProperNouns(rollingGlossary, result.properNouns, { lockedSources });

const buildGlossarySnapshot = (): GlossarySnapshot => ({
  globalEntries: (subtitleSettings.glossary ?? []).map((e) => ({ source: e.source, target: e.target })),
  properNouns: [...new Set([...rollingGlossary.keys(), ...(filmGlossary ? Object.keys(filmGlossary) : [])])],
  namedListId: activeList?.id ?? null,
  namedListEntries: (activeList?.entries ?? []).map((e) => ({ source: e.source, target: e.target })),
});

// service.translate({
//   ...
//   glossaryBlock: subtitleGlossary || undefined,
//   namedListGlossaryBlock: namedBlock || undefined,
//   rollingGlossaryBlock: formatRollingGlossary(rollingGlossary) || undefined,
// })
```

If `host` is empty string, resolve yields null (None) — safe.

- [ ] **Step 1: Write integration-style test**

Prefer a focused test file that mocks `loadSettings`, film glossary, and service like existing background tests:

```ts
// Assert translate() received namedListGlossaryBlock containing Personal dictionary
// Assert second chunk merge does not change locked name when properNouns tries overwrite
// Assert None path does not pass namedListGlossaryBlock
```

Mirror patterns in `services/__tests__/background.test.ts` (film glossary mocks already present).

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Wire message + coordinator + background as above**

Find every `action: 'translateSubtitle'` in `content/subtitleCoordinator.ts` and add `hostname: window.location.hostname`.

- [ ] **Step 4: Run**

```bash
pnpm exec vitest run services/__tests__/background.test.ts services/__tests__/background.namedGlossary.test.ts -v
```

Expected: PASS (update mocks if `TranslationRequest` type causes excess property issues — should be fine)

- [ ] **Step 5: Commit**

```bash
git add types/messages.ts content/subtitleCoordinator.ts services/background.ts services/__tests__/background.namedGlossary.test.ts
git commit -m "feat(subtitle): apply locked named glossary list in translate session"
```

---

### Task 7: Options — Named lists management UI

**Files:**
- Modify: `entrypoints/options/sections/DictionarySection.tsx`
- Create (as needed):  
  - `entrypoints/options/components/NamedGlossaryListPanel.tsx`  
  - `entrypoints/options/components/NamedGlossaryListDetail.tsx`  
- Test: `entrypoints/options/sections/__tests__/DictionarySection.namedLists.test.tsx` (or component tests)

**Behavior:**
- Below Global Custom terms, section **Named lists**
- `+ New list` → name prompt/inline → `createNamedList` → `updateSettings`
- Row: name, entry count, Open, ⋯ Rename / Export JSON / Delete (confirm if entries.length > 0)
- Detail view: reuse `GlossaryEntryList` + `DictionaryAddForm` patterns against `list.entries`; on save replace list in array and prune site map if deleted
- Import entries into list via existing CSV/JSON parsers
- Empty hero copy: “Names you lock here win over auto subtitle glossary when this list is selected on a video site.”

Keep Global block behavior unchanged.

- [ ] **Step 1: Component test — create list appears in store callback**

Use existing DictionarySection test patterns (`entrypoints/options/sections/__tests__/DictionarySection.test.tsx`).

Minimal:

```tsx
it('renders Named lists heading and creates a list', async () => {
  // mock useSettingsStore with namedGlossaryLists: []
  // click New list, type name, confirm
  // expect updateSettings called with namedGlossaryLists length 1
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement UI**

Use `useSettingsStore` for `namedGlossaryLists`, `subtitleListBySite`, `updateSettings`.  
On delete:

```ts
const nextLists = lists.filter((l) => l.id !== id);
updateSettings({
  namedGlossaryLists: nextLists,
  subtitleListBySite: pruneSubtitleListBySite(bySite, nextLists),
});
```

- [ ] **Step 4: Run options tests + typecheck if available**

```bash
pnpm exec vitest run entrypoints/options/sections/__tests__/DictionarySection -v
```

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/sections/DictionarySection.tsx entrypoints/options/components/NamedGlossary*.tsx entrypoints/options/sections/__tests__/
git commit -m "feat(options): manage named subtitle glossary lists"
```

---

### Task 8: Popup — select list + per-site memory (C)

**Files:**
- Modify: `entrypoints/popup/components/QuickSettings.tsx`
- Modify: `entrypoints/popup/App.tsx` (pass props / hostname from active tab)
- Create: `entrypoints/popup/lib/subtitleDictionarySelection.ts` (optional pure glue)
- Test: `entrypoints/popup/components/__tests__/QuickSettings.namedList.test.tsx`

**Behavior:**
When `subtitlesEnabled`:
- Show **Subtitle dictionary** `<select>` or `CustomSelect`:
  - `None`
  - each list by name
  - optional “Manage lists…” → `chrome.runtime.openOptionsPage` with hash if supported, else Options root
- Helper text: `Using last choice for {host}` when resolved from memory; or `No list for this site`
- On change:
  ```ts
  const nextMap = setSiteListSelection(subtitleListBySite, tabHostname, listIdOrNull);
  await updateSettings({ subtitleListBySite: nextMap });
  ```
- Resolve displayed value via `resolveActiveSubtitleListId` for `tabHostname`
- Obtain hostname: existing popup tab query (`usePopupTab` / `chrome.tabs.query`) — follow how other popup features get tab URL

**Inline create (minimum):** “+ New list” can open Options; optional compact prompt in popup is nice-to-have in this task if cheap.

- [ ] **Step 1: Test selector calls onChange with list id / null**

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement selector UI gated on subtitlesEnabled**

- [ ] **Step 4: PASS popup tests**

```bash
pnpm exec vitest run entrypoints/popup -v
```

- [ ] **Step 5: Commit**

```bash
git add entrypoints/popup/
git commit -m "feat(popup): select named glossary list with per-site memory"
```

---

### Task 9: Suggestions review + push into active list

**Files:**
- Create: `lib/namedGlossarySuggestions.ts` (pure candidate builder)
- Create: `lib/__tests__/namedGlossarySuggestions.test.ts`
- Create: `entrypoints/popup/components/NamedGlossarySuggestionsModal.tsx` (or Options-only first — prefer popup when subtitles on)
- Wire: message or storage read of last film glossary is harder from popup; **v1 source of truth for suggestions:**

**Pragmatic v1 candidates (no new LLM):**
1. Entries already in rolling are not available in popup without a bridge.  
2. **Use film glossary store from background:** add message `getFilmGlossaryForTab` **or** simpler v1: suggestions modal only offers **manual add** + optional “import from global” — **Rejected by spec.**

**Spec-compliant approach:**
- Add background message `getSubtitleNameSuggestions` handled in SW:
  - Input: optional `contentHash` or recompute from last session — sessions are ephemeral.
- Better: content script keeps `state.lastFilmGlossary: Record<string,string> | null` and `state.lastRollingSnapshot` updated when chunks arrive (background would need to send properNouns back — currently may not).

**Minimal path that matches spec without large coordinator rewrite:**

1. On `handleTranslateSubtitle`, after film glossary resolve, `chrome.storage.session.set({ [`suggest:${tabId}`]: filmGlossary })` (session storage).  
2. Popup asks background `getNamedGlossarySuggestions` → reads session key for active tab + merges nothing else.  
3. Modal edits + push via `pushEntriesIntoList` + `updateSettings`.

If session storage unavailable patterns differ, use `chrome.storage.session` (MV3) which this extension can use (already uses session elsewhere for PDF dedupe).

**Files for bridge:**
- Modify: `types/messages.ts` — `getNamedGlossarySuggestions` / response  
- Modify: `services/background.ts` — write suggestions after film load; handle get  
- Popup modal UI  

- [ ] **Step 1: Pure test for candidate builder**

```ts
// buildSuggestionRows(auto: Record<string,string>, activeList, limit=30)
// - exclude sources already in list (case-insensitive)
// - stable sort by source
// - cap 30
```

- [ ] **Step 2: FAIL → implement `lib/namedGlossarySuggestions.ts` → PASS**

- [ ] **Step 3: Background session write + message handler + popup modal “Review suggestions”**

Push:

```ts
const list = getNamedListById(lists, activeId);
if (!list) return toast error "Select a list first";
const result = pushEntriesIntoList(list, selectedRows);
if (!result.ok) toast error;
else updateSettings({
  namedGlossaryLists: lists.map((l) => (l.id === list.id ? result.list : l)),
});
```

- [ ] **Step 4: Tests for pure builder + message handler unit if practical**

```bash
pnpm exec vitest run lib/__tests__/namedGlossarySuggestions.test.ts -v
```

- [ ] **Step 5: Commit**

```bash
git add lib/namedGlossarySuggestions.ts lib/__tests__/namedGlossarySuggestions.test.ts types/messages.ts services/background.ts entrypoints/popup/
git commit -m "feat(subtitle): suggest and push names into active glossary list"
```

---

### Task 10: Regression suite + docs touch-up

**Files:**
- Modify: `conductor/product.md` Key Features bullet under Video Subtitle Translation (one bullet for named lists) — only if project convention expects product.md updates on feature ship; keep brief
- Run full relevant tests

- [ ] **Step 1: Run targeted then broader tests**

```bash
pnpm exec vitest run lib/__tests__/namedGlossaryLists.test.ts lib/__tests__/namedGlossarySettings.test.ts lib/__tests__/subtitleGlossary.test.ts lib/__tests__/subtitleCacheKey.test.ts lib/__tests__/namedGlossarySuggestions.test.ts services/__tests__/subtitlePrompt.test.ts services/__tests__/background.namedGlossary.test.ts services/__tests__/openaiCompatible.test.ts entrypoints/options/sections/__tests__/ entrypoints/popup -v
```

- [ ] **Step 2: Fix any fallout** (extractSettings missing fields often breaks save round-trip — already in Task 1)

- [ ] **Step 3: Manual QA checklist (document in commit message or learnings)**

1. None selected → subtitles behave as before  
2. Create list in Options, add 2 terms  
3. On YouTube/Youku watch page, popup selects list → site memory restores on reopen  
4. Translate chunk uses personal block (debugMode log)  
5. Review suggestions → push → entries appear in Options list  
6. Switch to None → forward behavior without personal block  

- [ ] **Step 4: Commit**

```bash
git add conductor/product.md  # if updated
git commit -m "test: verify named glossary lists regression suite"
```

---

### Task 11 (optional polish): In-page dictionary chip

**Files:**
- Modify: `content/subtitleControls.ts` / overlay controls
- Reuse same select semantics via message to update `subtitleListBySite`

Only implement if Tasks 1–10 green and time remains. Not required for MVP (popup is enough per spec).

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Named lists data model + defaults | 1 |
| Host normalize + resolve C + format + caps + push + prune | 2 |
| Locks on rolling/film merge | 3, 6 |
| Cache key includes named list | 4, 6 |
| Prompt order named → global → rolling | 5, 6 |
| Background session apply | 6 |
| Options CRUD | 7 |
| Popup select + per-site memory | 8 |
| Suggest → edit → push | 9 |
| None ≡ baseline | 6, 10 |
| No auto series detect | (global — no task adds it) |
| Subtitle-only scope | 6 (web path untouched) |
| Portable export keys | 1 |
| extractSettings persistence | 1 |

## Placeholder / consistency review

- No TBD steps  
- `NamedGlossaryList` / helper names consistent across tasks  
- `namedListGlossaryBlock` naming aligned request ↔ prompt ↔ openaiCompatible  
- Film suggestions via `chrome.storage.session` + tabId is the concrete bridge (not hand-waved)

## Execution notes

- Prefer **subagent-driven-development** one task at a time with review gates  
- Do not start Task 7 UI before Task 6 engine (UI without locks ships a footgun)  
- Task 9 depends on Task 8 (need active list selection UX) but pure suggestion builder can parallelize after Task 2  
