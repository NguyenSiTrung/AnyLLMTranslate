/**
 * Selection bubble Speak controller — browser speechSynthesis + optional
 * provider TTS (via background SYNTHESIZE_SPEECH). Keys never enter the page.
 */

import { loadSettings } from '@/lib/config';
import {
  hasProviderTtsCredentials,
  mergeTtsSettings,
  resolveTtsBackend,
  clampRate,
} from '@/lib/tts/resolveTtsBackend';
import {
  applyUtteranceVoice,
  ensureSpeechVoicesReady,
  normalizeSpeechLang,
  pickBrowserVoice,
} from '@/lib/tts/pickBrowserVoice';
import type { SynthesizeSpeechResult } from '@/types/messages';

export type SpeakResult =
  | { backend: 'browser' }
  | { backend: 'provider' }
  | { backend: 'browser'; fallbackFromProvider: true; providerError: string }
  | {
      backend: 'browser';
      preferredOverProvider: true;
      reason: 'matched-browser-voice';
    };

export class SpeakController {
  private speaking = false;
  private onSpeakingChange: ((speaking: boolean) => void) | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;

  /** Optional UI hook when speak starts/stops. */
  setOnSpeakingChange(cb: ((speaking: boolean) => void) | null): void {
    this.onSpeakingChange = cb;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  private setSpeaking(next: boolean): void {
    this.speaking = next;
    this.onSpeakingChange?.(next);
  }

  /** Browser-only speak (tests + legacy). Prefer {@link speakSmart}. */
  async speak(text: string, lang?: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    await this.speakBrowser(trimmed, lang, 1);
  }

  /**
   * Resolve backend from settings: provider TTS when configured, else browser.
   * Provider failure fails open to browser.
   */
  async speakSmart(text: string, lang?: string): Promise<SpeakResult> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error('Nothing to speak');
    }

    this.stop();

    const settings = await loadSettings();
    const tts = mergeTtsSettings(settings.tts);
    const providerAvailable = hasProviderTtsCredentials(settings);
    const backend = resolveTtsBackend(tts, providerAvailable);

    if (backend === 'disabled') {
      throw new Error('Speech is disabled in Settings → Advanced');
    }

    // Provider TTS (OpenAI/Mistral) uses a single configured voice and does not
    // switch language by BCP-47. When the caller passes a concrete lang and the
    // browser has a matching installed voice, prefer browser so Speak original
    // vs Speak translation can use different languages.
    if (backend === 'provider') {
      const speechLang = normalizeSpeechLang(lang);
      if (speechLang) {
        const voices = await ensureSpeechVoicesReady();
        const matched = pickBrowserVoice(voices, speechLang);
        if (matched) {
          await this.speakBrowser(trimmed, speechLang, clampRate(tts.rate));
          return {
            backend: 'browser',
            preferredOverProvider: true,
            reason: 'matched-browser-voice',
          };
        }
      }

      try {
        await this.speakProvider(trimmed, lang);
        return { backend: 'provider' };
      } catch (e) {
        const providerError =
          e instanceof Error ? e.message : 'Provider TTS failed';
        try {
          await this.speakBrowser(trimmed, lang, clampRate(tts.rate));
          return {
            backend: 'browser',
            fallbackFromProvider: true,
            providerError,
          };
        } catch {
          throw new Error(providerError);
        }
      }
    }

    await this.speakBrowser(trimmed, lang, clampRate(tts.rate));
    return { backend: 'browser' };
  }

  private async speakBrowser(
    text: string,
    lang?: string,
    rate = 1,
  ): Promise<void> {
    if (
      typeof speechSynthesis === 'undefined' ||
      typeof SpeechSynthesisUtterance === 'undefined'
    ) {
      throw new Error('Speech not supported in this browser');
    }

    const voices = await ensureSpeechVoicesReady();
    const utt = new SpeechSynthesisUtterance(text);
    applyUtteranceVoice(utt, lang, voices);
    utt.rate = rate;
    utt.onend = () => {
      this.setSpeaking(false);
    };
    utt.onerror = () => {
      this.setSpeaking(false);
    };
    this.setSpeaking(true);
    speechSynthesis.speak(utt);
  }

  private async speakProvider(text: string, lang?: string): Promise<void> {
    const response = (await chrome.runtime.sendMessage({
      action: 'SYNTHESIZE_SPEECH',
      text,
      lang,
    })) as SynthesizeSpeechResult | undefined;

    if (!response?.success || !response.audioBase64) {
      throw new Error(response?.error ?? 'TTS provider failed');
    }

    const mime = response.mimeType || 'audio/mpeg';
    const binary = atob(response.audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime });
    this.objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(this.objectUrl);
    this.audioEl = audio;

    await new Promise<void>((resolve, reject) => {
      audio.onended = () => {
        this.cleanupAudio();
        this.setSpeaking(false);
        resolve();
      };
      audio.onerror = () => {
        this.cleanupAudio();
        this.setSpeaking(false);
        reject(new Error('Audio playback failed'));
      };
      this.setSpeaking(true);
      void audio.play().catch((err: unknown) => {
        this.cleanupAudio();
        this.setSpeaking(false);
        reject(err instanceof Error ? err : new Error('Audio play blocked'));
      });
    });
  }

  private cleanupAudio(): void {
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.src = '';
      this.audioEl = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  stop(): void {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
    }
    this.cleanupAudio();
    this.setSpeaking(false);
  }
}
