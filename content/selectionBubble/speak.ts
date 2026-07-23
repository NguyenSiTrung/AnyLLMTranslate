/**
 * Browser speechSynthesis controller for selection bubble Speak.
 */

export class SpeakController {
  private speaking = false;
  private onSpeakingChange: ((speaking: boolean) => void) | null = null;

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

  speak(text: string, lang?: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (
      typeof speechSynthesis === 'undefined' ||
      typeof SpeechSynthesisUtterance === 'undefined'
    ) {
      throw new Error('Speech not supported in this browser');
    }
    this.stop();
    const utt = new SpeechSynthesisUtterance(trimmed);
    if (lang) utt.lang = lang;
    utt.onend = () => {
      this.setSpeaking(false);
    };
    utt.onerror = () => {
      this.setSpeaking(false);
    };
    this.setSpeaking(true);
    speechSynthesis.speak(utt);
  }

  stop(): void {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
    }
    this.setSpeaking(false);
  }
}
