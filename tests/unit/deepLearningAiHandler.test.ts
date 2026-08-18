// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DeepLearningAiHandler,
  DEEP_LEARNING_AI_PLATFORM,
  isDeepLearningAiHost,
  normalizeDeepLearningAiLanguage,
  extractDeepLearningAiLanguageFromUrl,
  extractDeepLearningAiVideoData,
} from '@/inject/subtitleHandlers/deepLearningAi';

const ENG_VTT =
  'https://video.deeplearning.ai/upv2/agentic-ai/lc-ADP-C1-M1-V1-intro/subtitle/eng/1784247348-7a6a3ebe57aa-eng-4e9f8df.vtt';
const JPN_VTT =
  'https://video.deeplearning.ai/upv2/agentic-ai/lc-ADP-C1-M1-V1-intro/subtitle/jpn/lc-ADP-C1-M1-V1-intro-jpn.vtt';
const ENG_M3U8 =
  'https://video.deeplearning.ai/upv2/agentic-ai/lc-ADP-C1-M1-V1-intro/subtitle/eng/1784247348-7a6a3ebe57aa-eng-4e9f8df.m3u8';
const MASTER_M3U8 =
  'https://video.deeplearning.ai/upv2/agentic-ai/lc-ADP-C1-M1-V1-intro/1784247348-7a6a3ebe57aa-master.m3u8?v=1784247538';
const THUMBNAIL_VTT =
  'https://video.deeplearning.ai/upv2/agentic-ai/lc-ADP-C1-M1-V1-intro/thumbnails/thumbnail-1784247593-47bbb5.vtt?v=1784247538';
const CHAPTER_VTT =
  'https://video.deeplearning.ai/upv2/agentic-ai/lc-ADP-C1-M1-V1-intro/chapters/chapter-1784247675-673877.vtt?v=1784247538';

/**
 * Trimmed structural clone of a real learn.deeplearning.ai lesson page's
 * `#__NEXT_DATA__` payload (tRPC dehydrated state), keeping the exact shape
 * of course.getLessonVideo.
 */
function makeNextDataFixture(): Record<string, unknown> {
  return {
    props: {
      pageProps: {
        courseName: 'agentic-ai',
        lessonId: 'pu5xbv',
        lessonName: 'welcome!',
        videoId: 10172096,
        trpcState: {
          json: {
            mutations: [],
            queries: [
              {
                queryKey: [
                  ['course', 'getCourseBySlug'],
                  { input: { courseSlug: 'agentic-ai' }, type: 'query' },
                ],
                state: {
                  data: {
                    courseId: 10074,
                    name: 'Agentic AI',
                    slug: 'agentic-ai',
                    lessons: {
                      pu5xbv: { videoId: 10172096, slug: 'pu5xbv', title: 'Welcome!' },
                      nae3i1: { videoId: 10172100, slug: 'nae3i1', title: 'Next lesson' },
                    },
                  },
                },
              },
              {
                queryKey: [['course', 'getLessonVideo'], { input: { videoId: 10172096 }, type: 'query' }],
                state: {
                  data: {
                    video: {
                      videoId: 10172096,
                      name: '10074-lc-ADP-C1-M1-V1-intro-1784247348',
                      mp4Url: MASTER_M3U8,
                      webmUrl: MASTER_M3U8,
                      subtitle: JSON.stringify({
                        'en-us': { URI: ENG_VTT, NAME: 'ENGLISH' },
                        'ja-jp': { URI: JPN_VTT, NAME: 'JAPANESE' },
                      }),
                      thumbnailVttUrl: THUMBNAIL_VTT,
                      chapterVttUrl: CHAPTER_VTT,
                      tracks: [
                        { kind: 'subtitles', label: 'ENGLISH', src: ENG_VTT, srcLang: 'en-us' },
                        { kind: 'subtitles', label: 'JAPANESE', src: JPN_VTT, srcLang: 'ja-jp' },
                      ],
                      srcSet: [{ src: MASTER_M3U8 }],
                    },
                  },
                },
              },
              {
                queryKey: [
                  ['course', 'getLessonVideoSubtitle'],
                  { input: { videoId: 10172096 }, type: 'query' },
                ],
                state: {
                  data: {
                    captions: [
                      { startInSeconds: 2, endInSeconds: 5, text: 'Welcome to this course on agentic AI.' },
                    ],
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

describe('DeepLearningAiHost', () => {
  it('matches learn.deeplearning.ai and subdomains, rejects lookalikes', () => {
    expect(isDeepLearningAiHost('learn.deeplearning.ai')).toBe(true);
    expect(isDeepLearningAiHost('DEEPLEARNING.AI')).toBe(true);
    expect(isDeepLearningAiHost('video.deeplearning.ai')).toBe(true);
    expect(isDeepLearningAiHost('notdeeplearning.ai')).toBe(false);
    expect(isDeepLearningAiHost('deeplearning.ai.evil.com')).toBe(false);
    expect(isDeepLearningAiHost('youtube.com')).toBe(false);
  });
});

describe('DeepLearningAi language helpers', () => {
  it('normalizes BCP-47 and ISO 639-2 codes', () => {
    expect(normalizeDeepLearningAiLanguage('en-us')).toBe('en-us');
    expect(normalizeDeepLearningAiLanguage('ja-jp')).toBe('ja-jp');
    expect(normalizeDeepLearningAiLanguage('eng')).toBe('en');
    expect(normalizeDeepLearningAiLanguage('JPN')).toBe('ja');
    expect(normalizeDeepLearningAiLanguage('  hi-IN ')).toBe('hi-in');
    expect(normalizeDeepLearningAiLanguage('')).toBe('');
  });

  it('extracts the language from video.deeplearning.ai subtitle URLs', () => {
    expect(extractDeepLearningAiLanguageFromUrl(new URL(ENG_VTT))).toBe('en');
    expect(extractDeepLearningAiLanguageFromUrl(new URL(JPN_VTT))).toBe('ja');
    // Region-qualified path segment
    const regional =
      'https://video.deeplearning.ai/upv2/course-x/lesson-y/subtitle/en-us/abc-eng.vtt';
    expect(extractDeepLearningAiLanguageFromUrl(new URL(regional))).toBe('en-us');
    // Thumbnail/chapter VTTs have no /subtitle/ segment — no language claim.
    expect(extractDeepLearningAiLanguageFromUrl(new URL(THUMBNAIL_VTT))).toBe('');
    expect(extractDeepLearningAiLanguageFromUrl(new URL(CHAPTER_VTT))).toBe('');
  });
});

describe('extractDeepLearningAiVideoData', () => {
  it('finds the lesson video tracks inside the embedded __NEXT_DATA__ shape', () => {
    const result = extractDeepLearningAiVideoData(makeNextDataFixture());
    expect(result).not.toBeNull();
    expect(result?.videoId).toBe('10172096');
    expect(result?.tracks).toHaveLength(2);

    const eng = result?.tracks.find((t) => t.url === ENG_VTT);
    const jpn = result?.tracks.find((t) => t.url === JPN_VTT);
    expect(eng).toMatchObject({
      language: 'en-us',
      label: 'ENGLISH',
      isAutoGenerated: false,
      platform: DEEP_LEARNING_AI_PLATFORM,
      videoId: '10172096',
    });
    expect(jpn).toMatchObject({
      language: 'ja-jp',
      label: 'JAPANESE',
      platform: DEEP_LEARNING_AI_PLATFORM,
      videoId: '10172096',
    });
    // Thumbnail/chapter VTTs must never become tracks.
    expect(result?.tracks.some((t) => t.url === THUMBNAIL_VTT)).toBe(false);
    expect(result?.tracks.some((t) => t.url === CHAPTER_VTT)).toBe(false);
  });

  it('accepts a bare video object and a tRPC-style nested response', () => {
    const video = {
      videoId: 42,
      tracks: [{ kind: 'subtitles', label: 'English', src: ENG_VTT, srcLang: 'en-us' }],
    };
    const bare = extractDeepLearningAiVideoData(video);
    expect(bare?.videoId).toBe('42');
    expect(bare?.tracks).toHaveLength(1);

    const nested = {
      result: { 0: { data: { video } } },
    };
    const fromNested = extractDeepLearningAiVideoData(nested);
    expect(fromNested?.tracks?.[0]).toEqual(bare?.tracks?.[0]);
  });

  it('falls back to the string-encoded subtitle map when tracks[] is absent', () => {
    const result = extractDeepLearningAiVideoData({
      videoId: 7,
      subtitle: JSON.stringify({
        'en-us': { URI: ENG_VTT, NAME: 'ENGLISH' },
      }),
    });
    expect(result?.videoId).toBe('7');
    expect(result?.tracks).toEqual([
      {
        language: 'en-us',
        label: 'ENGLISH',
        url: ENG_VTT,
        isAutoGenerated: false,
        platform: DEEP_LEARNING_AI_PLATFORM,
        videoId: '7',
      },
    ]);
  });

  it('returns null for payloads without subtitle video data', () => {
    expect(extractDeepLearningAiVideoData(null)).toBeNull();
    expect(extractDeepLearningAiVideoData('not json')).toBeNull();
    expect(extractDeepLearningAiVideoData({})).toBeNull();
    // Lessons list has videoIds but no tracks — must not match.
    expect(
      extractDeepLearningAiVideoData({
        lessons: { a: { videoId: 1 }, b: { videoId: 2 } },
      }),
    ).toBeNull();
    // Non-subtitle track kinds are ignored.
    expect(
      extractDeepLearningAiVideoData({
        videoId: 9,
        tracks: [{ kind: 'captions', label: 'X', src: ENG_VTT, srcLang: 'en-us' }],
      }),
    ).toBeNull();
  });
});

describe('DeepLearningAiHandler', () => {
  const originalLocation = window.location;

  function setLocation(hostname: string, pathname: string): void {
    Object.defineProperty(window, 'location', {
      value: { hostname, pathname, href: `https://${hostname}${pathname}` },
      writable: true,
      configurable: true,
    });
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    setLocation('learn.deeplearning.ai', '/courses/agentic-ai/lesson/pu5xbv/welcome!');
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    document.body.innerHTML = '';
  });

  it('detects DLAI hosts and gates watch pages on /lesson', () => {
    const handler = new DeepLearningAiHandler();
    expect(handler.platform).toBe(DEEP_LEARNING_AI_PLATFORM);
    expect(handler.detect()).toBe(true);
    expect(handler.isWatchPage()).toBe(true);

    setLocation('learn.deeplearning.ai', '/courses/agentic-ai');
    expect(handler.isWatchPage()).toBe(false);

    setLocation('youtube.com', '/lesson/x');
    expect(handler.detect()).toBe(false);
  });

  it('intercepts only DLAI CDN subtitle VTTs, never manifests or thumbnails', () => {
    const handler = new DeepLearningAiHandler();
    const patterns = handler.getPatterns();
    expect(patterns).toHaveLength(1);
    const { pattern, languageExtractor } = patterns[0]!;

    expect(pattern.test(ENG_VTT)).toBe(true);
    expect(pattern.test(JPN_VTT)).toBe(true);
    expect(pattern.test(`${ENG_VTT}?sig=abc`)).toBe(true);

    // HLS subtitle playlists + master playlists are manifests, not cue files.
    expect(pattern.test(ENG_M3U8)).toBe(false);
    expect(pattern.test(MASTER_M3U8)).toBe(false);
    // Thumbnail scrubber + chapter VTTs live outside /subtitle/.
    expect(pattern.test(THUMBNAIL_VTT)).toBe(false);
    expect(pattern.test(CHAPTER_VTT)).toBe(false);
    // Other hosts never match, even with an identical path.
    expect(pattern.test('https://cdn.example.com/x/subtitle/eng/a.vtt')).toBe(false);

    expect(languageExtractor?.(new URL(ENG_VTT))).toBe('en');
    expect(languageExtractor?.(new URL(JPN_VTT))).toBe('ja');
  });

  it('matches the tRPC lesson-video metadata endpoint on SPA navigation', () => {
    const handler = new DeepLearningAiHandler();
    const [metadata] = handler.getMetadataPatterns();
    expect(metadata.pattern.test(
      'https://learn.deeplearning.ai/api/trpc/course.getLessonVideo?batch=1&input=%7B%220%22%3A%7B%22videoId%22%3A10172096%7D%7D',
    )).toBe(true);
    expect(metadata.pattern.test(
      'https://learn.deeplearning.ai/api/trpc/course.getLessonVideo,0,course.getLessonVideoSubtitle,1?input=x',
    )).toBe(true);
    expect(metadata.pattern.test(
      'https://platform-api.dlai.link/api/trpc/course.getLessonVideo?input=x',
    )).toBe(true);
    expect(metadata.pattern.test('https://learn.deeplearning.ai/api/auth/signin/google')).toBe(false);
    expect(metadata.pattern.test('https://learn.deeplearning.ai/courses/agentic-ai/lesson/pu5xbv/welcome!')).toBe(false);
  });

  it('recognizes Next.js lesson data payloads used during client navigation', () => {
    const handler = new DeepLearningAiHandler();
    const metadata = handler.getMetadataPatterns().find((entry) =>
      entry.pattern.test(
        'https://learn.deeplearning.ai/learnext/_next/data/build-id/courses/agentic-ai/lesson/nae3i1/next-lesson.json',
      ),
    );

    expect(metadata).toBeDefined();
    expect(metadata?.pattern.test(
      'https://learn.deeplearning.ai/learnext/_next/data/build-id/courses/agentic-ai.json',
    )).toBe(false);
  });

  it('extracts tracks from an intercepted tRPC metadata body', () => {
    const handler = new DeepLearningAiHandler();
    const body = JSON.stringify({
      result: { 0: { data: { video: {
        videoId: 10172096,
        tracks: [
          { kind: 'subtitles', label: 'ENGLISH', src: ENG_VTT, srcLang: 'en-us' },
          { kind: 'subtitles', label: 'JAPANESE', src: JPN_VTT, srcLang: 'ja-jp' },
        ],
      } } } },
    });
    const tracks = handler.extractAvailableTracks(body, 'application/json', 'https://learn.deeplearning.ai/api/trpc/course.getLessonVideo');
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({ language: 'en-us', url: ENG_VTT, videoId: '10172096' });
    expect(tracks[1]).toMatchObject({ language: 'ja-jp', url: JPN_VTT, videoId: '10172096' });

    expect(handler.extractAvailableTracks('not json', 'application/json', 'https://learn.deeplearning.ai/api/trpc/x')).toEqual([]);
  });

  it('extracts tracks from the embedded #__NEXT_DATA__ on an empty-body DOM discovery call', () => {
    document.body.innerHTML = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
      makeNextDataFixture(),
    )}</script>`;
    const handler = new DeepLearningAiHandler();
    const tracks = handler.extractAvailableTracks('', 'application/json', '');
    expect(tracks).toHaveLength(2);
    expect(tracks.map((t) => t.language).sort()).toEqual(['en-us', 'ja-jp']);

    document.body.innerHTML = '';
    expect(handler.extractAvailableTracks('', 'application/json', '')).toEqual([]);
  });

  it('parses intercepted VTT bodies into cues', () => {
    const handler = new DeepLearningAiHandler();
    const vtt = [
      'WEBVTT',
      '',
      '00:00:02.000 --> 00:00:05.000',
      'Welcome to this course on agentic AI.',
      '',
      '00:00:05.000 --> 00:00:10.000',
      'It is growing fast.',
    ].join('\n');
    expect(handler.transformResponse(vtt, 'text/vtt', ENG_VTT)).toEqual([
      { startTime: 2, endTime: 5, text: 'Welcome to this course on agentic AI.' },
      { startTime: 5, endTime: 10, text: 'It is growing fast.' },
    ]);
    expect(handler.transformResponse('no cues here', 'text/vtt', ENG_VTT)).toEqual([]);
  });
});
