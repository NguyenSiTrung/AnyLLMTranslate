/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  showLoading,
  setPinned,
  isPinned,
  shouldDismissOnOutsideClick,
  removeDialog,
  applySentence,
} from '@/content/selectionBubble/shell';

const handlers = {
  onCopy: () => {},
  onRetry: () => {},
  onSpeakOriginal: () => {},
  onSpeakTranslation: () => {},
  onGlossary: () => {},
  onPin: () => setPinned(!isPinned()),
  onClose: () => removeDialog(),
};

describe('shell pin', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    removeDialog();
  });
  afterEach(() => {
    removeDialog();
  });

  it('dismisses on outside click when unpinned but not when pinned', () => {
    showLoading({
      anchor: { left: 100, top: 100, width: 40, height: 20 },
      originalText: 'hi',
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      handlers,
    });
    expect(shouldDismissOnOutsideClick()).toBe(true);

    setPinned(true);
    expect(shouldDismissOnOutsideClick()).toBe(false);
    expect(isPinned()).toBe(true);
  });

  it('applySentence fills body with translation', () => {
    showLoading({
      anchor: { left: 100, top: 100, width: 40, height: 20 },
      originalText: 'Hello',
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      handlers,
    });
    applySentence({ translatedText: 'Xin chào', originalText: 'Hello' });
    expect(
      document.querySelector('[data-anyllm-role="selection-translation"]')?.textContent,
    ).toBe('Xin chào');
  });
});
