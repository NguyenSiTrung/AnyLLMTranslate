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
      expect(cssContent).toContain(`data-anyllm-theme="${theme}"`);
    }
  });

  it('each theme has a dark mode variant (either media query or .anyllm-dark)', () => {
    for (const theme of EXPECTED_THEMES) {
      const hasMediaQuery = cssContent.includes(`prefers-color-scheme: dark`) &&
        cssContent.includes(`data-anyllm-theme="${theme}"`);
      const hasManualDark = cssContent.includes(`anyllm-dark`) &&
        cssContent.includes(`data-anyllm-theme="${theme}"`);

      expect(hasMediaQuery || hasManualDark).toBe(true);
    }
  });

  it('has base .anyllm-translate-translation styles', () => {
    expect(cssContent).toContain('.anyllm-translate-translation');
    expect(cssContent).toContain('anyllmFadeIn');
  });

  it('has loading state styles', () => {
    expect(cssContent).toContain('anyllm-translate-loading');
    expect(cssContent).toContain('anyllmSpinnerRotate');
  });

  it('has error state styles', () => {
    expect(cssContent).toContain('data-anyllm-error');
    expect(cssContent).toContain('#ef4444');
  });

  it('has page state rules for dual, translation-only, and off', () => {
    expect(cssContent).toContain('data-anyllm-state="dual"');
    expect(cssContent).toContain('data-anyllm-state="translation-only"');
    expect(cssContent).toContain('data-anyllm-state="off"');
  });

  it('has translation position variants', () => {
    expect(cssContent).toContain('data-anyllm-position="above"');
    expect(cssContent).toContain('data-anyllm-position="side"');
  });

  it('default theme applies when no data-anyllm-theme attribute', () => {
    expect(cssContent).toContain('html:not([data-anyllm-theme]) .anyllm-translate-translation');
  });
});
