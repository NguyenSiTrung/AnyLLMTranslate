/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { buildFooterActions, setStatusLine } from '@/content/selectionBubble/actions';

describe('buildFooterActions', () => {
  it('renders four action buttons and wires click', () => {
    const handlers = {
      onCopy: vi.fn(),
      onRetry: vi.fn(),
      onSpeak: vi.fn(),
      onGlossary: vi.fn(),
    };
    const el = buildFooterActions({ handlers });
    expect(el.querySelectorAll('[data-anyllm-role="selection-action"]')).toHaveLength(4);
    (el.querySelector('[data-action="copy"]') as HTMLButtonElement).click();
    expect(handlers.onCopy).toHaveBeenCalledOnce();
  });

  it('shows status line', () => {
    const el = buildFooterActions({
      handlers: {
        onCopy: () => {},
        onRetry: () => {},
        onSpeak: () => {},
        onGlossary: () => {},
      },
    });
    setStatusLine(el, 'Added to glossary', 'success');
    expect(el.querySelector('[data-anyllm-role="selection-status"]')?.textContent).toBe(
      'Added to glossary',
    );
  });
});
