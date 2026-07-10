# Subtitle Studio (Settings → Subtitles) — Design Spec

> **Date:** 2026-07-10  
> **Scope:** Settings → Subtitles tab full redesign (Subtitle Studio, Approach C)  
> **Status:** Approved (user chose Approach C; style knobs = compact 2×2 always open)  
> **Beads:** ALT-5zv  
> **Related:** [2026-07-10 Inline Settings Tab Redesign](./2026-07-10-inline-settings-tab-redesign-design.md) (hero + progressive disclosure)  
> **Related:** [2026-07-10 Theme Studio](./2026-07-10-theme-studio-design.md) (split-pane shell, independent scroll)  
> **Related:** [2026-06-23 Subtitle Knob Overrides](./2026-06-23-subtitle-knob-overrides-design.md) (knobOverrides semantics)

---

## 1. Context

The Subtitles tab (`SubtitlesSection.tsx` ~616 lines + `SubtitlePreview.tsx`) already has strong pieces: hero enable, animated mini-player preview, data-driven translation-style knobs, site monograms, YouTube ASR controls, and `DisabledDimmer`. It still falls short of Theme Studio / Inline quality:

| Problem | Detail |
|---------|--------|
| **Card order** | Translation Style sits before Appearance; power-user knobs outrank position/opacity. |
| **Orphaned preview** | Preview scrolls away; Appearance controls that drive it live further down. |
| **Style density** | Four full-width segmented knobs + per-knob status lines create a tall wall. |
| **Overloaded Platforms** | YouTube ASR (cost-sensitive, product feature) buried under site list + fallback. |
| **Weak naming** | “Language Discovery” does not describe preferred source track + auto-activate. |
| **Chrome inconsistency** | Style card skips shared `Card` title/description/headerExtra; raw reset button. |
| **Segment brand drift** | Active segment is always blue; Subtitles accent is cyan. |
| **Site noise** | Method hints as permanent third text lines compete with friendly summaries. |

**User decision:** Approach **C — Full Subtitle Studio** (split layout + IA restructure + polish). Style knobs: **compact 2×2 grid, always open** (not collapsed).

---

## 2. Goals

1. **Studio experience** — adjusting captions feels like tuning a player overlay, not filling a long form.
2. **Preview stays in view on desktop** while the user scrolls other settings.
3. **Correct priority** — Appearance lives next to the live preview; style and ASR use progressive structure without burying primary look controls.
4. **One concern per card** — Platforms ≠ Caption quality ≠ Translation style.
5. **Brand-coherent chrome** — cyan/teal primary; scannable segments (icons where helpful); shared `Card` / `Button` / `Badge` / `SettingsGroup`.
6. **No new settings schema** — existing `subtitleSettings` fields only; pure presentation / IA / extraction.
7. **Maintainability** — extract card subcomponents so the section shell stays readable.

## 3. Non-Goals

- New appearance keys (text color, outline, shadow, line count, etc.).
- Runtime changes to subtitle coordinator, profiles, interceptors, or ASR algorithms.
- Live provider / network translation inside the options preview.
- Popup or content-script UI redesign.
- Sidebar / tab navigation changes.
- Favorites, search for platforms, or site logos beyond monograms.
- Changing default values for timeout, knobs, or ASR flags.

---

## 4. Product Principles

1. **Progressive disclosure** — timeout under Advanced; technical method hints demoted.
2. **Instant feedback** — every Appearance (and style chip) change updates the preview without debounce that feels laggy.
3. **Non-intrusive chrome** — studio rail is extension UI, not a fake streaming site skin.
4. **Accessible** — WCAG 2.1 AA for options UI; selection not by color alone; reduced motion respected.
5. **Dark mode native** — existing zinc/cyan palette.

---

## 5. Information Architecture & Layout

### 5.1 Desktop (≥ `lg`)

Mirror Theme Studio pane mechanics (fixed height + independent column scroll — **not** fragile `position: sticky` alone).

```
┌─ SectionHeader: Subtitle Studio ────────────────────────────────┐
│ “Tune how translated captions look and behave on video.”        │
├─ Hero enable (full width, cyan strip) ──────────────────────────┤
├─────────────────────────────┬───────────────────────────────────┤
│ STUDIO RAIL (~40%, col-span-2) │ CONTROLS RAIL (~60%, col-span-3) │
│ own overflow-y-auto            │ own overflow-y-auto             │
│                                │                                 │
│ Live preview                   │ 1. Source track                 │
│   (taller shell + chips)       │ 2. Platforms (+ fallback)       │
│ Appearance                     │ 3. Caption quality (YouTube)    │
│   (layout / type / backdrop /  │ 4. Translation style (2×2)      │
│    display mode)               │    + Advanced timeout           │
└─────────────────────────────┴───────────────────────────────────┘
```

**Root shell (align with ThemesSection):**

- `flex flex-col lg:h-[calc(100dvh-4.5rem)] lg:min-h-[28rem] lg:max-h-[calc(100dvh-4.5rem)]`
- Header + hero: `shrink-0`
- Grid: `grid grid-cols-1 lg:grid-cols-5 gap-4 flex-1 min-h-0 items-stretch`
- Each column: `min-h-0 lg:overflow-y-auto lg:overscroll-contain [scrollbar-gutter:stable]`
- Studio rail: `lg:col-span-2`, Controls: `lg:col-span-3`
- Column order desktop: studio left, controls right.  
  **Mobile order:** preview first, then Appearance, then controls (see §5.2).

**Why Appearance is in the studio rail**  
Those knobs drive the mini player. Keeping them beside the preview is the Approach C differentiator vs a single-column reorder.

### 5.2 Narrow (&lt; `lg`)

Stack (normal page scroll; no forced viewport height required):

1. Header  
2. Hero enable  
3. Live preview  
4. Appearance  
5. Source track  
6. Platforms  
7. Caption quality  
8. Translation style  

Use `order-*` if needed so preview appears before Appearance on small screens when the grid collapses to one column.

### 5.3 Section header

| Field | Value |
|-------|--------|
| Title | `Subtitle Studio` |
| Description | `Tune how translated captions look and behave on video.` |
| Icon | `Subtitles` (lucide) |
| Accent | `cyan` |

### 5.4 Surface map

| Surface | Settings keys | Placement |
|---------|---------------|-----------|
| **Hero enable** | `enabled` | Full width above grid |
| **Live preview** | (read-only projection) | Studio rail |
| **Appearance** | `position`, `fontFamily`, `fontSizeMode`, `fontSize`, `backgroundOpacity`, `displayMode` | Studio rail |
| **Source track** | `preferredSubtitleLanguage`, `autoActivateSubtitles` | Controls rail |
| **Platforms** | `disabledSubtitleSites`, `enableGenericSubtitleHandler` | Controls rail |
| **Caption quality** | `youtubeAsrResegment` | Controls rail |
| **Translation style** | `knobOverrides`, `translationTimeout` | Controls rail |

**Removed as top-level card titles:** “Language Discovery”, mixing ASR into “Supported Sites”, single-column “Preview → Style → Appearance…”.

---

## 6. Surface Specifications

### 6.1 Hero enable strip

Pattern: existing Subtitles hero (keep cyan).

- Container: `rounded-xl border border-cyan-500/30 bg-cyan-500/[0.04] p-4`
- `Toggle` id: `subtitle-enabled-toggle` (preserve for tests)
- Label: `Enable Subtitles`
- Description (status-aware):
  - **On:** `Translated subtitles are active on supported video players.`
  - **Off:** `Subtitles are off — enable to configure the studio and show captions on video.`
- Always interactive. Studio + controls rails use `DisabledDimmer` when `!enabled`; individual controls also pass `disabled` where supported.

### 6.2 Live preview (studio rail)

**Card**

- `title`: `Live preview`
- `description`: `Reacts to Appearance and style knobs. No real video or API calls.`
- `icon`: `Subtitles` or `MonitorPlay` (pick one; stay consistent)
- `variant`: `bordered`

**Component:** enhance `entrypoints/options/components/SubtitlePreview.tsx`

**Visual structure**

1. **Player shell** — existing cinematic gradient, film grain, scan lines, decorative play button, progress bar when enabled.  
2. **Height** — desktop ~200–220px (up from 170px); mobile may keep ~170–180px if space is tight.  
3. **Animated cue** — existing `AnimatedCue` + `getPreviewCuesForLanguage(targetLanguage)`.  
4. **Style chip** — keep `resolveStyleChipLabel(overrides)` top-left chip when enabled.  
5. **Summary chips** — row under the shell (or bottom overlay bar) showing live tokens:

| Chip | Source |
|------|--------|
| Position | `Bottom` / `Top` |
| Display | `Bilingual` / `Translated` |
| Size | `{n}px` or `Auto` |
| Opacity | `{p}%` |
| Style | style chip label (optional duplicate if on-shell chip remains; prefer **on-shell style chip only**, summary for Appearance fields) |

**Behavior**

| Setting | Preview shows |
|---------|----------------|
| `enabled === false` | Dimmed / grayscale shell; “Subtitles disabled” cue (existing) |
| `position` | Cue top vs bottom |
| `fontFamily` / `fontSize` / `fontSizeMode` / `backgroundOpacity` | Existing mapping |
| `displayMode` | Original line on/off |
| `knobOverrides` | Style chip label only (sample cue text stays language-based, not knob-simulated copy) |

**A11y / motion**

- Decorative shell: `aria-hidden="true"` on pure decoration (existing).  
- Optional: short `aria-live="polite"` summary of chips when Appearance changes.  
- Respect `prefers-reduced-motion` for cue cycle and progress bar (existing).

### 6.3 Appearance (studio rail)

**Card**

- `title`: `Appearance`
- `description`: `Layout and type for the on-player overlay.`
- `icon`: `Type` or `Paintbrush` (pick one)
- `variant`: `bordered`

Wrapped in `DisabledDimmer` when `!enabled`.

**Groups** via `SettingsGroup` (scannable uppercase labels):

#### Layout

- **Position** — `SegmentedControl` (`accent="cyan"` when available)

| Value | Label | Icon |
|-------|-------|------|
| `bottom` | `Bottom` | `ArrowDownToLine` |
| `top` | `Top` | `ArrowUpToLine` |

- Description (group or field): `Where captions sit relative to the video.`

#### Type

- **Font family** — System / Serif / Mono (existing values; labels may shorten Mono as today).
- **Font size mode** — `Fixed` / `Auto` (drop long “Auto (Video Size)” from segment label; helper: `Auto scales with player height.`).
- **Font size slider** — only when mode is `fixed` (existing range 10–32px).

#### Backdrop

- **Background opacity** slider 0–100% (existing `backgroundOpacity` 0–1).

#### Mode

- **Display mode** — `SegmentedControl` with icons (Inline parity):

| Value | Label | Icon |
|-------|-------|------|
| `bilingual` | `Bilingual` | `Languages` |
| `translation-only` | `Translated` | `Type` |

- Helper: `Bilingual shows original + translation. Translated shows translation only.`

### 6.4 Source track (controls rail)

**Card**

- `title`: `Source track`
- `description`: `Which caption track to prefer before translating to your target language.`
- `icon`: `Languages`
- `variant`: `bordered`

**Contents**

1. Preferred source language — existing `Select` (`LANGUAGES` without `auto`); id `subtitle-preferred-language`.  
2. Auto-activate — existing toggle id `subtitle-auto-activate-toggle`; keep behavior; tighten description length if needed without changing meaning.

### 6.5 Platforms (controls rail)

**Card**

- `title`: `Platforms`
- `description`: `Enable or disable subtitle capture per site.`
- `icon`: `Globe`
- `variant`: `bordered`
- Optional `headerExtra`: count of enabled named sites (exclude generic) — nice-to-have, not required for v1.

**Contents**

1. Site rows (`SiteRow` / monogram) — load-more pagination unchanged (`getSubtitleSitesLoadMoreState`).  
2. **Method hints** — demote permanent third line: show via `title` tooltip on monogram (or Info icon with `title`), not always-visible body text. Keep `summary` as the secondary line.  
3. **Fallback** subsection — Generic handler toggle; separate setting `enableGenericSubtitleHandler` (unchanged semantics).  
4. **No** YouTube ASR block in this card.

### 6.6 Caption quality (controls rail)

**Card**

- `title`: `Caption quality`
- `description`: `Improve auto-generated YouTube captions before translation.`
- `icon`: `Sparkles` or `Captions` (pick one available in lucide)
- `variant`: `bordered`
- `headerExtra`: `Badge` text `YouTube` (info/neutral)

**Contents**

1. Master toggle — Improve auto-generated captions  
   - Settings: `youtubeAsrResegment.enable` (defaults via `DEFAULT_YOUTUBE_ASR_RESEGMENT_SETTINGS`)  
   - Turning master **off** also clears `aiEnable` (existing behavior — preserve).  
2. Dependent toggle — AI re-align  
   - Disabled when master off or subtitles disabled.  
   - Copy must mention BYOK / extra tokens and fail-open to local rules.  
3. Visual: when master on, nest AI control in a soft panel (`rounded-lg border border-cyan-500/15 bg-cyan-500/[0.03] p-3`) so it reads as a child, not a third platform row.

### 6.7 Translation style (controls rail)

**Card**

- `title`: `Translation style`
- `description`: `Auto follows each site profile. Override knobs to apply them everywhere.`
- `icon`: `SlidersHorizontal`
- `variant`: `bordered`
- `headerExtra`: when `overrideCount > 0`, `Badge` `{n} custom`

**Layout — compact 2×2 grid (always open)**

```
┌──────────────┬──────────────┐
│ Register     │ Faithfulness │
│ [segments]   │ [segments]   │
│ Auto|Custom  │ …            │
├──────────────┼──────────────┤
│ Brevity      │ Profanity    │
│ …            │ …            │
└──────────────┴──────────────┘
```

- CSS: `grid grid-cols-1 sm:grid-cols-2 gap-4`
- Each cell: short label, one-line description, `SegmentedControl` `size="sm"`, single status line (`Profile default` / cyan `Custom` — drop redundant multi-line noise).
- Data source: existing `KNOB_SPEC` + `handleKnobChange` / `knobOverrides` semantics (omit key when Auto).

**Friendlier one-line blurbs**

| Knob | Blurb |
|------|--------|
| Register | Formal ↔ casual tone |
| Faithfulness | Word-for-word vs natural phrasing |
| Brevity | How short on-screen lines stay |
| Profanity | Keep, soften, or remove strong language |

**Reset** — `Button` ghost/secondary + `RotateCcw`: `Reset to profile defaults`; disabled when no overrides or subtitles off.

**Advanced** — `AdvancedDisclosure` label `Advanced`:

- Translation timeout slider (existing id `subtitle-translation-timeout`, 10–120s).  
- Helper text about fallback to original text (keep meaning).

### 6.8 SegmentedControl accent

Add optional prop:

```ts
accent?: 'blue' | 'cyan'; // default 'blue' for other tabs
```

When `cyan`: active option uses cyan fill/shadow tokens (e.g. `bg-cyan-600`, `shadow-cyan-900/40`) instead of blue.  
Subtitles Studio uses `accent="cyan"` for Position, Font, Display, and Style knobs. Other sections keep default blue unless already themed separately.

---

## 7. File / Component Plan

| Piece | Action |
|-------|--------|
| `entrypoints/options/sections/SubtitlesSection.tsx` | Shell: header, hero, split layout, compose cards |
| `entrypoints/options/sections/subtitles/` (or colocated files) | Extract: `AppearanceCard`, `SourceTrackCard`, `PlatformsCard`, `CaptionQualityCard`, `TranslationStyleCard`, shared `SiteRow` / monogram if helpful |
| `entrypoints/options/components/SubtitlePreview.tsx` | Height, optional summary chips API |
| `ui/SegmentedControl.tsx` | Optional `accent` |
| `lib/subtitlePreviewCues.ts` | Unchanged unless chip helpers need a pure formatter |
| Tests | Update any SubtitlesSection / SegmentedControl tests; add preview chip unit tests if pure helpers extracted; preserve toggle ids used in tests |

**Refactor rule:** `handleUpdate` / store shape / knob Auto-omit logic / ASR nesting stay behavior-identical. No chrome.storage migration.

**Export strategy:** Prefer named exports from submodules; `SubtitlesSection` remains the public entry used by `App.tsx`.

---

## 8. State & Behavior (unchanged contracts)

| Concern | Contract |
|---------|----------|
| Master enable | `subtitleSettings.enabled` |
| Appearance fields | Same keys and value unions as today |
| Knob Auto | Omit key from `knobOverrides`; non-auto sets string union value |
| Reset knobs | `knobOverrides: {}` |
| Site disable list | `disabledSubtitleSites` array of platform ids |
| Generic | `enableGenericSubtitleHandler` boolean (not in disable list) |
| ASR | Full object replace via spread of current + partial; master off forces `aiEnable: false` |
| Timeout | `translationTimeout` number seconds |

---

## 9. Accessibility

- Keyboard order: Section header → Hero → Studio rail (preview decorative → Appearance controls) → Controls rail cards top-to-bottom.  
- Preserve control `id`s listed above where tests and a11y labels depend on them.  
- `SegmentedControl` remains `role="radiogroup"` with `aria-checked`.  
- Focus-visible rings retained; cyan active state still uses fill + font weight, not color alone.  
- `DisabledDimmer` must not trap focus incorrectly (existing pattern).  
- Reduced motion: no forced cue/progress animation.

---

## 10. Testing Strategy

1. **Unit** — pure chip label / summary formatter if extracted.  
2. **Component** — SegmentedControl cyan accent class smoke.  
3. **Section** — if/when `SubtitlesSection` tests exist: enable hero, Appearance updates store, Style Auto-omit, ASR master clears AI, site toggle membership.  
4. **Manual** — desktop: scroll controls rail; preview remains visible; change position/opacity/bilingual and confirm preview; narrow viewport stack order; reduced-motion OS setting.  
5. **Regression** — no new TypeScript errors; existing subtitle store tests still pass.

---

## 11. Success Criteria

- [ ] Desktop split panes: scrolling Platforms / Style does not remove Live preview from the viewport.  
- [ ] Appearance changes update preview immediately.  
- [ ] Style knobs write `knobOverrides` with Auto-omit; badge + reset work.  
- [ ] ASR toggles preserve enable → aiEnable nesting and clear-on-disable.  
- [ ] Platforms no longer contain ASR; method hints not always-visible body clutter.  
- [ ] No new settings keys or migrations.  
- [ ] Visual quality bar matches Theme Studio / Inline (cards, icons, cyan coherence).  
- [ ] `pnpm`/project test suite: no new failures from this work.

---

## 12. Implementation Phases (for plan author)

Suggested order (writing-plans will expand):

1. `SegmentedControl` accent prop + tests.  
2. `SubtitlePreview` height + summary chips.  
3. Extract card components with current single-column composition (behavior lock).  
4. Wire Subtitle Studio shell (hero + split layout + reorder).  
5. Style 2×2 grid + Card chrome; Platforms hint demotion; Caption quality card.  
6. Polish copy/icons; manual QA checklist; close ALT-5zv.

---

## 13. Open Decisions (resolved)

| Decision | Resolution |
|----------|------------|
| Approach | **C** Full studio |
| Style knobs visibility | **Compact 2×2 always open** |
| Preview fidelity | Reactive mock only (no network) |
| Schema | No new keys |

No remaining open product decisions for v1.
