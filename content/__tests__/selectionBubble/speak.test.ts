/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn(),
}));

import { loadSettings } from '@/lib/config';
import { SpeakController } from '@/content/selectionBubble/speak';

function makeVoice(lang: string, name = `Voice ${lang}`): SpeechSynthesisVoice {
  return {
    lang,
    name,
    localService: true,
    default: false,
    voiceURI: name,
  } as SpeechSynthesisVoice;
}

describe('SpeakController', () => {
  let speakMock: ReturnType<typeof vi.fn>;
  let cancelMock: ReturnType<typeof vi.fn>;
  let getVoicesMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    speakMock = vi.fn();
    cancelMock = vi.fn();
    getVoicesMock = vi.fn(() => [makeVoice('en-US'), makeVoice('vi-VN')]);
    vi.stubGlobal('speechSynthesis', {
      speak: speakMock,
      cancel: cancelMock,
      speaking: false,
      getVoices: getVoicesMock,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        text: string;
        lang = '';
        rate = 1;
        voice: SpeechSynthesisVoice | null = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      },
    );
    vi.mocked(loadSettings).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('speaks text with matched voice for lang', async () => {
    const c = new SpeakController();
    await c.speak('hello', 'en');
    expect(speakMock).toHaveBeenCalledOnce();
    const utt = speakMock.mock.calls[0][0];
    expect(utt.text).toBe('hello');
    expect(utt.lang).toBe('en-US');
    expect(utt.voice?.lang).toBe('en-US');
  });

  it('stop cancels synthesis', async () => {
    const c = new SpeakController();
    await c.speak('hello', 'en');
    c.stop();
    expect(cancelMock).toHaveBeenCalled();
    expect(c.isSpeaking()).toBe(false);
  });

  it('speakSmart uses browser when no provider credentials', async () => {
    vi.mocked(loadSettings).mockResolvedValue({
      tts: {
        enabled: true,
        preferredBackend: 'auto',
        model: 'tts-1',
        voice: 'alloy',
        rate: 1.1,
      },
      providers: [],
      provider: {
        preset: 'custom',
        baseUrl: '',
        apiKey: '',
        model: '',
        temperature: 0.3,
        maxTokens: 4096,
        displayName: 'Custom',
        connectionStatus: 'unknown',
        requiresApiKey: true,
      },
    } as never);

    const c = new SpeakController();
    const result = await c.speakSmart('hello', 'vi');
    expect(result).toEqual({ backend: 'browser' });
    expect(speakMock).toHaveBeenCalledOnce();
    const utt = speakMock.mock.calls[0][0];
    expect(utt.rate).toBe(1.1);
    expect(utt.lang).toBe('vi-VN');
    expect(utt.voice?.lang).toBe('vi-VN');
  });

  it('speakSmart throws when disabled', async () => {
    vi.mocked(loadSettings).mockResolvedValue({
      tts: {
        enabled: false,
        preferredBackend: 'auto',
        model: 'tts-1',
        voice: 'alloy',
        rate: 1,
      },
      providers: [],
      provider: { baseUrl: '', apiKey: '', requiresApiKey: true },
    } as never);

    const c = new SpeakController();
    await expect(c.speakSmart('hello')).rejects.toThrow(/disabled/i);
  });
});
