/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { buildSentenceContent } from '@/content/selectionBubble/contentSentence';

describe('buildSentenceContent', () => {
  it('shows translation with collapsed original by default and the original when expanded', () => {
    // Collapsed by default: translation visible, original hidden until toggled
    const onToggle = vi.fn();
    const el = buildSentenceContent({
      translatedText: 'Xin chào',
      originalText: 'Hello',
      originalExpanded: false,
      onToggleOriginal: onToggle,
    });
    expect(el.querySelector('[data-anyllm-role="selection-translation"]')?.textContent).toBe(
      'Xin chào',
    );
    expect(el.querySelector('[data-anyllm-role="selection-original"]')).toBeNull();
    const toggle = el.querySelector(
      '[data-anyllm-role="selection-original-toggle"]',
    ) as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    expect(onToggle).toHaveBeenCalledOnce();

    // Expanded: original shown
    const expanded = buildSentenceContent({
      translatedText: 'Xin chào',
      originalText: 'Hello',
      originalExpanded: true,
      onToggleOriginal: () => {},
    });
    expect(expanded.querySelector('[data-anyllm-role="selection-original"]')?.textContent).toBe(
      'Hello',
    );
  });
});
