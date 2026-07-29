/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { buildFooterActions, setStatusLine } from '@/content/selectionBubble/actions';

const baseHandlers = () => ({
  onCopy: vi.fn(),
  onRetry: vi.fn(),
  onSpeakOriginal: vi.fn(),
  onSpeakTranslation: vi.fn(),
  onGlossary: vi.fn(),
});

describe('buildFooterActions', () => {
  it('renders five action buttons including dual speak', () => {
    const handlers = baseHandlers();
    const el = buildFooterActions({ handlers });
    expect(el.querySelectorAll('[data-anyllm-role="selection-action"]')).toHaveLength(5);
    expect(el.querySelector('[data-action="speak-original"]')).toBeTruthy();
    expect(el.querySelector('[data-action="speak-translation"]')).toBeTruthy();
    expect(
      el.querySelector('[data-action="speak-original"]')?.getAttribute('aria-label'),
    ).toBe('Speak original');
    expect(
      el.querySelector('[data-action="speak-translation"]')?.getAttribute('aria-label'),
    ).toBe('Speak translation');
    (el.querySelector('[data-action="copy"]') as HTMLButtonElement).click();
    expect(handlers.onCopy).toHaveBeenCalledOnce();
    (el.querySelector('[data-action="speak-original"]') as HTMLButtonElement).click();
    expect(handlers.onSpeakOriginal).toHaveBeenCalledOnce();
    (el.querySelector('[data-action="speak-translation"]') as HTMLButtonElement).click();
    expect(handlers.onSpeakTranslation).toHaveBeenCalledOnce();
  });

  it('shows stop labels when speaking', () => {
    const el = buildFooterActions({ handlers: baseHandlers(), speaking: true });
    expect(
      el.querySelector('[data-action="speak-original"]')?.getAttribute('aria-label'),
    ).toBe('Stop');
    expect(
      el.querySelector('[data-action="speak-translation"]')?.getAttribute('aria-label'),
    ).toBe('Stop');
  });

  it('shows status line', () => {
    const el = buildFooterActions({
      handlers: {
        onCopy: () => {},
        onRetry: () => {},
        onSpeakOriginal: () => {},
        onSpeakTranslation: () => {},
        onGlossary: () => {},
      },
    });
    setStatusLine(el, 'Added to glossary', 'success');
    expect(el.querySelector('[data-anyllm-role="selection-status"]')?.textContent).toBe(
      'Added to glossary',
    );
  });
});
