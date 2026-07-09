import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function MockSourceBuffer(this: unknown) {
  // no-op
}
(
  MockSourceBuffer as unknown as {
    prototype: { appendBuffer: (data: BufferSource | ArrayBuffer) => void };
  }
).prototype.appendBuffer = function (_data: BufferSource | ArrayBuffer): void {
  // no-op mock
};

function MockMediaSource(this: unknown) {
  // no-op
}
(
  MockMediaSource as unknown as {
    prototype: { addSourceBuffer: (type: string) => SourceBuffer };
  }
).prototype.addSourceBuffer = function (_type: string): SourceBuffer {
  return new (MockSourceBuffer as unknown as { new (): SourceBuffer })();
};

const globalObj = globalThis as Record<string, unknown>;
globalObj.MediaSource = MockMediaSource as unknown as typeof MediaSource;
globalObj.SourceBuffer = MockSourceBuffer as unknown as typeof SourceBuffer;

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
    originalAddSourceBuffer = MediaSource.prototype.addSourceBuffer;
    originalAppendBuffer = SourceBuffer.prototype.appendBuffer;
    interceptor = new MseInterceptor(mockBridge);
  });

  afterEach(() => {
    interceptor.disable();
    MediaSource.prototype.addSourceBuffer = originalAddSourceBuffer;
    SourceBuffer.prototype.appendBuffer = originalAppendBuffer;
  });

  it('patches on enable, restores on disable, and does not double-patch', () => {
    interceptor.enable();
    expect(MediaSource.prototype.addSourceBuffer).not.toBe(originalAddSourceBuffer);
    const firstPatch = MediaSource.prototype.addSourceBuffer;
    interceptor.enable();
    expect(MediaSource.prototype.addSourceBuffer).toBe(firstPatch);
    interceptor.disable();
    expect(MediaSource.prototype.addSourceBuffer).toBe(originalAddSourceBuffer);
    expect(SourceBuffer.prototype.appendBuffer).toBe(originalAppendBuffer);
  });

  it('emits SUBTITLE_MSE_CUES for WebVTT text/vtt buffers (including ArrayBuffer)', () => {
    interceptor.enable();
    const ms = new MediaSource();
    const sb = ms.addSourceBuffer('text/vtt');
    const vttSegment = new TextEncoder().encode(
      'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello world\n',
    );
    (sb as unknown as { appendBuffer: (data: BufferSource | ArrayBuffer) => void }).appendBuffer(
      vttSegment,
    );
    expect(mockSend).toHaveBeenCalledWith(
      'SUBTITLE_MSE_CUES',
      expect.objectContaining({
        cues: expect.arrayContaining([
          expect.objectContaining({ startTime: 0, endTime: 2, text: 'Hello world' }),
        ]),
      }),
    );

    mockSend.mockClear();
    const buf = new TextEncoder().encode(
      'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nBuffer test\n',
    );
    sb.appendBuffer(buf.buffer.slice(0, buf.byteLength) as ArrayBuffer);
    expect(mockSend).toHaveBeenCalledWith(
      'SUBTITLE_MSE_CUES',
      expect.objectContaining({
        cues: expect.arrayContaining([expect.objectContaining({ text: 'Buffer test' })]),
      }),
    );
  });

  it('does not emit for video buffers or non-WebVTT binary; re-enable works', () => {
    interceptor.enable();
    const ms = new MediaSource();
    const videoSb = ms.addSourceBuffer('video/mp4');
    videoSb.appendBuffer(new TextEncoder().encode('video'));
    expect(mockSend).not.toHaveBeenCalledWith('SUBTITLE_MSE_CUES', expect.anything());

    const vttSb = ms.addSourceBuffer('text/vtt');
    vttSb.appendBuffer(new Uint8Array([0x00, 0x01, 0x02, 0x03]));
    expect(mockSend).not.toHaveBeenCalledWith('SUBTITLE_MSE_CUES', expect.anything());

    interceptor.disable();
    interceptor.enable();
    const ms2 = new MediaSource();
    const sb2 = ms2.addSourceBuffer('text/vtt');
    sb2.appendBuffer(
      new TextEncoder().encode('WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nRe-enabled\n'),
    );
    expect(mockSend).toHaveBeenCalledWith(
      'SUBTITLE_MSE_CUES',
      expect.objectContaining({
        cues: expect.arrayContaining([expect.objectContaining({ text: 'Re-enabled' })]),
      }),
    );
  });
});
