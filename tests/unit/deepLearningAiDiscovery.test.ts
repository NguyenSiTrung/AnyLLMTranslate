// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MessageBridgeSender } from '@/inject/messageBridge';
import { startDeepLearningAiMetadataDiscovery } from '@/inject/deepLearningAi';

const ENG_VTT =
  'https://video.deeplearning.ai/upv2/agentic-ai/lc-intro/subtitle/eng/1784-eng-4e9f8df.vtt';
const JPN_VTT =
  'https://video.deeplearning.ai/upv2/agentic-ai/lc-intro/subtitle/jpn/lc-intro-jpn.vtt';

function nextDataFixture(): Record<string, unknown> {
  return {
    props: {
      pageProps: {
        trpcState: {
          json: {
            queries: [
              {
                queryKey: [['course', 'getLessonVideo'], { input: { videoId: 10172096 }, type: 'query' }],
                state: {
                  data: {
                    video: {
                      videoId: 10172096,
                      subtitle: JSON.stringify({
                        'en-us': { URI: ENG_VTT, NAME: 'ENGLISH' },
                        'ja-jp': { URI: JPN_VTT, NAME: 'JAPANESE' },
                      }),
                      tracks: [
                        { kind: 'subtitles', label: 'ENGLISH', src: ENG_VTT, srcLang: 'en-us' },
                        { kind: 'subtitles', label: 'JAPANESE', src: JPN_VTT, srcLang: 'ja-jp' },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      },
    },
  };
}

describe('startDeepLearningAiMetadataDiscovery', () => {
  let bridge: { send: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    bridge = { send: vi.fn(() => 'req-1') };
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('emits SUBTITLE_TRACKS_DISCOVERED from embedded __NEXT_DATA__, immediately or when it appears mid-retry, deduplicated exactly once', () => {
    document.body.innerHTML = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
      nextDataFixture(),
    )}</script>`;

    let cleanup = startDeepLearningAiMetadataDiscovery(bridge as unknown as MessageBridgeSender);
    try {
      expect(bridge.send).toHaveBeenCalledWith(
        'SUBTITLE_TRACKS_DISCOVERED',
        expect.objectContaining({
          platform: 'deeplearningai',
          videoId: '10172096',
          tracks: expect.arrayContaining([
            expect.objectContaining({ language: 'en-us', url: ENG_VTT }),
            expect.objectContaining({ language: 'ja-jp', url: JPN_VTT }),
          ]),
        }),
      );
      // Emitted exactly once (deduplicated by key).
      const calls = bridge.send.mock.calls.filter(([type]) => type === 'SUBTITLE_TRACKS_DISCOVERED');
      expect(calls).toHaveLength(1);
      // Discovery finished — no pending retry timer.
      vi.advanceTimersByTime(60_000);
      expect(bridge.send).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }

    // Restart with no payload, then inject it during the retry window.
    document.body.innerHTML = '';
    bridge.send.mockClear();
    cleanup = startDeepLearningAiMetadataDiscovery(bridge as unknown as MessageBridgeSender);
    try {
      expect(bridge.send).not.toHaveBeenCalled();
      document.body.innerHTML = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
        nextDataFixture(),
      )}</script>`;
      vi.advanceTimersByTime(300);
      expect(bridge.send).toHaveBeenCalledWith(
        'SUBTITLE_TRACKS_DISCOVERED',
        expect.objectContaining({ platform: 'deeplearningai', videoId: '10172096' }),
      );
    } finally {
      cleanup();
    }
  });

  it('stays silent and exhausts the retry budget when __NEXT_DATA__ is absent or carries no lesson video data', () => {
    const run = (payload?: string): void => {
      if (payload) document.body.innerHTML = payload;
      const cleanup = startDeepLearningAiMetadataDiscovery(bridge as unknown as MessageBridgeSender);
      try {
        expect(bridge.send).not.toHaveBeenCalled();
        // 100 retries × 100ms — exhaust the discovery budget.
        vi.advanceTimersByTime(120_000);
        expect(bridge.send).not.toHaveBeenCalled();
      } finally {
        cleanup();
      }
      document.body.innerHTML = '';
      bridge.send.mockClear();
    };

    run();
    run(`<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"trpcState":{"json":{"queries":[]}}}}}</script>`);
  });

  it('cleanup stops pending retries', () => {
    const cleanup = startDeepLearningAiMetadataDiscovery(bridge as unknown as MessageBridgeSender);
    vi.advanceTimersByTime(250);
    cleanup();
    // Inject the payload after teardown — nothing should ever be emitted.
    document.body.innerHTML = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
      nextDataFixture(),
    )}</script>`;
    vi.advanceTimersByTime(120_000);
    expect(bridge.send).not.toHaveBeenCalled();
  });
});
