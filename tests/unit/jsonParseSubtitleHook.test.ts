import { describe, it, expect, vi, afterEach } from 'vitest';
import { installJsonParseSubtitleHook } from '@/inject/jsonParseSubtitleHook';
import { NetflixHandler } from '@/inject/subtitleHandlers/netflix';

describe('installJsonParseSubtitleHook', () => {
  const originalParse = JSON.parse;

  afterEach(() => {
    JSON.parse = originalParse;
  });

  it('emits SUBTITLE_TRACKS_DISCOVERED when Netflix JSON is parsed', () => {
    const send = vi.fn();
    installJsonParseSubtitleHook([new NetflixHandler()], { send });

    JSON.parse(
      JSON.stringify({
        result: {
          movieId: '1',
          timedtexttracks: [{ bcp47: 'en', displayName: 'English' }],
        },
      }),
    );

    expect(send).toHaveBeenCalledWith(
      'SUBTITLE_TRACKS_DISCOVERED',
      expect.objectContaining({
        platform: 'netflix',
        tracks: expect.arrayContaining([expect.objectContaining({ language: 'en', platform: 'netflix' })]),
      }),
    );
  });
});
