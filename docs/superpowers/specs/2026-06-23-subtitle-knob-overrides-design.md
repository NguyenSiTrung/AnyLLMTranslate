# Subtitle Knob Overrides — Design

Date: 2026-06-23
Status: Approved (pending user spec review)

## Problem

Sub-projects 1–3 shipped a profile system that maps each subtitle site's
hostname to one of three profiles (`educational` / `media` / `cinematic`), and
each profile presets four translation knobs — **Register, Faithfulness, Brevity,
Profanity** — which drive the subtitle prompt (`lib/subtitleProfiles.ts`,
`services/subtitlePrompt.ts`). Resolution is fully automatic and silent today:

```
hostname → resolveProfile() → PROFILE_PRESETS[profile] → prompt
```

The user has no control over the four knobs. Two real, common situations cannot
be expressed:

1. **Standing global preference.** A language learner who always wants
   `faithfulness: literal` regardless of site; a parent who always wants
   `profanity: remove`. Today they cannot express either.
2. **Per-video variance within one site.** YouTube hosts films, coding
   lectures, music videos, and news under one hostname that resolves to `media`.
   "This particular YouTube video is actually a lecture — bump faithfulness to
   `literal` for now" is the most frequent real-world tweak, and it is
   impossible today. The hostname is fixed; the profile cannot change per video.

The three profiles handle the *between-site* differences well. What is missing
is any way to nudge the four knobs *on top of* the resolved profile.

## Goal

Make the four translation knobs user-editable at two layers, in this order of
precedence (highest wins):

1. **Per-tab override** (session-scoped, not persisted, set from the popup).
2. **Global override** (persisted in Options, applies to all sites).
3. **Profile preset** (`PROFILE_PRESETS[resolvedProfile]` — the existing layer).

The profile system stays the foundation: it still sets the per-site defaults,
and untouched knobs continue to come from the profile. Overrides are *partial* —
a user who changes only `profanity` leaves the other three knobs on their
profile's values.

This is exactly what sub-project 1's spec promised: *"those same knobs become
editable per-tab and globally"* (see `2026-06-23-subtitle-profiles-and-prompt-design.md`,
Roadmap context #4).

## Approach

**Knob overrides are partial merges, applied in the background at the single
existing merge seam** (`services/background.ts:413`). Each override layer is a
`Partial<ProfileKnobs>` — a knob absent from an override inherits from the layer
below.

```
effectiveKnobs = {
  ...PROFILE_PRESETS[profile],   // layer 3: hostname → profile (existing)
  ...globalOverride,             // layer 2: persisted in Options (new)
  ...perTabOverride,             // layer 1: session, from message (new)
}
```

With **both** overrides empty (the default), the merge is a no-op and the system
behaves byte-for-byte identical to today. This is the primary regression guard.

**"Auto" as the inherit marker.** Every knob control exposes four options: the
three knob values plus `Auto`. `Auto` means "do not override — inherit from the
profile." Internally `Auto` is represented as *absence* (the key is omitted from
the partial), not a sentinel value. So `Auto` everywhere == empty override ==
today's behavior. This keeps the persisted shape clean (only set knobs are
stored) and makes the merge trivial.

### Rejected alternatives

- **Per-hostname overrides (mirror `SiteRule.category`).** Rejected for knobs.
  Hostname granularity is too coarse for subtitles: all of `youtube.com` is one
  host, so a per-hostname knob override could not express "this YouTube video is
  a lecture." The between-site differences are already handled by the three
  profiles. Per-hostname knobs would mostly duplicate profiles with more UI
  surface. (Treating an unmapped site as a different *profile* is a separate,
  later concern — not this sub-project.)
- **All three layers (global + per-hostname + per-tab).** Over-engineered for a
  four-knob vocabulary; the merge and UI cost outweighs the marginal benefit.
  Rejected.
- **Whole-profile swap instead of per-knob overrides.** Letting the user pick
  "treat this tab as cinematic" is coarse and discards the per-knob expressiveness
  the vocabulary was designed for. Rejected.
- **Persisted per-tab state.** Per-tab is intentionally ephemeral — it models
  "fix this one video right now." Persisting it across reloads would silently
  leak a temporary preference. Rejected; per-tab resets on page reload (like the
  existing tab-scoped `categoryOverride`).
- **Sentinel value for "Auto".** Adds a fifth union member to every knob type
  and forces every consumer to filter it out. Rejected; absence is cleaner.

## Components

### A. `lib/subtitleProfiles.ts` — merge helper (extend existing file)

Add one pure, side-effect-free function alongside `resolveProfile`:

```ts
export type KnobOverride = Partial<ProfileKnobs>;

/**
 * Resolve the effective knobs by layering partial overrides over the profile
 * preset. Precedence: perTab > global > preset. Keys absent from an override
 * inherit from the layer below. An undefined profile falls back to 'media'.
 *
 * This is the single source of truth for override precedence and is unit-tested
 * in isolation; the background calls it, the Options/popup UIs never merge.
 */
export function resolveEffectiveKnobs(
  profile: SubtitleProfile,
  globalOverride?: KnobOverride,
  perTabOverride?: KnobOverride,
): ProfileKnobs {
  return {
    ...PROFILE_PRESETS[profile] ?? PROFILE_PRESETS.media,
    ...(globalOverride ?? {}),
    ...(perTabOverride ?? {}),
  };
}
```

No other change to this file. `PROFILE_PRESETS`, the knob types, `resolveProfile`,
`DOMAIN_PROFILE_MAP` are all unchanged.

### B. `types/config.ts` — persisted global override (extend existing file)

Add a field to `SubtitleSettings` (`types/config.ts:106`) and to
`DEFAULT_SUBTITLE_SETTINGS` (`types/config.ts:254`):

```ts
export interface SubtitleSettings {
  // ... existing fields unchanged ...
  /**
   * Per-knob global translation-style overrides. Only set knobs override the
   * resolved profile preset; absent knobs inherit. Undefined/empty == no
   * override == today's behavior. Consumed in services/background.ts via
   * resolveEffectiveKnobs().
   */
  knobOverrides?: Partial<ProfileKnobs>;
}
```

`DEFAULT_SUBTITLE_SETTINGS.knobOverrides = {}` (empty — no override by default).

The existing `deepMerge` in `lib/config.ts` `loadSettings()` backfills this for
existing users automatically; no migration code needed.

### C. `types/messages.ts` — per-tab override on the wire (extend existing file)

Two message changes:

1. Add `knobOverrides?` to `TranslateSubtitleMessage` (`types/messages.ts:89`):
   the per-tab override, carried from content → background.

   ```ts
   export interface TranslateSubtitleMessage {
     action: 'translateSubtitle';
     cues: SubtitleCue[];
     sourceLanguage: string;
     targetLanguage: string;
     pageContext?: PageContext;
     profile?: SubtitleProfile;
     /** Per-tab translation-style override (session-scoped; from popup).
      *  Partial<ProfileKnobs> — set knobs override the profile/global layers. */
     knobOverrides?: Partial<ProfileKnobs>;
   }
   ```

2. A new `setSubtitleKnobOverride` message so the popup can write the active
   tab's override into content-script state (mirrors the existing
   `categoryChanged` message for the tab-scoped `categoryOverride`):

   ```ts
   export interface SetSubtitleKnobOverrideMessage {
     action: 'setSubtitleKnobOverride';
     /** Partial knobs to set, or null to clear the tab override entirely. */
     knobOverrides: Partial<ProfileKnobs> | null;
   }
   ```

3. A `getSubtitleKnobOverride` query (popup → content, expects a synchronous
   response) so the popup can read the live tab override when it opens — mirrors
   how the popup queries `getPageCategory`. No new interface type needed beyond
   the action string: the content handler responds with
   `{ knobOverrides: state.subtitleKnobOverride ?? {} }`.

### D. `content/subtitleCoordinator.ts` — per-tab state + message plumbing (edit)

Mirror the existing `categoryOverride` pattern exactly.

1. **State.** Add to `CoordinatorState` (`subtitleCoordinator.ts:51`), beside
   `categoryOverride` (line 64):

   ```ts
   /** Temporary tab-scoped translation-knob override from popup (resets on reload). */
   subtitleKnobOverride: Partial<ProfileKnobs> | undefined;
   ```

   Initialize to `undefined` in the default state (line 95). Reset to `undefined`
   on SPA-navigation epoch bump (beside the `categoryOverride` reset at line 1042).

2. **Message handler.** Handle the new message beside the `categoryChanged`
   handler (`subtitleCoordinator.ts:972`):

   ```ts
   if (msg.action === 'setSubtitleKnobOverride') {
     const o = (message as { knobOverrides?: Partial<ProfileKnobs> | null }).knobOverrides;
     state.subtitleKnobOverride = o ?? undefined; // null clears it
   }
   ```

3. **Send sites.** At the three `translateSubtitle` send sites
   (`subtitleCoordinator.ts:316, 398, 489`), add the per-tab override to the
   payload beside the existing `profile`:

   ```ts
   profile: currentSubtitleProfile(),
   knobOverrides: state.subtitleKnobOverride,   // NEW — undefined when not set
   ```

   (When undefined, the field is omitted on the wire — `JSON.stringify` drops
   undefined values — so a tab with no override sends the same bytes as today.)

### E. `services/background.ts` — the merge (edit, ~3 lines)

The single merge point, at the existing profile-resolution block
(`background.ts:413-414`):

```ts
const profile: SubtitleProfile = message.profile ?? 'media';
const subtitleKnobs: ProfileKnobs = resolveEffectiveKnobs(
  profile,
  subtitleSettings.subtitleSettings.knobOverrides,  // global (persisted)
  message.knobOverrides,                            // per-tab (session)
);
```

`subtitleSettings` is already loaded at line 404 (it is the full
`ExtensionSettings`). No other background change: `subtitleKnobs` then flows
through `translateChunk` → `service.translate({ subtitleKnobs })` exactly as
today, and the pre-scan (`preScanNames`) still receives the merged knobs so
proper-noun extraction honors the same style.

The merge is the *only* behavioral change on the subtitle path, and with both
overrides empty it is a no-op.

### F. `services/subtitlePrompt.ts`, `services/openaiCompatible.ts`, `TranslationRequest` — NO CHANGES

These are already fully knob-driven from sub-project 1. `buildSubtitleSystemPrompt`
accepts any valid `ProfileKnobs`; `subtitleKnobs` on `TranslationRequest` already
routes to the subtitle prompt. Overridden knobs flow through unchanged.

## UI

Two surfaces, editing the same four knobs with the same `Auto + 3 values` model.
Reuse existing primitives (`Card`, `FieldGroup`, `SegmentedControl`,
`useSettingsStore`) — no new UI components.

### Knob options (shared constant)

One `KNOB_CONTROL_OPTIONS` definition (e.g. in a small `lib/subtitleKnobOptions.ts`
or co-located in the section file) shared by both surfaces:

| Knob | Values (Auto first) |
|---|---|
| Register | Auto, Formal, Neutral, Casual |
| Faithfulness | Auto, Literal, Balanced, Idiomatic |
| Brevity | Auto, Relaxed, Moderate, Terse |
| Profanity | Auto, Preserve, Soften, Remove |

"Auto" maps to "omit from override." Selecting a concrete value writes it into
the partial; selecting "Auto" again removes it.

### F1. Options → Subtitles → new "Translation Style" card

File: `entrypoints/options/sections/SubtitlesSection.tsx`. A new `Card` titled
"Translation Style," placed after the Preview card and before Appearance (so the
behavioral knobs read above the visual styling). For each of the four knobs, a
`FieldGroup` + `SegmentedControl` bound to `subtitleSettings.knobOverrides`:

```tsx
const overrides = subtitleSettings.knobOverrides ?? {};

const handleKnobChange = (knob: keyof ProfileKnobs, value: string) => {
  const next = { ...overrides };
  if (value === 'auto') delete next[knob];        // Auto = inherit
  else (next as Record<string, string>)[knob] = value;
  handleUpdate({ knobOverrides: next });
};

// Per knob:
<SegmentedControl
  label="Faithfulness"
  options={FAITHFULNESS_OPTIONS}   // Auto, Literal, Balanced, Idiomatic
  value={overrides.faithfulness ?? 'auto'}
  onChange={(v) => handleKnobChange('faithfulness', v)}
/>
```

Plus a "Reset to profile defaults" button that clears `knobOverrides` to `{}`.

A short explainer line: *"Auto uses the recommended value for each site's profile
(Educational / Media / Cinematic). Override any knob to apply it everywhere."*

### F2. Popup → "Subtitle style" expander

File: `entrypoints/popup/App.tsx`. A new collapsible row in the "Display Settings"
section (beside the existing Subtitle Translation toggle at line 1209), shown
when `settings.subtitleSettings.enabled` is true. Compact: a single segmented
row per knob is too wide for the 340px popup, so use a one-line-per-knob layout
with a small inline select or an abbreviated segmented control.

This surface edits the **per-tab** override, not the global one:

```tsx
const [tabOverrides, setTabOverrides] = useState<Partial<ProfileKnobs>>({});
const [styleExpanded, setStyleExpanded] = useState(false);

const handleTabKnob = (knob: keyof ProfileKnobs, value: string) => {
  const next = { ...tabOverrides };
  if (value === 'auto') delete next[knob];
  else (next as Record<string, string>)[knob] = value;
  setTabOverrides(next);
  chrome.runtime.sendMessage({
    action: 'setSubtitleKnobOverride',
    knobOverrides: Object.keys(next).length ? next : null,
  });
};
```

- **On open / focus**, the popup queries the current tab's override so it shows
  the live state. A new `getSubtitleKnobOverride` message (content → popup
  response) returns `state.subtitleKnobOverride ?? {}`. This mirrors how the
  popup queries `getPageCategory` for live category state.
- **Reset** sends `setSubtitleKnobOverride` with `null` and clears local state.
- The per-tab override is **session-scoped**: it lives only in the content
  script's module state, so a page reload clears it (identical lifecycle to
  `categoryOverride`).

Because per-tab overrides ride on the already-existing `translateSubtitle`
message as `knobOverrides`, changes take effect on the *next* subtitle chunk
translated — no re-translate of already-translated cues. A short note in the UI
("applies to upcoming lines") sets expectations honestly.

## Data flow

```
                       ┌─────────────────────────────────────┐
                       │  Options UI (persisted, global)      │
                       │  SubtitlesSection → knobOverrides {}  │
                       │  → chrome.storage → settingsStore     │
                       └──────────────────┬──────────────────┘
                                          │ loadSettings() (already happens)
                                          ▼
┌──────────────────┐   setSubtitleKnobOverride   ┌─────────────────────────┐
│  Popup UI        │ ───────────────────────────▶ │ content/subtitleCoord   │
│ (per-tab, session)│                            │  state.subtitleKnob     │
└──────────────────┘                              │  Override (module var)  │
                                                  └────────────┬────────────┘
                                                               │ read at send sites
                                                               ▼
                  translateSubtitle { cues, profile, knobOverrides(=tab) }
                                                               │
                                                               ▼
                                          ┌──────────────────────────────────┐
                                          │ background.handleTranslateSubtitle│
                                          │  resolveEffectiveKnobs(           │
                                          │    profile,                       │
                                          │    settings.subtitleSettings      │
                                          │      .knobOverrides (global),     │
                                          │    message.knobOverrides (tab))   │
                                          └──────────────┬───────────────────┘
                                                         │ ProfileKnobs (merged)
                                                         ▼
                                          translateChunk → service.translate
                                                         │
                                                         ▼
                                          buildSubtitleSystemPrompt (unchanged)
```

The web-page translation path is entirely untouched — it never sets
`subtitleKnobs`, never reads `knobOverrides`.

## Scope boundaries (what this sub-project is NOT)

- ❌ No per-hostname knob overrides — only global + per-tab. (Coarse hostname
  granularity doesn't fit subtitles; profiles handle between-site differences.)
- ❌ No new knob values or new knobs — the four knobs and their three values each
  are fixed by sub-project 1. This sub-project only makes them editable.
- ❌ No re-translation of already-translated cues — overrides apply to upcoming
  chunks. (Re-translation is a larger UX concern outside this scope.)
- ❌ No changes to `subtitlePrompt.ts`, `openaiCompatible.ts`, or
  `TranslationRequest` — already knob-driven.
- ❌ No per-tab persistence — tab overrides reset on reload (matches
  `categoryOverride`).
- ✅ Web-page translation path untouched.
- ✅ With both overrides empty, behavior is byte-for-byte identical to today.

## Testing strategy

Grounded in the existing vitest setup.

1. **Unit — `resolveEffectiveKnobs`** (extend `lib/__tests__/subtitleProfiles.test.ts`):
   - both overrides empty → returns `PROFILE_PRESETS[profile]` exactly (the
     regression invariant).
   - global only → set knobs override, unset knobs inherit.
   - global + per-tab → per-tab wins on conflict; both apply on disjoint knobs.
   - partials with one knob set, three unset → only that knob changes.
   - unknown profile string → falls back to `media` preset.

2. **Unit — message types**: `TranslateSubtitleMessage.knobOverrides?` and
   `SetSubtitleKnobOverrideMessage` typecheck (compile-time; covered by `tsc`).

3. **Integration — background merge** (extend `services/__tests__/background.test.ts`):
   - mock the service, send `translateSubtitle` with `profile: 'cinematic'` and
     `knobOverrides: { faithfulness: 'literal' }`; assert the service receives
     `subtitleKnobs = { casual, literal, moderate, preserve }` (per-tab
     faithfulness overrode cinematic's idiomatic; the rest inherited).
   - seed `settings.subtitleSettings.knobOverrides = { profanity: 'remove' }`
     and assert it merges into the effective knobs even with no per-tab override.
   - send with neither override → assert the service receives exactly
     `PROFILE_PRESETS[profile]` (regression: today's behavior preserved).

4. **Integration — content-script per-tab state** (extend
   `content/__tests__/subtitleCoordinator.test.ts`):
   - send `setSubtitleKnobOverride` with `{ brevity: 'terse' }`; trigger a
     `translateSubtitle` send; assert the outgoing message carries
     `knobOverrides: { brevity: 'terse' }`.
   - send `setSubtitleKnobOverride` with `null`; assert the next outgoing message
     omits `knobOverrides` (or sends undefined).

5. **Regression — web-page path unchanged**: existing `translateText` test still
     passes; the web path never touches `knobOverrides`.

6. **Regression — default behavior**: a subtitle request with no overrides and
   no persisted `knobOverrides` produces a prompt identical to sub-project 3's
   output (diff the effective knobs object against `PROFILE_PRESETS[profile]`).

## Files touched

| File | Change | New? |
|---|---|---|
| `lib/subtitleProfiles.ts` | Add `KnobOverride` type + `resolveEffectiveKnobs()` | edit |
| `types/config.ts` | Add `knobOverrides?: Partial<ProfileKnobs>` to `SubtitleSettings`; default `{}` | edit |
| `types/messages.ts` | Add `knobOverrides?` to `TranslateSubtitleMessage`; add `SetSubtitleKnobOverrideMessage` + `getSubtitleKnobOverride` query | edit |
| `content/subtitleCoordinator.ts` | `subtitleKnobOverride` state; handle `setSubtitleKnobOverride` + `getSubtitleKnobOverride`; carry `knobOverrides` at 3 send sites; reset on nav | edit |
| `services/background.ts` | Replace `PROFILE_PRESETS[profile]` with `resolveEffectiveKnobs(profile, global, perTab)` (~3 lines at 413) | edit |
| `entrypoints/options/sections/SubtitlesSection.tsx` | New "Translation Style" card with 4 knob `SegmentedControl`s + Reset | edit |
| `entrypoints/popup/App.tsx` | New "Subtitle style" expander (per-tab override) + live query on open | edit |
| `lib/__tests__/subtitleProfiles.test.ts`, `services/__tests__/background.test.ts`, `content/__tests__/subtitleCoordinator.test.ts` | Unit + integration tests above | edit |

Net new production logic ≈ 90 lines (the merge helper, two UI blocks, message
plumbing). `subtitlePrompt.ts`, `openaiCompatible.ts`, `TranslationRequest` are
**not** touched.

## Success criteria

- A user can set a global `profanity: remove` in Options and it applies to every
  subtitle site; only `profanity` changes, the other three knobs come from each
  site's profile.
- A user can open the popup on a YouTube tab, set `faithfulness: literal` for
  that tab only, and the next subtitle chunks reflect it; reloading the page
  clears it.
- With both overrides empty, the subtitle prompt and effective knobs are
  byte-for-byte identical to sub-project 3 (regression).
- The web-page translation path is untouched and its tests pass unchanged.

## Roadmap context

This is sub-project 4 of seven for the subtitle-optimization effort. Sub-projects
1–3 (profile system, context/continuity, per-film proper-noun extraction) are
merged. Subsequent sub-projects:

5. Reading-speed & timing adaptation (CPS, wrapping, timing extension; Max DOM timing fix).
6. Context-aware cache & robustness (cache-key revision, per-cue retry).
