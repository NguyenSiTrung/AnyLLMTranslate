/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpeakController } from '@/content/selectionBubble/speak';

describe('SpeakController', () => {
  let speakMock: ReturnType<typeof vi.fn>;
  let cancelMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    speakMock = vi.fn();
    cancelMock = vi.fn();
    vi.stubGlobal('speechSynthesis', {
      speak: speakMock,
      cancel: cancelMock,
      speaking: false,
    });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        text: string;
        lang = '';
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('speaks text with lang', () => {
    const c = new SpeakController();
    c.speak('hello', 'en');
    expect(speakMock).toHaveBeenCalledOnce();
    const utt = speakMock.mock.calls[0][0];
    expect(utt.text).toBe('hello');
    expect(utt.lang).toBe('en');
  });

  it('stop cancels synthesis', () => {
    const c = new SpeakController();
    c.speak('hello', 'en');
    c.stop();
    expect(cancelMock).toHaveBeenCalled();
    expect(c.isSpeaking()).toBe(false);
  });
});
