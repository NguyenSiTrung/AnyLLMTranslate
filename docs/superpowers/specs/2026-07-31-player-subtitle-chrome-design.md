# Player Subtitle Chrome (In-Player Mini Studio) — Design Spec

> **Date:** 2026-07-31  
> **Status:** Approved for spec review (brainstorming)  
> **Approach:** Hybrid native inject + floating fallback (Approach A)  
> **Related:**  
> - [Fullscreen Subtitle Overlay](../../../conductor/archive/fullscreen-overlay_20260417/spec.md)  
> - [Subtitle Studio (Options)](./2026-07-10-subtitle-studio-design.md)  
> - [Subtitle Knob Overrides](./2026-06-23-subtitle-knob-overrides-design.md)  
> - [Named Subtitle Glossary Lists](./2026-07-21-subtitle-named-glossary-lists-design.md)  
> - [Selection Bubble Redesign](./2026-07-23-selection-bubble-full-redesign-design.md) (isolation / content-script UI patterns)

---

## 1. Context

AnyLLMTranslate already translates video subtitles on YouTube, Udemy, Coursera, LinkedIn Learning, HBO Max, Youku, WeTV, Netflix/Disney+ stubs, and a generic fallback. Appearance prefs, per-tab style knobs, named glossary lists, and fullscreen-safe cue overlay exist today.

What is missing is **on-player chrome**:

- Settings live in the **popup** and **Options → Subtitles**.
- `content/subtitleControls.ts` holds pref helpers (font size, position, opacity, drag) but does **not** render a control-bar affordance.
- `content/subtitleOverlay.ts` renders cues and handles fullscreen reparenting/popover; it is not a settings surface.

Users watching fullscreen or immersive players must leave the video to adjust bilingual mode, size, style knobs, or glossary list. Native player controls auto-hide; any extension chrome that stays permanently visible feels wrong.

### Problem summary

| Gap | Detail |
|-----|--------|
| No in-player entry point | Cannot enable or tune subtitles without popup/options |
| No control-bar parity | Nothing sits with site transport controls |
| Fullscreen UX | Cues work in fullscreen; settings chrome does not follow control auto-hide |
| Site diversity | YouTube is easy to inject; Max/Youku/WeTV players are fragile or closed |

---

## 2. Goals

1. **On-player icon** on subtitle-capable video pages, aligned with the player control bar region.
2. **Mini studio panel** on click for the approved richer control set (see §5).
3. **Hybrid mount:** native control-bar inject when a site adapter succeeds; floating fallback otherwise.
4. **Soft-mirror visibility:** icon hides/shows with native controls (or activity heuristic); open panel stays sticky until dismissed.
5. **Fullscreen parity:** chrome remains usable in fullscreen and still soft-mirrors idle hide.
6. **Reuse existing settings paths** — no parallel prefs schema.
7. **Non-blocking playback** — our chrome must not steal scrubber/clicks outside its hit targets.

---

## 3. Non-Goals (v1)

- Picture-in-Picture (PiP) chrome.
- On-player retry / re-translate / clear-cache actions.
- Source-track picker, ASR controls, full platform enable list, or Options Subtitle Studio redesign.
- Guaranteed native inject on HBO Max, Youku, or WeTV (floating is acceptable permanently if native stays brittle).
- React UI injected into host pages.
- MAIN-world player monkey-patches solely for chrome (content-script DOM is enough for v1).
- Multi-video simultaneous chrome (primary video only).

---

## 4. Product decisions (locked)

| Decision | Choice |
|----------|--------|
| Mount strategy | **Hybrid** — native adapters + floating fallback |
| Icon availability | **Whenever** a supported/generic subtitle-capable player is detected (even if translation is currently off) |
| Hide behavior | **Soft mirror** — icon follows controls; open mini studio keeps icon+panel visible until dismiss |
| Mini studio depth | **Richer set (option 1)** — enable, display mode, appearance, style knobs, glossary list, status, link to full studio |
| Architecture | **New `content/playerChrome/` module** (not bolted only onto `subtitleOverlay`) |

---

## 5. Product behavior

### 5.1 When the icon appears

Show when **all** are true:

1. Page is eligible for the subtitle pipeline (specific handler detect **or** generic handler path active for that host policy).
2. A **primary** video/player shell is detected (`findPrimaryVideo` / player host helpers).
3. Extension context is valid.

Independent of:

- Global subtitles toggle currently off (icon is the on-ramp).
- Whether cues have arrived yet.

Hide when:

- No player / left watch surface.
- Pipeline tore down / navigation cleanup.
- Site explicitly out of subtitle product surface (non-video extension pages, etc.).

### 5.2 Placement

1. **Native (preferred):** site adapter returns a control-bar mount node (typically right-side cluster near CC/settings). Button is appended there and should look like a peer control (size ~player icon buttons).
2. **Floating (fallback):** anchor near bottom-right of the player shell, above the usual progress/control band, tracked to player `getBoundingClientRect()` on resize/time/fullscreen.
3. **Fallback rules:** if native node disappears (SPA remount), debounced remount to floating; if native returns, prefer native again.

### 5.3 Visibility — soft mirror

**Controls-visible signals (priority):**

1. Adapter `isControlsVisible(doc)` when it returns a boolean.
2. Else activity heuristic on player root:
   - pointermove / pointerenter
   - click / seek interaction
   - focus within player
   - short show pulse on `play` / `pause` / `seeking`
3. Idle hide after **~2.5s** without activity (named constant; tunable).

**Sticky open exception:**

- While mini studio is open → force chrome **visible** (icon + panel).
- Close via: icon toggle, `Escape`, outside click (not on panel/icon), or navigation/teardown.
- After close: treat as fresh activity if pointer still over player (do not instantly vanish).

**Cue overlay** remains governed by existing overlay rules — independent of chrome visibility.

### 5.4 Mini studio contents (v1)

| Control | Behavior |
|---------|----------|
| Enable subtitles | Turns pipeline on/off using existing global + per-site disable model |
| Display mode | `bilingual` \| `translation-only` → overlay config |
| Font size | Existing range/clamps via `subtitleControls` / overlay config |
| Position | `top` \| `bottom` |
| Background opacity | 0–1 (UI as %) |
| Style knobs | Faithfulness, brevity, register, profanity — **same per-tab override path as popup** |
| Glossary list | Named list picker with existing site memory (`subtitleListBySite`) |
| Status line | Idle / waiting for captions / translating / error (read-only in v1) |
| Footer | “Open full Subtitle Studio” → options page Subtitles section |

Live updates: appearance changes apply immediately to the overlay when present. Knob/list/enable changes use the same messaging/store paths as popup (no duplicate authority).

### 5.5 Fullscreen

- Participate in the same Top Layer problem the cue overlay solved: when `fullscreenElement` is a container, chrome must mount/reparent so it is not stranded under the page layer.
- Floating geometry uses fullscreen-relative player/video rects.
- Soft-mirror still applies; sticky panel rule still applies.
- On fullscreen exit, restore normal mount parent and geometry.

### 5.6 Per-site native inject expectations

| Site | v1 native? | Notes |
|------|------------|-------|
| YouTube | **Phase 2 target** | Open `ytp-*` controls; best ROI |
| Udemy | Phase 3 | Custom HTML player; selectors need live validation |
| Coursera | Phase 3 | Same class as Udemy |
| LinkedIn Learning | Floating first | Adapter optional later |
| HBO Max | **Floating** | Complex player; existing testids help cues, not a stable chrome promise |
| Youku | **Floating** | KUI player; closed/custom chrome risk |
| WeTV | **Floating** | Custom player |
| Generic / unknown | **Floating only** | No control-bar contract |
| Netflix / Disney+ | Floating if handler active | Same fragility class as other streamers |

Native is always an **upgrade path**. Product must not depend on native success.

---

## 6. Architecture

### 6.1 Module layout

```
content/playerChrome/
├── index.ts              # bootstrap / teardown with subtitle lifecycle
├── host.ts               # resolve player shell + primary video
├── visibility.ts         # soft-mirror state machine
├── mountNative.ts        # adapter native mount + observe
├── mountFloating.ts      # rect-tracked floating anchor
├── button.ts             # icon control (a11y, toggle)
├── miniStudio.ts         # panel DOM + control bindings
├── styles.ts             # shadow-friendly CSS text (or shared css inject)
└── adapters/
    ├── types.ts          # PlayerChromeAdapter
    ├── registry.ts       # hostname → adapter
    ├── youtube.ts        # Phase 2
    ├── udemy.ts          # Phase 3
    └── coursera.ts       # Phase 3
```

Integration points:

- `entrypoints/content.ts` / subtitle coordinator lifecycle starts and stops player chrome with the subtitle surface (not on every arbitrary page).
- Reuse `content/subtitleControls.ts` for appearance prefs.
- Reuse settings/message paths used by popup for enable, knobs, glossary list.
- Do **not** fold button UI into `subtitleOverlay.ts` cue renderer (keep cue DOM vs chrome DOM separated; shared fullscreen host helpers are OK if extracted carefully).

### 6.2 Adapter contract

```ts
interface PlayerChromeAdapter {
  id: string;
  match(hostname: string): boolean;
  /** Control-bar container to append the button into, or null if unavailable. */
  findNativeMount(doc: Document): HTMLElement | null;
  /** true/false when known; null → use activity heuristic. */
  isControlsVisible?(doc: Document): boolean | null;
  /** Player shell for floating geometry / activity bounds / fullscreen root hints. */
  findPlayerRoot?(doc: Document): HTMLElement | null;
}
```

Registry picks the first matching adapter. No adapter ⇒ floating only + heuristic visibility.

### 6.3 Mount priority state machine

```
detect player
  → try adapter.findNativeMount()
      → success: mount native, observe node/parent
      → fail: mount floating on player root/video rect
native node disconnected
  → debounced remount (prefer native again, else floating)
fullscreenchange
  → revalidate mount parent + geometry
teardown
  → remove nodes, observers, listeners
```

### 6.4 UI isolation

- Prefer **shadow DOM** root for button+panel (selection-bubble spirit: host page CSS must not restyle our studio).
- Lightweight DOM only (no React on host pages).
- Panel opens upward from the icon; clamp to player and viewport edges.
- `pointer-events` only on our chrome; transparent gaps must not block the scrubber.
- Focusable icon; Enter/Space toggles; Escape closes; basic focus management while open (no heavy modal trap required if panel is small and non-blocking).

### 6.5 State wiring (authority)

| Concern | Source of truth |
|---------|-----------------|
| Appearance (size/position/opacity/displayMode) | Existing overlay config + `subtitleControls` storage key path |
| Enable / per-site disable | Existing `subtitleSettings` / coordinator gates |
| Style knobs | Existing per-tab override merge (`resolveEffectiveKnobs` path; same as popup) |
| Glossary list | Existing named lists + `subtitleListBySite` |
| Status | Coordinator/overlay-facing signals already used for toasts/progress; thin read-only projection |

Mini studio **must not** invent a second prefs blob. Session appearance drag offsets remain overlay-owned.

### 6.6 Fullscreen implementation notes

- Reuse patterns from `subtitleOverlay.ts`: `fullscreenchange` (+ webkit/moz/ms reads), reparent into `fullscreenElement` when it is a container, avoid breaking when fullscreen element is the bare `<video>` (popover or sibling strategy as needed for chrome — prefer mounting beside overlay host if a shared fullscreen host is introduced).
- Clear timeouts/observers on cleanup (overlay already tracks fullscreen reposition timeouts; chrome must match leak discipline).

### 6.7 Lifecycle

- **Start** when subtitle surface is eligible and primary video appears.
- **Stop** on coordinator cleanup, SPA leave-watch, or context invalidation.
- **Primary video only** — same selection policy as overlay.
- Fail quiet on context invalidation (no throw loops).

---

## 7. Visibility details

### 7.1 States

```
hidden  ──activity|adapter-visible──►  shown
shown   ──idle timeout (panel closed)──►  hidden
any     ──panel opened──►  shownForced
shownForced ──panel closed──►  shown (reset idle timer if pointer over player)
any     ──teardown──►  destroyed
```

### 7.2 Constants (initial)

| Name | Initial | Notes |
|------|---------|-------|
| Idle hide ms | 2500 | Match common player feel |
| Native recheck debounce ms | 100–250 | Avoid thrash on SPA |
| Floating reposition | rAF-coalesced on resize/scroll/fullscreen/timeupdate-light | Prefer ResizeObserver on player root |

Exact numbers are implementation defaults; behavior above is normative.

### 7.3 Outside click

Outside = event target outside panel root **and** outside icon button. Clicks on native player controls count as outside (close panel) **and** as activity (may keep icon shown briefly).

---

## 8. Edge cases

| Case | Behavior |
|------|----------|
| Global subtitles off | Icon shown; enabling from studio turns pipeline on |
| Site in `disabledSubtitleSites` | Icon shown; enable removes/clears disable for this site via existing API |
| No captions yet | Status: waiting / idle; appearance controls still editable |
| Translation error | Status error; existing toast path; no retry button in v1 |
| SPA route change | Teardown + redetect (debounced) |
| Native mount removed | Floating fallback |
| Closed shadow player UI | Skip native; floating only |
| Multiple videos | Primary only |
| Cross-origin ad iframes | Do not enter; stay on page-level primary content video |
| Reduced motion | Instant show/hide; no required animation |
| Extension reload mid-page | Quiet fail; next full navigation recovers |

---

## 9. Phased delivery

### Phase 1 — Core (must ship for feature value)

- `playerChrome` host, floating mount, soft-mirror visibility, sticky panel.
- Mini studio with full v1 control set wired to existing prefs/messages.
- Fullscreen reparent/geometry parity.
- Works on all subtitle sites via floating (YouTube, Udemy, Coursera, Max, Youku, WeTV, generic, …).
- Unit tests: visibility state machine, mount fallback, studio action wiring (mocked).

### Phase 2 — Native YouTube

- `youtube` adapter: native mount into current right-controls cluster.
- Optional `isControlsVisible` from YouTube control visibility classes.
- Tests with HTML fixtures; still falls back to floating.

### Phase 3 — Learning sites

- Udemy + Coursera adapters after live selector validation.
- Fixture tests per adapter.

### Phase 4 — Streaming polish (optional)

- Evaluate Max / Youku / WeTV native only if stable selectors exist.
- Accept permanent floating if not.

Phases 2–4 must not block Phase 1 release criteria.

---

## 10. Testing strategy

| Layer | Coverage |
|-------|----------|
| Unit | `visibility.ts` transitions (idle, sticky open, adapter signal, teardown) |
| Unit | Mount priority: native → disconnect → floating → native returns |
| Unit | Mini studio handlers call appearance/enable/knob/list APIs (mocks) |
| Unit | Adapter `match` + `findNativeMount` against fixture HTML (YouTube Phase 2+) |
| Integration-ish (jsdom) | Fullscreen change remount hooks with mocked `fullscreenElement` (same cleanup discipline as overlay tests) |
| Manual | YouTube + one learning site + one streaming site; windowed + fullscreen; panel sticky while bar would hide |

CI must not require live streaming logins.

---

## 11. Success criteria (v1 / Phase 1)

- [ ] On a subtitle-capable watch page with a primary video, the icon appears without opening the popup.
- [ ] Click opens mini studio; display mode / font size / opacity / position update the overlay live when cues are shown.
- [ ] Enable from studio can start the subtitle pipeline when the site is allowed.
- [ ] Style knobs and glossary list use the same authority paths as the popup (no divergent session state).
- [ ] With panel closed, icon hides after idle roughly with player controls; with panel open, icon+panel remain until dismiss.
- [ ] Fullscreen: icon/panel usable; soft-mirror still works; exit fullscreen restores correct placement.
- [ ] Native mount failure never removes the feature (floating always available).
- [ ] `npm run lint` and unit tests for new modules pass.

---

## 12. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Site control-bar DOM churn | Hybrid + floating default; adapters isolated and easy to disable |
| z-index / Top Layer fights | Reuse overlay fullscreen lessons; mount under fullscreen element |
| Blocking scrubber | Tight hit targets; floating above bar; pointer-events scoped |
| Prefs drift vs popup | Single write APIs; no new storage keys for studio fields |
| Performance (mousemove) | Passive listeners; rAF coalesce; teardown aggressively |
| Over-large mini studio | Fixed v1 control set; no ASR/track/retry creep |

---

## 13. Open implementation choices (non-blocking)

These may be resolved in the implementation plan without reopening product scope:

1. Whether to extract a tiny shared `fullscreenHost` helper used by both overlay and player chrome, or duplicate the minimal reparent logic in v1 and consolidate later.
2. Exact YouTube selector string at Phase 2 time (validate live; fixture freeze).
3. Whether status line needs a new thin coordinator event or can poll/subscribe to existing signals only.

---

## 14. Summary

Ship an in-player **hybrid chrome** module that always offers a floating control near the player bar, optionally injects into native bars via per-site adapters (YouTube first), opens a **richer mini studio** for enablement/appearance/style/glossary, and **soft-mirrors** control visibility while keeping an open panel sticky — including in fullscreen — without inventing a second settings system.
