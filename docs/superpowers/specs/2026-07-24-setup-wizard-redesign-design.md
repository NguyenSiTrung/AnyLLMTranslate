# Setup Wizard UI/UX Redesign — Design Spec

> **Date:** 2026-07-24  
> **Scope:** First-run / resume setup wizard (`SetupWizard`), shared shell pieces, catalog row reuse with Guided Add  
> **Status:** Approved direction — **Approach B + C-lite**  
> **Beads:** AnyLLMTranslate-rnm  
> **Related:** `2026-05-04-new-user-success-path-design.md` (original onboarding), `2026-07-10-providers-tab-ops-redesign-design.md` (Guided Add / EmptyPoolHero)

---

## 1. Context

The setup wizard is the first-run path to a working translation: pick an OpenAI-compatible provider, verify the connection, choose a target language, then optionally translate the current page.

Today it lives mainly in:

| Layer | Path |
|-------|------|
| UI (god component) | `entrypoints/options/SetupWizard.tsx` (~770 lines) |
| Pure helpers | `lib/setupWizard.ts` |
| Types | `OnboardingState.lastStep` in `types/config.ts` |
| Wiring | `entrypoints/options/App.tsx`, popup recovery, `EmptyPoolHero` |
| Shared pieces | `ProviderCatalogPicker`, `ModelPicker`, `ConnectionTestProgressList` |

### Current flow (5 steps)

```
welcome → provider → test → language → done
```

### Parallel product surface

**GuidedAddProvider** already implements a stronger day-2 path:

```
choose → connect → verify
```

…with category groups, `ProviderIdentityBadge` monograms, and progressive steps. **EmptyPoolHero** markets `1 Choose · 2 Connect · 3 Verify` while the setup wizard still exposes five equal stepper pills. First-run and day-2 feel like different products.

### Pain points

1. **Dual onboarding mental models** — 5-step SetupWizard vs 3-step Guided Add.  
2. **Dense provider step** — catalog list + base URL + key + model on one screen; flat list without identity badges.  
3. **Step inflation** — Welcome and Done are framing, not decisions; language is separate from verify though the test already uses a target language.  
4. **Brand inconsistency** — wizard cyan accents vs primary `Button` blue vs catalog active blue.  
5. **God component** — shell, a11y, all steps, and side effects in one file.  
6. **Weak first impression** — welcome is competent but template-ish vs EmptyPoolHero’s monogram constellation.

### Decision

| Choice | Selection |
|--------|-----------|
| Core IA | **B — Unified 4-step Success Path** |
| C-lite add-ons | **Brand Welcome**, **Connect category filters**, **shared WizardShell** (extract now; Scientific PDF can adopt later) |
| Explicitly deferred | Full path-fork Welcome (Cloud / Local / Custom as separate wizard routes) |

---

## 2. Goals

1. **One mental model** with Guided Add / EmptyPoolHero: choose → connect → verify → ready.  
2. **Faster time-to-ready** — fewer discrete steps; language on Verify; progressive credentials.  
3. **Beautiful first-run** — brand Welcome + monogram constellation; cyan-aligned shell.  
4. **Scanable catalog** — identity badges, Cloud / Local / Custom groups, sticky **filters** (C-lite, not hard paths).  
5. **Decomposed structure** — shell + step components; pure step migration helpers.  
6. **No regression** of skip / resume / reconfigure / popup deep-link / pool atomic writes.  
7. **Shared catalog rows** — extract from Guided Add; wizard and Guided Add consume the same list UI.

## 3. Non-Goals

- Full **path-first** Welcome (hard Cloud / Local / Custom wizard branches) — follow-up only.  
- Rewriting Scientific PDF wizard in this track (shell extraction may be reused later; not required for acceptance).  
- Changing provider readiness rules, `testConnection` pipeline, or pool coordinator semantics.  
- Popup recovery IA redesign (keep CTAs; update deep-link step ids only).  
- Light theme, new settings keys beyond `lastStep` enum migration.  
- Merging SetupWizard and GuidedAdd into a single component (share primitives only).

---

## 4. Information Architecture

### 4.1 New steps (4)

```
welcome → connect → verify → ready
```

| Step id | Label (UI) | User decision |
|---------|------------|---------------|
| `welcome` | Welcome | Start or skip |
| `connect` | Connect | Provider + credentials |
| `verify` | Verify | Target language + connection proof |
| `ready` | Ready | Celebrate + translate / open settings |

### 4.2 Mapping from legacy steps

| Legacy `lastStep` | New step |
|-------------------|----------|
| `welcome` | `welcome` |
| `provider` | `connect` |
| `test` | `verify` |
| `language` | `verify` |
| `done` | `ready` |

Deep links: `?setup=1&step=…` must accept **new** ids and **legacy** ids (normalize via pure helper).

### 4.3 Entry rules (preserve behavior, new ids)

| Situation | Entry step |
|-----------|------------|
| First run (`!completed && !skipped`) | `welcome` (or resume `lastStep` if mid-flow) |
| Skipped, resume | `lastStep` migrated; never stuck on `ready` without complete |
| `lastStep === 'ready'` and not completed | `verify` if was mid-finish, or `welcome` if skipped — mirror existing `done` logic with new ids |
| Completed, reopen setup | **`connect`** (not Ready) — reconfigure |
| `forceEntryStep` / `?step=` | Normalized step if valid |

Pure function stays in `lib/setupWizard.ts` (`resolveWizardEntryStep` + new `normalizeWizardStep`).

### 4.4 Connect internal phases (same step id)

Connect is **one** wizard step with two progressive phases (local UI state, not persisted as separate `lastStep` unless useful):

| Phase | Content |
|-------|---------|
| **Choose** | Search + filter chips + grouped catalog rows |
| **Credentials** | Identity header + key + model; base URL under Advanced disclosure |

Selecting a catalog entry moves to Credentials. “Change provider” returns to Choose without clearing the API key by default (same as catalog selection today).

### 4.5 Verify combines test + language

| Zone | Content |
|------|---------|
| Language | Popular chips + full select (“All languages”) |
| Summary chips | Provider · model · → target |
| Test | Primary test CTA + `ConnectionTestProgressList` + success/error |
| Continue | Enabled when test success **or** persisted `connectionStatus === 'success'` (unchanged gate) |

Language choice updates `selectedLanguage` for the test payload and is written to `targetLanguage` on finish (when entering Ready / complete).

---

## 5. UI / UX by step

### 5.1 Shell (`WizardShell`)

Shared chrome for SetupWizard:

```
┌────────────────────────────────────────────────────────────┐
│  Cyan brand gradient bar                                   │
│  Title (context) · Step n of 4 · [Skip for now?]           │
│  ████████░░░░  segment progress (4 segments)               │
├────────────────────────────────────────────────────────────┤
│  Scrollable step body                                      │
├────────────────────────────────────────────────────────────┤
│  [Back / secondary]                    [Primary CTA]       │
└────────────────────────────────────────────────────────────┘
```

**Shell responsibilities**

- Backdrop + centered panel (`max-w-2xl`, `max-h ~88–92vh`)  
- Body scroll lock while open  
- Focus trap + Escape → skip confirm (unless completed / on Ready → close)  
- Progress segments + optional clickable completed segments (Back only, not skip ahead)  
- Footer slot for step actions  
- Soft brand glow (cyan/sky), `prefers-reduced-motion` safe animations  

**Skip**

- Header Skip only when `step !== 'ready'` and not in reconfigure-complete mode  
- Welcome footer: single secondary “Skip for now” (no double Skip in the same viewport as a second primary row — header may still offer Skip for consistency with later steps; **prefer footer-only on Welcome, header-only on Connect/Verify**)  
- Skip confirm copy unchanged in spirit  

**Titles**

| Mode | Header title |
|------|----------------|
| First-run / incomplete | “Setup guide” or “Get ready to translate” |
| Completed reconfigure | “Update provider” |

### 5.2 Welcome (brand — C-lite)

**Goal:** Emotion + trust in one screen; no path forks.

- Brand monogram / icon (same asset family as options sidebar / popup)  
- **Monogram constellation** (reuse EmptyPoolHero pattern: OR, GQ, OL, … low opacity)  
- Headline: **See the web in your language**  
- Subcopy: Connect any OpenAI-compatible provider or local Ollama. Keys stay on your device.  
- Three **compact** proof lines (icon + one sentence), not tall 3-column feature cards if space is tight — single column on narrow, 3-up on `sm+` is OK if height stays under the fold  
- Micro step hint: `1 Connect · 2 Verify · 3 Translate` (align with hero language)  
- Primary: **Get started** → `connect`  
- Secondary: **Skip for now** → confirm  

### 5.3 Connect

**Choose**

- Search field (sticky within list region)  
- **Filter chips (C-lite):** `All` · `Cloud` · `Local` · `Custom`  
  - Filters `groupByCategory` / catalog categories already on entries  
  - Not separate wizard steps; no dead-end if user picks “wrong” filter — switch chip anytime  
- Grouped list with **identity badge + name + mono URL** (shared `ProviderCatalogRows` extracted from Guided Add)  
- Active selection uses **cyan** tint (wizard brand), not blue  

**Credentials**

- Header: monogram + display name + text button **Change**  
- Fields order: **API key** (if required) → **Model** (`ModelPicker`) → **Base URL** inside Advanced disclosure (default open if Custom / empty template URL; default collapsed when catalog prefilled URL)  
- Blocking readiness banner (amber) when `!canTest`  
- Footer: Back → Welcome (or Choose phase if on Credentials); Primary **Continue to verify** disabled until `canTest`  

### 5.4 Verify

- Intro: **Prove the connection** + short subtitle  
- **Language first:** Popular chips + All languages select  
- Summary chips: provider · model · → language  
- Test button: Test connection / Retry / Testing…  
- Progress list + success (emerald) / previously verified (soft) / failure (rose + next action)  
- Optional: after successful test, enable Continue immediately; **do not hard auto-navigate** without user click (avoids surprise); optional short success pulse is OK  
- Footer: Back → Connect; Primary **Finish setup** (or “Continue”) → complete onboarding + `ready`  

**Completion write** (same transaction spirit as today):

```ts
{
  targetLanguage: selectedLanguage,
  onboarding: { completed: true, skipped: false, lastStep: 'ready' },
}
```

Connection status already updated by test handler via atomic provider/pool write.

### 5.5 Ready

- Centered success mark (emerald)  
- Title: **You're ready to translate**  
- Summary: provider display name · target language (chips preferred over prose)  
- Primary: **Translate current page** (if `onTranslateCurrentPage` provided)  
- Secondary: **Open settings** (`onClose`)  
- At most one tip row (Providers tab / change language) — avoid tutorial walls  

---

## 6. Visual system

| Token | Spec |
|-------|------|
| Accent | **Cyan** for setup brand (gradient bar, progress fill, selected catalog, chips active) |
| Primary CTA | Prefer cyan-aligned primary on wizard actions **or** keep shared `Button` primary but ensure selected states and progress are cyan-consistent (do not introduce a third accent) |
| Surfaces | zinc-950 panel, `border-white/10` / zinc-800 borders, inset highlights matching `Card` |
| Radius | Shell `rounded-2xl`; inner `rounded-xl` / chips `rounded-full` |
| Motion | Step body `fade-in-up` ~150–200ms; respect `prefers-reduced-motion` (opacity only or none) |
| Catalog active | Cyan wash (`bg-cyan-500/10`, `text-cyan-200`, ring) — not blue |

---

## 7. Component architecture

```
entrypoints/options/
  SetupWizard.tsx                 # open gate, store wiring, step orchestration
  components/wizard/
    WizardShell.tsx               # chrome, progress, a11y, skip overlay slot
    WizardProgress.tsx            # 4-segment bar + labels
    steps/
      WelcomeStep.tsx
      ConnectStep.tsx             # choose + credentials phases
      VerifyStep.tsx
      ReadyStep.tsx
  components/
    ProviderCatalogRows.tsx       # NEW extract: groups + badges + search layout pieces
    ProviderCatalogPicker.tsx     # may thin-wrap or deprecate compact list for wizard
    GuidedAddProvider.tsx         # migrate choose list to ProviderCatalogRows
    ConnectionTestProgressList.tsx
    ModelPicker.tsx
    ProviderIdentityBadge.tsx
    EmptyPoolHero.tsx             # unchanged API; constellation pattern mirrored on Welcome

lib/setupWizard.ts
  WIZARD_STEPS, labels, popular languages
  normalizeWizardStep(legacy | new) → WizardStep
  resolveWizardEntryStep(onboarding)
  providerPatchInvalidatesTest
  wizardStepIndex
  (optional) filter helpers if not inlined

types/config.ts
  OnboardingState.lastStep union → new ids
  (migration at read time via normalize — no storage migration job required)
```

### Orchestration boundaries

| Concern | Owner |
|---------|--------|
| Persist `lastStep` | SetupWizard orchestration |
| `updateProviderAndPool` atomic write | SetupWizard (or small hook `useWizardProviderSync`) |
| Test run + connectionStatus | SetupWizard / VerifyStep callbacks |
| Pure step math / normalize | `lib/setupWizard.ts` |
| Presentational step UI | `steps/*` |

---

## 8. State & data flow

### 8.1 Unchanged

- `onboarding.completed` / `skipped`  
- Provider readiness via `getProviderReadiness` / recovery messages  
- `testConnection` + progress steps  
- Atomic `provider` + `providers` sync on patch and test result  
- Translate current page callback from `App.tsx`  

### 8.2 Local React state (wizard session)

- `step: WizardStep`  
- `connectPhase: 'choose' | 'credentials'`  
- `catalogFilter: 'all' | 'cloud' | 'local' | 'custom'`  
- `selectedLanguage`  
- `isTesting`, `testResult`, `testProgress`  
- `isTranslating`  
- `showSkipConfirm`  

### 8.3 Persistence

| Event | Write |
|-------|--------|
| Navigate steps | `onboarding.lastStep` |
| Skip | `skipped: true`, `completed: false`, lastStep = current (map ready→verify if needed) |
| Provider field change | provider + pool; clear local test UI if invalidating |
| Test finish | connectionStatus success/error on provider + pool |
| Finish setup | targetLanguage + completed + lastStep `ready` |

---

## 9. Accessibility

- `role="dialog"` `aria-modal` labelled by title id  
- Focus trap; initial focus on dialog panel  
- Escape: dismiss skip confirm first; else skip confirm or close when completed/ready  
- Progress: `nav` with `aria-label="Setup progress"`; current step `aria-current="step"`  
- Filter chips: `aria-pressed`  
- Catalog: `listbox` / `option` or buttons with clear selected state  
- Errors: text + icon, not color alone; `role="status"` / `aria-live` on test progress  
- Reduced motion: disable translateY animations  

---

## 10. Deep links & integration

| Entry | Behavior |
|-------|----------|
| Auto first-run | Open wizard |
| `?setup=1` / `#setup` | Open wizard |
| `?step=provider` (legacy) | Normalize → `connect` |
| `?step=test` / `language` | → `verify` |
| `?step=done` | → `ready` only if meaningful; completed reopen still prefers `connect` via resolve |
| EmptyPoolHero “Open setup guide” | Open wizard (force null entry → resolve) |
| Popup “Set up / Resume” | Unchanged open Options with setup query; step ids updated if popup passes them |

---

## 11. Testing plan

### Pure (`lib/setupWizard` / unit)

- `normalizeWizardStep` for all legacy + new ids + invalid → fallback  
- `resolveWizardEntryStep` completed → connect; skipped done → welcome; mid-flow resume  
- Popular languages / test invalidation unchanged  

### Component

- Skip from Welcome persists skipped  
- Connect: filter chips narrow list; select provider → credentials; Continue gated on readiness  
- Verify: language chips update selection; test success enables finish; finish sets completed + ready  
- Ready: translate callback / close  
- Focus trap / Escape smoke (existing patterns)  
- Guided Add still works after catalog extract  

### Regression

- Existing SetupWizard tests updated for new copy/steps  
- Provider pool sync tests still pass  

---

## 12. Migration & compatibility

1. Update `OnboardingState.lastStep` TypeScript union to **new** ids.  
2. On every read path used by the wizard, run `normalizeWizardStep` so **existing chrome.storage** values (`provider`, `test`, …) keep working.  
3. Writes only persist **new** ids going forward.  
4. No bulk storage migration job.

---

## 13. Implementation phases (suggested)

| Phase | Deliverable |
|-------|-------------|
| **P0** | Pure helpers: new steps, normalize, resolve; type update; unit tests |
| **P1** | `WizardShell` + `WizardProgress`; scaffold SetupWizard orchestration |
| **P2** | `ProviderCatalogRows` extract; Guided Add + Connect choose |
| **P3** | Welcome (brand) + Connect credentials (progressive URL) |
| **P4** | Verify (language + test) + Ready |
| **P5** | Wire App deep links; polish motion/a11y; update tests; visual pass |

---

## 14. Acceptance criteria

1. First-run user sees **4** progress segments and can complete setup without the old 5-step labels.  
2. Connect catalog matches Guided Add quality (badges + groups) and supports **All / Cloud / Local / Custom** filters.  
3. Base URL is not always a top-level required-looking field when a template fills it (Advanced disclosure).  
4. Target language is chosen on **Verify**, not a separate wizard step.  
5. Completed reopen lands on **Connect**, not Ready.  
6. Skip / resume / popup setup entry still work; legacy `lastStep` and `?step=` values normalize.  
7. Atomic provider/pool updates preserved; connection test behavior preserved.  
8. SetupWizard is decomposed (shell + steps); no single 770-line monolith.  
9. Visual brand is coherent (cyan setup accent; no blue/cyan clash on catalog selection).  
10. Keyboard-complete path works; reduced-motion respected.

---

## 15. Out-of-scope follow-ups (parked)

- Full C path-fork Welcome (Cloud / Local / Custom as separate routes)  
- Adopt `WizardShell` in Scientific PDF wizard  
- Auto-run connection test when landing on Verify with `canTest`  
- Merge Guided Add modal into SetupWizard shell  
- Wizard-specific primary `Button` variant in design system if cyan primary becomes global  

---

## 16. Spec self-review notes

| Check | Result |
|-------|--------|
| Placeholders / TBD | None material; primary CTA cyan vs shared Button noted as implementer choice with constraint |
| Consistency | 4 steps, legacy map, entry rules, and acceptance criteria align |
| Scope | Single implementation plan; phases P0–P5 are sequential, not separate products |
| Ambiguity | Welcome Skip placement specified (footer-only on Welcome); auto-advance on test **disabled** (user click required) |

---

## 17. Open implementation choices (non-blocking)

These may be decided during implementation without reopening the product design:

1. Whether wizard primary buttons use a local `className` cyan override or a new `Button` variant.  
2. Whether `connectPhase` is reset every time `connect` is entered or preserved for the session.  
3. Exact Welcome microcopy for the three proof lines (keep current meaning: Any LLM / Privacy / Quick setup).  
