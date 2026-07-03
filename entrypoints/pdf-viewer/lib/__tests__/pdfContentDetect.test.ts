/**
 * Tests for pure math-paragraph classification and the prose short-circuit
 * heuristic.
 *
 * The classifiers are synchronous and pure — no PDF.js, no network. We assert
 * on the kind label directly.
 *
 * The classification-cache tests mock idb-keyval and crypto.subtle so they run
 * in the jsdom environment without a real IndexedDB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyMathParagraph, isObviouslyProse } from '../pdfContentDetect';

// ── idb-keyval mock (for classification cache tests) ────────────────────────
const classifyStore = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => 'mock-store'),
  get: vi.fn(async (key: string) => classifyStore.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    classifyStore.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    classifyStore.delete(key);
  }),
  keys: vi.fn(async () => Array.from(classifyStore.keys())),
  entries: vi.fn(async () => Array.from(classifyStore.entries())),
  clear: vi.fn(async () => {
    classifyStore.clear();
  }),
}));

// ── crypto mock (needed for generateCacheKey → classifyCacheKey) ─────────────
vi.stubGlobal('crypto', {
  subtle: {
    digest: vi.fn(async (_algo: string, data: ArrayBuffer) => {
      // Deterministic mock: xor each byte with 0x42
      const arr = new Uint8Array(32);
      const view = new Uint8Array(data instanceof ArrayBuffer ? data : (data as Uint8Array).buffer);
      for (let i = 0; i < view.length && i < 32; i++) {
        arr[i] = view[i] ^ 0x42;
      }
      return arr.buffer;
    }),
  },
});

// ── STORAGE_KEYS stub ────────────────────────────────────────────────────────
vi.mock('@/lib/constants', () => ({
  STORAGE_KEYS: {
    CACHE_DB: 'anyllm-cache-db',
    CACHE_STORE: 'anyllm-translations',
  },
}));

import {
  classifyCacheKey,
  getCachedClassification,
  cacheClassification,
  generateCacheKey,
} from '@/services/cacheManager';

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

  describe('Unicode math (markers without LaTeX delimiters)', () => {
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

// ── isObviouslyProse tests ───────────────────────────────────────────────────

describe('pdfContentDetect.isObviouslyProse', () => {
  describe('obviously-prose paragraphs', () => {
    it('returns true for long latin-heavy prose', () => {
      const prose =
        'The quick brown fox jumps over the lazy dog. This is a long enough ' +
        'sentence to pass the length threshold and it contains enough words ' +
        'for the word count check as well, making it obviously prose.';
      expect(isObviouslyProse(prose)).toBe(true);
    });

    it('returns true for a typical academic abstract paragraph', () => {
      const abstract =
        'In this paper we present a novel approach to neural machine ' +
        'translation that leverages large language models for improved ' +
        'fluency and accuracy across diverse language pairs.';
      expect(isObviouslyProse(abstract)).toBe(true);
    });
  });

  describe('short text (figure labels)', () => {
    it('returns false for short text (< 80 chars)', () => {
      expect(isObviouslyProse('Figure 1: Results overview')).toBe(false);
    });

    it('returns false for a medium-length caption under 80 chars', () => {
      expect(isObviouslyProse('Table 3: Comparison of accuracy scores across models.')).toBe(false);
    });
  });

  describe('word count < 15', () => {
    it('returns false for text with >= 80 chars but < 15 words', () => {
      // 14 words, > 80 chars
      const text =
        'These fourteen words are intentionally made long enough to pass the threshold easily today.';
      expect(text.split(/\s+/).length).toBe(14);
      expect(text.length).toBeGreaterThanOrEqual(80);
      expect(isObviouslyProse(text)).toBe(false);
    });
  });

  describe('high symbol density', () => {
    it('returns false for text with >= 10% math symbols (no strong markers)', () => {
      // Uses ∘ (U+2218, RING OPERATOR) which is in the Unicode Mathematical
      // Operators range but NOT in STRONG_MATH_MARKERS, so it passes the
      // safety guard but triggers the symbol-density check.
      const text =
        'This is a long enough text with many words to pass the count check ' +
        'easily and we add ∘∘∘∘∘∘∘∘∘∘∘∘∘∘∘∘∘∘ symbols to test density high.';
      expect(isObviouslyProse(text)).toBe(false);
    });
  });

  describe('non-latin text (low latin ratio)', () => {
    it('returns false for text dominated by CJK characters', () => {
      // Long enough and has enough "words" (split by whitespace), but the
      // latin ratio is far below 80%.
      const text =
        '这是一段足够长的中文文本 用于测试拉丁字符比例的检查 ' +
        '它包含足够多的字符来通过长度阈值 但是大部分字符不是拉丁字母 ' +
        '所以应该返回 false 而不是 true 这是确定的。';
      expect(isObviouslyProse(text)).toBe(false);
    });
  });

  describe('never returns true for math that classifyMathParagraph flags', () => {
    // Verify the safety guarantee: for every text where classifyMathParagraph
    // returns 'math', isObviouslyProse must return false.
    const mathExamples: Array<{ label: string; text: string }> = [
      { label: '\\[ ... \\] block', text: '\\[ \\sum_{i=1}^{n} x_i \\]' },
      { label: '$$ ... $$ block', text: '$$x^2 + y^2 = r^2$$' },
      { label: '\\begin{equation}', text: '\\begin{equation} E = mc^2 \\end{equation}' },
      { label: '\\begin{align}', text: '\\begin{align} a &= b \\\\ c &= d \\end{align}' },
      { label: 'standalone inline LaTeX', text: '\\(x^2 + y^2 + z^2\\)' },
      { label: 'short Unicode math (=)', text: 'f(x) = x² + 2x + 1' },
      { label: 'short Greek math', text: 'α + β = γ' },
      { label: 'short Unicode sum', text: 'L(θ) = Σᵢ ℓ(yᵢ, ŷᵢ)' },
    ];

    for (const { label, text } of mathExamples) {
      it(`returns false for: ${label}`, () => {
        expect(classifyMathParagraph(text)).toBe('math');
        expect(isObviouslyProse(text)).toBe(false);
      });
    }

    it('returns false for long text containing block-level LaTeX', () => {
      // Long enough to pass length/word checks, but contains \begin{equation}
      const text =
        'Consider the identity \\begin{equation} E = mc^2 \\end{equation} ' +
        'which relates energy and mass, and this sentence is long enough to ' +
        'pass both the character and word count thresholds for the heuristic.';
      expect(classifyMathParagraph(text)).toBe('math');
      expect(isObviouslyProse(text)).toBe(false);
    });

    it('returns false for long text with strong math markers (=, Greek)', () => {
      // Contains = and Greek letters — hasStrongMathMarker catches it.
      // classifyMathParagraph returns 'prose' here (> 12 words), but
      // isObviouslyProse is conservative and also returns false.
      const text =
        'The loss function L(θ) = Σᵢ ℓ(yᵢ, ŷᵢ) is minimized by gradient ' +
        'descent over many epochs of training to achieve convergence.';
      expect(isObviouslyProse(text)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns false for empty string', () => {
      expect(isObviouslyProse('')).toBe(false);
    });

    it('returns false for whitespace-only string', () => {
      expect(isObviouslyProse('   \n  ')).toBe(false);
    });
  });
});

// ── Classification cache tests ───────────────────────────────────────────────

describe('classification cache', () => {
  beforeEach(() => {
    classifyStore.clear();
    vi.clearAllMocks();
  });

  describe('getCachedClassification', () => {
    it('returns null on miss', async () => {
      const key = await classifyCacheKey('missing text', 'en', 'vi');
      expect(await getCachedClassification(key)).toBeNull();
    });
  });

  describe('round-trip', () => {
    it('caches and retrieves a prose classification', async () => {
      const key = await classifyCacheKey('some paragraph text', 'en', 'vi');
      await cacheClassification(key, 'prose');
      expect(await getCachedClassification(key)).toBe('prose');
    });

    it('caches and retrieves a figure classification', async () => {
      const key = await classifyCacheKey('figure caption text', 'en', 'vi');
      await cacheClassification(key, 'figure');
      expect(await getCachedClassification(key)).toBe('figure');
    });

    it('caches and retrieves a math classification', async () => {
      const key = await classifyCacheKey('math formula text', 'en', 'vi');
      await cacheClassification(key, 'math');
      expect(await getCachedClassification(key)).toBe('math');
    });
  });

  describe('isolation from translation cache via classify: prefix', () => {
    it('produces a classify:-prefixed key', async () => {
      const key = await classifyCacheKey('shared text', 'en', 'vi');
      expect(key.startsWith('classify:')).toBe(true);
    });

    it('classify key differs from the translation key for the same text', async () => {
      const baseKey = await generateCacheKey('shared text', 'en', 'vi');
      const cKey = await classifyCacheKey('shared text', 'en', 'vi');
      expect(cKey).toBe(`classify:${baseKey}`);
      expect(cKey).not.toBe(baseKey);
    });

    it('a translation entry at the base key does not leak into classification', async () => {
      const baseKey = await generateCacheKey('shared text', 'en', 'vi');
      const cKey = await classifyCacheKey('shared text', 'en', 'vi');

      // Simulate a translation entry stored at the non-prefixed key.
      classifyStore.set(baseKey, 'translated text');

      // Classification miss — different key, no interference.
      expect(await getCachedClassification(cKey)).toBeNull();

      // Store a classification and verify the translation is untouched.
      await cacheClassification(cKey, 'math');
      expect(await getCachedClassification(cKey)).toBe('math');
      expect(classifyStore.get(baseKey)).toBe('translated text');
    });
  });
});
