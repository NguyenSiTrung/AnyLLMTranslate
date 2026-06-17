/**
 * Tests for pure math-paragraph classification.
 *
 * The classifier is synchronous and pure — no PDF.js, no network. We assert
 * on the kind label directly.
 */

import { describe, it, expect } from 'vitest';
import { classifyMathParagraph, isMathLine } from '../pdfContentDetect';

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

describe('pdfContentDetect.isMathLine', () => {
  it('identifies LaTeX block equations as math lines', () => {
    expect(isMathLine('\\[ \\sum x_i \\]')).toBe(true);
    expect(isMathLine('$$\\alpha = \\beta$$')).toBe(true);
  });

  it('identifies pure/display Unicode math lines as math lines', () => {
    expect(isMathLine('ptcfg = pc + γ(pc - pu), γ > 1, (1)')).toBe(true);
    expect(isMathLine('f(x) = x^2 + 2x + 1')).toBe(true);
    expect(isMathLine('L(θ) = Σi ℓ(yi, ŷi)')).toBe(true);
    expect(isMathLine('MSEtoken(j) = ||Knative[:, j] - Knative[:, j]||²₂')).toBe(true);
  });

  it('does NOT identify normal prose sentences with inline math as math lines', () => {
    expect(isMathLine('where γ modulates the guidance strength, revealing different attention sparsity.')).toBe(false);
    expect(isMathLine('The loss is minimized using gradient descent.')).toBe(false);
    expect(isMathLine('Section 3.2: Margin Columns as Semantic Anchors')).toBe(false);
  });
});
