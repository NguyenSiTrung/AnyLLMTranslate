/**
 * Browser speechSynthesis controller for selection bubble Speak.
 */

export class SpeakController {
  private speaking = false;

  isSpeaking(): boolean {
    return this.speaking;
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
      this.speaking = false;
    };
    utt.onerror = () => {
      this.speaking = false;
    };
    this.speaking = true;
    speechSynthesis.speak(utt);
  }

  stop(): void {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
    }
    this.speaking = false;
  }
}
