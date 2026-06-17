# PDF Translation: Skip Math & Figure/Table Content — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the PDF translation right pane from translating pure-math paragraphs and figure/chart/table text — these are kept verbatim (source text shown in place of translation).

**Architecture:** Option A (from the design spec). Classification runs *inside* the existing `translateParagraphs()` orchestrator. Math is detected by a new pure, synchronous module (`pdfContentDetect.ts`). Figure/table text is detected by a new batched LLM classification call (`CLASSIFY_PDF_PARAGRAPHS` message) that returns per-paragraph `prose`/`figure` labels. The merged result has the same shape as today, so the React hook and rendering pane are untouched. Classification failure degrades gracefully to translating all non-math paragraphs.

**Tech Stack:** TypeScript, React 19, pdfjs-dist, WXT (Manifest V3), Vitest + jsdom. The existing test mocks `chrome.runtime.sendMessage` — this plan extends that pattern.

**Spec:** `docs/superpowers/specs/2026-06-17-pdf-skip-math-figures-design.md`

**Reference patterns:**
- LLM classification call mirrors `services/openaiCompatible.ts:113` (`detectPageCategory`) and `services/langflowService.ts:180`.
- Background routing mirrors `services/background.ts:686-699` (`handleDetectPageCategoryLLM`).
- Coordinator batch+cache structure mirrors `entrypoints/pdf-viewer/lib/pdfTranslation.ts:101-127`.

---

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `entrypoints/pdf-viewer/lib/pdfContentDetect.ts` | Pure, synchronous math-paragraph classification (`'prose'` / `'math'`). No I/O. | **Create** |
| `entrypoints/pdf-viewer/lib/__tests__/pdfContentDetect.test.ts` | Unit tests for the math classifier. | **Create** |
| `entrypoints/pdf-viewer/lib/pdfTranslation.ts` | Rule-split + LLM-classify + merge inside `translateParagraphs()`. | **Modify** |
| `entrypoints/pdf-viewer/lib/__tests__/pdfTranslation.test.ts` | Extend with classification scenarios (second mocked `sendMessage` branch). | **Modify** |
| `types/messages.ts` | Add `CLASSIFY_PDF_PARAGRAPHS` action + message type + union members. | **Modify** |
| `services/base.ts` | Add optional `classifyPdfParagraphs()` to `TranslationService`; add inline-math rule to `DEFAULT_SYSTEM_PROMPT_TEMPLATE`. | **Modify** |
| `services/__tests__/base.test.ts` | Update assertions for the new prompt rule (existing tests assert on template content). | **Modify** |
| `services/openaiCompatible.ts` | Implement `classifyPdfParagraphs()`. | **Modify** |
| `services/langflowService.ts` | Implement `classifyPdfParagraphs()` via `sendToLangflow()`. | **Modify** |
| `services/background.ts` | Route `CLASSIFY_PDF_PARAGRAPHS` → `handleClassifyPdfParagraphs()`; import new message type. | **Modify** |

**Untouched (by design):** `pdfTextExtraction.ts`, `usePdfPageTranslations.ts`, `PdfTranslationPane.tsx`, `App.tsx`, all CSS.

**Task ordering rationale:** Build from the leaves inward. Pure module first (no dependencies), then message types, then service implementations, then background wiring, then the coordinator that consumes everything, and finally the prompt rule (kept last because it's the lowest-risk, most-independent change).

---

### Task 1: Pure math-content detection module

**Files:**
- Create: `entrypoints/pdf-viewer/lib/pdfContentDetect.ts`
- Test: `entrypoints/pdf-viewer/lib/__tests__/pdfContentDetect.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `entrypoints/pdf-viewer/lib/__tests__/pdfContentDetect.test.ts`:

```ts
/**
 * Tests for pure math-paragraph classification.
 *
 * The classifier is synchronous and pure — no PDF.js, no network. We assert
 * on the kind label directly.
 */

import { describe, it, expect } from 'vitest';
import { classifyMathParagraph } from '../pdfContentDetect';

describe('pdfContentDetect.classifyMathParagraph', () => {
  describe('LaTeX block delimiters', () => {
    it('flags \\[ ... \\] blocks', () => {
      expect(classifyMathParagraph('\\[ \\sum_{i=1}^{n} x_i \\]')).toBe('math');
    });

    it('flags $$ ... $$ blocks', () => {
      expect(classifyMathParagraph('$$x^2 + y^2 = r^2$$')).toBe('math');
    });

    it('flags \\begin{equation} ... \\end{equation}', () => {
      expect(classifyMathParagraph('\\begin{equation} E = mc^2 \\end{equation}')).toBe('math');
    });

    it('flags \\begin{align} ... \\end{align}', () => {
      expect(classifyMathParagraph('\\begin{align} a &= b \\\\ c &= d \\end{align}')).toBe('math');
    });
  });

  describe('standalone inline LaTeX', () => {
    it('flags short paragraphs that are mostly an inline formula', () => {
      expect(classifyMathParagraph('\\(x^2 + y^2 + z^2\\)')).toBe('math');
    });

    it('does NOT flag prose that merely contains a short inline symbol', () => {
      // A full sentence with one inline symbol — should stay prose and rely
      // on the prompt to preserve the inline math.
      expect(classifyMathParagraph('Use the variable $x$ as the input to the model.')).toBe('prose');
    });
  });

  describe('high symbol-ratio Unicode math', () => {
    it('flags short Unicode-math expressions without LaTeX delimiters', () => {
      expect(classifyMathParagraph('f(x) = x² + 2x + 1')).toBe('math');
      expect(classifyMathParagraph('α + β = γ')).toBe('math');
      expect(classifyMathParagraph('L(θ) = Σᵢ ℓ(yᵢ, ŷᵢ)')).toBe('math');
    });

    it('does NOT flag a normal sentence that happens to contain one symbol', () => {
      expect(classifyMathParagraph('The model achieves high accuracy on the test set.')).toBe('prose');
    });

    it('does NOT flag long math-containing prose (relies on prompt instead)', () => {
      // Mixed prose + math — too long to be a pure formula. Stays prose.
      expect(
        classifyMathParagraph(
          'The loss function L(θ) = Σᵢ ℓ(yᵢ, ŷᵢ) is minimized by gradient descent over many epochs.',
        ),
      ).toBe('prose');
    });
  });

  describe('pure prose', () => {
    it('classifies a normal sentence as prose', () => {
      expect(classifyMathParagraph('This paper presents a novel approach to translation.')).toBe('prose');
    });

    it('classifies empty string as prose (safe default)', () => {
      expect(classifyMathParagraph('')).toBe('prose');
    });

    it('classifies whitespace-only string as prose', () => {
      expect(classifyMathParagraph('   \n  ')).toBe('prose');
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run entrypoints/pdf-viewer/lib/__tests__/pdfContentDetect.test.ts`
Expected: FAIL — "Failed to resolve import `../pdfContentDetect`" (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `entrypoints/pdf-viewer/lib/pdfContentDetect.ts`:

```ts
/**
 * Pure, synchronous content detection for PDF paragraphs.
 *
 * Used by `translateParagraphs()` to decide which paragraphs to skip
 * translation for. Only math detection lives here — figure/table detection
 * is an LLM classification call (see `pdfTranslation.ts`) because it
 * requires understanding the paragraph's role on the page, not just its
 * text.
 *
 * Why pure/synchronous? It is deterministic, free (no API call), trivially
 * unit-testable, and immune to network failure. The math rules are
 * conservative: a paragraph is only flagged `'math'` when it is clearly
 * dominated by mathematical content. Mixed prose-with-inline-math stays
 * `'prose'` and relies on the translation prompt to preserve the inline math.
 */

/** Result of classifying a paragraph's content kind. */
export type ParagraphKind = 'prose' | 'math';

/**
 * Tunable: maximum number of whitespace-separated words a paragraph may have
 * to be eligible for the "short math fragment" paths (inline-only LaTeX,
 * high symbol ratio). Long paragraphs are never classified as pure math here.
 */
const SHORT_MATH_MAX_WORDS = 12;

/**
 * Tunable: for standalone inline LaTeX (`\(…\)` / `$…$`), the paragraph is
 * flagged when the delimited content is at least this many characters AND the
 * text outside the delimiters is ≤ this many words.
 */
const INLINE_LATEX_MIN_INNER_CHARS = 4;
const INLINE_LATEX_MAX_OUTSIDE_WORDS = 8;

/**
 * Tunable: minimum ratio of math-symbol characters to non-space characters
 * for the "high symbol ratio" path to fire. Requires the paragraph to also
 * be short (≤ SHORT_MATH_MAX_WORDS words).
 */
const SYMBOL_RATIO_FLOOR = 0.4;

/**
 * Block-level LaTeX delimiters. A single match flags the paragraph as math
 * regardless of length — these unambiguously denote a display equation.
 */
const LATEX_BLOCK_PATTERNS: RegExp[] = [
  /\\\[[\s\S]*?\\\]/, // \[ ... \]
  /\$\$[\s\S]*?\$\$/, // $$ ... $$
  /\\begin\{(?:equation|align|gather|cases|matrix|bmatrix|pmatrix)\*?\}[\s\S]*?\\end\{\1\*?\}/,
];

/**
 * Standalone inline LaTeX: `\(…\)` or `$…$`. Flagged only when the inner
 * content is substantial AND the surrounding text is short.
 */
const INLINE_LATEX_PATTERN = /\\\(([^)]{4,})\\\)|\$([^$\n]{4,})\$/;

/** Count whitespace-separated words. */
function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Strip inline/block LaTeX delimiters and their inner content, returning the
 * "outside" prose (used to test whether the paragraph is prose-with-a-symbol
 * vs. a standalone formula).
 */
function stripLatexBlocks(text: string): string {
  return text
    .replace(/\\\[[\s\S]*?\\\]/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\\begin\{(?:equation|align|gather|cases|matrix|bmatrix|pmatrix)\*?\}[\s\S]*?\\end\{(?:equation|align|gather|cases|matrix|bmatrix|pmatrix)\*?\}/g, ' ')
    .replace(/\\\([^)]*\\\)/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Math-symbol character set for the symbol-ratio heuristic. Includes common
 * operators, relations, arrows, Greek letters (α-ω, Α-Ω), subscripts/
 * superscripts, and Unicode mathematical symbols.
 */
const MATH_SYMBOLS = new Set(
  (
    '+−-∗·×÷/=≠≈∼≅≤≥<>→←↔⇒⇔∈∉∀∃∑∏∫∂∇√∞αβγδεζηθικλμνξοπρστυφχψω' +
    'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ⊥⊕⊗∝±∓∞⌊⌋⌈⌉∂∅∪∩⊂⊃'
  ).split(''),
);

/**
 * Ratio of math-symbol characters to total non-space characters.
 * Returns 0 for empty input.
 */
function mathSymbolRatio(text: string): number {
  const chars = text.replace(/\s/g, '');
  if (chars.length === 0) return 0;
  let symbolCount = 0;
  for (const ch of chars) {
    if (MATH_SYMBOLS.has(ch)) symbolCount += 1;
    // Unicode subscripts/superscripts (U+2070–U+209F) and the "Mathematical
    // Alphanumeric Symbols" / superscript block count as math.
    const code = ch.codePointAt(0) ?? 0;
    if (
      (code >= 0x2070 && code <= 0x209f) || // superscripts/subscripts
      (code >= 0x00b2 && code <= 0x00b3) || // ² ³
      code === 0x00b9 || // ¹
      ch === '²' || ch === '³' || ch === '¹'
    ) {
      symbolCount += 1;
    }
  }
  return symbolCount / chars.length;
}

/**
 * Classify a paragraph as prose or pure-math.
 *
 * Conservative by design: mixed prose-with-inline-math returns `'prose'` and
 * relies on the translation prompt to preserve the math. Only paragraphs
 * clearly dominated by math (block delimiters, standalone inline formulas,
 * or a high density of math symbols in a short string) are flagged `'math'`.
 */
export function classifyMathParagraph(text: string): ParagraphKind {
  if (text.trim() === '') return 'prose';

  // 1. Block-level LaTeX — always math, regardless of length.
  for (const pattern of LATEX_BLOCK_PATTERNS) {
    if (pattern.test(text)) return 'math';
  }

  // 2. Standalone inline LaTeX — math only if short prose around it.
  const inlineMatch = text.match(INLINE_LATEX_PATTERN);
  if (inlineMatch) {
    const outside = stripLatexBlocks(text);
    if (
      inlineMatch[1]?.length >= INLINE_LATEX_MIN_INNER_CHARS ||
      inlineMatch[2]?.length >= INLINE_LATEX_MIN_INNER_CHARS
    ) {
      if (countWords(outside) <= INLINE_LATEX_MAX_OUTSIDE_WORDS) return 'math';
    }
  }

  // 3. High symbol ratio in a short string — Unicode math without LaTeX.
  if (countWords(text) <= SHORT_MATH_MAX_WORDS && mathSymbolRatio(text) >= SYMBOL_RATIO_FLOOR) {
    return 'math';
  }

  return 'prose';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run entrypoints/pdf-viewer/lib/__tests__/pdfContentDetect.test.ts`
Expected: PASS — all cases green.

If a case fails, adjust the relevant threshold constant at the top of `pdfContentDetect.ts` (NOT the test — the test encodes the intended behavior). Re-run until green.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/pdf-viewer/lib/pdfContentDetect.ts entrypoints/pdf-viewer/lib/__tests__/pdfContentDetect.test.ts
git commit -m "feat(pdf): add pure math-paragraph classifier

Conservative detection of math-dominated paragraphs via LaTeX block
delimiters, standalone inline LaTeX, and high symbol-ratio Unicode math.
Mixed prose-with-inline-math stays 'prose' and relies on the prompt."
```

---

### Task 2: Message type for paragraph classification

**Files:**
- Modify: `types/messages.ts`

- [ ] **Step 1: Add the action to the `MessageAction` union**

In `types/messages.ts`, find the `MessageAction` union (around line 22-44). Add `'CLASSIFY_PDF_PARAGRAPHS'` to the list — add it right after `'DETECT_PAGE_CATEGORY_LLM'` to keep related actions together:

```ts
  | 'DETECT_PAGE_CATEGORY_LLM'
  | 'CLASSIFY_PDF_PARAGRAPHS'
```

- [ ] **Step 2: Add the message interface**

Add this interface immediately after the existing `DetectPageCategoryLlmMessage` interface (which ends around line 160):

```ts
/** A label assigned to a paragraph by the LLM figure/table classifier. */
export type PdfParagraphLabel = 'prose' | 'figure';

/** Classify PDF paragraphs as prose vs figure/table (Content → Background). */
export interface ClassifyPdfParagraphsMessage {
  action: 'CLASSIFY_PDF_PARAGRAPHS';
  paragraphs: Array<{ id: string; text: string }>;
}

/** Response shape for CLASSIFY_PDF_PARAGRAPHS. */
export interface ClassifyPdfParagraphsResult {
  success: boolean;
  labels?: Record<string, PdfParagraphLabel>;
  error?: string;
}
```

- [ ] **Step 3: Add the new message to the `ExtensionMessage` union**

Find the `ExtensionMessage` union (around line 174-196). Add `ClassifyPdfParagraphsMessage` — place it after `DetectPageCategoryLlmMessage`:

```ts
  | DetectPageCategoryLlmMessage
  | ClassifyPdfParagraphsMessage
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS — no type errors. (The new types are not yet referenced anywhere, so this only checks internal consistency.)

- [ ] **Step 5: Commit**

```bash
git add types/messages.ts
git commit -m "feat(types): add CLASSIFY_PDF_PARAGRAPHS message protocol

New message + result types for the per-page LLM figure/table
classification pass that powers PDF math/figure skip."
```

---

### Task 3: Service interface + OpenAI-compatible implementation

**Files:**
- Modify: `services/base.ts`
- Modify: `services/openaiCompatible.ts`

- [ ] **Step 1: Add the method to the `TranslationService` interface**

In `services/base.ts`, find the `TranslationService` interface (lines 11-20). Add the optional `classifyPdfParagraphs` method. Also add the import for the new result type at the top of the file.

Update the import from `@/types/messages` — currently `services/base.ts` imports only from `@/types/translation`, `@/types/config`, and `@/lib/languages`. Add a new import line near the top:

```ts
import type { ClassifyPdfParagraphsResult, PdfParagraphLabel } from '@/types/messages';
```

Then add to the interface (after the optional `detectPageCategory?` method):

```ts
  /** Classify PDF paragraphs as prose vs figure/table content */
  classifyPdfParagraphs?(
    paragraphs: Array<{ id: string; text: string }>,
  ): Promise<ClassifyPdfParagraphsResult>;
```

- [ ] **Step 2: Implement the method in `OpenAICompatibleService`**

In `services/openaiCompatible.ts`, first add the new types to the existing import from `@/types/messages`. Check the current imports — `openaiCompatible.ts` imports `PageContext` from `@/types/config`. Add a new import line after the existing service import (line 13-14 area):

```ts
import type { ClassifyPdfParagraphsResult, PdfParagraphLabel } from '@/types/messages';
```

Then add this method to the `OpenAICompatibleService` class — place it immediately after the existing `detectPageCategory` method (which ends around line 159):

```ts
  async classifyPdfParagraphs(
    paragraphs: Array<{ id: string; text: string }>,
  ): Promise<ClassifyPdfParagraphsResult> {
    if (paragraphs.length === 0) {
      return { success: true, labels: {} };
    }
    try {
      const systemPrompt = `You classify paragraphs extracted from a PDF page.
For each paragraph id, return exactly one label:
- "prose": normal sentences or paragraphs of running text that should be translated.
- "figure": chart axis labels, legend entries, table cell text, diagram annotations, isolated numbers, single-word labels, or any short fragment that is part of a figure, chart, or table and is NOT a full sentence of prose.

Rules:
- When in doubt between prose and figure, prefer "prose" (it is safer to translate than to skip real prose).
- Mathematical formulas will already have been filtered out by the caller — do not return "math".
- Respond ONLY with valid JSON in this format: {"labels": {"id1": "prose", "id2": "figure"}}`;

      const userPrompt = `Classify each of the following paragraphs. Respond with the JSON object only.\n\n${JSON.stringify(
        Object.fromEntries(paragraphs.map((p) => [p.id, p.text])),
        null,
        2,
      )}`;

      const completionRequest: ChatCompletionRequest = {
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      };

      const response = await this.fetchCompletion(completionRequest);
      const responseText = response.choices[0]?.message?.content ?? '';
      if (!responseText.trim()) {
        return { success: false, error: 'Empty response from LLM' };
      }

      let parsed: { labels?: Record<string, string> };
      try {
        parsed = JSON.parse(responseText);
      } catch {
        const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (jsonMatch?.[1]) {
          parsed = JSON.parse(jsonMatch[1]);
        } else {
          return { success: false, error: 'Failed to parse classification response' };
        }
      }

      const rawLabels = parsed.labels ?? {};
      const labels: Record<string, PdfParagraphLabel> = {};
      for (const [id, rawLabel] of Object.entries(rawLabels)) {
        // Normalize: anything that is not explicitly "figure" becomes "prose".
        labels[id] = rawLabel === 'figure' ? 'figure' : 'prose';
      }
      return { success: true, labels };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Classification failed';
      return { success: false, error: message };
    }
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add services/base.ts services/openaiCompatible.ts
git commit -m "feat(services): add classifyPdfParagraphs to translation service

OpenAI-compatible implementation classifies paragraphs as prose vs
figure/table via a temperature-0 JSON call, defaulting unrecognized
labels to 'prose' (fail-open)."
```

---

### Task 4: Langflow service implementation

**Files:**
- Modify: `services/langflowService.ts`

- [ ] **Step 1: Add the import and method**

In `services/langflowService.ts`, add the message types to imports. The file currently imports from `@/types/config` and `@/types/translation`. Add a new import line:

```ts
import type { ClassifyPdfParagraphsResult, PdfParagraphLabel } from '@/types/messages';
```

Then add this method to the `LangflowService` class, immediately after the existing `detectPageCategory` method (which ends around line 215, after its JSON parse + return):

```ts
  async classifyPdfParagraphs(
    paragraphs: Array<{ id: string; text: string }>,
  ): Promise<ClassifyPdfParagraphsResult> {
    if (paragraphs.length === 0) {
      return { success: true, labels: {} };
    }
    try {
      const systemPrompt = `You classify paragraphs extracted from a PDF page.
For each paragraph id, return exactly one label:
- "prose": normal sentences or paragraphs of running text that should be translated.
- "figure": chart axis labels, legend entries, table cell text, diagram annotations, isolated numbers, single-word labels, or any short fragment that is part of a figure, chart, or table and is NOT a full sentence of prose.

Rules:
- When in doubt between prose and figure, prefer "prose" (it is safer to translate than to skip real prose).
- Mathematical formulas will already have been filtered out by the caller — do not return "math".
- Respond ONLY with valid JSON in this format: {"labels": {"id1": "prose", "id2": "figure"}}`;

      const userPrompt = `Classify each of the following paragraphs. Respond with the JSON object only.\n\n${JSON.stringify(
        Object.fromEntries(paragraphs.map((p) => [p.id, p.text])),
        null,
        2,
      )}`;

      const responseText = await this.sendToLangflow(systemPrompt, userPrompt);
      if (!responseText.trim()) {
        return { success: false, error: 'Empty response from Langflow' };
      }

      let parsed: { labels?: Record<string, string> };
      try {
        parsed = JSON.parse(responseText);
      } catch {
        const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (jsonMatch?.[1]) {
          parsed = JSON.parse(jsonMatch[1]);
        } else {
          return { success: false, error: 'Failed to parse classification response' };
        }
      }

      const rawLabels = parsed.labels ?? {};
      const labels: Record<string, PdfParagraphLabel> = {};
      for (const [id, rawLabel] of Object.entries(rawLabels)) {
        labels[id] = rawLabel === 'figure' ? 'figure' : 'prose';
      }
      return { success: true, labels };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Classification failed';
      return { success: false, error: message };
    }
  }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add services/langflowService.ts
git commit -m "feat(services): add classifyPdfParagraphs to Langflow service

Parallel implementation to the OpenAI-compatible one, routed through
sendToLangflow(). Same fail-open normalization of labels."
```

---

### Task 5: Background message routing

**Files:**
- Modify: `services/background.ts`

- [ ] **Step 1: Add the new message type to imports**

In `services/background.ts`, the type import block is at lines 6-13. Add `ClassifyPdfParagraphsMessage` and `ClassifyPdfParagraphsResult`:

```ts
import type {
  ExtensionMessage,
  TranslationResultMessage,
  TranslateSubtitleMessage,
  TranslateSelectionMessage,
  FetchSubtitleMessage,
  DetectPageCategoryLlmMessage,
  ClassifyPdfParagraphsMessage,
  ClassifyPdfParagraphsResult,
} from '@/types/messages';
```

- [ ] **Step 2: Add the handler function**

Add this handler immediately after `handleDetectPageCategoryLLM` (which ends at line 699). It mirrors that function's structure:

```ts
/** Handle CLASSIFY_PDF_PARAGRAPHS message */
async function handleClassifyPdfParagraphs(
  message: ClassifyPdfParagraphsMessage,
): Promise<ClassifyPdfParagraphsResult> {
  try {
    const service = await initService();
    if (!service.classifyPdfParagraphs) {
      return { success: false, error: 'Provider does not support paragraph classification' };
    }
    return await service.classifyPdfParagraphs(message.paragraphs);
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
```

- [ ] **Step 3: Wire the handler into the message router**

In the `handleMessage` switch statement (starting at line 727), find the `case 'DETECT_PAGE_CATEGORY_LLM':` line (around line 794). Add the new case immediately after it:

```ts
    case 'DETECT_PAGE_CATEGORY_LLM':
      return handleDetectPageCategoryLLM(message);
    case 'CLASSIFY_PDF_PARAGRAPHS':
      return handleClassifyPdfParagraphs(message);
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/background.ts
git commit -m "feat(background): route CLASSIFY_PDF_PARAGRAPHS to service

Mirrors the existing DETECT_PAGE_CATEGORY_LLM handler — initializes the
service and delegates, returning fail-open shape on any error."
```

---

### Task 6: Coordinator — classify + skip logic in `translateParagraphs`

This is the central task. It consumes everything built in Tasks 1-5.

**Files:**
- Modify: `entrypoints/pdf-viewer/lib/pdfTranslation.ts`
- Modify: `entrypoints/pdf-viewer/lib/__tests__/pdfTranslation.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `entrypoints/pdf-viewer/lib/__tests__/pdfTranslation.test.ts`. The existing `beforeEach` (lines 29-46) mocks `chrome.runtime.sendMessage` to handle `translate` messages. We need it to *also* handle `CLASSIFY_PDF_PARAGRAPHS` messages.

Replace the existing `vi.mocked(chrome.runtime.sendMessage).mockImplementation(...)` block in `beforeEach` (lines 39-45) with a version that branches on the message action:

```ts
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
    const action = (message as { action: string }).action;
    if (action === 'CLASSIFY_PDF_PARAGRAPHS') {
      // Default: classify everything as prose. Individual tests override this.
      const pieces = (message as { paragraphs: Array<{ id: string }> }).paragraphs;
      return {
        success: true,
        labels: Object.fromEntries(pieces.map(({ id }) => [id, 'prose'])),
      };
    }
    // translate
    const pieces = (message as { pieces: Array<{ id: string }> }).pieces;
    return {
      success: true,
      results: pieces.map(({ id }) => ({ id, translatedText: `translated-${id}` })),
    };
  });
```

Then **add these new test cases** to the existing `describe('pdfTranslation memory cache', ...)` block (anywhere inside it, e.g. after the last existing `it(...)`):

```ts
  it('keeps math paragraphs verbatim and does not send them to the translator', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const action = (message as { action: string }).action;
      if (action === 'CLASSIFY_PDF_PARAGRAPHS') {
        const pieces = (message as { paragraphs: Array<{ id: string }> }).paragraphs;
        return {
          success: true,
          labels: Object.fromEntries(pieces.map(({ id }) => [id, 'prose'])),
        };
      }
      const pieces = (message as { pieces: Array<{ id: string }> }).pieces;
      return {
        success: true,
        results: pieces.map(({ id }) => ({ id, translatedText: `translated-${id}` })),
      };
    });

    const results = await translateParagraphs(
      [
        // Pure math — should be kept verbatim, never sent to translator
        { pageNumber: 1, paragraph: { id: '1-0', text: 'f(x) = x² + 2x + 1', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
        // Prose — should be translated
        { pageNumber: 1, paragraph: { id: '1-1', text: 'This is a normal sentence about the model.', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
      ],
      'https://example.com/a.pdf',
    );

    // Math paragraph: translatedText equals its original source text
    const mathResult = results.find((r) => r.id === '1-0');
    expect(mathResult?.translatedText).toBe('f(x) = x² + 2x + 1');

    // Prose paragraph: translated normally
    const proseResult = results.find((r) => r.id === '1-1');
    expect(proseResult?.translatedText).toBe('translated-1-1');

    // The translator must NOT have received the math paragraph. Inspect every
    // sendMessage call whose action is 'translate' and collect their piece ids.
    const calls = vi.mocked(chrome.runtime.sendMessage).mock.calls;
    const translateCalls = calls.filter(
      ([msg]) => (msg as { action: string }).action === 'translate',
    );
    const translatedIds = translateCalls.flatMap(([msg]) =>
      (msg as { pieces: Array<{ id: string }> }).pieces.map((p) => p.id),
    );
    expect(translatedIds).not.toContain('1-0');
    expect(translatedIds).toContain('1-1');
  });

  it('keeps figure-labeled paragraphs verbatim', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const action = (message as { action: string }).action;
      if (action === 'CLASSIFY_PDF_PARAGRAPHS') {
        // Mark the short label as a figure axis label
        return { success: true, labels: { '1-0': 'figure', '1-1': 'prose' } };
      }
      const pieces = (message as { pieces: Array<{ id: string }> }).pieces;
      return {
        success: true,
        results: pieces.map(({ id }) => ({ id, translatedText: `translated-${id}` })),
      };
    });

    const results = await translateParagraphs(
      [
        { pageNumber: 1, paragraph: { id: '1-0', text: 'Accuracy', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
        { pageNumber: 1, paragraph: { id: '1-1', text: 'The model achieves high accuracy.', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
      ],
      'https://example.com/a.pdf',
    );

    expect(results.find((r) => r.id === '1-0')?.translatedText).toBe('Accuracy');
    expect(results.find((r) => r.id === '1-1')?.translatedText).toBe('translated-1-1');
  });

  it('fail-opens to translating all non-math when classification fails', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const action = (message as { action: string }).action;
      if (action === 'CLASSIFY_PDF_PARAGRAPHS') {
        return { success: false, error: 'network down' };
      }
      const pieces = (message as { pieces: Array<{ id: string }> }).pieces;
      return {
        success: true,
        results: pieces.map(({ id }) => ({ id, translatedText: `translated-${id}` })),
      };
    });

    const results = await translateParagraphs(
      [
        // Math still protected by rules, even though LLM is down
        { pageNumber: 1, paragraph: { id: '1-0', text: 'f(x) = x²', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
        { pageNumber: 1, paragraph: { id: '1-1', text: 'Normal prose sentence here.', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
      ],
      'https://example.com/a.pdf',
    );

    // Math: rule-based protection intact
    expect(results.find((r) => r.id === '1-0')?.translatedText).toBe('f(x) = x²');
    // Prose: translated despite classification failure (fail-open)
    expect(results.find((r) => r.id === '1-1')?.translatedText).toBe('translated-1-1');
  });

  it('defaults to prose when the classifier omits an id', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const action = (message as { action: string }).action;
      if (action === 'CLASSIFY_PDF_PARAGRAPHS') {
        // Classifier returns labels for only one of two paragraphs
        return { success: true, labels: { '1-0': 'prose' } };
      }
      const pieces = (message as { pieces: Array<{ id: string }> }).pieces;
      return {
        success: true,
        results: pieces.map(({ id }) => ({ id, translatedText: `translated-${id}` })),
      };
    });

    const results = await translateParagraphs(
      [
        { pageNumber: 1, paragraph: { id: '1-0', text: 'First paragraph of prose.', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
        { pageNumber: 1, paragraph: { id: '1-1', text: 'Second paragraph of prose.', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
      ],
      'https://example.com/a.pdf',
    );

    // Missing label → defaults to prose → translated
    expect(results.find((r) => r.id === '1-1')?.translatedText).toBe('translated-1-1');
  });

  it('skips the classification call entirely when all paragraphs are math', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const action = (message as { action: string }).action;
      if (action === 'CLASSIFY_PDF_PARAGRAPHS') {
        throw new Error('classification should not have been called');
      }
      const pieces = (message as { pieces: Array<{ id: string }> }).pieces;
      return {
        success: true,
        results: pieces.map(({ id }) => ({ id, translatedText: `translated-${id}` })),
      };
    });

    const results = await translateParagraphs(
      [
        { pageNumber: 1, paragraph: { id: '1-0', text: 'f(x) = x²', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
        { pageNumber: 1, paragraph: { id: '1-1', text: 'α + β = γ', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
      ],
      'https://example.com/a.pdf',
    );

    // Both kept verbatim
    expect(results.find((r) => r.id === '1-0')?.translatedText).toBe('f(x) = x²');
    expect(results.find((r) => r.id === '1-1')?.translatedText).toBe('α + β = γ');

    // No classification call was made
    const classifyCalls = vi.mocked(chrome.runtime.sendMessage).mock.calls.filter(
      ([msg]) => (msg as { action: string }).action === 'CLASSIFY_PDF_PARAGRAPHS',
    );
    expect(classifyCalls).toHaveLength(0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run entrypoints/pdf-viewer/lib/__tests__/pdfTranslation.test.ts`
Expected: FAIL — the new tests fail because `translateParagraphs` does not yet classify. Specifically:
- "keeps math paragraphs verbatim" → the math paragraph gets `translated-1-0` instead of verbatim.
- "keeps figure-labeled paragraphs verbatim" → similar.
- The fail-open and skip-classification tests also fail.

(The pre-existing tests should still pass — they assert the old behavior, which the new code must preserve when everything is classified as prose.)

- [ ] **Step 3: Implement the classify + skip logic**

Open `entrypoints/pdf-viewer/lib/pdfTranslation.ts`. Make three changes:

**3a. Update imports.** The current import block (lines 16-19) imports from `@/types/messages`, `@/lib/config`, `@/services/cacheManager`, and `./pdfTextExtraction`. Add the classifier import and the new message type. Replace the import block with:

```ts
import type { ExtensionMessage, TranslationResultItem, ClassifyPdfParagraphsResult } from '@/types/messages';
import { loadSettings } from '@/lib/config';
import { cacheTranslation } from '@/services/cacheManager';
import type { PdfParagraph } from './pdfTextExtraction';
import { classifyMathParagraph } from './pdfContentDetect';
```

**3b. Add a helper to call the classification endpoint.** Add this immediately before the existing `translateParagraphs` function (which starts at line 101):

```ts
/**
 * Send non-math paragraphs to the background LLM classifier and return the
 * prose/figure labels. Returns null on any failure so the caller can
 * fail-open (treat everything as prose).
 */
async function classifyParagraphs(
  paragraphs: Array<{ id: string; text: string }>,
): Promise<Record<string, 'prose' | 'figure'> | null> {
  if (paragraphs.length === 0) return {};
  const message: ExtensionMessage = {
    action: 'CLASSIFY_PDF_PARAGRAPHS',
    paragraphs,
  };
  try {
    const response = await chrome.runtime.sendMessage(message);
    const result = response as ClassifyPdfParagraphsResult;
    if (!result || !result.success || !result.labels) {
      return null;
    }
    return result.labels;
  } catch {
    return null;
  }
}
```

**3c. Rewrite `translateParagraphs` to split, classify, and merge.** Replace the entire existing `translateParagraphs` function (lines 101-127) with:

```ts
/** Single batched LLM request for one or more pages of the document. */
export async function translateParagraphs(
  paragraphs: Array<{ pageNumber: number; paragraph: PdfParagraph }>,
  pdfUrl: string,
): Promise<TranslationResultItem[]> {
  if (paragraphs.length === 0) return [];

  const settings = await loadSettings();
  const sourceLanguage = settings.sourceLanguage;
  const targetLanguage = settings.targetLanguage;

  // 1. Rule-based math split (deterministic, free, immune to network failure).
  const mathItems: Array<{ pageNumber: number; paragraph: PdfParagraph }> = [];
  const restItems: Array<{ pageNumber: number; paragraph: PdfParagraph }> = [];
  for (const item of paragraphs) {
    if (classifyMathParagraph(item.paragraph.text) === 'math') {
      mathItems.push(item);
    } else {
      restItems.push(item);
    }
  }

  // 2. LLM classification of the remaining paragraphs into prose vs figure.
  //    Failure → null → fail-open: translate everything in `restItems`.
  const labels = await classifyParagraphs(
    restItems.map((item) => ({ id: item.paragraph.id, text: item.paragraph.text })),
  );

  const proseItems = restItems.filter((item) => labels?.[item.paragraph.id] !== 'figure');

  // 3. Translate only the prose subset via the existing batched path.
  const batches = splitIntoBatches(proseItems, settings.maxBatchChars);
  const batchResults = await Promise.all(
    batches.map((batch) => sendTranslationBatch(batch, pdfUrl, sourceLanguage, targetLanguage)),
  );
  const translatedResults = batchResults.flat();

  // 4. Merge: prose → LLM output; figure & math → original source text.
  const results: TranslationResultItem[] = [...translatedResults];
  const sourceById = new Map<string, string>();
  for (const { paragraph } of proseItems) {
    sourceById.set(paragraph.id, paragraph.text);
  }
  for (const { paragraph } of restItems) {
    if (labels?.[paragraph.id] === 'figure') {
      results.push({ id: paragraph.id, translatedText: paragraph.text });
      sourceById.set(paragraph.id, paragraph.text);
    }
  }
  for (const { paragraph } of mathItems) {
    results.push({ id: paragraph.id, translatedText: paragraph.text });
    sourceById.set(paragraph.id, paragraph.text);
  }

  // 5. Write-through cache for every result (including the source→source ones).
  for (const { id, translatedText } of results) {
    const source = sourceById.get(id);
    if (source) {
      await cacheTranslation(source, translatedText, sourceLanguage, targetLanguage);
    }
  }

  return results;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run entrypoints/pdf-viewer/lib/__tests__/pdfTranslation.test.ts`
Expected: PASS — all new tests green AND all pre-existing tests in the file still pass.

If a pre-existing test fails, it is because the new default mock (prose-for-all classification) is not in place — re-check Step 1's `beforeEach` replacement.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/pdf-viewer/lib/pdfTranslation.ts entrypoints/pdf-viewer/lib/__tests__/pdfTranslation.test.ts
git commit -m "feat(pdf): skip math & figure paragraphs in translation

translateParagraphs() now:
1. Rule-splits math paragraphs out (kept verbatim, never sent to LLM).
2. LLM-classifies the rest as prose vs figure (one batched call per batch).
3. Translates only the prose subset via the existing batched path.
4. Merges: prose→translated, figure & math→original source text.

Classification failure fail-opens to translating all non-math paragraphs.
Math protection is network-independent. Result shape is unchanged so the
React hook and rendering pane require no changes."
```

---

### Task 7: Prompt rule for inline-math preservation

**Files:**
- Modify: `services/base.ts`
- Modify: `services/__tests__/base.test.ts`

- [ ] **Step 1: Update the prompt-asserting test**

Open `services/__tests__/base.test.ts`. The tests at lines 15-29 assert that `DEFAULT_SYSTEM_PROMPT_TEMPLATE` contains `{{targetLanguage}}`, `{{glossary}}`, `json`, and `translations`. Those still hold. Add a new assertion inside the existing `describe('DEFAULT_SYSTEM_PROMPT_TEMPLATE', ...)` block, after the last `it(...)` in that block (line 29):

```ts
  it('instructs the model to preserve inline math/notation', () => {
    expect(DEFAULT_SYSTEM_PROMPT_TEMPLATE.toLowerCase()).toContain('mathematical');
    expect(DEFAULT_SYSTEM_PROMPT_TEMPLATE.toLowerCase()).toContain('preserve');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run services/__tests__/base.test.ts`
Expected: FAIL — the new `it` fails because the template does not yet contain "mathematical"/"preserve".

- [ ] **Step 3: Add the rule to the prompt template**

In `services/base.ts`, find `DEFAULT_SYSTEM_PROMPT_TEMPLATE` (lines 23-32). Add a new rule line to the `Rules:` block, immediately after the "Do NOT translate code, URLs…" rule. The current template is:

```ts
export const DEFAULT_SYSTEM_PROMPT_TEMPLATE = `You are a professional translator. Translate the given text to {{targetLanguage}}.

Rules:
- Translate naturally and fluently, preserving the original meaning and tone.
- Preserve ALL HTML tags, attributes, and structure exactly as they are.
- Do NOT translate code, URLs, email addresses, or proper nouns unless appropriate.
- If the text is already in the target language, return it unchanged.
- Respond ONLY with valid JSON in this exact format: {"translations": {"id1": "translated text 1", "id2": "translated text 2"}}
- The keys in "translations" must exactly match the input keys.
{{glossary}}`;
```

Change it to:

```ts
export const DEFAULT_SYSTEM_PROMPT_TEMPLATE = `You are a professional translator. Translate the given text to {{targetLanguage}}.

Rules:
- Translate naturally and fluently, preserving the original meaning and tone.
- Preserve ALL HTML tags, attributes, and structure exactly as they are.
- Do NOT translate code, URLs, email addresses, or proper nouns unless appropriate.
- If the text is already in the target language, return it unchanged.
- If the text contains mathematical formulas, equations, or notation (LaTeX like \\(x^2\\), Unicode like x², or symbol expressions), translate only the surrounding prose and preserve the mathematical content EXACTLY as written. Do NOT translate variable names, operators, or symbols.
- Respond ONLY with valid JSON in this exact format: {"translations": {"id1": "translated text 1", "id2": "translated text 2"}}
- The keys in "translations" must exactly match the input keys.
{{glossary}}`;
```

(Note: the `\\(` and `\\)` are escaped because this is inside a template literal — they render as literal `\(` and `\)` in the actual prompt string.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run services/__tests__/base.test.ts`
Expected: PASS — including the new assertion.

- [ ] **Step 5: Commit**

```bash
git add services/base.ts services/__tests__/base.test.ts
git commit -m "feat(prompt): preserve inline math/notation during translation

Adds a rule to DEFAULT_SYSTEM_PROMPT_TEMPLATE instructing the LLM to
translate only the surrounding prose of inline math and preserve the
notation exactly. Protects mixed prose+math paragraphs that pass through
the prose path."
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`
Expected: PASS — all tests across all files green. Pay particular attention to:
- `entrypoints/pdf-viewer/lib/__tests__/pdfContentDetect.test.ts` (new)
- `entrypoints/pdf-viewer/lib/__tests__/pdfTranslation.test.ts` (extended)
- `services/__tests__/base.test.ts` (extended)
- Any test that mocks `chrome.runtime.sendMessage` elsewhere — verify nothing broke from the message-protocol changes.

- [ ] **Step 2: Run the linter**

Run: `npm run lint`
Expected: PASS — no new errors or warnings. Fix any issues introduced by the new code.

- [ ] **Step 3: Run the type checker**

Run: `npx tsc --noEmit`
Expected: PASS — no type errors.

- [ ] **Step 4: Build the extension**

Run: `npm run build`
Expected: PASS — build completes, producing `.output/chrome-mv3/`. No new warnings about unresolved imports.

- [ ] **Step 5: Manual smoke test (optional but recommended)**

Load the rebuilt extension, open a research-paper PDF via the PDF viewer, and verify on a page with:
- A math equation → the right pane shows the original formula, not a mangled translation.
- A chart with axis labels → the labels are not translated (shown as-is).
- Normal prose → still translates correctly.

If anything is off, the threshold constants at the top of `entrypoints/pdf-viewer/lib/pdfContentDetect.ts` (`SHORT_MATH_MAX_WORDS`, `INLINE_LATEX_MIN_INNER_CHARS`, `INLINE_LATEX_MAX_OUTSIDE_WORDS`, `SYMBOL_RATIO_FLOOR`) are the tuning knobs. Adjust and re-run the unit tests to confirm no regressions.

---

## Self-Review

**1. Spec coverage:**
- Pure-math detection (rules) → Task 1. ✓
- Inline-math prompt preservation → Task 7. ✓
- Figure/table LLM classification → Tasks 2-5 (plumbing) + Task 6 (call site). ✓
- Keep-original behavior for skipped paragraphs → Task 6 (merge step). ✓
- Graceful degradation (classification failure → translate all non-math) → Task 6, `classifyParagraphs` returns null + test "fail-opens". ✓
- Math rules immune to network failure → Task 6 step 1 runs before any network call; test "skips classification call entirely when all paragraphs are math". ✓
- Missing labels default to prose → Task 6 (`labels?.[id] !== 'figure'` treats absent as prose) + test "defaults to prose when the classifier omits an id". ✓
- Write-through cache for skipped paragraphs → Task 6 step 5 caches all results. ✓
- Untouched files (extraction, hook, pane, App, CSS) → confirmed no task modifies them. ✓

**2. Placeholder scan:** No TBD/TODO. Every code step shows the full code. Every test shows full assertions. Commands show exact invocations.

**3. Type consistency:**
- `classifyMathParagraph(text: string): ParagraphKind` where `ParagraphKind = 'prose' | 'math'` — defined Task 1, consumed Task 6. ✓
- `classifyPdfParagraphs(paragraphs): Promise<ClassifyPdfParagraphsResult>` where `ClassifyPdfParagraphsResult = { success; labels?: Record<string, PdfParagraphLabel>; error? }` and `PdfParagraphLabel = 'prose' | 'figure'` — defined Task 2 (types), declared Task 3 (interface), implemented Tasks 3-4, routed Task 5, consumed Task 6. ✓
- `TranslationResultItem` (`{ id; translatedText }`) — unchanged from existing code; Task 6's merge produces this shape. ✓
- `ClassifyPdfParagraphsMessage` (`{ action: 'CLASSIFY_PDF_PARAGRAPHS'; paragraphs: Array<{id; text}> }`) — matches what `classifyParagraphs()` in Task 6 sends and what `handleClassifyPdfParagraphs` in Task 5 receives. ✓

The plan is complete and internally consistent.
