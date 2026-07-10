# Inline Settings Tab Redesign (Approach C + Reactive Mock) — Design Spec

> **Date:** 2026-07-10  
> **Scope:** Settings → Inline tab information architecture, UI polish, and reactive mock preview  
> **Status:** Approved (user chose approach C + preview fidelity 1)  
> **Beads:** ALT-doc  

---

## 1. Context

The Inline tab (`InlineTranslateSection`) is a flat stack of five cards:

1. **Configuration** — enable, static gesture chips, target language, tap count, time window  
2. **Gesture Timing** — idle / gap / tolerance always expanded  
3. **Language Prefix & Write Mode** — prefix, dual mode, fallback undo  
4. **Site Blocklist** — raw mono textarea  
5. **How It Works** — wall of help text  

Pain points:

- Master enable is buried inside Configuration (Subtitles already uses a hero strip).  
- Advanced timing sliders compete with primary controls.  
- Gesture summary is static text, not a first-class summary.  
- No live feedback when dual mode / language / prefix change.  
- Dual mode is a toggle; General/Subtitles prefer scannable segments.  
- Underuses shared primitives: `DisabledDimmer`, `AdvancedDisclosure`, `SegmentedControl`, `Badge`, `Button`, card `description`.  
- Help content is long and hard to scan.

User selected **Approach C**: full IA restructure **plus** a mini preview. Preview fidelity **1: reactive mock** (no network, no Play-demo animation, no live provider calls).

---

## 2. Goals

1. **Clear information architecture** — one primary concern per card.  
2. **Hero enable** — most important control above all cards; status-aware copy.  
3. **Reactive mock preview** — fake input chrome that updates as settings change (no API).  
4. **Scannable gesture summary** — live chips for Space×N, window ms, Alt+I.  
5. **Progressive disclosure** — gesture timing collapsed by default.  
6. **Shared primitives** — align with Subtitles/General patterns.  
7. **No new settings keys** — pure presentation / IA change; store fields unchanged.

## 3. Non-Goals

- Real translation or provider calls from the options page.  
- Animated “Play demo” sequence (fidelity 2 — deferred).  
- Changing content-script gesture runtime or defaults.  
- Editable trigger key (remains Space; Alt+I remains browser shortcuts).  
- Sidebar / tab navigation redesign.  
- Popup settings redesign.  
- Schema migration or new config fields.

---

## 4. Information Architecture

```
Inline
├── Hero enable              — master on/off + status copy
├── 1. Preview               — reactive mock input
├── 2. Trigger               — language, taps, window, gesture chips
├── 3. Write & language      — dual mode, prefix, undo
├── 4. Site blocklist        — patterns + count + reset
├── 5. Advanced timing       — idle / gap / tolerance (collapsed)
└── 6. How it works          — compact tip list
```

| Surface | Settings keys | Controls |
|---------|---------------|----------|
| **Hero** | `enabled` | Toggle + status description |
| **Preview** | (read-only projection of several) | `InlineTranslatePreview` |
| **Trigger** | `targetLanguage`, `tapCount`, `timeWindowMs` | Select, sliders, chip row |
| **Write & language** | `dualMode`, `enableLanguagePrefix`, `languagePrefix`, `enableFallbackUndo` | SegmentedControl, toggles, 1-char input |
| **Site blocklist** | `blocklistPatterns` | Textarea, count badge, Reset |
| **Advanced timing** | `idleMs`, `triggerGapMs`, `triggerToleranceCount` | Sliders inside `AdvancedDisclosure` |
| **How it works** | — | Static tips (gesture labels reactive) |

**Section header**

- Title: `Inline Translation`  
- Description: `Translate text in inputs with a key gesture or Alt+I.`  
- Icon: `TextCursorInput`  
- Accent: `amber`  

**Stagger order:** Preview `0` → Trigger `1` → Write `2` → Blocklist `3` → Advanced `4` → How it works `5`.

---

## 5. Surface Specifications

### 5.1 Hero enable strip

Pattern: Subtitles master enable (cyan → amber for Inline).

- Container: `rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-4`  
- `Toggle` id: `inline-translate-toggle`  
- Label: `Enable Inline Translation`  
- Description (status-aware):  
  - **On:** `Active in text fields on pages that are not blocklisted.`  
  - **Off:** `Off — enable to translate text inside inputs with a key gesture or Alt+I.`  
- Always interactive (not dimmed). Downstream cards use `DisabledDimmer` when `!enabled`.

### 5.2 Preview card

**Card**

- `title`: `Preview`  
- `description`: `Sample field that mirrors your current settings. No real translation runs here.`  
- `icon`: `TextCursorInput` (or `Eye` / `MonitorSmartphone` if preferred for variety — pick one and keep consistent)  
- `variant`: `bordered`  

**Component:** `entrypoints/options/components/InlineTranslatePreview.tsx`

**Props (illustrative):**

```ts
interface InlineTranslatePreviewProps {
  disabled: boolean;
  targetLanguage: string;
  dualMode: boolean;
  enableLanguagePrefix: boolean;
  languagePrefix: string;
  tapCount: number;
  timeWindowMs: number;
  triggerKeyLabel: string; // e.g. "Space × 3"
}
```

**Visual structure**

1. **Chrome bar** — soft browser/app chrome with decorative field-type chips (`input` · `textarea` · `contentEditable`) — non-interactive.  
2. **Mock field** — monospaced/system input shell showing:
   - **Before** line (optional): sample user text, with prefix when prefix mode is on (e.g. `/en hello world` or `hello world`).  
   - **After** line / result state: projected output from pure helper (see §6).  
3. **Footer meta** — gesture chip + target language native/short name.  

**Behavior**

| Setting | Preview shows |
|---------|----------------|
| `dualMode === false` | Field result = sample translation only |
| `dualMode === true` | Field result = `original` + separator + sample translation |
| `enableLanguagePrefix` | Before shows `{prefix}en ` + sample; after uses English sample and note that prefix is stripped |
| Gesture / window | Footer chips update live |
| `disabled` | Dimmed shell + short message: `Enable inline translation to preview` |

**No network.** Sample translations from a small map (see §6). Unknown targets: fallback `(translated · {code})`.

**A11y / motion**

- Preview is decorative: `aria-hidden` on pure decoration; include a short `aria-live="polite"` summary of the result string for screen readers when settings change (optional but preferred).  
- No mandatory animations; if any fade is used, respect `prefers-reduced-motion`.

### 5.3 Trigger card

**Card**

- `title`: `Trigger`  
- `description`: `Default language and how the key gesture fires.`  
- `icon`: `Keyboard`  
- `variant`: `bordered`  

**Contents (top → bottom)**

1. **Gesture summary row** (always at top of body when enabled):  
   - `kbd` chip: `{triggerKeyLabel}` (Space × N or key × N)  
   - text: `within {timeWindowMs}ms`  
   - `kbd` chip: `Alt+I`  
   - Soft container: `rounded-lg bg-zinc-800/40 border border-zinc-700/50` (existing style OK).  

2. **Target language** — existing `Select` of `LANGUAGES` excluding `auto`.  
   - Description: `Default language for input translation (overridable with /en-style prefixes).`  

3. **Tap count** — `Slider` 2–5 step 1; description includes live value.  

4. **Time window** — `Slider` 200–1000 step 50 ms; description includes live value.  

Wrapped in `DisabledDimmer` when `!enabled`. Individual controls also pass `disabled={!enabled}` where supported.

### 5.4 Write & language card

**Card**

- `title`: `Write & language`  
- `description`: `How the translated text is written back and optional per-request language overrides.`  
- `icon`: `Languages`  
- `variant`: `bordered`  

**Dual mode** — `SegmentedControl` (not Toggle):

| Value | Label | Icon (suggested) |
|-------|-------|------------------|
| `false` | `Translation only` | `Type` |
| `true` | `Original + translation` | `Languages` |

- Helper under control:  
  `Translation only replaces the field. Original + translation keeps both.`  

**Language prefix**

- Toggle: `Enable Language Prefix` — existing copy about `/en` / `/ja`.  
- Prefix character: single-char control (`maxLength={1}`), default `/`, disabled when master off or prefix disabled. Prefer shared `Input` if styling matches; otherwise keep focused mono input with amber ring.

**Fallback undo**

- Toggle: `Fallback Undo` — existing description about re-trigger when Ctrl+Z unavailable.

### 5.5 Site blocklist card

**Card**

- `title`: `Site blocklist`  
- `description`: `Disable inline translate on matching hosts. Wildcards (*) supported.`  
- `icon`: `ShieldOff`  
- `variant`: `bordered`  
- `headerExtra`: `Badge` with pattern count, e.g. `{n} patterns` (variant `info` or neutral).  

**Contents**

- `Textarea` (or shared `Textarea` component) — one pattern per line; existing parse logic (split, trim, filter empty).  
- Hint: e.g. `*figma.com`  
- **Reset to defaults** — `Button` (ghost/secondary) with `RotateCcw` icon calling `DEFAULT_INLINE_TRANSLATE_BLOCKLIST`.  
- No chip-edit UI in v1 (textarea remains the editor; badge provides scannability). Chip chips can be a later enhancement.

### 5.6 Advanced timing

**Placement:** own card **or** trailing block inside Trigger. Prefer **own card** for clarity and stagger parity with Subtitles Advanced disclosure.

**Card**

- `title`: `Advanced`  
- `description`: `Fine-tune gesture recognition. Defaults work for most users.`  
- `icon`: `SlidersHorizontal`  
- `variant`: `bordered`  

**Body:** `AdvancedDisclosure` label `Gesture timing` (`defaultExpanded={false}`).

| Control | Range | Setting |
|---------|-------|---------|
| Idle debounce | 0–500 step 25 ms | `idleMs` |
| Trigger gap | 0–200 step 10 ms | `triggerGapMs` |
| Tolerance | 0–3 step 1 | `triggerToleranceCount` |

Keep existing FieldGroup descriptions (explain 0 = fire immediately / no gap filter / strict).

### 5.7 How it works

**Card**

- `title`: `How it works`  
- `variant`: `bordered`  
- No long intro paragraph. Prefer **compact bullets**:

1. Gesture + Alt+I (live gesture label; mention `chrome://extensions/shortcuts` for Alt+I).  
2. Prefix example: `{prefix}en hello` + gesture → English, strips prefix.  
3. Works in text inputs, search boxes, textareas, contentEditable.  
4. Undo: Ctrl+Z when available; else re-trigger if Fallback Undo is on.  
5. Exclusions: password fields, code editors, blocklisted hosts, browser internal pages / Web Store.

---

## 6. Preview helper module

**File:** `lib/inlineTranslatePreview.ts` (pure functions + sample map)

Responsibilities:

1. **Sample source text** — constant, e.g. `hello world`.  
2. **Sample translations** — map of common ISO codes (e.g. `en`, `vi`, `ja`, `zh`, `ko`, `es`, `fr`, `de`, `pt`, `ru`) to short natural phrases.  
3. **`resolvePreviewTranslation(targetLanguage: string): string`** — map lookup or fallback `(translated · {code})`.  
4. **`buildPreviewProjection(settings): { before: string; after: string; meta: string }`** — pure:  
   - If prefix enabled: `before = `${prefix}en ${source}`` and translation uses English sample (or keep target language sample but document that prefix overrides to `en` for the demo). **Rule (explicit):** when prefix is enabled, demo uses a fixed `/en` (or `{prefix}en`) override and English sample translation to teach the feature; when prefix is disabled, `before` is plain source and `after` uses `targetLanguage` sample.  
   - If `dualMode`: `after = `${source} / ${translation}`` (or newline join if visual prefers; pick one: **` · `** middle-dot or **` / `** — use **` / `** for clarity).  
   - If not dualMode: `after = translation`.  

Unit tests cover projection matrix: dual on/off × prefix on/off × known/unknown language.

---

## 7. File plan

| File | Action |
|------|--------|
| `entrypoints/options/sections/InlineTranslateSection.tsx` | Restructure to new IA |
| `entrypoints/options/components/InlineTranslatePreview.tsx` | **New** — presentational preview |
| `lib/inlineTranslatePreview.ts` | **New** — pure sample + projection helpers |
| `lib/__tests__/inlineTranslatePreview.test.ts` | **New** — unit tests for helpers |
| `entrypoints/options/sections/__tests__/InlineTranslateSection.test.tsx` | **New** (optional but preferred) — smoke: hero toggle, dual segments, dimmer when off |

**Out of scope files:** content scripts, `settingsStore` schema, `types/config` defaults (no behavior change).

---

## 8. Implementation notes

- Continue using `useSettingsStore` + existing `patch` merge into `inlineTranslate`.  
- Preserve `DEFAULT_INLINE_TRANSLATE_BLOCKLIST` reset behavior.  
- Prefer shared `ui/*` components over one-off class strings when equivalent exists.  
- SegmentedControl currently uses blue active styles globally — **do not** fork the component for amber in this pass unless already themable; consistency with General/Subtitles wins over amber segment pills. Hero strip and section accent remain amber.  
- Keep `stagger()` animations consistent with other options sections.  
- When `enabled` is false: dim preview + trigger + write + blocklist + advanced; hero remains full opacity.

---

## 9. Testing

| Layer | What |
|-------|------|
| Unit | `buildPreviewProjection` / resolve translation map |
| Component (preferred) | Render section with store mock; enable toggle; dual mode segment; blocklist badge count |
| Manual | Open options → Inline: toggle on/off, change language/dual/prefix, confirm preview + chips; expand Advanced; reset blocklist |

No E2E required for this presentation-only change.

---

## 10. Success criteria

1. User sees enable → preview → essentials without scrolling through timing first.  
2. Changing dual mode / language / prefix / taps updates preview and chips immediately.  
3. Timing controls start collapsed; defaults and ranges unchanged.  
4. Existing saved settings load/save unchanged (no migration).  
5. Visually consistent with Subtitles hero + General card descriptions.  
6. Unit tests for preview helpers pass.

---

## 11. Open decisions (resolved)

| Decision | Choice |
|----------|--------|
| Scope | C — full restructure + mini preview |
| Preview fidelity | 1 — reactive mock, no API |
| Dual mode control | SegmentedControl |
| Timing placement | Own Advanced card + AdvancedDisclosure collapsed |
| Blocklist editor | Textarea + count badge (no chip editor v1) |
| Prefix demo in preview | Fixed `{prefix}en` + English sample when prefix enabled |

---

## 12. Follow-ups (out of scope)

- Play-demo animation (fidelity 2).  
- Live try-it with real provider (fidelity 3).  
- Chip-based blocklist editor.  
- Theming SegmentedControl accent per section.
