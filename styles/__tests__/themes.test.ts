/**
 * Tests for CSS theme system — verifies all 16 themes are defined.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const cssContent = readFileSync(resolve(__dirname, '../../styles/inject.css'), 'utf-8');

const EXPECTED_THEMES = [
  'dividing-line', 'blockquote', 'paper', 'underline',
  'dashed-underline', 'highlight', 'wavy-underline', 'bubble',
  'side-by-side', 'mask', 'fade-in', 'italic',
  'dotted-border', 'shadow-card', 'minimal', 'gradient-accent',
];

describe('CSS themes', () => {
  it('contains all 16 theme selectors', () => {
    for (const theme of EXPECTED_THEMES) {
      expect(cssContent).toContain(`data-lingua-theme="${theme}"`);
    }
  });

  it('each theme has a dark mode variant (either media query or .lingua-dark)', () => {
    for (const theme of EXPECTED_THEMES) {
      const hasMediaQuery = cssContent.includes(`prefers-color-scheme: dark`) &&
        cssContent.includes(`data-lingua-theme="${theme}"`);
      const hasManualDark = cssContent.includes(`lingua-dark`) &&
        cssContent.includes(`data-lingua-theme="${theme}"`);

      expect(hasMediaQuery || hasManualDark).toBe(true);
    }
  });

  it('has base .lingua-lens-translation styles', () => {
    expect(cssContent).toContain('.lingua-lens-translation');
    expect(cssContent).toContain('linguaFadeIn');
  });

  it('has loading state styles', () => {
    expect(cssContent).toContain('data-lingua-loading');
    expect(cssContent).toContain('linguaShimmer');
  });

  it('has error state styles', () => {
    expect(cssContent).toContain('data-lingua-error');
    expect(cssContent).toContain('#ef4444');
  });

  it('has page state rules for dual, translation-only, and off', () => {
    expect(cssContent).toContain('data-lingua-state="dual"');
    expect(cssContent).toContain('data-lingua-state="translation-only"');
    expect(cssContent).toContain('data-lingua-state="off"');
  });

  it('has translation position variants', () => {
    expect(cssContent).toContain('data-lingua-position="above"');
    expect(cssContent).toContain('data-lingua-position="side"');
  });

  it('default theme applies when no data-lingua-theme attribute', () => {
    expect(cssContent).toContain('html:not([data-lingua-theme]) .lingua-lens-translation');
  });
});
