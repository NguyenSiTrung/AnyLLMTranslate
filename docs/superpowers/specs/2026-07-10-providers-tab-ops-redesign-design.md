# Providers Tab Ops Redesign — Design Spec

> **Date:** 2026-07-10  
> **Scope:** Settings → Providers tab — full product redesign (guided + pool dashboard + live ops)  
> **Status:** Approved (user chose Approach C, layout 4, edit D, scope 3 through design §1–§3)  
> **Related:** Prior FR-1 provider component extractions; SetupWizard onboarding; `ProviderPoolCoordinator` key status API

---

## 1. Context

The Providers tab is functionally strong (multi-provider pool, multi-key rotation, bulk test, catalog, progressive disclosure) but UX lags the post-restructure **General** tab:

- Expanded `ProviderCard` is a long admin form (enable → catalog → name → URL → heavy key rows → model → advanced → connection test).
- Collapsed rows under-inform (no model, host, key health mix, enable-from-list).
- Readiness banner is a kitchen sink (status + system prompt link + setup + test-all).
- Triple test mental model (per-key / provider panel / test-all).
- Catalog quality split: `AddProviderModal` is polished; inline `ProviderCatalogPicker` is flat.
- Live circuit-breaker health exists on `ProviderPoolCoordinator.getKeyStatus` / `getAllKeyStatuses` but is **not** wired to the options UI (only an unused optional `getKeyStatus` prop).
- Rotation order is **already** provider array order then key order (`resolveSlots`); UI does not expose reorder.

### Locked product decisions

| Decision | Value |
|----------|--------|
| Approach | **C — full product redesign** |
| Layout metaphor | **4 — Guided + dashboard hybrid** (empty/first-run guided; day-to-day = pool dashboard list) |
| Edit pattern | **D — Hybrid** (dense row quick actions; **Edit** opens right drawer) |
| Feature scope | **3 — Ops-grade** (core redesign + drag-reorder + live key health + latency/recovery chips) |

---

## 2. Goals

1. **Glanceable pool health** — ready / partial / degraded / not ready without reading paragraphs.
2. **Fast happy path** — catalog → key → model → verify in a guided flow.
3. **Ops control plane** — rotation order, live cooling/invalid chips, bulk test, multi-key management.
4. **One clear test story** — key / provider / all; remove redundant “Test connection” panel concept.
5. **Visual craft** parity with General tab + brand cyan/teal primary.
6. **No translation algorithm change** — only UI + status transport + persisting array order users already own.

## 3. Non-Goals

- Non–OpenAI-compatible provider protocols.
- Changing circuit-breaker thresholds, RPM math, or round-robin algorithm (UI surfaces results only).
- Priority **weights** beyond list order.
- Popup redesign; sidebar nav redesign; Themes/General changes.
- Rebuilding `SetupWizard` inside the tab (keep as secondary full onboarding entry).
- Undo stack for key delete (v1).

---

## 4. Experience model

### Product metaphor

**Translation pool control plane**

- **Empty / first run** → guided success path.
- **Configured** → ops dashboard (command bar + ordered list).
- **Deep edit** → right drawer so the list remains the map of the pool.

### Screen map

```
Providers (Settings tab)
│
├─ EMPTY / NOT READY (guided)
│   └─ EmptyPoolHero + multi-step Guided Add / Open setup guide
│
└─ CONFIGURED (dashboard)
    ├─ 1. PoolCommandBar     status · metrics · Test all · Add · Setup · prompt link
    ├─ 2. ProviderRotationList  ordered rows (drag) + key health chips + quick actions
    └─ 3. ProviderEditDrawer    Connection | Keys | Advanced | Danger
```

### Primary journeys

| Journey | Path |
|---------|------|
| First provider | Empty hero → Guided Add (or Setup guide) → green/ready command bar |
| Add another | Add provider → Guided Add → append to rotation → auto-open drawer on Keys |
| Daily health | Command bar + chips; Test all; fix failed key in drawer |
| Failover tune | Drag providers (and keys in drawer) |
| Live outage | Cooling / invalid chips + recovery copy + cooldown timer |

---

## 5. Information architecture

### 5.1 Section header

- **Title:** Providers  
- **Description:** Your LLM pool — rotation, keys, and live health.  
- **Icon:** `Layers` or `Zap` (implementation may keep `Zap`; prefer `Layers` for “pool”)  
- **Accent:** `cyan` (brand primary; amber reserved for warnings)

### 5.2 Pool Command Bar

Replaces the readiness kitchen-sink card.

**Left — status**

- Icon + title  
- One-line description  
- Metrics: `N providers · M keys healthy · K cooling · last test …`  
- Optional secondary link: Edit system prompt → Advanced tab  

**Right — actions**

- **Test all keys** (loading + `Testing {done}/{total}…`)  
- **Add provider** (primary when not ready; secondary when ready)  
- Secondary: Open setup guide  

#### Pool status model

| State | Meaning |
|-------|---------|
| **Ready** | ≥1 healthy enabled slot; `canTranslate` |
| **Partial** | Some keys failed/open/invalid, but ≥1 healthy |
| **Degraded** | Live breakers open on a large share of slots (e.g. ≥50% open/invalid) while still can translate |
| **Not ready** | No usable slots (empty, missing config, all failed/untested with no success) |

Extend `getPoolRecoveryMessage` / readiness helpers rather than one-off strings in JSX.

### 5.3 Rotation list — ProviderRow

Dense ops row (~56–64px). **No full-form inline expand.**

| Zone | Content |
|------|---------|
| Drag | `GripVertical` — reorder = rotation preference |
| Identity | Monogram + display name + host chip |
| Health | Aggregate: Verified / Failed / Mixed / Untested / Cooling |
| Model | Truncated model id (`font-mono`) |
| Keys | Compact chips per key or summary count + worst status |
| Actions | Enable toggle · Test (provider scope) · Edit · ⋮ Remove |

- Click **Edit** or key chip → open drawer (key chip focuses that key).  
- Enable works **from the row** (not only inside editor).  
- Copy near list:  
  **“Top providers and keys are preferred in rotation. Unhealthy keys are skipped automatically.”**

### 5.4 Provider Edit Drawer

- Width ~420–480px; narrow options pane → full-width bottom sheet.  
- Focus trap, Escape, restore focus to Edit control.  
- Overlay `bg-black/50`.

**Header:** monogram, name, aggregate health, enable, **Test provider**, close.

**Sections (sticky subnav / tabs)**

| Section | Contents |
|---------|----------|
| **Connection** | Template summary + Change template · Display name · Base URL · Model picker + browse · lightweight checklist (URL / key / model / last test) |
| **Keys** | DnD key list · compact rows · Add key |
| **Advanced** | Temperature · Max tokens (same ranges as today) |
| **Danger** | Remove provider → existing danger `Modal` above drawer; on confirm close drawer |

#### Compact key row

- Drag handle  
- Status chip (live + stored merge)  
- Label or “Key {n}” (avoid raw mono ids as primary label when empty)  
- API key password field (deferred commit on blur)  
- Enable toggle  
- Test · ⋮ (label, advanced limits, remove)  
- “Get a key” external link when catalog provides URL  
- No-key providers: “No key required” panel  

#### Key advanced (disclosure)

- Max RPM (0–600)  
- Concurrency limit (0–20)  
- Throttle interval ms (0–60000)  

---

## 6. Guided experiences

### 6.1 EmptyPoolHero

Show when `providers.length === 0` (and optionally emphasize when not ready with zero keys).

- Soft monogram constellation (catalog accents, low opacity)  
- **Title:** Connect your first LLM  
- **Body:** Pick a provider, add a key, verify — then translate any page.  
- **Primary:** Add provider  
- **Secondary:** Open setup guide  
- Step hint: 1 Choose · 2 Connect · 3 Verify  

### 6.2 Guided Add (modal stepper)

Day-2 and empty primary path. **Not** a rewrite of `SetupWizard`.

| Step | UI |
|------|-----|
| 1 Choose | Search + Cloud / Local / Custom groups + identity badges (current Add modal quality) |
| 2 Connect | Prefill name/URL; API key if required; model + optional Browse |
| 3 Verify | Run connection test; success → commit; failure → recovery + Retry / Skip (add untested) |

**On success:** append provider to end of pool; toast; close stepper; open Edit drawer on **Keys** (or Connection if no key required).

**Custom:** step 1 Custom → empty URL/model on step 2.

### 6.3 Setup wizard

| Entry | Role |
|-------|------|
| Full onboarding / `?setup=1` | Existing `SetupWizard` |
| Providers hero secondary | `onOpenSetup` |
| Day-2 add | Guided Add only |

Share catalog/identity components; do not duplicate wizard business logic.

---

## 7. Unified test story

| Control | Where | Behavior |
|---------|--------|----------|
| **Test** | Drawer key row | That key only; write `lastTestResult`; update chip |
| **Test provider** | Drawer header + row quick action | All enabled keys on that provider; parallel with existing bulk concurrency cap; live chip updates |
| **Test all keys** | Command bar | All enabled pool keys; N/M progress; summary toast |

**Remove** standalone bottom **Test connection** panel as a third concept. Reuse `ConnectionTestProgressList` / `ProviderTestResult` inside key test UI and/or a drawer test-run tray during multi-key runs.

**Gates:** unchanged spirit — base URL + model + (API key if `requiresApiKey`).

Bulk concurrency remains `BULK_TEST_CONCURRENCY = 4` unless tests show need to tune.

---

## 8. Drag-reorder

### Semantics

Matches `lib/poolResolver.ts` `resolveSlots`:

1. Provider array order = outer slot order.  
2. Key array order within provider = order of that provider’s slots.  
3. Disabled providers stay in list (dimmed), still reorderable so users can prep failover order.  
4. **No weight field** — order is the preference.

### UX

- Drag handles on provider rows and key rows.  
- Keyboard: Move up / Move down in ⋮ menus (required for a11y).  
- Persist immediately: `updateSettings({ providers: next })`.  
- Mid-test removals: ignore results for missing provider/key ids.

---

## 9. Live health wiring (ops-grade)

### Background

- Coordinator already implements `getKeyStatus` / `getAllKeyStatuses` (`KeyStatus`: `open`, `openUntil`, `credentialInvalid`, `lastFailureKind`, `disabled`, ids).  
- Add options ↔ background message, e.g. `GET_POOL_KEY_STATUSES`, returning a serializable `Record<keyId, KeyStatus>` (or array).

### Options UI

- Hook `usePoolKeyStatuses`: poll **every 3s** while Providers tab is visible (`document.visibilityState`), refresh on window focus and after tests.  
- Merge live + stored `lastTestResult` + enabled flags for chips.  
- If message fails: fall back to stored test badges; show **“Live status unavailable — showing last test results.”**

### Chip vocabulary

| Chip | Sources | Meaning |
|------|---------|---------|
| Healthy | last test success + breaker closed | In rotation |
| Failed | last test failure | Needs attention |
| Cooling | `open: true` | Skipped until `openUntil`; show countdown |
| Invalid key | `credentialInvalid` | Auth failure recovery |
| Off | key or provider disabled | Excluded |
| Untested | no lastTestResult | Encourage test |

Icon + label required (not color alone). Latency from last test when available.

### Recovery examples

| Condition | Direction |
|-----------|-----------|
| Invalid key | API key rejected — replace key or disable it |
| Cooling | Cooling down · back in {mm:ss}; traffic uses other keys |
| All open | Pool exhausted — wait or fix keys |
| Untested only | Verify connection to start translating |

---

## 10. Visual system

| Layer | Treatment |
|-------|-----------|
| Command bar | Bordered/elevated card; status left; actions right; metrics one row |
| Rows | `rounded-xl` bordered surfaces; monogram accent on hover/selected |
| Chips | emerald healthy · rose failed/invalid · amber cooling/untested · zinc off |
| Drawer | `bg-zinc-950`, border-l, sticky header, scroll body |
| Motion | Existing stagger; ~200ms drawer slide; pulse only on active test; honor `prefers-reduced-motion` |
| Brand | Cyan/teal primary CTAs; amber warnings only |

---

## 11. Component map

| Component / module | Role |
|--------------------|------|
| `ProvidersSection` | Shell: hero vs dashboard; wire store + hooks |
| `PoolCommandBar` | Status, metrics, global actions |
| `ProviderRotationList` | DnD provider list |
| `ProviderRow` | Dense ops row |
| `ProviderEditDrawer` | Tabbed editor shell |
| `ProviderKeyRow` | Compact + advanced + chips (evolve existing) |
| `GuidedAddProvider` | 3-step modal |
| `EmptyPoolHero` | First-run CTA |
| `usePoolKeyStatuses` | Poll background statuses |
| Pool actions helpers | reorder, CRUD, bulk test (extract from section) |

**Stable exports** for popup/tests: `countEnabledKeys`, `getPoolReadiness` (behavior preserved; may gain richer internal helpers without breaking callers).

Reuse: `ProviderIdentityBadge`, catalog filter/group, `ModelPicker`, `useConnectionTest`, `useDeferredCommit`, `Modal`, `Button`, `FieldGroup`, etc.

---

## 12. Copy deck

| UI | Copy |
|----|------|
| Section description | Your LLM pool — rotation, keys, and live health. |
| Order hint | Top providers and keys are preferred in rotation. Unhealthy keys are skipped automatically. |
| Empty title | Connect your first LLM |
| Empty body | Pick a provider, add a key, verify — then translate any page. |
| Guided steps | 1 Choose · 2 Connect · 3 Verify |
| Test all idle | Test all keys |
| Test all running | Testing {done}/{total}… |
| Live unavailable | Live status unavailable — showing last test results. |
| Cooling | Cooling down · back in {time} |
| Invalid | API key rejected |

---

## 13. Edge cases

1. **Last key removed** — allow empty key list; provider incomplete; do not auto-delete provider.  
2. **No API key required** — Guided Add skips secret; synthetic/no-key slot UX as today.  
3. **Change template** — confirm if URL/model would overwrite.  
4. **Concurrent options pages** — last write wins via existing storage sync.  
5. **Stale bulk test** — drop results for missing ids.  
6. **Delete while drawer open** — confirm modal above drawer; close drawer on confirm.  
7. **Single provider** — keep drag handle for consistency.  
8. **Narrow pane** — drawer as bottom sheet; command bar actions wrap.

---

## 14. Phasing

| Phase | Delivers |
|-------|----------|
| **P0 — Shell** | Command bar + dense rows + drawer (tabs) + compact keys + retire mega-card expand; stored status only |
| **P1 — Guided** | Empty hero + Guided Add 3-step + auto-open drawer |
| **P2 — Order** | Provider + key drag + keyboard move + order copy |
| **P3 — Live ops** | Message API + `usePoolKeyStatuses` + cooling/invalid + partial/degraded + recovery |
| **P4 — Polish** | Motion, monogram empty art, a11y pass, narrow sheet, unified test tray |

Ship recommendation: P0+P1 first PR if feasible; P2 then P3; P4 with or right after P3.

---

## 15. Testing strategy

| Layer | Coverage |
|-------|----------|
| Unit | Status aggregation (ready/partial/degraded/not ready); merge(live, stored); reorder helpers; recovery messages |
| Component | Command bar states; ProviderRow; Guided Add steps; drawer tabs; compact key row |
| Integration | Bulk test progress; mocked status message; delete closes drawer |
| A11y | Drawer focus trap; keyboard reorder; chip names |
| Regression | Popup readiness helpers; coordinator dispatch unchanged; settings schema unchanged except order of existing arrays |

Prefer TDD for pure aggregation/reorder helpers.

---

## 16. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Drawer + Modal stacking | Single confirm modal layer; no nested drawers |
| Poll cost | 3s only when tab visible |
| DnD dependency weight | Prefer lightweight HTML5 DnD or existing dep; keyboard mandatory |
| Scope creep | Non-goals enforced; no weights/analytics |
| SetupWizard drift | Share catalog components only |

---

## 17. Success criteria

1. New user reaches a verified provider in ≤3 guided steps without hunting Advanced.  
2. Power user sees pool health and cooling keys without expanding mega-forms.  
3. Reorder clearly changes rotation preference (copy + behavior match `resolveSlots`).  
4. One understandable test model: key / provider / all.  
5. Visual craft consistent with General tab restructure.  
6. Live status end-to-end when background coordinator is available.  
7. No new settings **keys** required; order is existing array order.

---

## 18. Defaults locked by approval

| Decision | Value |
|----------|--------|
| Approach | C — full product redesign |
| Metaphor | Guided + dashboard hybrid (4) |
| Edit | List quick actions + Edit drawer (D) |
| Scope | Ops-grade including reorder + live health (3) |
| Test model | Key / provider-all-keys / pool-all; no separate connection panel |
| Order | Array order only; drag + keyboard |
| Live poll | 3s while visible + focus + post-test |
| Setup wizard | Kept as secondary full onboarding |
| Section accent | cyan |
| Phases | P0→P4 as in §14 |

---

## 19. Implementation notes

- Extract bulk test / CRUD from `ProvidersSection` into hooks/helpers for testability; fix any stale-closure risks when committing mid-bulk-test (functional updates from latest store).  
- Message types: add to `types/messages.ts` and background handler next to existing pool coordinator access.  
- Do not break `ProvidersSection` prop surface used by `App.tsx` (`onOpenSetup`, `onNavigateToAdvanced`).  
- After implementation: unit tests for options providers + lint; run relevant pool tests if message wiring touches background.  
- Follow project TDD / clean-code skills during implementation; track work in **bd**, not markdown TODOs.

---

## 20. Spec self-review

- No TBD placeholders left for core behavior.  
- Status model, test model, and drawer IA are mutually consistent.  
- Scope is large but phased (P0–P4); single design doc, multiple implementation PRs.  
- Ambiguity resolved: order = array order; live status via new message; Guided Add ≠ SetupWizard rewrite.
