# PDF Translation: Skip Math & Figure/Table Content

**Date:** 2026-06-17
**Status:** Approved (pending implementation)
**Scope:** `entrypoints/pdf-viewer/`, `services/`, `types/`

## Problem

The PDF translation right pane over-translates two content types that appear
frequently in research papers:

1. **Math/formulas.** Equations like `f(x) = x²` or `L(θ) = Σᵢ ℓ(yᵢ, ŷᵢ)` are
   extracted as text by PDF.js and sent to the LLM, which mangles variable
   names and operators (e.g. translating `Σ` to a word, or "fixing" notation).
2. **Figure/chart/table text.** Axis labels ("Accuracy", "Year"), legend items,
   table-cell values, and annotations are extracted as normal text items,
   grouped into paragraphs, and translated like prose — even though they are
   labels *on a figure* that the reader can still see on the left pane.

Both are undesirable: the reader sees a translated label that no longer
matches the figure on the original page, and a formula that has lost its
meaning.

## Root Cause

`extractPageText()` (`entrypoints/pdf-viewer/lib/pdfTextExtraction.ts`)
pulls **every** text item from the page via `page.getTextContent()`, then
groups them into paragraphs purely by spatial proximity. There is no content
filtering. Every paragraph — prose, formula, or chart label — is then sent to
`translateParagraphs()` (`entrypoints/pdf-viewer/lib/pdfTranslation.ts`)
which forwards all of them to the LLM in a batched `translate` message.

## Goals

- Pure-math paragraphs (equations, formulas) are **kept verbatim** — never
  sent to the LLM.
- Prose that *contains* inline math is **translated**, with the inline math
  preserved by a prompt instruction.
- Figure/chart/table text (axis labels, legends, table cells, annotations) is
  **kept verbatim** — identified by an LLM classification pass.
- The pipeline degrades gracefully: if the classification call fails, all
  non-math paragraphs are translated (current behavior). Math rules remain in
  force because they are deterministic and require no network.

## Non-Goals

- Hiding or visually badging skipped paragraphs. The agreed behavior is
  **keep original text** — skipped paragraphs render their source text in the
  right pane, just untranslated. (This requires no rendering change: the pane
  already renders whatever `translatedText` it receives.)
- Translating captions *underneath* figures. A caption like "Figure 3: Loss
  curve over epochs." is genuine prose and should still translate; only
  labels *inside* the figure region should be skipped.
- OCR of scanned figures. Out of scope.

## Architecture Decision: Option A

Classification runs **inside** `translateParagraphs`, the existing
orchestration seam. Rationale (see brainstorming analysis):

- **Atomic failure handling.** One `try/catch` around the classification call;
  on failure, translate all non-math paragraphs (graceful degradation to
  current behavior).
- **Atomic retry.** `retryPage()` re-runs one function; classification and
  translation re-execute together.
- **Unified cache.** The write-through cache key is `source → translated`;
  skipped paragraphs cache `source → source`, which is consistent and
  idempotent.
- **Minimal blast radius.** `extractPageText()` stays pure; the rendering pane
  and the React hook are unchanged.
- **Natural test extension.** Existing `pdfTranslation.test.ts` mocks
  `chrome.runtime.sendMessage`; adding a second mocked message type extends
  the same fixture.

Rejected alternatives: **Option B** (separate classification step in the hook)
adds a new intermediate UI state, splits caching decisions, and complicates
retry/failure wiring for no functional gain. **Option C** (classification
inside `extractPageText`) breaks the function's purity guarantee and its
existing synchronous test strategy.

## Design

### New module: `entrypoints/pdf-viewer/lib/pdfContentDetect.ts`

Pure, synchronous, no I/O — fully unit-testable.

```ts
export type ParagraphKind = 'prose' | 'math';

/** A paragraph is "math" if it is dominated by mathematical content. */
export function classifyMathParagraph(text: string): ParagraphKind;
```

**Detection signals** (a paragraph is `'math'` if **any** match):

1. **LaTeX block delimiters.** Contains `\[…]`, `$$…$$`, `\begin{equation}`,
   `\begin{align}`, `\begin{gather}`, or `\[` / `\]` on its own.
2. **Inline LaTeX with heavy content.** Contains `\(…\)` or `$…$` where the
   delimited content has length ≥ 4 *and* the paragraph is otherwise short
   (≤ ~8 words outside the delimiters). This catches standalone inline-formula
   paragraphs without flagging prose that merely cites `$x$`.
3. **High symbol ratio.** After stripping whitespace, the ratio of
   "math-symbol characters" (`+ − ∗ · × ÷ = ≠ ≈ ≤ ≥ < > → ← ↔ ⇒ ⇔ ∈ ∉ ∀ ∃
   ∑ ∏ ∫ ∂ ∇ √ ∞ α-ω Α-Ω ₀-₉ superscripts/subscripts ∈ ¬ ⊥ ⊕` and the
   Greek/Unicode math block) to total non-space characters is **≥ 0.4**,
   *and* the paragraph is short (≤ ~12 words). This catches Unicode-math
   formulas like `f(x) = x² + 2x + 1` that lack LaTeX delimiters.

**Conservative by design.** Mixed paragraphs ("The loss `L(θ) = Σᵢ ℓ` is
minimized") stay `'prose'` and rely on the prompt to preserve the inline
math. The symbol-ratio path requires the paragraph to be short, so a
sentence with one symbol is not flagged.

Tunables (word-count thresholds, ratio floor) are module-level constants so
they can be adjusted without touching detection logic.

### New message: `CLASSIFY_PDF_PARAGRAPHS`

Mirrors the existing `translate` / `DETECT_PAGE_CATEGORY_LLM` plumbing.

```ts
// types/messages.ts
export interface ClassifyPdfParagraphsMessage {
  action: 'CLASSIFY_PDF_PARAGRAPHS';
  paragraphs: Array<{ id: string; text: string }>;
}

export type MessageAction = /* …existing… */ | 'CLASSIFY_PDF_PARAGRAPHS';
export type ExtensionMessage = /* …existing… */ | ClassifyPdfParagraphsMessage;
```

**Response shape:**

```ts
{ success: boolean; labels?: Record<string, 'prose' | 'figure'>; error?: string }
```

- `prose` → translate normally.
- `figure` → keep original verbatim (covers charts, diagrams, tables,
  annotations, axis labels — any non-prose content the LLM recognizes as
  belonging to a figure/table).

Only `prose`/`figure` labels are returned. (Math is already filtered
client-side by `pdfContentDetect.ts` before this call, so it never reaches
the classifier — saves tokens and removes one classification category from
the LLM's job.)

### Service method: `classifyPdfParagraphs()`

Added to `TranslationService` (optional, like `detectPageCategory`):

```ts
classifyPdfParagraphs?(
  paragraphs: Array<{ id: string; text: string }>,
): Promise<{ success: boolean; labels?: Record<string, 'prose' | 'figure'>; error?: string }>;
```

Implemented in `services/openaiCompatible.ts` (and `langflowService.ts` for
parity). Uses:

- `temperature: 0` for deterministic labels.
- `response_format: { type: 'json_object' }`.
- A tight system prompt:
  ```
  You classify paragraphs extracted from a PDF page.
  For each paragraph id, return exactly one label:
  - "prose": normal sentences/paragraphs that should be translated.
  - "figure": chart axis labels, legend entries, table cell text, diagram
    annotations, or any short label/fragment that is part of a figure or
    table and is NOT a full sentence of prose.
  Respond ONLY with JSON: {"labels": {"id1": "prose", "id2": "figure"}}.
  ```

When a paragraph id is missing from the LLM's response, the coordinator
defaults it to `'prose'` (translate) — fail-open, never lose content.

### Coordinator change: `translateParagraphs()`

`entrypoints/pdf-viewer/lib/pdfTranslation.ts`. New internal flow:

```
input: paragraphs[]
  │
  ├─ 1. Rule-split (synchronous, pure):
  │     math   = paragraphs.filter(p => classifyMathParagraph(p.text) === 'math')
  │     rest   = paragraphs.filter(p => classifyMathParagraph(p.text) !== 'math')
  │
  ├─ 2. LLM-classify `rest` → { id: 'prose' | 'figure' }
  │     wrapped in try/catch; on failure → ALL of `rest` treated as 'prose'
  │
  ├─ 3. Translate only the 'prose' subset via existing batched path
  │     (reuse splitIntoBatches + sendTranslationBatch)
  │
  └─ 4. Merge into one result list:
        prose   → { id, translatedText: <llm output> }
        figure  → { id, translatedText: <original source text> }
        math    → { id, translatedText: <original source text> }
```

The merged result has the same shape (`TranslationResultItem[]`) and the
same id set as the input, so **callers (`usePdfPageTranslations.ts`) and
renderers (`PdfTranslationPane.tsx`) require no changes.**

**Cache:** write-through continues to cache every result, including the
`source → source` entries for skipped paragraphs. This is correct and
idempotent.

**Edge case — empty `rest` after math split:** skip the classification call
entirely (no tokens spent). If *all* paragraphs are math, return immediately.

**Edge case — classification returns no labels / partial labels:** any id
absent from the response defaults to `'prose'`. Logged via `console.warn`
(the project's existing pattern, see `parseTranslationResponse`).

### Prompt change: inline-math preservation

`DEFAULT_SYSTEM_PROMPT_TEMPLATE` (`services/base.ts`) gains one rule:

```
- If a paragraph contains mathematical formulas, equations, or notation
  (LaTeX like \(x^2\), Unicode like x², or symbol expressions), translate
  only the surrounding prose and preserve the math/notation EXACTLY as
  written. Do not translate variable names, operators, or symbols.
```

This protects the mixed prose+math paragraphs that pass through the
`'prose'` path. Existing tests that assert on the prompt text must be
updated.

## Data Flow

```
extractPageText(page)           [unchanged, pure]
    │ paragraphs[]
    ▼
translateParagraphs(paragraphs) [modified]
    │
    ├─ pdfContentDetect.classifyMathParagraph()  ── pure, synchronous
    │     splits into math[] / rest[]
    │
    ├─ chrome.runtime.sendMessage(CLASSIFY_PDF_PARAGRAPHS, rest)
    │     └─ background → service.classifyPdfParagraphs() → {id: prose|figure}
    │        (try/catch: failure ⇒ all rest = prose)
    │
    ├─ chrome.runtime.sendMessage(translate, proseSubset)   [existing path]
    │
    └─ merge: prose→translated, figure/math→original
        │
        ▼
TranslationResultItem[]  ── unchanged shape ──▶ PdfTranslationPane (unchanged)
```

## Failure Modes & Handling

| Failure | Behavior |
|---|---|
| Classification network error / timeout | `try/catch` → all `rest` treated as `prose` → translated (current behavior). Logged. |
| Classification returns invalid JSON | Same — treated as failure, fail-open to translate-all. |
| Classification omits some ids | Missing ids default to `'prose'` (translated). Logged via `console.warn`. |
| Translation call itself fails (prose subset) | Bubbles up as `state: 'error'` (existing behavior — page shows Retry button). Math/figure paragraphs are not lost because the merge only happens after translation succeeds. |
| Provider lacks `classifyPdfParagraphs` | Background returns `{success:false}`; coordinator fail-opens to translate-all. |

**Invariant:** a classification failure can never make the page worse than it
is today. Math rules are unaffected by any network failure.

## Testing

- **`pdfContentDetect.test.ts` (new)** — pure unit tests:
  - LaTeX block delimiters (`\[ \sum \]`, `$$x$$`, `\begin{equation}`) → `'math'`.
  - Standalone inline LaTeX (`\(x^2 + y^2\)`, short) → `'math'`.
  - Prose with a single inline symbol ("Use $x$ as the variable.") → `'prose'`.
  - High symbol-ratio short string (`f(x) = x² + 2x + 1`) → `'math'`.
  - Normal sentence ("The model achieves high accuracy.") → `'prose'`.
  - Mixed prose+math ("The loss L(θ) = Σᵢ ℓ is minimized.") → `'prose'` (relies on prompt).
  - Empty string → `'prose'` (safe default; no harm — empty translates to empty).
- **`pdfTranslation.test.ts` (extended)** — add a second mocked `sendMessage`
  branch keyed on `action: 'CLASSIFY_PDF_PARAGRAPHS'`:
  - Math paragraphs are returned with `translatedText === source` and the
    translate message is *not* called for them.
  - Figure-labeled paragraphs are returned with `translatedText === source`.
  - Prose paragraphs are translated via the existing mocked path.
  - When classification mock rejects, all non-math paragraphs are still
    translated (fail-open).
  - Missing labels default to `'prose'`.
- **Existing `pdfTextExtraction.test.ts`** — unchanged (extraction stays pure).
- **Prompt tests** — any test asserting `DEFAULT_SYSTEM_PROMPT_TEMPLATE`
  content is updated for the new inline-math rule.

## Files Touched

| File | Change |
|---|---|
| `entrypoints/pdf-viewer/lib/pdfContentDetect.ts` | **New.** Pure math-classification module. |
| `entrypoints/pdf-viewer/lib/pdfTranslation.ts` | Rule-split + classify + merge in `translateParagraphs()`. |
| `types/messages.ts` | Add `CLASSIFY_PDF_PARAGRAPHS` action + message type. |
| `services/base.ts` | Optional `classifyPdfParagraphs()` on `TranslationService`; add inline-math rule to `DEFAULT_SYSTEM_PROMPT_TEMPLATE`. |
| `services/openaiCompatible.ts` | Implement `classifyPdfParagraphs()`. |
| `services/langflowService.ts` | Implement `classifyPdfParagraphs()` concretely via `sendToLangflow()` (parallel to its existing concrete `detectPageCategory`). |
| `services/background.ts` | Route `CLASSIFY_PDF_PARAGRAPHS` to `service.classifyPdfParagraphs()`, mirroring `handleDetectPageCategoryLLM`. |
| `entrypoints/pdf-viewer/lib/__tests__/pdfContentDetect.test.ts` | **New.** |
| `entrypoints/pdf-viewer/lib/__tests__/pdfTranslation.test.ts` | Extend with classification scenarios. |

**Untouched:** `pdfTextExtraction.ts`, `usePdfPageTranslations.ts`,
`PdfTranslationPane.tsx`, `App.tsx`, all CSS.

## Cost Impact

- One extra LLM call per page (classification), batched over all non-math
  paragraphs on that page. Roughly the size of one translate batch.
- Math-heavy pages (common in research papers) spend *fewer* tokens overall,
  because math paragraphs are removed from both the classification and
  translation payloads.
- Users on rate-limited local LLMs (Ollama) pay one extra round-trip per
  page; acceptable given the accuracy benefit the user explicitly requested.
