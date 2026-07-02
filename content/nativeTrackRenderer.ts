/**
 * Native HTML5 TextTrack subtitle renderer.
 *
 * Creates synthetic subtitle tracks on the <video> and adds VTTCue objects;
 * the browser handles active-cue timing, positioning, and fullscreen. This
 * replaces the custom overlay's timeupdate/findActiveCue/updateDisplayedText
 * loop (spec decision D2: two tracks for bilingual display).
 *
 * Two tracks both `mode: 'showing'` are stacked by the browser:
 *   - 'AnyLLM-Original'    — the source-language line (styled dimmer via ::cue)
 *   - 'AnyLLM-Translation' — the translated line (styled brighter)
 * In translation-only mode only the translation track is created.
 */
import type { SubtitleCue } from '@/types/subtitle';
import type { SubtitleRenderer, SubtitleDisplayConfig } from '@/content/subtitleRenderer';

const ORIGINAL_LABEL = 'AnyLLM-Original';
const TRANSLATION_LABEL = 'AnyLLM-Translation';

export class NativeTrackRenderer implements SubtitleRenderer {
  private originalTrack: TextTrack | null = null;
  private translationTrack: TextTrack | null = null;
  private seenKeys = new Set<string>();
  private displayMode: SubtitleDisplayConfig['displayMode'] = 'bilingual';

  async initialize(
    cues: SubtitleCue[],
    config: SubtitleDisplayConfig,
    _video: HTMLVideoElement,
  ): Promise<void> {
    this.displayMode = config.displayMode ?? 'bilingual';
    // If re-initialized, clear any prior state first.
    this.destroyInternal();
    this.createTracks(_video);
    this.seenKeys.clear();
    this.addCues(cues);
  }

  private createTracks(video: HTMLVideoElement): void {
    // Probe 3 guard: never destroy Max's own tracks — synthetic tracks use
    // distinct labels so the player's tracks (if any) are untouched.
    if (this.displayMode === 'bilingual') {
      this.originalTrack = video.addTextTrack('subtitles', ORIGINAL_LABEL);
      this.originalTrack.mode = 'showing';
    }
    this.translationTrack = video.addTextTrack('subtitles', TRANSLATION_LABEL);
    this.translationTrack.mode = 'showing';
  }

  private addCues(cues: SubtitleCue[]): void {
    for (const cue of cues) {
      const key = this.keyFor(cue);
      if (this.seenKeys.has(key)) continue;
      this.seenKeys.add(key);

      if (this.originalTrack) {
        const text = cue.originalText ?? cue.text;
        this.originalTrack.addCue(new VTTCue(cue.startTime, cue.endTime, text));
      }
      this.translationTrack?.addCue(
        new VTTCue(cue.startTime, cue.endTime, cue.text),
      );
    }
  }

  updateCues(cues: SubtitleCue[]): void {
    // Delta-only: stable cues already added are skipped by the seenKeys check.
    // Changed cues (same timing, different text) are added as new cues; the
    // browser surfaces the latest matching cue for a given time range.
    this.addCues(cues);
  }

  destroy(): void {
    this.destroyInternal();
    this.seenKeys.clear();
  }

  private destroyInternal(): void {
    this.clearTrack(this.originalTrack);
    this.clearTrack(this.translationTrack);
    if (this.originalTrack) this.originalTrack.mode = 'disabled';
    if (this.translationTrack) this.translationTrack.mode = 'disabled';
    this.originalTrack = null;
    this.translationTrack = null;
  }

  private clearTrack(track: TextTrack | null): void {
    if (!track || !track.cues) return;
    // Remove from the end to keep indices stable during iteration.
    for (let i = track.cues.length - 1; i >= 0; i--) {
      track.removeCue(track.cues[i]);
    }
  }

  private keyFor(cue: SubtitleCue): string {
    return `${cue.startTime}|${cue.endTime}|${cue.text}`;
  }
}
