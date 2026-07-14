# PDF Layout: Stronger Math/Table Skip + Explicit Kind

**Date:** 2026-07-14  
**Status:** Approved (user: implement Layout improvements)  
**Scope:** `entrypoints/pdf-viewer/`, `types/messages.ts`

## Problem

In Split + **Layout** mode, tables and math on the translated (right) pane often lose the original visual layout:

1. **Math** extracted as Unicode glyphs is frequently misclassified as prose, then white-masked and replaced with plain text.
2. **Table cells** rely on LLM figure classification with fail-open-to-prose, so many cells are translated and masked.
3. **Skip is inferred** only via `translatedText === original`, with no explicit `kind` for the renderer.

## Goals

1. Stronger **rule-based math** detection for PDF-extracted Unicode formulas.
2. Stronger **rule-based table/figure** skip using spatial row/column clustering (not only LLM).
3. Propagate explicit **`kind: prose | math | figure`** end-to-end; Layout overlay **never** masks or overlays `math`/`figure`.

## Non-Goals

- KaTeX / MathJax re-rendering of formulas.
- Full table structure recovery (rows/cols as HTML).
- Translating figure captions that are genuine prose sentences (still prose).

## Design

### Detection (`pdfContentDetect.ts`)

- Extend `ParagraphKind` / introduce `ContentKind = 'prose' | 'math' | 'figure'`.
- **Math (enhanced):** keep existing LaTeX + short strong-marker rules; add:
  - Mathematical Alphanumeric Symbols (U+1D400–U+1D7FF)
  - Density path for longer pure formulas (word cap raised for density path)
  - ASCII equation helpers (`^` superscripts, multi-`=` fragments) when combined with markers
- **Table-like (new):** `classifyTableLikeParagraphs(paragraphs: PdfParagraph[]): Set<id>`
  - Pure numeric / percent / currency fragments → figure
  - Group by Y into rows; rows with ≥3 short cell-like texts, or ≥2 such multi-cell rows on a page → mark those cells figure
- Keep LLM classification for remaining ambiguous short labels; wire `isObviouslyProse` so long latin prose skips the classify call.

### Pipeline (`translateParagraphs`)

1. Rule math → skip translate, `kind: math`
2. Rule table-like → skip translate, `kind: figure`
3. Obviously-prose → translate, no classify
4. Rest → LLM classify (figure → skip; prose → translate); fail-open → prose
5. Every result includes `kind`

### Data

- `TranslationResultItem.kind?: 'prose' | 'math' | 'figure'`
- `PageTranslations.paragraphKinds?: Map<string, ContentKind>`
- Progress store serializes kinds; memory-cache path falls back to text equality + re-running pure rules when kinds absent

### Renderer (`LayoutOverlay`)

Skip mask + box when `paragraphKinds.get(id)` is `math` or `figure` (primary).  
Fallback: `translated === original` for older cached pages without kinds.

### Download PDF generator

Same skip rule: prefer explicit kind, then verbatim text.
