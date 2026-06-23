# Subtitle Knob Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the four subtitle translation knobs (Register, Faithfulness, Brevity, Profanity) user-editable at two layers — a persisted global override (Options) and a session-scoped per-tab override (popup) — merged over each site's profile preset.

**Architecture:** A new pure `resolveEffectiveKnobs(profile, global, perTab)` helper merges partial overrides in precedence order (per-tab > global > preset). The single behavioral change is at the existing merge seam in `services/background.ts:413`. Per-tab state lives in the content script (mirroring the existing `categoryOverride` pattern) and rides on the `translateSubtitle` message as `knobOverrides`; global state is a new persisted field on `SubtitleSettings`. The prompt builder and service layer need no changes — they are already knob-driven from sub-project 1. With both overrides empty, behavior is byte-for-byte identical to today.

**Tech Stack:** TypeScript, WXT (browser extension), React 19 + Zustand store, Tailwind CSS v4, existing `ui/` primitives (`Card`, `FieldGroup`, `SegmentedControl`, `Toggle`), vitest.

## Global Constraints

- **No changes** to `services/subtitlePrompt.ts`, `services/openaiCompatible.ts`, or `types/translation.ts` (`TranslationRequest.subtitleKnobs` already exists and routes correctly).
- **Auto = absence.** A knob not overridden is omitted from the `Partial<ProfileKnobs>` object (never a sentinel string). "Auto" in the UI writes/removes the key; it is NOT stored as a value.
- **Defaults = empty override = today's behavior.** With `knobOverrides = {}` globally and no per-tab override, `resolveEffectiveKnobs` returns `PROFILE_PRESETS[profile]` exactly. This is the primary regression guard.
- **Per-tab override is session-scoped, not persisted.** It resets on page reload and on SPA navigation (same lifecycle as `state.categoryOverride`).
- **Profile resolution stays hostname-driven.** This sub-project does NOT add per-hostname knob overrides — only global + per-tab.
- **Knob vocabulary is fixed** (from sub-project 1): Register `formal|neutral|casual`; Faithfulness `literal|balanced|idiomatic`; Brevity `relaxed|moderate|terse`; Profanity `preserve|soften|remove`. No new values.
- All tests run via `npx vitest run <path>` (non-interactive). Use `npx vitest run <path> -t "<name>"` to target a single test.
- Commits are per-task; commit messages use `feat(subtitle):`, `test(subtitle):`, `refactor(subtitle):` prefixes matching recent history.

---

## File Structure

| File | Responsibility | New? |
|---|---|---|
| `lib/subtitleProfiles.ts` | Adds `KnobOverride` type + `resolveEffectiveKnobs()` pure merge helper alongside existing exports | edit |
| `lib/__tests__/subtitleProfiles.test.ts` | Unit tests for `resolveEffectiveKnobs` precedence + regression | edit |
| `types/config.ts` | Adds `knobOverrides?: Partial<ProfileKnobs>` to `SubtitleSettings`; default `{}` in `DEFAULT_SUBTITLE_SETTINGS` | edit |
| `types/messages.ts` | Adds `knobOverrides?` to `TranslateSubtitleMessage`; adds `SetSubtitleKnobOverrideMessage` interface | edit |
| `content/subtitleCoordinator.ts` | Adds `subtitleKnobOverride` state; handles `setSubtitleKnobOverride` + `getSubtitleKnobOverride`; carries `knobOverrides` at 3 send sites; resets on nav | edit |
| `services/background.ts` | Replaces `PROFILE_PRESETS[profile]` with `resolveEffectiveKnobs(profile, global, perTab)` (~3 lines at 413) | edit |
| `services/__tests__/background.test.ts` | Integration tests asserting merged knobs appear in the prompt | edit |
| `content/__tests__/subtitleCoordinator.test.ts` | Tests: `setSubtitleKnobOverride` populates state; outgoing message carries `knobOverrides` | edit |
| `entrypoints/options/sections/SubtitlesSection.tsx` | New "Translation Style" card: 4 knob `SegmentedControl`s + Reset, bound to global `knobOverrides` | edit |
| `entrypoints/popup/App.tsx` | New "Subtitle style" expander (per-tab override); queries `getSubtitleKnobOverride` on open | edit |

---

## Task 1: Pure merge helper `resolveEffectiveKnobs`

**Files:**
- Modify: `lib/subtitleProfiles.ts` (add at end of file)
- Test: `lib/__tests__/subtitleProfiles.test.ts` (extend)

**Interfaces:**
- Consumes: `SubtitleProfile`, `ProfileKnobs`, `PROFILE_PRESETS` (all already exported from this same file).
- Produces: `KnobOverride` (= `Partial<ProfileKnobs>`) and `resolveEffectiveKnobs(profile, globalOverride?, perTabOverride?)` — used by Task 4 (background).

- [ ] **Step 1: Write the failing tests**

Append to `lib/__tests__/subtitleProfiles.test.ts` (after the existing `DOMAIN_PROFILE_MAP` describe block). First update the import at the top of the file:

```ts
import {
  resolveProfile,
  resolveEffectiveKnobs,
  PROFILE_PRESETS,
  DOMAIN_PROFILE_MAP,
  type SubtitleProfile,
} from '@/lib/subtitleProfiles';
```

Then append the new describe block at the end of the file:

```ts
describe('resolveEffectiveKnobs', () => {
  it('returns the profile preset unchanged when both overrides are absent', () => {
    expect(resolveEffectiveKnobs('cinematic')).toEqual(PROFILE_PRESETS.cinematic);
    expect(resolveEffectiveKnobs('educational')).toEqual(PROFILE_PRESETS.educational);
  });

  it('returns the profile preset unchanged when overrides are empty objects', () => {
    expect(resolveEffectiveKnobs('media', {}, {})).toEqual(PROFILE_PRESETS.media);
  });

  it('falls back to media preset for an unknown profile string', () => {
    // Guard against untrusted runtime data: PROFILE_PRESETS[badKey] is undefined.
    const result = resolveEffectiveKnobs('bogus' as SubtitleProfile);
    expect(result).toEqual(PROFILE_PRESETS.media);
  });

  it('global override replaces only the set knob; others inherit from preset', () => {
    const result = resolveEffectiveKnobs('cinematic', { profanity: 'remove' });
    expect(result).toEqual({
      register: 'casual',        // from cinematic preset
      faithfulness: 'idiomatic', // from cinematic preset
      brevity: 'moderate',       // from cinematic preset
      profanity: 'remove',       // overridden
    });
  });

  it('per-tab override wins over global on the same knob', () => {
    const result = resolveEffectiveKnobs(
      'cinematic',
      { faithfulness: 'literal' },   // global
      { faithfulness: 'balanced' },  // per-tab wins
    );
    expect(result.faithfulness).toBe('balanced');
  });

  it('per-tab and global apply on disjoint knobs', () => {
    const result = resolveEffectiveKnobs(
      'media',
      { profanity: 'soften' },   // global only
      { brevity: 'terse' },      // per-tab only
    );
    expect(result).toEqual({
      register: 'neutral',       // from media preset
      faithfulness: 'balanced',  // from media preset
      brevity: 'terse',          // per-tab
      profanity: 'soften',       // global
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/subtitleProfiles.test.ts`
Expected: FAIL — `resolveEffectiveKnobs` is not exported (import error).

- [ ] **Step 3: Write minimal implementation**

Append to `lib/subtitleProfiles.ts` (after the existing `resolveProfile` function):

```ts
/** A partial set of knob values — absent knobs inherit from the layer below. */
export type KnobOverride = Partial<ProfileKnobs>;

/**
 * Resolve the effective knobs by layering partial overrides over the profile
 * preset. Precedence: perTab > global > preset. Keys absent from an override
 * inherit from the layer below. An unknown profile string falls back to 'media'
 * (guards against malformed untrusted runtime data, matching resolveProfile).
 *
 * With both overrides empty/absent this returns PROFILE_PRESETS[profile]
 * exactly — today's behavior, byte-for-byte.
 */
export function resolveEffectiveKnobs(
  profile: SubtitleProfile,
  globalOverride?: KnobOverride,
  perTabOverride?: KnobOverride,
): ProfileKnobs {
  return {
    ...(PROFILE_PRESETS[profile] ?? PROFILE_PRESETS.media),
    ...(globalOverride ?? {}),
    ...(perTabOverride ?? {}),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/subtitleProfiles.test.ts`
Expected: PASS — all existing tests + the 6 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/subtitleProfiles.ts lib/__tests__/subtitleProfiles.test.ts
git commit -m "feat(subtitle): add resolveEffectiveKnobs merge helper

Pure function layering partial knob overrides (per-tab > global > preset)
over a profile's preset. No-op when both overrides are empty — preserves
today's behavior. Foundation for editable knob overrides."
```

---

## Task 2: Type changes — config + messages

**Files:**
- Modify: `types/config.ts` (`SubtitleSettings` interface ~line 106 + `DEFAULT_SUBTITLE_SETTINGS` ~line 254)
- Modify: `types/messages.ts` (`TranslateSubtitleMessage` ~line 89; add `SetSubtitleKnobOverrideMessage`)

**Interfaces:**
- Consumes: `ProfileKnobs` from `lib/subtitleProfiles.ts`.
- Produces: `SubtitleSettings.knobOverrides?` (consumed by Task 4 background + Task 5 Options UI); `TranslateSubtitleMessage.knobOverrides?` (consumed by Task 4 background); `SetSubtitleKnobOverrideMessage` (consumed by Task 3 content handler + Task 6 popup).

- [ ] **Step 1: Add `knobOverrides` to `SubtitleSettings`**

In `types/config.ts`, find the `SubtitleSettings` interface and add the field. First check the current import line at the top of the file to ensure `ProfileKnobs` is imported from `@/lib/subtitleProfiles`. If it is not present, add it to the import from `@/lib/subtitleProfiles` (a new import line if none exists). Then add the field as the last field of the interface:

```ts
  /**
   * Per-knob global translation-style overrides. Only set knobs override the
   * resolved profile preset; absent knobs inherit. Undefined/empty == no
   * override == today's behavior. Consumed in services/background.ts via
   * resolveEffectiveKnobs().
   */
  knobOverrides?: Partial<ProfileKnobs>;
```

- [ ] **Step 2: Set the default to `{}` in `DEFAULT_SUBTITLE_SETTINGS`**

In `types/config.ts`, find `DEFAULT_SUBTITLE_SETTINGS` and add `knobOverrides: {}` as the last field (after `disabledSubtitleSites`):

```ts
  knobOverrides: {},
```

- [ ] **Step 3: Add `knobOverrides?` to `TranslateSubtitleMessage`**

In `types/messages.ts`, find `TranslateSubtitleMessage` and add the field after `profile`:

```ts
  /** Per-tab translation-style override (session-scoped; from popup).
   *  Partial<ProfileKnobs> — set knobs override the profile/global layers.
   *  Undefined when no per-tab override is active. */
  knobOverrides?: Partial<ProfileKnobs>;
```

- [ ] **Step 4: Add `SetSubtitleKnobOverrideMessage` interface**

In `types/messages.ts`, add the new interface after `TranslateSubtitleMessage`:

```ts
/** Popup → content: set or clear the active tab's per-subtitle translation-style override. */
export interface SetSubtitleKnobOverrideMessage {
  action: 'setSubtitleKnobOverride';
  /** Partial knobs to set, or null to clear the tab override entirely. */
  knobOverrides: Partial<ProfileKnobs> | null;
}
```

- [ ] **Step 5: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: PASS with no errors. (If `ProfileKnobs` import is flagged as unused in either file, it is because the field/interface uses it — confirm the field is present; do not remove the import.)

- [ ] **Step 6: Commit**

```bash
git add types/config.ts types/messages.ts
git commit -m "feat(subtitle): add knobOverrides types for global + per-tab overrides

SubtitleSettings.knobOverrides (persisted global override, default {}),
TranslateSubtitleMessage.knobOverrides (per-tab override on the wire), and
SetSubtitleKnobOverrideMessage (popup → content setter)."
```

---

## Task 3: Content-script per-tab override state + message handling

**Files:**
- Modify: `content/subtitleCoordinator.ts`
- Test: `content/__tests__/subtitleCoordinator.test.ts` (extend)

**Interfaces:**
- Consumes: `ProfileKnobs` from `@/lib/subtitleProfiles`; `SetSubtitleKnobOverrideMessage` action string from Task 2.
- Produces: `state.subtitleKnobOverride` (module state); outgoing `translateSubtitle` messages carry `knobOverrides`; responds to `setSubtitleKnobOverride` and `getSubtitleKnobOverride`.

- [ ] **Step 1: Write the failing tests**

First, read `content/__tests__/subtitleCoordinator.test.ts` to find the existing `handleIntercepted` translation-path test that asserts the outgoing `translateSubtitle` message shape (search for `chrome.runtime.sendMessage).toHaveBeenCalledWith` near the intercepted path, around lines 220-280). Mirror that test's setup. Add two new tests.

Add a helper import for the type at the top of the test file (if not already present):

```ts
import type { ProfileKnobs } from '@/lib/subtitleProfiles';
```

Add a new `describe` block (place it near the existing category/override tests, e.g. after the last `describe` block in the file). The exact send path tested should match whatever path the existing `translateSubtitle` message assertion test uses — read that test first and reuse its setup (mock `parseSubtitles`, `loadSettings`, dispatch the intercepted handler). Below uses the intercepted-handler path; adapt the setup to match the existing working test in the file:

```ts
describe('subtitleKnobOverride (per-tab)', () => {
  it('includes knobOverrides on the outgoing translateSubtitle message when set', async () => {
    // Mirror the setup of the existing intercepted-path translate test:
    // mock parseSubtitles to return cues, mock loadSettings to return enabled
    // subtitle settings, then dispatch the captured intercepted handler.
    // (Copy the exact setup lines from the existing passing test above.)

    // Dispatch setSubtitleKnobOverride to every registered runtime listener.
    const addListenerCalls = (global.chrome.runtime.onMessage.addListener as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    for (const call of addListenerCalls) {
      const l = call[0] as (m: { action: string; knobOverrides?: Partial<ProfileKnobs> | null }) => void;
      try { l({ action: 'setSubtitleKnobOverride', knobOverrides: { faithfulness: 'literal' } }); } catch { /* ignore */ }
    }

    // Trigger the intercepted translation path (same trigger the existing test uses).
    // ... (reuse the existing test's trigger)

    const sent = (chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => (c[0] as { action?: string }).action === 'translateSubtitle',
    );
    expect(sent).toBeDefined();
    expect((sent![0] as { knobOverrides?: Partial<ProfileKnobs> }).knobOverrides).toEqual({ faithfulness: 'literal' });
  });

  it('omits knobOverrides (undefined) from the outgoing message when not set', async () => {
    // Same setup as above, but do NOT dispatch setSubtitleKnobOverride.
    // ... (reuse the existing test's trigger)

    const sent = (chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => (c[0] as { action?: string }).action === 'translateSubtitle',
    );
    expect(sent).toBeDefined();
    expect((sent![0] as { knobOverrides?: Partial<ProfileKnobs> }).knobOverrides).toBeUndefined();
  });

  it('clears the override when setSubtitleKnobOverride receives null', async () => {
    const addListenerCalls = (global.chrome.runtime.onMessage.addListener as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    // Set, then clear.
    for (const call of addListenerCalls) {
      const l = call[0] as (m: { action: string; knobOverrides?: Partial<ProfileKnobs> | null }) => void;
      try { l({ action: 'setSubtitleKnobOverride', knobOverrides: { brevity: 'terse' } }); } catch { /* ignore */ }
    }
    for (const call of addListenerCalls) {
      const l = call[0] as (m: { action: string; knobOverrides?: Partial<ProfileKnobs> | null }) => void;
      try { l({ action: 'setSubtitleKnobOverride', knobOverrides: null }); } catch { /* ignore */ }
    }

    // Trigger the intercepted translation path.
    // ... (reuse the existing test's trigger)

    const sent = (chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => (c[0] as { action?: string }).action === 'translateSubtitle',
    );
    expect(sent).toBeDefined();
    expect((sent![0] as { knobOverrides?: Partial<ProfileKnobs> }).knobOverrides).toBeUndefined();
  });
});
```

**IMPORTANT for the implementer:** The "reuse the existing test's setup/trigger" lines above are the single highest-risk part of this plan. Before writing these tests, READ the existing passing test that asserts `translateSubtitle` is sent on the intercepted path (around line 270-280 per the grep). Copy its `beforeEach`/mock setup verbatim, then add only the override dispatch + assertion. Do NOT invent a new setup. If you cannot find that test, ask.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run content/__tests__/subtitleCoordinator.test.ts -t "subtitleKnobOverride"`
Expected: FAIL — first test fails (`knobOverrides` is undefined on the sent message because the handler doesn't set state and the send sites don't read it yet).

- [ ] **Step 3: Add `subtitleKnobOverride` to coordinator state**

In `content/subtitleCoordinator.ts`:

3a. Add the type import. Find the existing import of `resolveProfile, type SubtitleProfile` from `@/lib/subtitleProfiles` (around line 41) and extend it to also import `ProfileKnobs`:

```ts
import { resolveProfile, type SubtitleProfile, type ProfileKnobs } from '@/lib/subtitleProfiles';
```

3b. Add the state field. In the `CoordinatorState` interface, right after the existing `categoryOverride: string | undefined;` field (around line 64), add:

```ts
  /** Temporary tab-scoped translation-knob override from popup (resets on reload/nav). */
  subtitleKnobOverride: Partial<ProfileKnobs> | undefined;
```

3c. Initialize the default. Find the coordinator state default object (around line 95, where `categoryOverride: undefined` is set) and add right after it:

```ts
  subtitleKnobOverride: undefined,
```

- [ ] **Step 4: Handle the two new messages**

In `content/subtitleCoordinator.ts`, find the `categoryChanged` handler block (around line 972):

```ts
    // Handle category override changes from popup
    if (msg.action === 'categoryChanged') {
      state.categoryOverride = (message as { category?: string | null }).category ?? undefined;
    }
```

Add right after it:

```ts
    // Handle per-tab subtitle knob override from popup (set/clear)
    if (msg.action === 'setSubtitleKnobOverride') {
      const o = (message as { knobOverrides?: Partial<ProfileKnobs> | null }).knobOverrides;
      state.subtitleKnobOverride = o ?? undefined; // null clears → undefined
    }
    // Popup queries the current tab override on open
    if (msg.action === 'getSubtitleKnobOverride') {
      _sendResponse({ knobOverrides: state.subtitleKnobOverride ?? {} });
    }
```

- [ ] **Step 5: Carry `knobOverrides` at the 3 send sites**

In `content/subtitleCoordinator.ts`, at each of the three `translateSubtitle` send sites (lines 316, 398, 489 — each has `profile: currentSubtitleProfile(),`), add the override immediately after the `profile` line:

```ts
      profile: currentSubtitleProfile(),
      knobOverrides: state.subtitleKnobOverride,
```

(When `state.subtitleKnobOverride` is `undefined`, the field is present in the object but `JSON.stringify` drops it on the wire — equivalent to omitting it. The background reads it as `message.knobOverrides` which is then `undefined`.)

- [ ] **Step 6: Reset on SPA navigation**

In `content/subtitleCoordinator.ts`, find the reset block where `state.categoryOverride = undefined;` is set on navigation (around line 1042), and add right after it:

```ts
  state.subtitleKnobOverride = undefined;
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run content/__tests__/subtitleCoordinator.test.ts`
Expected: PASS — all existing tests + the 3 new tests pass.

- [ ] **Step 8: Commit**

```bash
git add content/subtitleCoordinator.ts content/__tests__/subtitleCoordinator.test.ts
git commit -m "feat(subtitle): per-tab knob override state in subtitle coordinator

Adds subtitleKnobOverride module state (session-scoped, resets on reload/nav),
handles setSubtitleKnobOverride + getSubtitleKnobOverride messages, and carries
knobOverrides on all three translateSubtitle send sites. Mirrors the existing
categoryOverride pattern."
```

---

## Task 4: Background merge — `resolveEffectiveKnobs`

**Files:**
- Modify: `services/background.ts` (lines ~407-414 + import)
- Test: `services/__tests__/background.test.ts` (extend)

**Interfaces:**
- Consumes: `resolveEffectiveKnobs` (Task 1); `message.knobOverrides` (Task 2); `subtitleSettings.subtitleSettings.knobOverrides` (Task 2, already loaded at line 404).
- Produces: merged `ProfileKnobs` flowing into `translateChunk` → `service.translate({ subtitleKnobs })` (unchanged downstream).

- [ ] **Step 1: Write the failing tests**

In `services/__tests__/background.test.ts`, find the `describe('handleMessage — translateSubtitle', ...)` block (line 192). Add three new tests inside it, after the existing profile-routing tests. The pattern: seed settings via `mockStorage['anyllm-translate-settings']`, send the message, assert the prompt content (the fetch body) reflects the merge.

```ts
    it('applies a per-tab knob override over the profile preset', async () => {
      mockFetch(JSON.stringify({ translations: { s1: 'Xin chào' } }));

      await handleMessage(
        {
          action: 'translateSubtitle',
          cues: [{ startTime: 0, endTime: 2, text: 'Hello' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          profile: 'cinematic',                              // preset faithfulness = idiomatic
          knobOverrides: { faithfulness: 'literal' },        // per-tab overrides to literal
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      // literal line present, idiomatic line absent (overridden).
      expect(body.messages[0].content).toContain('precise, faithful translation');
      expect(body.messages[0].content).not.toContain('idiomatic, natural phrasing');
    });

    it('applies a persisted global knob override when no per-tab override is set', async () => {
      // Seed global override in settings storage.
      mockStorage['anyllm-translate-settings'] = {
        subtitleSettings: { knobOverrides: { profanity: 'remove' } },
      };
      mockFetch(JSON.stringify({ translations: { s1: 'Xin chào' } }));

      await handleMessage(
        {
          action: 'translateSubtitle',
          cues: [{ startTime: 0, endTime: 2, text: 'Hello' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          profile: 'media',
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(body.messages[0].content).toContain('Remove strong profanity entirely');
    });

    it('produces the plain profile prompt when neither override is set (regression)', async () => {
      mockFetch(JSON.stringify({ translations: { s1: 'Xin chào' } }));

      await handleMessage(
        {
          action: 'translateSubtitle',
          cues: [{ startTime: 0, endTime: 2, text: 'Hello' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          profile: 'media',   // all defaults → no knob lines
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      // Media preset = neutral/balanced/moderate/preserve → identity only, no knob lines.
      expect(body.messages[0].content).toContain('subtitle translator');
      expect(body.messages[0].content).not.toContain('idiomatic, natural phrasing');
      expect(body.messages[0].content).not.toContain('precise, faithful translation');
      expect(body.messages[0].content).not.toContain('Remove strong profanity');
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run services/__tests__/background.test.ts -t "translateSubtitle"`
Expected: FAIL — the first test fails because the background still uses the unmodified cinematic preset (idiomatic line present, literal line absent).

- [ ] **Step 3: Wire the merge in the background**

In `services/background.ts`, find the import line near the top that pulls from `@/lib/subtitleProfiles` (around line 25):

```ts
import { PROFILE_PRESETS, type SubtitleProfile, type ProfileKnobs } from '@/lib/subtitleProfiles';
```

Add `resolveEffectiveKnobs` to that import:

```ts
import { PROFILE_PRESETS, resolveEffectiveKnobs, type SubtitleProfile, type ProfileKnobs } from '@/lib/subtitleProfiles';
```

Then find the profile/knob resolution block (lines 407-414):

```ts
    const profile: SubtitleProfile = message.profile ?? 'media';
    const subtitleKnobs: ProfileKnobs = PROFILE_PRESETS[profile] ?? PROFILE_PRESETS.media;
```

Replace those two lines with:

```ts
    const profile: SubtitleProfile = message.profile ?? 'media';
    // Layer partial overrides over the profile preset. Precedence:
    // per-tab (message.knobOverrides) > global (persisted) > preset.
    // With both absent this returns PROFILE_PRESETS[profile] exactly.
    const subtitleKnobs: ProfileKnobs = resolveEffectiveKnobs(
      profile,
      subtitleSettings.subtitleSettings?.knobOverrides,
      message.knobOverrides,
    );
```

Note: `subtitleSettings` (line 404) is the full `ExtensionSettings` object, so the global override is at `subtitleSettings.subtitleSettings.knobOverrides`. The optional chaining (`?.`) guards against a stored settings object missing the new field before deep-merge backfills it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run services/__tests__/background.test.ts`
Expected: PASS — all existing tests + the 3 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/background.ts services/__tests__/background.test.ts
git commit -m "feat(subtitle): merge global + per-tab knob overrides in background

handleTranslateSubtitle now calls resolveEffectiveKnobs(profile, global, perTab)
instead of reading PROFILE_PRESETS directly. The single behavioral seam for
editable knobs; no-op when both overrides are empty."
```

---

## Task 5: Options UI — "Translation Style" card

**Files:**
- Modify: `entrypoints/options/sections/SubtitlesSection.tsx`

**Interfaces:**
- Consumes: `useSettingsStore` (`subtitleSettings`, `updateSettings`); `ProfileKnobs`, knob union types from `@/lib/subtitleProfiles`; existing `ui/` primitives (`Card`, `FieldGroup`, `SegmentedControl`).
- Produces: writes `subtitleSettings.knobOverrides` (persisted global) via the existing `handleUpdate` helper.

- [ ] **Step 1: Add knob option constants**

In `entrypoints/options/sections/SubtitlesSection.tsx`, near the existing option constants (`POSITION_OPTIONS`, `FONT_FAMILY_OPTIONS`, etc., around lines 22-41), add:

```ts
import type { ProfileKnobs } from '@/lib/subtitleProfiles';
import { RotateCcw } from 'lucide-react';

// Auto = inherit from the resolved profile preset (omit the key from the override).
type KnobKey = keyof ProfileKnobs;

const REGISTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'formal', label: 'Formal' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'casual', label: 'Casual' },
];

const FAITHFULNESS_OPTIONS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'literal', label: 'Literal' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'idiomatic', label: 'Idiomatic' },
];

const BREVITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'relaxed', label: 'Relaxed' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'terse', label: 'Terse' },
];

const PROFANITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'preserve', label: 'Preserve' },
  { value: 'soften', label: 'Soften' },
  { value: 'remove', label: 'Remove' },
];
```

(If `RotateCcw` is not yet imported, add it to the existing `lucide-react` import line at the top of the file rather than adding a second import.)

- [ ] **Step 2: Add the change handler**

Inside the `SubtitlesSection` component (after the existing `handleUpdate` definition, around line 218), add:

```ts
  const overrides = subtitleSettings.knobOverrides ?? {};

  const handleKnobChange = (knob: KnobKey, value: string) => {
    const next = { ...overrides };
    if (value === 'auto') {
      delete next[knob];
    } else {
      (next as Record<string, string>)[knob] = value;
    }
    handleUpdate({ knobOverrides: next });
  };

  const handleResetKnobs = () => {
    handleUpdate({ knobOverrides: {} });
  };
```

- [ ] **Step 3: Add the "Translation Style" card**

In the JSX returned by `SubtitlesSection`, the cards live inside `<div className="space-y-4">` starting around line 232. The Preview card is first (with `stagger(0)`), then the Controls card (with `stagger(1)`). Insert a new card BETWEEN them, using `stagger(1)`, and bump the Controls card's stagger to `stagger(2)`.

Insert this card right after the Preview card's closing `</div>` (the one wrapping the staggered `<Card title="Preview">`), and before the Controls card:

```tsx
        {/* Translation Style card — editable translation knobs (global override) */}
        <div className="animate-stagger" style={stagger(1)}>
          <Card variant="bordered" title="Translation Style">
            <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
              Auto uses the recommended value for each site's profile (Educational / Media / Cinematic).
              Override any knob to apply it everywhere subtitles are translated.
            </p>
            <div className={`${isDisabled ? 'opacity-50 pointer-events-none' : ''} transition-opacity duration-200`}>
              <div className="space-y-5">
                <FieldGroup label="Register" description="Tone of the translation.">
                  <SegmentedControl
                    label="Register"
                    options={REGISTER_OPTIONS}
                    value={overrides.register ?? 'auto'}
                    onChange={(v) => handleKnobChange('register', v)}
                    disabled={isDisabled}
                  />
                </FieldGroup>
                <FieldGroup label="Faithfulness" description="How closely the translation tracks the source wording.">
                  <SegmentedControl
                    label="Faithfulness"
                    options={FAITHFULNESS_OPTIONS}
                    value={overrides.faithfulness ?? 'auto'}
                    onChange={(v) => handleKnobChange('faithfulness', v)}
                    disabled={isDisabled}
                  />
                </FieldGroup>
                <FieldGroup label="Brevity" description="How aggressively filler is trimmed for on-screen brevity.">
                  <SegmentedControl
                    label="Brevity"
                    options={BREVITY_OPTIONS}
                    value={overrides.brevity ?? 'auto'}
                    onChange={(v) => handleKnobChange('brevity', v)}
                    disabled={isDisabled}
                  />
                </FieldGroup>
                <FieldGroup label="Profanity" description="How to handle strong profanity.">
                  <SegmentedControl
                    label="Profanity"
                    options={PROFANITY_OPTIONS}
                    value={overrides.profanity ?? 'auto'}
                    onChange={(v) => handleKnobChange('profanity', v)}
                    disabled={isDisabled}
                  />
                </FieldGroup>
                <button
                  type="button"
                  onClick={handleResetKnobs}
                  disabled={isDisabled || Object.keys(overrides).length === 0}
                  className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset to profile defaults
                </button>
              </div>
            </div>
          </Card>
        </div>
```

Then find the Controls card's wrapper (currently `style={stagger(1)}`) and change it to `style={stagger(2)}`.

- [ ] **Step 4: Verify it compiles + renders**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

Then build to confirm the entrypoint bundles: `npx wxt build` (or the project's build command — check `package.json` scripts). Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/sections/SubtitlesSection.tsx
git commit -m "feat(subtitle): add Translation Style card to Subtitles options

Four-knob editor (Register/Faithfulness/Brevity/Profanity) bound to the
persisted global knobOverrides, with Auto = inherit-from-profile and a
Reset-to-defaults button. Reuses Card/FieldGroup/SegmentedControl."
```

---

## Task 6: Popup UI — per-tab "Subtitle style" expander

**Files:**
- Modify: `entrypoints/popup/App.tsx`

**Interfaces:**
- Consumes: `chrome.tabs.query`, `chrome.tabs.sendMessage` (existing query pattern at line 527/575); `settings.subtitleSettings.enabled` to gate visibility; `ProfileKnobs` from `@/lib/subtitleProfiles`.
- Produces: sends `setSubtitleKnobOverride` (set/clear) and queries `getSubtitleKnobOverride` on popup open.

- [ ] **Step 1: Read the existing popup structure**

Before editing, read `entrypoints/popup/App.tsx` around lines 1163-1216 (the "Display Settings" collapsible section containing the Subtitle Translation toggle at line 1209) and lines 527-580 (the existing `chrome.tabs.query` / `chrome.tabs.sendMessage` pattern used for `getPageCategory`). The new expander goes directly under the Subtitle Translation toggle (line 1213), shown only when `settings.subtitleSettings.enabled` is true. The query-on-open pattern mirrors `getPageCategory`.

- [ ] **Step 2: Add per-tab override state + handlers**

Near the other popup `useState` declarations (search for existing `const [settingsExpanded`), add:

```ts
import type { ProfileKnobs } from '@/lib/subtitleProfiles';

const [styleExpanded, setStyleExpanded] = useState(false);
const [tabOverrides, setTabOverrides] = useState<Partial<ProfileKnobs>>({});
```

(Add the `ProfileKnobs` import at the top of the file with the other type imports; add the `useState` calls beside the existing popup UI state.)

Add an effect that loads the current tab override when the expander opens. Place it near other `useEffect` hooks, and model it on the existing `getPageCategory` query:

```ts
  // When the subtitle-style expander opens, read the live per-tab override.
  useEffect(() => {
    if (!styleExpanded) return;
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return;
        const resp = await chrome.tabs.sendMessage(tab.id, { action: 'getSubtitleKnobOverride' }) as { knobOverrides?: Partial<ProfileKnobs> };
        setTabOverrides(resp?.knobOverrides ?? {});
      } catch {
        // content script not present (non-subtitle page) — leave empty.
      }
    })();
  }, [styleExpanded]);
```

Add the change handler (near the existing `updateSubtitleSetting` around line 669):

```ts
  const handleTabKnob = useCallback(async (knob: keyof ProfileKnobs, value: string) => {
    const next = { ...tabOverrides };
    if (value === 'auto') {
      delete next[knob];
    } else {
      (next as Record<string, string>)[knob] = value;
    }
    setTabOverrides(next);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      await chrome.tabs.sendMessage(tab.id, {
        action: 'setSubtitleKnobOverride',
        knobOverrides: Object.keys(next).length ? next : null,
      });
    } catch {
      /* content script may not be present */
    }
  }, [tabOverrides]);
```

- [ ] **Step 3: Render the expander**

Find the Subtitle Translation `SharedToggle` (around line 1209-1213):

```tsx
                <SharedToggle
                  checked={settings.subtitleSettings.enabled}
                  onChange={() => updateSubtitleSetting({ enabled: !settings.subtitleSettings.enabled })}
                  label="Subtitle Translation"
                />
```

Immediately after it, conditionally render the expander (only when subtitles are enabled):

```tsx
                {settings.subtitleSettings.enabled && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setStyleExpanded(!styleExpanded)}
                      className="w-full flex items-center justify-between text-zinc-400 hover:text-zinc-200 transition-colors text-xs"
                    >
                      <span>Subtitle style (this tab)</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-all duration-300 ${styleExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    {styleExpanded && (
                      <div className="mt-3 space-y-3">
                        <p className="text-[10px] text-zinc-500 leading-relaxed">
                          Applies to upcoming lines. Auto uses the site's profile. Resets on reload.
                        </p>
                        {([
                          { knob: 'faithfulness' as const, label: 'Faithfulness', opts: ['auto', 'literal', 'balanced', 'idiomatic'] },
                          { knob: 'brevity' as const, label: 'Brevity', opts: ['auto', 'relaxed', 'moderate', 'terse'] },
                          { knob: 'register' as const, label: 'Register', opts: ['auto', 'formal', 'neutral', 'casual'] },
                          { knob: 'profanity' as const, label: 'Profanity', opts: ['auto', 'preserve', 'soften', 'remove'] },
                        ]).map(({ knob, label, opts }) => (
                          <div key={knob}>
                            <div className="flex bg-zinc-950 p-0.5 rounded-lg border border-zinc-800/50">
                              {opts.map((opt) => {
                                const active = (tabOverrides[knob] ?? 'auto') === opt;
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => handleTabKnob(knob, opt)}
                                    className={`flex-1 py-1.5 px-2 rounded-md text-[11px] font-medium capitalize transition-all ${
                                      active
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
```

(`ChevronDown` is already imported in the popup — it is used by the existing Advanced/Display Settings expanders. Confirm via the import at the top of the file; if missing, add it to the `lucide-react` import.)

- [ ] **Step 4: Verify it compiles + builds**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

Run: `npx wxt build` (or the project build script).
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/popup/App.tsx
git commit -m "feat(subtitle): add per-tab Subtitle style expander to popup

Session-scoped knob override (Register/Faithfulness/Brevity/Profanity) shown
when subtitles are enabled. Queries getSubtitleKnobOverride on open, writes
setSubtitleKnobOverride on change. Auto = inherit; resets on reload."
```

---

## Task 7: Full regression sweep + manual verification notes

**Files:** none (verification only)

- [ ] **Step 1: Run the full subtitle-related test suite**

Run: `npx vitest run lib/__tests__/subtitleProfiles.test.ts services/__tests__/background.test.ts services/__tests__/subtitlePrompt.test.ts content/__tests__/subtitleCoordinator.test.ts`
Expected: ALL PASS. The subtitle-prompt tests are unchanged and must still pass (guards that no prompt regression slipped in).

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: ALL PASS. If any pre-existing unrelated test fails, confirm it is unrelated (it was failing before this branch) and note it; do not attempt to fix unrelated tests.

- [ ] **Step 3: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 4: Confirm the regression invariant by inspection**

Open `services/background.ts` at the merge seam and confirm: with `subtitleSettings.subtitleSettings?.knobOverrides` undefined/empty and `message.knobOverrides` undefined, `resolveEffectiveKnobs(profile, undefined, undefined)` returns `PROFILE_PRESETS[profile]` exactly — verified by the Task 1 unit test "returns the profile preset unchanged when both overrides are absent."

- [ ] **Step 5: Manual verification checklist (document, do not automate)**

Load the unpacked extension and verify on a real subtitle-capable site:
1. **Options → Subtitles → Translation Style:** change Faithfulness to Literal; confirm it persists across reopening Options (global override saved).
2. **Options Reset button:** clears all four knobs back to Auto.
3. **Popup → Subtitle style (this tab):** change Brevity to Terse; reload the page; confirm the expander shows all Auto again (session-scoped).
4. **Per-tab wins:** set a global Faithfulness = Literal, then on a tab set Faithfulness = Idiomatic; confirm the prompt (via devtools network inspection of the translation request, or via `debugMode`) reflects Idiomatic for that tab.
5. **Default behavior:** with everything Auto, the subtitle translation is visually identical to before this sub-project.

- [ ] **Step 6: Final commit (if any cleanup)**

If Step 5 surfaced copy/visual tweaks, commit them:
```bash
git add -A
git commit -m "polish(subtitle): tweak knob override UI copy/spacing"
```
Otherwise no commit — the feature is complete at Task 6.

---

## Self-Review

**Spec coverage:**
- A. `resolveEffectiveKnobs` helper → Task 1. ✓
- B. `SubtitleSettings.knobOverrides` → Task 2. ✓
- C. `TranslateSubtitleMessage.knobOverrides` + `SetSubtitleKnobOverrideMessage` + `getSubtitleKnobOverride` → Task 2 (types) + Task 3 (handler). ✓
- D. Content-script per-tab state + message plumbing → Task 3. ✓
- E. Background merge → Task 4. ✓
- F1. Options "Translation Style" card → Task 5. ✓
- F2. Popup per-tab expander → Task 6. ✓
- Testing strategy items 1–6 → Tasks 1, 3, 4, 7 cover them (resolveEffectiveKnobs unit, content per-tab, background merge incl. regression, web-path unchanged via full suite). ✓
- Scope boundaries (no per-hostname, no new knobs, no prompt/service changes, per-tab not persisted) → respected; no task touches those. ✓

**Placeholder scan:** The Task 3 test steps contain "reuse the existing test's setup/trigger" markers. These are intentional and unavoidable — the existing coordinator test's mock setup is large and duplicating it verbatim across 3 tests would be brittle. The implementer is explicitly directed to READ the existing passing test and copy its setup, with a fallback to ask. This is flagged as the single highest-risk step. All other steps contain complete code.

**Type consistency:**
- `resolveEffectiveKnobs(profile, global?, perTab?)` signature: Task 1 defines it; Task 4 calls it with `(profile, subtitleSettings.subtitleSettings?.knobOverrides, message.knobOverrides)` — matches. ✓
- `SetSubtitleKnobOverrideMessage.action === 'setSubtitleKnobOverride'`, `knobOverrides: Partial<ProfileKnobs> | null`: Task 2 defines; Task 3 handler reads `message.knobOverrides ?? undefined` (null → undefined = cleared); Task 6 popup sends `{ action: 'setSubtitleKnobOverride', knobOverrides: ... | null }`. ✓
- `getSubtitleKnobOverride` query: Task 3 handler responds `{ knobOverrides: state.subtitleKnobOverride ?? {} }`; Task 6 popup reads `resp?.knobOverrides ?? {}`. ✓
- `KnobKey = keyof ProfileKnobs`: used consistently in Task 5 and Task 6 handlers. ✓

No gaps, no type mismatches, no spec requirements without a task.
