# Selection Bubble Full Feature Redesign — Design Spec

> **Date:** 2026-07-23  
> **Scope:** Text-selection translate chip + result bubble (content script surface), Phase A full UI/actions; Phase B multi-provider TTS settings  
> **Status:** Approved architecture (user OK 2026-07-23); awaiting user review of written spec  
> **Beads:** AnyLLMTranslate-cdj  
> **Approach:** A — Modular shell + pure renderers (DOM, not React on host page)

---

## 1. Context

### Current surface

After the user selects page text, AnyLLMTranslate shows a floating brand chip (`.anyllm-selection-btn`). Clicking it (or using the context-menu path) opens a result bubble (`.anyllm-selection-tooltip`) near the selection with:

- Loading spinner + “Translating…”
- **Sentence mode:** plain translation text + Copy / Close
- **Dictionary mode:** headword, phonetic, POS, definitions, examples, translation, contextual analysis + Copy / Close

Implementation today is concentrated in:

| File | Role |
|------|------|
| `content/textSelection.ts` | Chip, tooltip DOM, selection handlers, dictionary builder, translate request |
| `styles/tooltip.css` | Chip + tooltip + dictionary + dark mode styles |
| `content/__tests__/textSelection.dictionary.test.ts` | Dictionary DOM unit tests |

### Pain points (from UX review)

1. **Generic look** — Google-blue accents (`#1a73e8`), flat white card; not brand (teal `#0EA5E9`, slate, amber).
2. **Thin sentence hierarchy** — translation dump only; no original, no language chips.
3. **Weak actions** — only Copy + Close; no Retry, Speak, Glossary, Pin.
4. **A11y anti-pattern** — `role="tooltip"` with interactive buttons; chip is `<div role="button">`; no focus rings.
5. **Fragile positioning** — magic offsets (`y - 40 - 80`); no re-measure after content grows (dictionary).
6. **Error UX** — `⚠ ${message}` with no retry or next-step guidance.
7. **Dictionary scroll** — actions live inside scroll body and can leave the viewport.
8. **Monolith** — ~600-line `textSelection.ts` mixes shell, content, and I/O.

### Product decisions (locked)

| Topic | Decision |
|-------|----------|
| Goal | Premium visual **+** full action bar |
| Glossary target | **Global** `settings.glossary` |
| Pin | Stay open until Close / Escape (no drag, no history stack) |
| Speak v1 path | Phase A: `speechSynthesis`; Phase B: multi-provider TTS settings with browser fallback |
| Delivery | **One epic, two phases** |
| Sentence body | Translation primary + **collapsible original** + language chips in header |

---

## 2. Goals

### Phase A — Bubble redesign (must ship first)

1. **Brand-coherent floating UI** — tokens from product guidelines; light/dark; optional glass with solid fallback.
2. **Clear hierarchy** — header / scrollable body / sticky footer; caret toward selection.
3. **Full action bar** — Copy, Retry, Speak (browser), Add to glossary, Pin (+ Close).
4. **Accessible dialog** — real buttons, focus styles, correct ARIA, Escape + pin-aware dismiss.
5. **Reliable placement** — measure after paint; flip above/below; clamp to viewport; re-position after content swap.
6. **Modular code** — split shell, content builders, actions, speak controller; thin public API in `textSelection.ts`.
7. **Preserve behavior** — dictionary vs sentence classification, stale-session guard, context-menu entry, enable toggle.

### Phase B — Multi-provider TTS (after Phase A is shippable)

1. Options TTS settings (enable, provider preset, model/voice/rate, test).
2. Speak prefers configured provider TTS; fail-open to browser TTS with user-visible status.
3. No regression to Phase A bubble UX when TTS is off or misconfigured.

---

## 3. Non-Goals

| Non-goal | Rationale |
|----------|-----------|
| Drag-to-reposition bubble | Explicitly out of pin scope |
| Pin history stack / multi-bubble | Complexity without locked requirement |
| Named-list or site-scoped glossary from bubble | User chose global glossary only |
| React / shadow-DOM island on host pages | Approach C rejected |
| Changing dictionary LLM schema / prompts | Backend path stays |
| Changing selection classifier thresholds | Only UI consumes existing modes |
| Immersive pixel-perfect clone | Brand-first redesign, not parity chase |
| TTS for page-inline or subtitle tracks | Speak is selection-bubble only in this epic |
| Full Options visual redesign | Phase B adds a TTS section only |

---

## 4. Architecture

### 4.1 Module map

```
content/
  textSelection.ts                 # Public API: init, enable, context-menu, re-exports for tests
  selectionBubble/
    types.ts                       # Shared types (BubbleState, ActionId, SpeakRequest, …)
    tokens.ts                      # Optional: class name constants only (CSS owns values)
    chip.ts                        # Floating translate chip
    shell.ts                       # Dialog create/update/remove, pin, position, focus
    position.ts                    # Pure placement math (viewport clamp, flip)
    contentLoading.ts              # Loading body
    contentSentence.ts             # Translation + collapsible original
    contentDictionary.ts           # Dictionary layout (migrated from buildDictionaryTooltipContent)
    contentError.ts                # Error body + retry affordance
    actions.ts                     # Footer toolbar + header controls wiring
    speak.ts                       # SpeakController (Phase A: speechSynthesis)
    glossaryAdd.ts                 # Append to global glossary via updateSettings
    index.ts                       # Barrel for shell entry points used by textSelection.ts

styles/
  tooltip.css                      # Full visual system (tokens + components)

lib/ (Phase B)
  tts/
    types.ts
    browserTts.ts
    providerTts.ts                 # OpenAI-compatible and other presets
    resolveTtsBackend.ts

entrypoints/options/ (Phase B)
  sections/TtsSection.tsx          # or Advanced subsection — see Phase B

types/
  config.ts                        # Phase B: tts settings on ExtensionSettings
  messages.ts                      # Phase B: optional speak/tts message actions
```

### 4.2 Responsibility split

| Unit | Does | Does not |
|------|------|----------|
| `chip.ts` | Create/remove brand chip; click → callback | Translate network I/O |
| `shell.ts` | Own single dialog node; states loading/result/error; pin flag; dismiss rules | Know dictionary field parsing |
| `position.ts` | Pure functions: given rects → `{ left, top, placement }` | Touch DOM except via args |
| Content builders | Return `HTMLElement` trees for body | Attach global listeners |
| `actions.ts` | Build toolbar; emit action events / call injected handlers | Own settings schema |
| `speak.ts` | Start/stop speech; report speaking state | UI layout |
| `glossaryAdd.ts` | Dedup + `updateSettings({ glossary })` | Named lists |
| `textSelection.ts` | Selection mouseup, session id, `translateSelection` message, wire modules | Inline CSS strings for layout |

### 4.3 Runtime flow

```
mouseup selection (≥2 chars)
  → chip.show(anchorRect)
chip click | context menu
  → selectionSession++
  → shell.showLoading(anchor)
  → chrome.runtime.sendMessage({ action: 'translateSelection', … })
  → if session stale: drop
  → shell.applyResult(sentence | dictionary | error)
  → shell.reposition(anchor)

actions:
  copy     → clipboard + transient success on button
  retry    → same as chip click with lastRequest context
  speak    → SpeakController.speak(primaryText, lang)
  glossary → glossaryAdd(source, target) → footer toast/status
  pin      → shell.setPinned(true|false)
  close    → shell.dismiss(force=true)
```

### 4.4 State model (conceptual)

```ts
type BubbleMode = 'loading' | 'sentence' | 'dictionary' | 'error';

interface BubbleSession {
  sessionId: number;
  pinned: boolean;
  mode: BubbleMode;
  /** Document-space anchor from selection range */
  anchor: { x: number; y: number; width: number; height: number };
  originalText: string;
  sourceLanguage: string;
  targetLanguage: string;
  /** Last successful or failed response payload for retry/copy/speak/glossary */
  lastResult?: {
    translatedText: string;
    dictionary?: SelectionDictionaryPayload;
    error?: string;
  };
  originalExpanded: boolean;
}
```

Only one bubble at a time (existing behavior). Pin does not create multiple instances.

---

## 5. Information architecture (UI)

### 5.1 Chip

```
┌──────┐
│ logo │  32×32 brand mark, teal focus ring, scale hover
└──────┘
```

- Element: real `<button type="button">`.
- `aria-label`: “Translate selection”.
- Position: above selection center when room; else below; clamp horizontally.
- Animation: short fade + scale (existing spirit, brand shadow).

### 5.2 Dialog shell

```
        ▲ caret (points at selection)
┌─────────────────────────────────────────┐
│ [EN → VI]              [📌 Pin] [✕]     │  header (sticky)
├─────────────────────────────────────────┤
│                                         │
│  body (scrollable, max-height ~min(360px, 50vh))
│                                         │
├─────────────────────────────────────────┤
│ [Copy] [Retry] [Speak] [Glossary]       │  footer (sticky)
│  status line (optional, one line)       │
└─────────────────────────────────────────┘
```

- Root: `role="dialog"`, `aria-label="Translation"`, `aria-modal="false"` (page remains interactive; not a blocking modal).
- Result text region: `aria-live="polite"`.
- Max width ~360–400px; min width ~220px.
- Caret: CSS triangle on edge matching placement (`above` | `below`).

### 5.3 Header

| Element | Behavior |
|---------|----------|
| Language chips | Show `source → target` labels (display names or codes from existing language helpers). If source is `auto`, show `Auto → VI` (or resolved if available without extra round-trip). |
| Pin | Toggle; amber active state when pinned; `aria-pressed`. |
| Close | Always dismisses (even when pinned). |

### 5.4 Body — loading

- Brand-colored spinner + “Translating…”.
- Optional secondary line: truncated original (max ~80 chars) for orientation.
- No action buttons required; footer may show disabled Copy/Speak/Glossary, enabled Close only via header.

### 5.5 Body — sentence

```
Translation text (primary, readable)

[ Show original ▾ ]     // collapsed by default
  original text         // when expanded
```

- Primary text uses brand-forward color (not Google blue).
- Collapsible control is a button; `aria-expanded`.
- Expanding original triggers `reposition` if height changes.

### 5.6 Body — dictionary

Preserve field set from Immersive-style dictionary mode; improve hierarchy:

```
headword
/phonetic/

── Definitions ──
[pos] meaning
  example source
  example target

── Translation ──
primary gloss

── In this context ──
contextual analysis
```

- Section labels: subtle uppercase or small slate labels (not heavy chrome).
- POS pills: teal-tint brand tokens.
- Max height + scroll on body only; header/footer fixed.

### 5.7 Body — error

```
⚠ Short human message
Optional detail (collapsed or smaller type)
[ Retry ]   // primary in body or rely on footer Retry
```

- Prefer mapping known errors (no API key, rate limit, network) to actionable copy when already available from existing error helpers; otherwise show sanitized message.
- Never empty the dialog on failure.

### 5.8 Footer actions

| Id | Label / icon | Enabled when | Effect |
|----|--------------|--------------|--------|
| `copy` | Copy | Has text to copy | Clipboard primary translation (dict: `translation` or first meaning fallback); success checkmark ~1.5s |
| `retry` | Retry | After result or error | Re-invoke last selection translation; bump session; loading state |
| `speak` | Speak / Stop | Has speakable text | Toggle: start/stop `SpeakController` |
| `glossary` | Glossary | Has source + target pair | Add to global glossary; status “Added” / “Already in glossary” / error |
| `pin` | (header primary; footer optional mirror) | Always when open | Toggle pin — **header is source of truth**; footer may omit pin to reduce clutter |

**Decision:** Pin lives in **header only** (footer keeps Copy / Retry / Speak / Glossary). Close in header only.

Icons: inline SVG (Lucide-like strokes), 16px, consistent with copy icon style today. Tooltips via `title` + `aria-label`.

### 5.9 Status line

Single line under footer icons for transient feedback (copy ok, glossary added, speak failed → “Using browser voice”). Auto-clear after ~2s except errors (clear on next action).

---

## 6. Visual design system

### 6.1 Tokens (CSS custom properties on bubble root)

```css
.anyllm-selection-dialog {
  --anyllm-sb-bg: #ffffff;
  --anyllm-sb-bg-elevated: #f8fafc;
  --anyllm-sb-fg: #0f172a;
  --anyllm-sb-muted: #64748b;
  --anyllm-sb-border: rgba(15, 23, 42, 0.08);
  --anyllm-sb-primary: #0ea5e9;
  --anyllm-sb-primary-soft: rgba(14, 165, 233, 0.12);
  --anyllm-sb-accent: #f59e0b;
  --anyllm-sb-success: #10b981;
  --anyllm-sb-danger: #f43f5e;
  --anyllm-sb-shadow: 0 8px 28px rgba(15, 23, 42, 0.14), 0 0 0 1px var(--anyllm-sb-border);
  --anyllm-sb-radius: 14px;
  --anyllm-sb-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
```

Dark (`prefers-color-scheme: dark` and `.anyllm-dark`):

- Background `#0f172a` / elevated `#1e293b`
- Foreground `#e2e8f0`, muted `#94a3b8`
- Borders white alpha
- Primary remains teal; soft primary adjusted for contrast

Optional glass:

```css
background: color-mix(in srgb, var(--anyllm-sb-bg) 88%, transparent);
backdrop-filter: blur(12px);
```

Solid fallback when `backdrop-filter` unsupported (same solid bg).

### 6.2 Motion

- Chip: 150ms fade/scale in.
- Dialog: 180ms fade + 4px translate.
- Content swap: opacity crossfade optional; avoid layout thrash.
- Respect `prefers-reduced-motion: reduce` → disable transform animations.

### 6.3 Focus

- All interactive elements: `outline: 2px solid var(--anyllm-sb-primary); outline-offset: 2px` on `:focus-visible`.
- No reliance on color alone for pin/active states (icon fill + `aria-pressed`).

---

## 7. Behavior details

### 7.1 Pin

| Event | Unpinned | Pinned |
|-------|----------|--------|
| Click outside | Dismiss | Keep |
| New text selection | Remove chip+bubble (or replace chip); dismiss bubble | Keep bubble; may still show new chip for a *new* translate (if user clicks chip, **replace** content of same shell and keep pin) |
| Escape | Dismiss | Dismiss |
| Close button | Dismiss | Dismiss |
| Navigate away / cleanup | Dismiss | Dismiss |

When pinned and user starts a new translation from chip/context menu: update in place (same dialog), stay pinned, new session id.

### 7.2 Retry

Store `lastRequest: { text, range snapshot optional, dictionaryCandidate flags inputs }`. Retry re-sends `translateSelection` with same languages from current settings (re-load settings so language changes apply).

### 7.3 Glossary add

```ts
// Pseudocode
const settings = await loadSettings();
const source = originalText.trim();
const target = primaryTranslation.trim();
if (!source || !target) → status error
if (findDuplicateSource(settings.glossary, source)) → "Already in glossary"
else {
  const entry = { id: crypto.randomUUID(), source, target };
  await updateSettings({ glossary: [...settings.glossary, entry] });
  → "Added to glossary"
}
```

- Use existing `findDuplicateSource` from `lib/glossary.ts`.
- Content script may call `updateSettings` from `lib/config` (already used patterns via loadSettings); if encryption/save path is heavy, prefer a small background message `addGlossaryEntry` — **prefer direct `updateSettings` first** (matches other content paths using config helpers). If tests or MV3 constraints force messaging, add `addGlossaryEntry` action as implementation detail without changing UX.

### 7.4 Speak (Phase A)

- Text: sentence → translated text; dictionary → `translation` or headword + translation.
- Lang: `targetLanguage` BCP-47 best-effort for `SpeechSynthesisUtterance.lang`.
- Toggle: if speaking, cancel; else speak.
- On missing `speechSynthesis`: status “Speech not supported in this browser”.
- No network in Phase A.

### 7.5 Positioning algorithm

Pure function inputs:

- `anchorRect` (viewport)
- `dialogSize` `{ width, height }`
- `viewport` `{ width, height }`
- `scroll` `{ x, y }`
- preferred: above

Rules:

1. Prefer place **above** anchor if `anchor.top - height - caret >= 8`.
2. Else place **below** if space.
3. Else choose side with more vertical space; clamp top into `[8, viewport.height - height - 8]`.
4. Horizontal: center on anchor midX; clamp to `[8, viewport.width - width - 8]`.
5. Output document coordinates for `position: absolute` (add scroll).
6. Call after mount, after content updates, on `resize`/`scroll` (passive) while open — **when unpinned, scroll may dismiss chip only; bubble repositions**. If performance issue, throttle 100ms.

### 7.6 Dismiss + selection chip coexistence

- Unpinned bubble: mousedown outside dialog+chip → remove both.
- Ignore interactions originating inside dialog/chip (existing closest checks).
- `suppressNextMouseUp` retained for chip click path.

### 7.7 Keyboard

| Key | Action |
|-----|--------|
| Escape | Dismiss dialog + chip |
| Tab | Cycle focusable controls inside dialog when focus is inside (no full focus trap — `aria-modal=false`) |
| Enter/Space | Activate focused button |

Chip: focusable button if ever focused programmatically (mouse-first UX remains).

---

## 8. Phase B — Multi-provider TTS (outline)

### 8.1 Settings shape (proposed)

```ts
interface TtsSettings {
  enabled: boolean;           // master; default true for Speak button usefulness
  preferredBackend: 'auto' | 'browser' | 'provider';
  /** When provider: which preset id (openai, etc.) */
  providerId?: string;
  model?: string;             // e.g. tts-1
  voice?: string;             // e.g. alloy
  rate?: number;              // 0.5–2, applies to browser; provider if supported
  // Future: pitch, format
}
```

Stored under `ExtensionSettings.tts` with defaults; migration: missing key → defaults.

### 8.2 Options UI

- Section under Advanced or dedicated “Speech” group: enable, backend preference, provider/model/voice when provider, rate slider, **Test voice** button.
- Copy explains: provider TTS uses API quota; browser is free/local.

### 8.3 Runtime

```
SpeakController.speak(text, lang)
  → resolveTtsBackend(settings)
  → if provider: fetch audio (background message to avoid CORS / key exposure in page)
  → play Audio element
  → on failure: fallback browser + status line
```

API keys never injected into page DOM; background performs provider fetch.

### 8.4 Phase B non-blocking rule

Bubble Speak button always works with browser if provider path fails or is disabled.

---

## 9. Class / DOM contract

Prefer stable `data-anyllm-role` attributes for tests and styling:

| Role | Element |
|------|---------|
| `selection-btn` | Chip button |
| `selection-dialog` | Dialog root (rename from tooltip class; **keep legacy class alias** `.anyllm-selection-tooltip` during transition or update all tests in same PR) |
| `selection-header` | Header |
| `selection-body` | Scroll body |
| `selection-footer` | Footer |
| `selection-caret` | Caret |
| `selection-lang` | Language chips |
| `selection-action` | Action buttons (`data-action=copy\|retry\|…`) |
| `selection-status` | Status line |
| `word-dictionary` | Dictionary root (keep existing class names where tests depend) |

**Migration:** Update `TOOLTIP_CLASS` constant and tests in the same change set; no multi-release dual DOM required if extension is single-versioned.

---

## 10. Testing strategy

### Unit (jsdom)

- `position.ts` — above/below/clamp cases.
- `contentSentence.ts` — collapsed/expanded original.
- `contentDictionary.ts` — field rendering (migrate existing dictionary tests).
- `contentError.ts` — message rendering.
- `actions.ts` — buttons present/disabled by mode.
- `glossaryAdd.ts` — duplicate vs append (mock `updateSettings`).
- `speak.ts` — mock `speechSynthesis`; speak/cancel.
- `shell.ts` — pin dismiss matrix; applyResult modes.
- `textSelection` integration — session stale guard still holds.

### Manual

- Long dictionary near top/bottom of viewport.
- Dark page + `prefers-color-scheme`.
- Pin + click outside + new selection + translate again.
- Glossary appears in Options Dictionary/Glossary UI.
- Escape while speaking cancels speech.
- Reduced motion.

---

## 11. File-level change list (Phase A)

| Action | Path |
|--------|------|
| Modify | `content/textSelection.ts` — thin orchestration |
| Create | `content/selectionBubble/*` modules above |
| Modify | `styles/tooltip.css` — redesign tokens + layout |
| Modify | `content/__tests__/textSelection.dictionary.test.ts` + new tests under `content/__tests__/selectionBubble/` or co-located |
| Modify | `README.md` — selection bubble capabilities (copy/retry/speak/glossary/pin) |
| No change | Dictionary prompt / background `translateSelection` contract (unless glossary message needed) |

Phase B files as in §4.1.

---

## 12. Success criteria

### Phase A

- [ ] Bubble matches brand tokens (no `#1a73e8` as primary accent).
- [ ] Header / body / sticky footer visible; actions not lost in scroll.
- [ ] Sentence: collapsible original works; lang chips show.
- [ ] Dictionary: section labels; all prior fields still render.
- [ ] Copy, Retry, Speak (browser), Glossary (global), Pin behaviors match §7.
- [ ] `role="dialog"`, focus-visible styles, Escape dismiss.
- [ ] Position stays on-screen after load and resize for typical viewports.
- [ ] Existing dictionary + selection tests updated and green; new unit tests for position/pin/glossary/speak.
- [ ] `textSelection.ts` public API preserved: `initTextSelection`, `setTextSelectionEnabled`, `translateSelectedTextViaContextMenu`, dictionary exports needed by tests.

### Phase B

- [ ] TTS settings persist and drive Speak backend selection.
- [ ] Provider failure falls back to browser with status.
- [ ] Keys never exposed to page JS beyond existing settings patterns.

---

## 13. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Host page CSS resets break layout | High-specificity classes + explicit font/box on dialog root; avoid `all: initial` war unless needed |
| `updateSettings` from content races Options UI | Atomic read-modify-write; duplicates guarded; acceptable rare race |
| speechSynthesis voice quality | Status honesty; Phase B provider path |
| Position thrash on scroll | Throttle; consider freeze position while pinned if noisy |
| Bundle size of SVGs | Inline minimal paths only |
| Scope creep into drag/history | Non-goals enforced |

---

## 14. Implementation order (for planning)

1. Tokens + shell structure (empty header/body/footer) + position pure functions + tests  
2. Chip as real button + loading body  
3. Sentence + dictionary content migration  
4. Actions: copy, close, pin dismiss matrix  
5. Retry + error body  
6. Glossary add  
7. Speak controller (browser)  
8. Polish motion/dark/reduced-motion + README  
9. Phase B track (separate plan after A ships)

---

## 15. Open implementation choices (non-blocking)

Resolved defaults if implementer needs a call:

| Topic | Default |
|-------|---------|
| Footer includes Pin? | **No** — header only |
| Class rename | Prefer `.anyllm-selection-dialog`; update tests same PR |
| Glossary via message vs `updateSettings` | Prefer `updateSettings`; message only if required |
| Auto language label | Show `Auto` until we have a free detected lang without extra UX |

No remaining product open questions for Phase A.

---

## 16. References

- UX review conversation (2026-07-23)  
- `conductor/product-guidelines.md` — brand + UX principles  
- Archived track `selection-dict-mode_20260709` — dictionary mode behavior  
- Current: `content/textSelection.ts`, `styles/tooltip.css`
