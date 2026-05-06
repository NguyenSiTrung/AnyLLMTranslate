# General Tab UI/UX Overhaul — Design Spec

> **Date:** 2026-05-06
> **Scope:** Settings General tab restructure, component extraction, accessibility & polish fixes
> **Status:** Approved

---

## 1. Context

The General tab in the AnyLLMTranslate extension settings page has accumulated several UX issues through iterative development:

- A `ThemePreview` component is duplicated between General and Themes tabs
- Semantically identical cards (Display / Appearance) are unnecessarily split
- The "Dark Mode" label creates confusion with the ThemePreview's own dark toggle
- Translation Position remains interactive even when meaningless (Translation-only mode)
- The sticky section header pattern is copy-pasted across all 9 sections
- Minor accessibility and polish gaps exist in shared components

## 2. Goals

1. **Reduce cognitive load** — Merge related cards, remove duplication
2. **Fix UX logic bugs** — Disable irrelevant controls, fix misleading labels
3. **Improve maintainability** — Extract shared patterns into reusable components
4. **Polish accessibility** — Add proper ARIA linkage to SegmentedControl

## 3. Non-Goals

- Redesigning the Themes tab (out of scope except ThemePreview error label fix)
- Changing the navigation structure or sidebar
- Adding new features or settings

---

## 4. Changes

### 4.1 Remove ThemePreview from GeneralSection

**What:** Delete the `<ThemePreview />` render and its stagger wrapper (lines 151-154 of GeneralSection.tsx).

**Why:** The same preview already exists at the top of the Themes tab with identical functionality. Duplication creates maintenance cost and user confusion.

**Replace with:** A small inline text link below the Translation Theme dropdown:
```
"Preview all themes →"
```
This link navigates to the Themes tab. Implementation requires either:
- A callback prop `onNavigateToThemes?: () => void` passed from App.tsx, or
- A lightweight shared navigation mechanism (e.g., custom event or URL hash)

**Decision:** Use a callback prop approach — `GeneralSection` receives `onNavigateToThemes` from `App.tsx`, matching the existing pattern where `ProviderSection` receives `onOpenSetup`.

### 4.2 Merge Display + Appearance Cards

**What:** Combine the "Display" card (Display Mode + Translation Theme) and "Appearance" card (Translation Position + Dark Mode) into a single **"Display & Appearance"** card.

**Why:** Both cards control "how translations look." The split is artificial and adds unnecessary vertical scrolling.

**Structure of merged card:**
```
Card: "Display & Appearance" (Monitor icon, bordered variant)
├── FieldGroup: Display Mode (SegmentedControl)
├── FieldGroup: Translation Theme (Select + "Preview all themes →" link)
├── ── separator (border-t border-zinc-800 pt-4 mt-4) ──
├── FieldGroup: Translation Position (SegmentedControl) — conditional
└── FieldGroup: Host Page Mode (SegmentedControl)
```

**Result:** General tab goes from 3 cards + standalone preview (4 visual blocks) → 2 cards (Language + Display & Appearance).

### 4.3 Conditionally Disable Translation Position

**What:** When `displayMode === 'translation-only'`, disable the Translation Position SegmentedControl.

**Why:** Position (Below/Above/Side) controls placement relative to the original text. If original text is hidden, position is meaningless — it becomes a confusing no-op control.

**Implementation:**
- Wrap the Translation Position `FieldGroup` in a div with `opacity-40 pointer-events-none` when translation-only is active
- Add a hint below: `"Position only applies in Bilingual mode."`
- Uses the same disable pattern as AdvancedSection.tsx line 295

### 4.4 Rename "Dark Mode" to "Host Page Mode"

**What:** Change the label and description of the Dark Mode segmented control.

**Before:**
- Label: `"Dark Mode"`
- Description: `"Control the appearance of translated text on host pages."`

**After:**
- Label: `"Host Page Mode"`
- Description: `"Match how translations render on the page. Auto detects the site's theme."`

**Why:** "Dark Mode" implies the Settings UI theme, not the injected translation styling. The rename clarifies scope (host page, not settings) and eliminates semantic collision with ThemePreview's "Dark Mode Preview" toggle.

**Options remain unchanged:** Auto / Light / Dark

### 4.5 Extract SectionHeader Component

**What:** Create a new reusable `ui/SectionHeader.tsx` component to replace the duplicated sticky header markup across all 9 settings sections.

**Current pattern (duplicated 9 times):**
```tsx
<div className="sticky top-0 z-10 backdrop-blur-md bg-[#09090b]/95 pt-4 pb-4 mb-3 -mt-4 flex items-center gap-3">
  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600/15 border border-blue-500/20">
    <Icon className="w-4 h-4 text-blue-400" />
  </div>
  <div>
    <h2 className="text-base font-semibold text-zinc-100 leading-tight">Title</h2>
    <p className="text-xs text-zinc-500 mt-0.5">Description</p>
  </div>
</div>
```

**New component props:**
```typescript
interface SectionHeaderProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  accentColor: 'blue' | 'pink' | 'emerald' | 'amber' | 'zinc' | 'sky' | 'orange' | 'indigo' | 'cyan';
}
```

**Accent color mapping:** Each section uses a different icon tint color. The component maps `accentColor` to the appropriate bg/border/text classes for the icon container.

**Sections to update:**
| Section | Accent Color |
|---------|-------------|
| General | blue |
| Themes | pink |
| Provider | emerald |
| Dictionary | amber |
| Site Rules | sky |
| Subtitles | orange |
| Statistics | indigo |
| Shortcuts | cyan |
| Inline | blue |
| Advanced | zinc |

### 4.6 Remove Language Field Hints

**What:** Remove the `hint` prop from both Source Language and Target Language `FieldGroup` components.

**Why:** The hint "Type the first few letters to jump to a language" documents native browser `<select>` type-ahead behavior. It adds visual noise without providing non-obvious information.

### 4.7 Visual Indicator for Auto Source Language

**What:** Prefix the "Auto (Detect)" option in the Source Language dropdown with a 🌐 globe emoji.

**Before:** `Auto (Detect Language)`
**After:** `🌐 Auto (Detect Language)`

**Why:** Visually distinguishes the "detect" meta-option from specific language choices.

### 4.8 Adjust Stagger Animation Timing

**What:** Increase the stagger delay multiplier in `animations.css` from `30ms` to `50ms`.

**Before:** `animation-delay: calc(var(--stagger-delay, 0) * 30ms);`
**After:** `animation-delay: calc(var(--stagger-delay, 0) * 50ms);`

**Why:** The current 30ms×3 = 90ms total spread is imperceptible. 50ms×3 = 150ms creates a noticeable but still subtle cascading effect.

### 4.9 ThemePreview Error State Label

**What:** Add a muted label above the loading/error sample states in ThemePreview.tsx.

**Before:** Loading and error states render directly with no context.
**After:** A small label: `"Sample states:"` in `text-[10px] text-zinc-600 uppercase tracking-wider` appears above them.

**Why:** Users seeing "⚠ Translation failed: example error" may think something is broken. The label clarifies these are demonstrative samples.

**Note:** This change applies to the ThemePreview as used in the Themes tab (since it's being removed from General).

### 4.10 SegmentedControl Accessibility

**What:** Add `id` prop support to the SegmentedControl component and use `aria-labelledby` to programmatically associate it with its FieldGroup label.

**Changes to SegmentedControl.tsx:**
```typescript
interface SegmentedControlProps<T extends string> {
  // ... existing props
  id?: string;           // NEW: DOM id for the radiogroup
  labelledBy?: string;   // NEW: id of the labelling element
}
```

Apply to the `<div role="radiogroup">`:
```tsx
<div role="radiogroup" aria-label={label} aria-labelledby={labelledBy} id={id} ...>
```

**Changes to FieldGroup.tsx:**
- Generate a stable id from `htmlFor` or `label` for the label element
- Pass this id to children via a render prop or simply use `htmlFor` convention

**Simplified approach:** Since SegmentedControl already receives `label` as `aria-label`, the quickest improvement is to add `id` for testing hooks and keep `aria-label` as the accessible name. The `aria-labelledby` linkage is a nice-to-have that can be deferred if FieldGroup refactoring is too invasive.

**Decision:** Add `id` prop to SegmentedControl. Keep existing `aria-label` pattern. Defer `aria-labelledby` linkage.

### 4.11 TypeScript Stagger Helper

**What:** Extract the repeated CSS variable cast into a shared utility.

**Before (repeated 4× per section):**
```tsx
style={{ '--stagger-delay': '1' } as React.CSSProperties}
```

**After:**
```typescript
// lib/styleUtils.ts (or inline in each section)
export const stagger = (delay: number): React.CSSProperties =>
  ({ '--stagger-delay': String(delay) } as React.CSSProperties);

// Usage:
<div className="animate-stagger" style={stagger(1)}>
```

---

## 5. Files Affected

| File | Action | Changes |
|------|--------|---------|
| `ui/SectionHeader.tsx` | **Create** | New reusable section header component |
| `lib/styleUtils.ts` | **Create** | Stagger helper utility |
| `sections/GeneralSection.tsx` | **Major edit** | Merge cards, remove preview, add nav link, rename fields, disable position |
| `ui/SegmentedControl.tsx` | **Minor edit** | Add `id` prop |
| `ThemePreview.tsx` | **Minor edit** | Add "Sample states" label |
| `animations.css` | **Minor edit** | Adjust stagger multiplier 30ms → 50ms |
| `App.tsx` | **Minor edit** | Pass `onNavigateToThemes` callback to GeneralSection |
| `sections/ThemesSection.tsx` | **Minor edit** | Replace inline header with SectionHeader |
| `sections/ProviderSection.tsx` | **Minor edit** | Replace inline header with SectionHeader |
| `sections/DictionarySection.tsx` | **Minor edit** | Replace inline header with SectionHeader |
| `sections/SiteRulesSection.tsx` | **Minor edit** | Replace inline header with SectionHeader |
| `sections/SubtitlesSection.tsx` | **Minor edit** | Replace inline header with SectionHeader |
| `sections/StatisticsSection.tsx` | **Minor edit** | Replace inline header with SectionHeader |
| `sections/ShortcutsSection.tsx` | **Minor edit** | Replace inline header with SectionHeader |
| `sections/InlineTranslateSection.tsx` | **Minor edit** | Replace inline header with SectionHeader |
| `sections/AdvancedSection.tsx` | **Minor edit** | Replace inline header with SectionHeader |

## 6. Testing Considerations

- Verify Translation Position disables correctly when switching Display Mode
- Verify "Preview all themes →" link navigates to Themes tab
- Verify SectionHeader renders correctly across all 9 sections with different accent colors
- Verify stagger animation is visually perceptible
- Existing ThemePreview tests in `__tests__/ThemePreview.test.tsx` remain valid (component unchanged structurally)
- GeneralSection tests may need updating for merged card structure and new nav callback

## 7. Out of Scope

- Theme dropdown visual picker enhancement (keeping native `<select>`)
- Themes tab redesign
- Sidebar navigation changes
- New settings or features
