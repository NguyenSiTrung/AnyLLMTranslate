/**
 * MSE SourceBuffer Interceptor — Monkey-patches MediaSource.prototype.addSourceBuffer
 * and SourceBuffer.prototype.appendBuffer to catch subtitle segments fed to
 * MSE-based players (Netflix-style obfuscated/DRM-token streams).
 *
 * Runs in the MAIN world where MediaSource is accessible.
 * Detects WebVTT content in appendBuffer calls on text/vtt or application/mp4
 * SourceBuffers and emits SUBTITLE_MSE_CUES progressively.
 *
 * Idempotent patching + BFCache-safe teardown matching FetchInterceptor/XhrInterceptor:
 * - capture originals in instance fields
 * - restore only when identity-equal to own patch
 * - disable() on pagehide, re-enable() on pageshow with event.persisted
 */

import type { MessageBridgeSender } from '@/inject/messageBridge';
import type { SubtitleMseCuesPayload } from '@/types/subtitle';
import { parseWebVTT } from '@/lib/subtitleParser';

/** MIME types that may carry subtitle data */
const SUBTITLE_MIME_TYPES = ['text/vtt', 'application/mp4'];

export class MseInterceptor {
  private enabled = false;
  /** Reference to patched methods for identity-equal restore */
  private patchedAddSourceBuffer: typeof MediaSource.prototype.addSourceBuffer | null = null;
  private patchedAppendBuffer: typeof SourceBuffer.prototype.appendBuffer | null = null;
  /** Original methods captured at enable() time */
  private originalAddSourceBuffer: typeof MediaSource.prototype.addSourceBuffer | null = null;
  private originalAppendBuffer: typeof SourceBuffer.prototype.appendBuffer | null = null;
  /** Tagged SourceBuffers created with subtitle MIME types */
  private taggedBuffers: WeakSet<SourceBuffer> = new WeakSet();

  constructor(private bridge: MessageBridgeSender) {}

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    // Capture originals
    this.originalAddSourceBuffer = MediaSource.prototype.addSourceBuffer;
    this.originalAppendBuffer = SourceBuffer.prototype.appendBuffer;

    // Patch addSourceBuffer — tag buffers created with subtitle MIME types
    const patchedAddSourceBuffer = function (this: MediaSource, type: string): SourceBuffer {
      const origAdd = self.originalAddSourceBuffer;
      if (!origAdd) throw new Error('MSE interceptor not enabled');
      const buffer = origAdd.call(this, type);

      // Tag subtitle buffers
      const lowerType = type.toLowerCase().split(';')[0].trim();
      if (SUBTITLE_MIME_TYPES.includes(lowerType)) {
        self.taggedBuffers.add(buffer);
      }

      return buffer;
    };

    // Patch appendBuffer — detect and parse WebVTT content in tagged buffers
    const patchedAppendBuffer = function (this: SourceBuffer, data: BufferSource | ArrayBuffer): void {
      // Only process tagged (subtitle) buffers
      if (self.taggedBuffers.has(this)) {
        try {
          // Convert buffer data to string
          const bytes = data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : new Uint8Array(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength);

          // Decode as text — WebVTT is always text
          const text = new TextDecoder('utf-8').decode(bytes);

          // Check if this looks like WebVTT
          if (text.startsWith('WEBVTT') || text.includes('WEBVTT')) {
            const cues = parseWebVTT(text);
            if (cues.length > 0) {
              self.bridge.send('SUBTITLE_MSE_CUES', {
                cues,
                platform: 'mse',
                language: '',
              } as SubtitleMseCuesPayload);

              console.log('AnyLLMTranslate: MSE interceptor detected WebVTT cues', {
                count: cues.length,
              });
            }
          }
          // IMSC1 / TTML-in-MP4 content is binary — detected but not deep-parsed (deferred)
        } catch {
          // Binary data or decode error — silently skip
        }
      }

      // Always call through to the original — never block playback
      const origAppend = self.originalAppendBuffer;
      if (!origAppend) throw new Error('MSE interceptor not enabled');
      return origAppend.call(this, data as BufferSource);
    };

    this.patchedAddSourceBuffer = patchedAddSourceBuffer;
    this.patchedAppendBuffer = patchedAppendBuffer;
    MediaSource.prototype.addSourceBuffer = patchedAddSourceBuffer;
    SourceBuffer.prototype.appendBuffer = patchedAppendBuffer;
  }

  disable(): void {
    if (!this.enabled) return;

    // Only restore if our patch is still the active method
    if (this.patchedAddSourceBuffer && MediaSource.prototype.addSourceBuffer === this.patchedAddSourceBuffer) {
      if (this.originalAddSourceBuffer) MediaSource.prototype.addSourceBuffer = this.originalAddSourceBuffer;
    }
    if (this.patchedAppendBuffer && SourceBuffer.prototype.appendBuffer === this.patchedAppendBuffer) {
      if (this.originalAppendBuffer) SourceBuffer.prototype.appendBuffer = this.originalAppendBuffer;
    }

    this.patchedAddSourceBuffer = null;
    this.patchedAppendBuffer = null;
    this.originalAddSourceBuffer = null;
    this.originalAppendBuffer = null;
    this.enabled = false;
  }
}
