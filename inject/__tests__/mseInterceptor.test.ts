import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock MediaSource / SourceBuffer (not available in jsdom) ───────────────

function MockSourceBuffer(this: unknown) {
  // No-op constructor
}
(MockSourceBuffer as unknown as { prototype: { appendBuffer: (data: BufferSource | ArrayBuffer) => void } }).prototype.appendBuffer = function (_data: BufferSource | ArrayBuffer): void {
  // no-op mock
};

function MockMediaSource(this: unknown) {
  // No-op constructor
}
(MockMediaSource as unknown as { prototype: { addSourceBuffer: (type: string) => SourceBuffer } }).prototype.addSourceBuffer = function (_type: string): SourceBuffer {
  return new (MockSourceBuffer as unknown as { new (): SourceBuffer })();
};

// Install globals before module import
const globalObj = globalThis as Record<string, unknown>;
globalObj.MediaSource = MockMediaSource as unknown as typeof MediaSource;
globalObj.SourceBuffer = MockSourceBuffer as unknown as typeof SourceBuffer;

// Mock bridge sender
const mockSend = vi.fn();
const mockBridge = { send: mockSend };

vi.mock('@/inject/messageBridge', () => ({
  createBridgeSender: () => mockBridge,
}));

import { MseInterceptor } from '@/inject/mseInterceptor';

describe('MseInterceptor', () => {
  let interceptor: InstanceType<typeof MseInterceptor>;
  let originalAddSourceBuffer: typeof MediaSource.prototype.addSourceBuffer;
  let originalAppendBuffer: typeof SourceBuffer.prototype.appendBuffer;

  beforeEach(() => {
    mockSend.mockClear();

    // Capture current prototypes (may be patched from previous test)
    originalAddSourceBuffer = MediaSource.prototype.addSourceBuffer;
    originalAppendBuffer = SourceBuffer.prototype.appendBuffer;

    interceptor = new MseInterceptor(mockBridge);
  });

  afterEach(() => {
    interceptor.disable();
    // Restore to the mock baseline
    MediaSource.prototype.addSourceBuffer = originalAddSourceBuffer;
    SourceBuffer.prototype.appendBuffer = originalAppendBuffer;
  });

  it('patches addSourceBuffer on enable', () => {
    interceptor.enable();
    expect(MediaSource.prototype.addSourceBuffer).not.toBe(originalAddSourceBuffer);
  });

  it('restores addSourceBuffer on disable', () => {
    interceptor.enable();
    interceptor.disable();
    expect(MediaSource.prototype.addSourceBuffer).toBe(originalAddSourceBuffer);
  });

  it('does not double-patch on repeated enable calls', () => {
    interceptor.enable();
    const firstPatch = MediaSource.prototype.addSourceBuffer;
    interceptor.enable();
    expect(MediaSource.prototype.addSourceBuffer).toBe(firstPatch);
  });

  it('emits SUBTITLE_MSE_CUES for text/vtt SourceBuffer with WebVTT content', () => {
    interceptor.enable();
    const ms = new MediaSource();
    const sb = ms.addSourceBuffer('text/vtt');
    const vttSegment = new TextEncoder().encode('WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello world\n');
    (sb as unknown as { appendBuffer: (data: BufferSource | ArrayBuffer) => void }).appendBuffer(vttSegment);

    expect(mockSend).toHaveBeenCalledWith(
      'SUBTITLE_MSE_CUES',
      expect.objectContaining({
        cues: expect.arrayContaining([
          expect.objectContaining({
            startTime: 0,
            endTime: 2,
            text: 'Hello world',
          }),
        ]),
      }),
    );
  });

  it('emits SUBTITLE_MSE_CUES for application/mp4 SourceBuffer with WebVTT content', () => {
    interceptor.enable();
    const ms = new MediaSource();
    const sb = ms.addSourceBuffer('application/mp4');
    const vttSegment = new TextEncoder().encode('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nTest cue\n');
    sb.appendBuffer(vttSegment);

    expect(mockSend).toHaveBeenCalledWith(
      'SUBTITLE_MSE_CUES',
      expect.objectContaining({
        cues: expect.arrayContaining([
          expect.objectContaining({
            text: 'Test cue',
          }),
        ]),
      }),
    );
  });

  it('does not emit cues for video/mp4 SourceBuffers', () => {
    interceptor.enable();
    const ms = new MediaSource();
    const sb = ms.addSourceBuffer('video/mp4');
    const data = new TextEncoder().encode('some video data');
    sb.appendBuffer(data);

    expect(mockSend).not.toHaveBeenCalledWith('SUBTITLE_MSE_CUES', expect.anything());
  });

  it('does not emit cues for audio SourceBuffers', () => {
    interceptor.enable();
    const ms = new MediaSource();
    const sb = ms.addSourceBuffer('audio/mp4');
    const data = new TextEncoder().encode('audio data');
    sb.appendBuffer(data);

    expect(mockSend).not.toHaveBeenCalledWith('SUBTITLE_MSE_CUES', expect.anything());
  });

  it('handles non-WebVTT binary content gracefully (no emit)', () => {
    interceptor.enable();
    const ms = new MediaSource();
    const sb = ms.addSourceBuffer('text/vtt');
    const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    sb.appendBuffer(binaryData);

    expect(mockSend).not.toHaveBeenCalledWith('SUBTITLE_MSE_CUES', expect.anything());
  });

  it('handles ArrayBuffer input to appendBuffer', () => {
    interceptor.enable();
    const ms = new MediaSource();
    const sb = ms.addSourceBuffer('text/vtt');
    const vttSegment = new TextEncoder().encode('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nBuffer test\n');
    sb.appendBuffer(vttSegment.buffer.slice(0, vttSegment.byteLength) as ArrayBuffer);

    expect(mockSend).toHaveBeenCalledWith(
      'SUBTITLE_MSE_CUES',
      expect.objectContaining({
        cues: expect.arrayContaining([
          expect.objectContaining({ text: 'Buffer test' }),
        ]),
      }),
    );
  });

  it('is idempotent — disable then enable works correctly', () => {
    interceptor.enable();
    interceptor.disable();
    interceptor.enable();

    const ms = new MediaSource();
    const sb = ms.addSourceBuffer('text/vtt');
    const vttSegment = new TextEncoder().encode('WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nRe-enabled\n');
    sb.appendBuffer(vttSegment);

    expect(mockSend).toHaveBeenCalledWith(
      'SUBTITLE_MSE_CUES',
      expect.objectContaining({
        cues: expect.arrayContaining([
          expect.objectContaining({ text: 'Re-enabled' }),
        ]),
      }),
    );
  });

  it('restores appendBuffer on disable', () => {
    interceptor.enable();
    interceptor.disable();
    expect(SourceBuffer.prototype.appendBuffer).toBe(originalAppendBuffer);
  });
});
