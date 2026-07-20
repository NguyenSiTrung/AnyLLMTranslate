# PDF Viewer — Reader / Compare Shell Redesign

> **Date:** 2026-07-20  
> **Scope:** `entrypoints/pdf-viewer/` shell (layout, header, bridge status, post-job viewing)  
> **Status:** Draft (awaiting user review)  
> **Decision:** Approach **B** — full-width reader by default; split only for original vs result compare  
> **Related:** [Scientific Job Modal UX](./2026-07-17-scientific-job-modal-ux-design.md) (job modal stays; open-in-viewer contract extended)  
> **Supersedes (layout intent):** [PDF translation-only view](./2026-06-18-pdf-translation-only-view-design.md) for the live bridge-only product (that spec targeted the removed Fast overlay path)

---

## 1. Context

PDF Translate is **bridge-only** (local Docker / pdf2zh). The legacy in-browser Fast path is gone. Jobs produce downloadable mono / dual / side-by-side PDFs; the viewer opens results as PDFs in-tab.

The shell still assumes the old dual-pane product:

| Problem | Detail |
|---------|--------|
| **Wasted half-screen** | Right pane is a static `BridgeStatusPanel`, not a live translation stream. 50% of the viewport is empty chrome when the bridge is ready. |
| **CTA duplication** | Translate / setup appear in header, right panel, offline banner, and (when forced) the job modal. |
| **Weak post-job moment** | “Open in viewer” swaps the left PDF to the result and leaves the status card on the right — no real original ↔ translated compare. |
| **Dead architecture** | `viewMode` is hardcoded `"split"`; `translation-only` and overlay leftovers remain from Fast PDF. |
| **Developer-facing copy** | Setup body still mentions that Fast translation “has been removed.” |
| **Brand drift** | Viewer zinc + blue vs product teal/cyan + slate dark (`product-guidelines.md`). Secondary to layout; light token alignment only in this pass. |

**User decision:** Approach **B** (with A’s idle layout): full-width reader until there is something to compare; split only for original | result; bridge health as chrome, not a permanent content pane.

---

## 2. Goals

1. **Reader-first idle** — When no compare session is active, the PDF uses the full main area.
2. **Compare when it matters** — After a successful job, the user can view original and translated side-by-side in the tab (scroll-synced).
3. **One primary CTA** — Header owns Translate (ready) or Set up bridge (not ready). No duplicate primary Translate on a permanent side panel.
4. **Bridge status as chrome** — Pill + compact offline surface; setup steps only when unavailable.
5. **Keep the job modal** — Running / done / error stay in `ScientificJobModal` (already redesigned). This spec only extends how “open” actions land in the shell.
6. **Progressive disclosure** — Power-user Docker steps available when offline; calm surface when ready.
7. **No bridge API changes** — Same health probe, job orchestration, and download formats.

---

## 3. Non-Goals

- Rebuilding live in-pane translation, layout overlay, or OCR Fast path.
- Zoom, fit-width, page scrubber, thumbnails (P2 follow-up).
- Full migration of viewer buttons/modals onto shared `ui/` primitives (optional light reuse only if trivial).
- Auto-download or auto-open of results (modal policy unchanged: user chooses).
- Changing Scientific bridge HTTP API, Docker scripts, or Options Scientific PDF settings IA.
- Mobile-specific responsive redesign beyond “single column always works; compare stacks or keeps two columns on wide viewports.”
- Persisting zoom or last page number.

---

## 4. Product Principles (applied)

1. **Non-intrusive by default** — Idle chrome is minimal; PDF is the hero.
2. **Progressive disclosure** — Setup detail only when the bridge is not ready.
3. **Instant feedback** — Health pill states; clear mode chip when comparing.
4. **Accessible** — Status not color-only; keyboard-reachable header actions; compare panes labeled.
5. **Honest IA** — Split means “original vs result,” never “placeholder status card.”

---

## 5. Core model

### 5.1 Shell modes

Replace the overloaded mental model (`split` always on + dead `translation-only`) with two **session modes**:

| Mode | When | Main area |
|------|------|-----------|
| **`reader`** | Default; also after “Open translated only” or “Exit compare” | Single scroll column of PDF pages |
| **`compare`** | User chose compare from done modal or header toggle (when a result is held) | Two panes: **Original** \| **Translated**, scroll-synced |

```ts
/** PDF viewer shell mode (bridge-only product). */
export type PdfShellMode = 'reader' | 'compare';
```

**Persistence:** Do **not** persist `PdfShellMode` across documents in v1. Opening a new `?file=` always starts in `reader`. A held result is tab-session only (existing blob URL lifecycle).

**Legacy type:** `PdfViewMode = 'split' | 'translation-only'` in `lib/constants.ts` is obsolete for this product. Implementation should:

- Introduce `PdfShellMode` (constants or viewer-local types).
- Stop passing hardcoded `viewMode="split"`.
- Remove or stop using `translation-only` in live UI (delete dead branches if nothing else references them).

### 5.2 Document roles

Keep and formalize the two URL roles already partially present in `App.tsx`:

| Role | State | Purpose |
|------|--------|---------|
| **Source** | `sourcePdfUrl` | Always the job input; left pane in compare; restore target for “Back to original” |
| **Result** | `resultPdfUrl` (adopted object URL) | Mono or dual blob the user opened; right pane in compare; sole document in reader when viewing result-only |

Additional UI state:

| State | Type | Notes |
|-------|------|--------|
| `shellMode` | `PdfShellMode` | `reader` \| `compare` |
| `readerFocus` | `'source' \| 'result'` | Which doc fills reader mode when a result exists; ignore when `shellMode === 'compare'` |
| `bridgeReady` | derived | `healthOk === true` |
| banners | existing | File permission; offline; optional short compare/result strip |

Revoke rules (unchanged intent, clarified):

- App-owned `resultPdfUrl` revoked on unmount, on adopting a newer result, and when explicitly clearing the session.
- Hook-owned mono/dual URLs may still be revoked on next `startJob` / `reset`; open-in-viewer must keep copying into an App-owned object URL (current pattern).

### 5.3 What the right pane is allowed to be

| Content | Allowed? |
|---------|----------|
| Translated result PDF canvases | **Yes** — only in `compare` |
| Permanent `BridgeStatusPanel` as half the grid | **No** |
| Offline setup card | **Yes** — as centered overlay **on top of** the reader (or full main when PDF failed to load), not a grid column |

---

## 6. Information architecture & layout

### 6.1 Header (all modes)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ PDF Translator    filename.pdf.pdf          [● Bridge ready] [Translate] │
│                                           or [○ Offline] [Set up bridge] │
│                     when result held: [ Reader | Compare ]  (segmented)  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Left**

- Title: `PDF Translator`
- Subtitle: source file name (ellipsis; keep rtl trick for long paths if useful)

**Right (`headerExtra`) — single control cluster, left → right**

1. **Mode segmented control** — only if `resultPdfUrl` is non-null: `Reader` | `Compare`
2. **Bridge status pill** — `Checking bridge…` | `Bridge ready` | `Not configured` | `Bridge offline` (existing labels; keep title tooltip)
3. **Primary action**
   - Ready: `Translate` (disabled while `isRunning`)
   - Not ready (after probe): `Set up bridge` → options page
   - Checking: primary disabled or secondary-only; no fake Translate

**Removed from header permanent set**

- No second Translate elsewhere as equal primary.
- No Layout/Text toggles (Fast path gone).

### 6.2 Mode: `reader` (default)

```
┌─ header ───────────────────────────────────────────────────────────────┐
│ [optional banners]                                                     │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│                     Original  (or Translated)                          │
│                     ┌─────────────────────┐                            │
│                     │   PDF page stack    │                            │
│                     │   full width        │                            │
│                     └─────────────────────┘                            │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

- One pane label reflecting `readerFocus`: `Original` or `Translated`.
- Virtualization (`useVisiblePages` + `PdfCanvasRenderer`) targets this single scroll container.
- When `readerFocus === 'result'`, show a compact info strip (not a blocking banner wall):

  > Viewing translated result · [Show original] · [Compare side-by-side]

  “Show original” sets `readerFocus = 'source'`. “Compare” sets `shellMode = 'compare'`.

### 6.3 Mode: `compare`

```
┌─ header (+ mode = Compare) ────────────────────────────────────────────┐
├─────────────────────────────┬──────────────────────────────────────────┤
│ Original                    │ Translated                               │
│ ┌─────────────────────────┐ │ ┌──────────────────────────────────────┐ │
│ │ source PDF pages        │ │ │ result PDF pages                     │ │
│ └─────────────────────────┘ │ └──────────────────────────────────────┘ │
└─────────────────────────────┴──────────────────────────────────────────┘
```

- Enable `useSynchronizedScroll` **only** in `compare` (both pane elements mounted).
- Left always `sourcePdfUrl` document; right always `resultPdfUrl` document.
- Requires both URLs. If source is missing/unloadable, force `reader` + result-only and toast/inline note: compare unavailable.
- Pane labels: `Original` / `Translated` (not “PDF Translate”).
- Exit: segmented control → `Reader`, or strip action “Exit compare”.

**Two document loads:** Compare needs two `usePdfDocument` (or equivalent) instances — source and result — each with its own visible-page set and scroll parent. Implementation may:

- Lift a small `PdfDocumentPane` component: `{ url, containerRef, label }`, or
- Call `usePdfDocument` twice in `App` with separate visibility hooks.

Do **not** flip a single `pdfUrl` between panes; that fights compare.

### 6.4 Bridge unavailable (not ready after probe)

Do **not** open a permanent right column.

**Pattern:** full-width reader (if PDF loaded) + **one** of:

1. **Compact top banner** (always when `healthOk === false`): short message + `Set up bridge` + `Check connection` links (existing banner style, de-duplicated copy).
2. **Optional first-run / empty emphasis:** if user has not dismissed in this tab, a **centered card** over the dimmed reader (or in the main area if no PDF) with the 4 setup steps currently in `BridgeStatusPanel`.

Dismiss: “Not now” hides the card for the tab session; banner remains until ready.

**Copy rules**

- Drop any mention of removed Fast translation.
- Keep Docker one-liner and Options path for power users.
- Default bridge URL hint stays secondary (`http://127.0.0.1:17890`).

Refactor `BridgeStatusPanel` into something like `BridgeSetupCard` used only in this overlay/empty path — same content, new placement.

### 6.5 Loading / error / no URL

Keep centered empty states in a single-column shell (current non-loaded branch). No split chrome.

---

## 7. Job modal integration

`ScientificJobModal` remains the job surface ([2026-07-17 design](./2026-07-17-scientific-job-modal-ux-design.md)). Extend the **done** secondary actions:

| Action | Behavior |
|--------|----------|
| **Download** (primary) | Unchanged — selected format |
| **Open translated** | Adopt mono (or dual if only dual); `readerFocus = 'result'`; `shellMode = 'reader'`; close modal |
| **Compare side-by-side** | Adopt preferred blob for right pane: **mono** when available (true original\|translation pages); if only dual, adopt dual and still enter compare (left = source, right = dual artifact — honest label “Translated / bilingual result”); `shellMode = 'compare'`; close modal |
| **Close** | Unchanged — soft dismiss; blobs may remain in hook until next job |

**UI detail:** If both open actions clutter the modal, use:

- Primary secondary: **Open in viewer** ▾ or a split button  
- Or two equal secondary buttons: `Open translated` · `Compare`

**Recommendation:** two secondary buttons when `hasMono || hasDual`; hide Compare if source URL is missing.

**Default recommendation for open:** Prefer **Compare** when source is available and mono exists (showcases layout preservation). Do **not** auto-enter compare without a click.

**Opening while already comparing:** Replacing result revokes previous App-owned result URL, loads new result, stays in `compare` if mode was compare.

**Translate while viewing result:** Jobs always use `sourcePdfUrl` (already true). Starting a new job does not clear the held result until a new open adopts a replacement (or explicit clear). Modal running state can remain on top of either mode.

---

## 8. CTA & banner dedupe matrix

| Surface | Ready | Offline / not configured | Running | Has result |
|---------|-------|--------------------------|---------|------------|
| Header primary | Translate | Set up bridge | Translate disabled | Same + mode control |
| Header pill | Ready | Warn label | Ready/warn | Same |
| Top banner | Hidden | One offline banner | Hidden | Optional result strip in reader-result |
| Overlay setup card | Hidden | Optional / dismissible | Hidden | Hidden |
| Right grid panel | **None** | **None** | **None** | Result PDF only in compare |
| Job modal | N/A | Offline error + setup | Progress | Done downloads + open actions |

**Rule:** At most **one** full setup step list visible at a time (overlay card **or** options page, not both forced).

---

## 9. Visual design (v1 scope)

### 9.1 Layout tokens

- Keep dark viewer shell; prefer gradual alignment toward product dark `#0F172A` only if low-risk (optional). Not a blocker.
- Primary interactive accent: shift header Translate / focus rings toward product primary teal/cyan `#0EA5E9` where easy; success/warn pills stay emerald/amber.
- Pane labels: keep uppercase micro labels; rename right label as specified.
- Compare divider: 1px border; equal `1fr 1fr` columns; min-width 0; horizontal scroll avoided by existing max-width page scaling.

### 9.2 Components

| Piece | Approach |
|-------|----------|
| Mode control | Reuse existing toggle/segmented styles if present in viewer CSS, or match options `SegmentedControl` look with local classes |
| Setup card | Restyle current bridge panel as a floating card (`max-width: 420px`, centered, subtle backdrop) |
| Result strip | Reuse `pdf-viewer-scan-banner--info` pattern, thinner padding |
| Buttons | Keep `.pdf-download-btn*` for modal consistency; header button stays `.pdf-download-btn-header` |

### 9.3 Motion

- Mode switch: no heavy animation; instant layout swap (respect `prefers-reduced-motion` if any fade is added).
- Modal animations unchanged.

---

## 10. Component & code structure

### 10.1 Target structure

```
entrypoints/pdf-viewer/
  App.tsx                 # orchestration: URLs, mode, health, modal
  components/
    ViewerLayout.tsx      # shell: header, banner slot, reader | compare grid
    PdfDocumentPane.tsx   # NEW: scroll container + page stack for one URL
    BridgeSetupCard.tsx   # RENAMED/REFACTORED from BridgeStatusPanel
    ScientificJobModal.tsx
    PdfCanvasRenderer.tsx
    FilePermissionGuide.tsx
  hooks/
    usePdfDocument.ts
    useVisiblePages.ts
    useSynchronizedScroll.ts  # compare only
    useScientificPdfJob.ts
```

### 10.2 `ViewerLayout` contract (revised)

```ts
export interface ViewerLayoutProps {
  title?: string;
  subtitle?: string;
  banner?: ReactNode;
  headerExtra?: ReactNode;
  mode: PdfShellMode;
  /** Single-column reader content (ignored in compare). */
  reader?: ReactNode;
  readerPaneRef?: RefObject<HTMLDivElement | null>;
  readerLabel?: string;
  /** Compare panes */
  left?: ReactNode;
  right?: ReactNode;
  leftPaneRef?: RefObject<HTMLDivElement | null>;
  rightPaneRef?: RefObject<HTMLDivElement | null>;
  leftLabel?: string;   // default "Original"
  rightLabel?: string;  // default "Translated"
}
```

Sync hook runs only when `mode === 'compare'` and both pane els are non-null.

### 10.3 `App.tsx` responsibilities

- Parse `?file=`, own source + result URLs and revoke.
- Probe health once per source.
- Derive header controls and banners from bridge + mode + focus.
- Wire modal open actions to mode transitions (§7).
- Register/unregister PDF session (unchanged).

Avoid growing App further without extracting `PdfDocumentPane` and a thin `ViewerHeaderControls` if the JSX cluster exceeds readability.

---

## 11. Accessibility

- Mode control: `role="radiogroup"` (or toolbar) with clear labels `Reader` / `Compare`.
- Panes: `aria-label` on scroll regions (`Original PDF`, `Translated PDF`).
- Status pill: text label always present (not color alone).
- Offline banner: `role="status"`.
- Setup overlay: if modal-like, use `role="dialog"`, Escape dismisses card (not the whole tab), focus moves to first action; if non-modal card, keep focus in page and do not trap.
- Job modal a11y (focus trap / Escape) is **out of scope** unless touched incidentally — track as P2.
- Keyboard: header buttons in tab order; no keyboard trap on reader.

---

## 12. Edge cases

| Case | Behavior |
|------|----------|
| No `?file=` | Empty state; Translate disabled; setup still reachable via options if user opens viewer bare |
| `file://` without permission | Existing `FilePermissionGuide`; translate may still be offered but load fails — keep guide |
| Bridge checking (`healthOk === null`) | Pill “Checking…”; Translate disabled until probe returns |
| User clicks Translate while offline | May open modal with offline error **or** focus setup card — prefer **setup card / options**, avoid double error UX; if modal already pattern-tested, keep modal offline state once only |
| Compare with different page counts | Existing page-block scroll sync; accept imperfect mid-page align |
| Result is dual PDF in compare | Right label: `Bilingual result` when adopted blob was dual |
| New Translate after compare | Modal on top; on new Open, replace result URL |
| Narrow viewport | Compare may become tight; v1 keeps two columns (min widths via CSS); optional stack later |
| Hook reset revokes mono/dual | App-owned result URL remains valid |

---

## 13. Testing

### 13.1 Unit / component

- `ViewerLayout`: reader renders one pane; compare renders two; sync hook not required for static render tests.
- Mode control visibility: hidden without result; shown with result.
- `BridgeSetupCard`: ready path not used in grid; offline copy has no “Fast removed” string.
- Modal open helpers (extend `scientificJobModalFormats` or App handlers):  
  - `openTranslated` → reader + result focus  
  - `openCompare` → compare mode  
  Pure functions preferred for mode transition decisions.

### 13.2 Integration (existing vitest patterns)

- App-level: mock `useScientificPdfJob` + document hooks; assert mode class or pane labels after simulated open actions.
- Keep `BridgeStatusPanel` tests renamed/updated for setup card.

### 13.3 Manual checklist

1. Open remote PDF, bridge ready → full-width original, one Translate button.
2. Offline → banner + setup card; no empty half pane.
3. Complete job → Download works; Open translated → full-width result + strip.
4. Compare → two panes, scroll roughly tracks; Exit compare → reader.
5. Back to original / Show original restores source.
6. file:// permission banner still correct.
7. Second job + open replaces previous result without leaking blob URLs (DevTools / no blank canvas).

---

## 14. Migration & cleanup

1. Remove permanent right-pane `BridgeStatusPanel` usage from loaded happy path.
2. Delete or quarantine unused Fast-path CSS (translation slot leftovers only if unused — verify with grep before delete).
3. Update comments in `App.tsx` / `ViewerLayout` that describe “translated text right pane.”
4. Mark `docs/superpowers/specs/2026-06-18-pdf-translation-only-view-design.md` as **superseded for bridge-only shell** (note at top of that file or in this doc only — prefer a one-line status note on the old spec when implementing).
5. No settings schema migration.

---

## 15. Phased delivery

### Phase 1 — Shell correct (this spec’s MVP)

- `reader` default full width  
- Remove permanent status column  
- Offline banner + setup card  
- CTA dedupe  
- Copy cleanup  
- `compare` + dual `usePdfDocument` + modal open actions  
- Mode segmented control when result held  

### Phase 2 — Reader chrome (follow-up issue)

- Page indicator `n / N`  
- Zoom / fit width  
- Optional keyboard j/k page  

### Phase 3 — Polish (follow-up)

- Modal focus trap / Escape  
- Token alignment with product guidelines  
- Shared `ui/` buttons where painless  
- Narrow-viewport compare stack  

**v1 done = Phase 1 only.**

---

## 16. Success criteria

1. With bridge ready and no result, **≥ ~90%** of the main viewport shows PDF (no half-width status column).
2. User can complete: open PDF → Translate → download **without** seeing a permanent empty right pane.
3. User can complete: Translate → **Compare side-by-side** → see source and result pages together with working scroll sync.
4. Exactly one primary header CTA for the bridge state (Translate **or** Set up).
5. No user-visible copy about removed Fast translation.
6. Existing job modal download formats still work; no bridge API change.
7. Tests updated and green for layout/mode helpers and setup card.

---

## 17. Open questions (resolved for v1)

| Question | Resolution |
|----------|------------|
| Auto-enter compare on job done? | **No** — user clicks Compare or Open |
| Persist shell mode? | **No** for v1 |
| Compare uses mono or dual on right? | Prefer **mono**; dual only if mono missing |
| Keep BridgeStatusPanel name? | Prefer rename to **BridgeSetupCard** |
| Zoom in same PR? | **No** — Phase 2 |

---

## 18. Implementation notes (for planning)

- Prefer extracting `PdfDocumentPane` before wiring compare to avoid doubled JSX bugs.
- `numPagesRef` / visibility today assume one container — each pane needs its own totalPages + visible set.
- Memory: two full PDF.js documents in compare; acceptable for v1; document as known cost for very large PDFs.
- `startTranslate` today opens modal even when offline — align with §12 (prefer setup surface when `!bridgeReady` and stage idle).

---

## 19. Summary

The PDF viewer becomes a **full-width reader** whose only split mode is **original vs bridge result**. Bridge health is header chrome plus a compact offline setup surface. Translation work stays in the existing Scientific job modal; open actions gain an explicit **Compare** path so layout-preserving translation is visible in-tab, not only as a download.
