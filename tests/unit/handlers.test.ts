import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YoukuHandler, youkuCodeToLanguage } from '@/inject/subtitleHandlers/youku';
import { YouTubeHandler } from '@/inject/subtitleHandlers/youtube';
import { DisneyPlusHandler } from '@/inject/subtitleHandlers/disneyplus';
import { WetvHandler } from '@/inject/subtitleHandlers/wetv';
import { GenericSubtitleHandler } from '@/inject/subtitleHandlers/generic';
import { LinkedInHandler, parseLinkedInTranscriptJson } from '@/inject/subtitleHandlers/linkedin';
import { HboMaxHandler } from '@/inject/subtitleHandlers/hbomax';
import {
  createIsolatedWorldHandlers,
  handlerPlatformIds,
} from '@/inject/subtitleHandlers/worldHandlers';
import {
  registerSubtitleHandlers,
  getHandlerByPlatform,
} from '@/inject/subtitleHandlers/registry';
import {
  DeepLearningAiHandler,
  DEEP_LEARNING_AI_PLATFORM,
  isDeepLearningAiHost,
  normalizeDeepLearningAiLanguage,
  extractDeepLearningAiLanguageFromUrl,
  extractDeepLearningAiVideoData,
} from '@/inject/subtitleHandlers/deepLearningAi';
import type { MessageBridgeSender } from '@/inject/messageBridge';
import { startDeepLearningAiMetadataDiscovery } from '@/inject/deepLearningAi';

// @vitest-environment jsdom

describe('Platform Subtitle Handlers', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'www.youtube.com',
        pathname: '/watch',
        href: 'https://www.youtube.com/watch?v=123',
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it('handles YouTube timedtext patterns and language extractions, plus Youku, Disney+, WeTV, and Generic fallback handlers', () => {
    const handler = new YouTubeHandler();
    expect(handler.detect()).toBe(true);
    expect(handler.isWatchPage()).toBe(true);

    const patterns = handler.getPatterns();
    expect(patterns.length).toBeGreaterThan(0);
    const { pattern, languageExtractor } = patterns[0]!;
    const url = 'https://www.youtube.com/api/timedtext?v=123&lang=en&fmt=vtt';
    expect(pattern.test(url)).toBe(true);
    if (languageExtractor) {
      expect(languageExtractor(new URL(url))).toBe('en');
    }

    // Youku language map (handler detect is hostname-bound)
    expect(youkuCodeToLanguage('chs')).toBe('zh-Hans');
    expect(youkuCodeToLanguage('en')).toBe('en');
    const youku = new YoukuHandler();
    expect(youku.platform).toBe('youku');

    // Disney+
    const disney = new DisneyPlusHandler();
    expect(disney.getPatterns().length).toBeGreaterThan(0);

    // WeTV
    const wetv = new WetvHandler();
    expect(wetv.getPatterns().length).toBeGreaterThan(0);

    // Generic fallback
    const generic = new GenericSubtitleHandler();
    // On YouTube hostname a specific handler detects, so generic.detect() yields
    expect(typeof generic.detect()).toBe('boolean');
    expect(generic.getPatterns().length).toBeGreaterThan(0);
  });
});

describe('LinkedInHandler', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'www.linkedin.com',
        pathname: '/learning/programming-foundations-fundamentals/welcome',
        href: 'https://www.linkedin.com/learning/programming-foundations-fundamentals/welcome',
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  const DETAILED_COURSES_URL =
    'https://www.linkedin.com/learning-api/detailedCourses?courseSlug=programming-foundations-fundamentals&fields=selectedVideo&q=slugs&videoSlug=welcome&resolution=_720';

  const TRANSCRIPT_JSON = JSON.stringify({
    elements: [
      {
        selectedVideo: {
          primaryLocale: { country: 'US', language: 'en' },
          durationInSeconds: 5,
          transcript: {
            lines: [
              { transcriptStartAt: 0, caption: 'Welcome to the course.' },
              { transcriptStartAt: 2500, caption: 'Let us get started.' },
              { transcriptStartAt: 4000, caption: 'Here is the final thought.' },
            ],
          },
        },
      },
    ],
  });

  it('detects LinkedIn hosts, gates watch pages on /learning/, and matches the detailedCourses API, ambry captions, and legacy .vtt URLs', () => {
    // Facet: host detection + watch-page gating on /learning/.
    const handler = new LinkedInHandler();
    expect(handler.detect()).toBe(true);
    expect(handler.isWatchPage()).toBe(true);

    Object.defineProperty(window, 'location', {
      value: { hostname: 'www.linkedin.com', pathname: '/feed/', href: 'https://www.linkedin.com/feed/' },
      writable: true,
      configurable: true,
    });
    expect(handler.isWatchPage()).toBe(false);

    // Facet: URL patterns (detailedCourses API, ambry captions, legacy .vtt).
    const patterns = handler.getPatterns();
    const [coursesPattern, ambryPattern, vttPattern] = patterns;
    expect(coursesPattern.pattern.test(DETAILED_COURSES_URL)).toBe(true);
    expect(coursesPattern.pattern.test('https://www.linkedin.com/learning-api/detailedCourses?q=slugs')).toBe(true);
    expect(coursesPattern.pattern.test('https://www.linkedin.com/feed/')).toBe(false);

    // Player's data-captions-url (ambry blob endpoint, no .vtt extension)
    expect(ambryPattern.pattern.test('https://www.linkedin.com/ambry/?x-li-ambry-ep=AQLd5zZBGfhHMAAAAZ_VVvrTEtBQArWkHa12K')).toBe(true);
    expect(ambryPattern.pattern.test('https://www.linkedin.com/learning-api/detailedCourses?q=slugs')).toBe(false);

    expect(vttPattern.pattern.test('https://video.licdn.com/rest/v1/subtitle_en.vtt?x=1')).toBe(true);
    const { languageExtractor } = vttPattern;
    if (languageExtractor) {
      expect(languageExtractor(new URL('https://video.licdn.com/rest/v1/subtitle_en.vtt?x=1'))).toBe('en');
      expect(languageExtractor(new URL('https://video.licdn.com/rest/v1/subtitle-en_US.vtt'))).toBe('en-US');
      expect(languageExtractor(new URL(DETAILED_COURSES_URL))).toBe('');
    }
  });

  it('parses detailedCourses transcript JSON into timed cues and transforms JSON transcripts and legacy VTT bodies', () => {
    // Facet: parseLinkedInTranscriptJson timing + duration+2s fallback + invalid input.
    const cues = parseLinkedInTranscriptJson(TRANSCRIPT_JSON);
    expect(cues).toEqual([
      { startTime: 0, endTime: 2.5, text: 'Welcome to the course.' },
      { startTime: 2.5, endTime: 4, text: 'Let us get started.' },
      // Last cue ends at the video duration.
      { startTime: 4, endTime: 5, text: 'Here is the final thought.' },
    ]);

    const noDuration = JSON.stringify({
      transcript: {
        lines: [
          { transcriptStartAt: 1000, caption: 'Only cue.' },
        ],
      },
    });
    expect(parseLinkedInTranscriptJson(noDuration)).toEqual([
      { startTime: 1, endTime: 3, text: 'Only cue.' },
    ]);

    // Course-listing payload (chapters only, no selectedVideo transcript)
    const listing = JSON.stringify({
      elements: [{ chapters: [], description: 'x', title: 'y' }],
    });
    expect(parseLinkedInTranscriptJson(listing)).toEqual([]);
    expect(parseLinkedInTranscriptJson('not json')).toEqual([]);
    expect(parseLinkedInTranscriptJson('[]')).toEqual([]);

    // Facet: handler.transformResponse for JSON and legacy VTT bodies.
    const handler = new LinkedInHandler();
    const jsonCues = handler.transformResponse(TRANSCRIPT_JSON, 'application/json', DETAILED_COURSES_URL);
    expect(jsonCues.length).toBe(3);
    // Body-prefix detection works even with a missing/odd Content-Type.
    expect(handler.transformResponse(TRANSCRIPT_JSON, 'text/plain', DETAILED_COURSES_URL).length).toBe(3);

    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n';
    const vttCues = handler.transformResponse(vtt, 'text/vtt', 'https://video.licdn.com/rest/v1/subtitle_en.vtt');
    expect(vttCues).toEqual([{ startTime: 1, endTime: 2, text: 'Hello' }]);
  });

  it('extracts tracks from legacy arrays and from the detailedCourses transcript', () => {
    const handler = new LinkedInHandler();

    const legacy = JSON.stringify({
      subtitles: [
        { language: 'en', label: 'English', url: 'https://video.licdn.com/rest/v1/subtitle_en.vtt' },
        { language: 'de', label: 'Deutsch' },
      ],
    });
    const legacyTracks = handler.extractAvailableTracks(legacy, 'application/json', 'https://www.linkedin.com/api/transcript');
    expect(legacyTracks).toHaveLength(2);
    expect(legacyTracks[0]).toMatchObject({ language: 'en', url: 'https://video.licdn.com/rest/v1/subtitle_en.vtt' });

    const transcriptTracks = handler.extractAvailableTracks(TRANSCRIPT_JSON, 'application/json', DETAILED_COURSES_URL);
    expect(transcriptTracks).toHaveLength(1);
    expect(transcriptTracks[0]).toMatchObject({ language: 'en', platform: 'linkedin' });
    expect(transcriptTracks[0].url).toBeUndefined();

    expect(handler.extractAvailableTracks('{"elements":[]}', 'application/json', DETAILED_COURSES_URL)).toEqual([]);
  });

  it('hides the video.js emulated caption window while the overlay is active', () => {
    const handler = new LinkedInHandler();
    expect(handler.getNativeCaptionHide()).toEqual({ selector: '.vjs-text-track-display' });
  });
});

// @vitest-environment jsdom

describe('HboMaxHandler.getDomCueSource', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'www.max.com',
        pathname: '/video/watch/abc-123',
        href: 'https://www.max.com/video/watch/abc-123',
      },
      writable: true,
      configurable: true,
    });
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    document.body.innerHTML = '';
  });

  it('hides native captions with visibility (never display) so Max keeps rendering cues', () => {
    const source = new HboMaxHandler().getDomCueSource();

    // MAX-28 / spec decision 1: the cue source lives inside the caption window,
    // so display:none risks stopping cue production entirely.
    expect(source.captionHideMethod).toBe('visibility');
    expect(source.cueSelector).toBe('[data-testid="cueBoxRowTextCue"]');
    expect(source.captionWindowSelector).toBe('[data-testid="caption_renderer_overlay"]');
  });

  it('declares the cue root/track-switch selectors and extracts the video id from the watch URL', () => {
    const source = new HboMaxHandler().getDomCueSource();

    // Facet: observed ancestor + aria-checked track-switch button.
    expect(source.observeRootSelector).toBe('[data-testid="caption_renderer_overlay"]');
    expect(source.trackSwitchSelector).toBe('[data-testid="player-ux-text-track-button"]');
    expect(source.trackSwitchAttribute).toBe('aria-checked');

    // Facet: video id from the watch URL.
    expect(source.videoIdExtractor?.()).toBe('abc-123');
  });

  it('reads the active language from the checked track button', () => {
    const button = document.createElement('button');
    button.setAttribute('data-testid', 'player-ux-text-track-button');
    button.setAttribute('aria-checked', 'true');
    button.setAttribute('aria-label', 'English');
    document.body.appendChild(button);

    const source = new HboMaxHandler().getDomCueSource();
    expect(source.readActiveLanguage()).toBe('en');
  });
});

describe('HboMaxHandler detection, patterns and track extraction', () => {
  const originalLocation = window.location;

  function setLocation(hostname: string, pathname = '/video/watch/abc-123'): void {
    Object.defineProperty(window, 'location', {
      value: { hostname, pathname, href: `https://${hostname}${pathname}` },
      writable: true,
      configurable: true,
    });
  }

  beforeEach(() => {
    setLocation('www.max.com');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    document.body.innerHTML = '';
  });

  it('detects every Max-owned host shape and rejects look-alikes, and treats only /video/watch/ paths as watch pages', () => {
    const handler = new HboMaxHandler();

    // Facet: host detection over Max-owned and look-alike hosts.
    for (const host of [
      'max.com',
      'www.max.com',
      'play.max.com',
      'play.hbomax.com',
      'www.hbomax.com',
      'eu.hbomax.com',
    ]) {
      setLocation(host);
      expect(handler.detect(), host).toBe(true);
    }

    for (const host of [
      'notmax.com',
      'max.com.evil.example',
      'hbomax.com.evil.example',
      'www.example.com',
    ]) {
      setLocation(host);
      expect(handler.detect(), host).toBe(false);
    }

    // Facet: watch-page gating on /video/watch/.
    setLocation('www.max.com', '/video/watch/abc-123');
    expect(handler.isWatchPage()).toBe(true);

    setLocation('www.max.com', '/browse');
    expect(handler.isWatchPage()).toBe(false);
    setLocation('www.max.com', '/');
    expect(handler.isWatchPage()).toBe(false);
  });

  it('exposes the .vtt + manifest patterns and extracts DOM tracks (skipping Off), returning none without the caption menu', () => {
    // Facet: .vtt pattern + track-id language extractor + manifest patterns.
    const handler = new HboMaxHandler();

    const [vttPattern] = handler.getPatterns();
    expect(vttPattern.pattern.test('https://cf.asia.prd.media.max.com/a/t/t3/8.vtt')).toBe(true);
    expect(vttPattern.pattern.test('https://cf.asia.prd.media.max.com/a/t/t3/8.vtt?x=1')).toBe(true);
    expect(vttPattern.pattern.test('https://cf.asia.prd.media.max.com/a/t/t3/8.mpd')).toBe(false);

    document.body.innerHTML = '<button data-testid="player-ux-text-track-button" aria-checked="true" aria-label="Deutsch"></button>';
    const extracted = vttPattern.languageExtractor?.(
      new URL('https://cf.asia.prd.media.max.com/a/t/t3/8.vtt'),
    );
    // The checked track button wins over the opaque CDN track id.
    expect(extracted).toBe('de');

    document.body.innerHTML = '';
    const fromPath = vttPattern.languageExtractor?.(
      new URL('https://cf.asia.prd.media.max.com/a/t/t3/8.vtt'),
    );
    expect(fromPath).toBe('t3');

    const manifestPatterns = handler.getManifestPatterns();
    expect(
      manifestPatterns.some((p) => p.pattern.test('https://beam.prd.api.hbomax.com/x/master.m3u8')),
    ).toBe(true);
    expect(manifestPatterns.some((p) => p.pattern.test('https://cdn.example.com/a/1.mpd'))).toBe(true);
    expect(
      manifestPatterns.some((p) =>
        p.pattern.test('https://akm.asia.prd.media.max.com/fadb6e8d?manifest-params=TOKEN'),
      ),
    ).toBe(true);

    // Facet: DOM track extraction with localized labels, skipping the Off entry.
    setLocation('www.max.com', '/video/watch/abc-123');
    document.body.innerHTML = `
      <button data-testid="player-ux-text-track-button" aria-checked="true" aria-label="English"></button>
      <button data-testid="player-ux-text-track-button" aria-checked="false" aria-label="Español (Latinoamérica)"></button>
      <button data-testid="player-ux-text-track-button" aria-checked="false" aria-label="Off"></button>
      <button data-testid="player-ux-text-track-button" aria-checked="false"></button>
    `;

    const tracks = new HboMaxHandler().extractAvailableTracks('', 'application/json', '');

    // "Español (Latinoamérica)" is the Latin American track: the label map
    // records the region (es-419) rather than a bare `es`.
    expect(tracks.map((track) => track.language)).toEqual(['en', 'es-419']);
    expect(tracks.map((track) => track.label)).toEqual(['English', 'Español (Latinoamérica)']);
    expect(tracks.every((track) => track.platform === 'hbomax')).toBe(true);
    expect(tracks.every((track) => track.videoId === 'abc-123')).toBe(true);
    expect(tracks.every((track) => track.url === undefined)).toBe(true);

    // Facet: no tracks when the player has not rendered the caption menu.
    document.body.innerHTML = '<div></div>';
    expect(new HboMaxHandler().extractAvailableTracks('', '', '')).toEqual([]);
  });
});

/**
 * Coverage guard for the shared platform subtitle handlers.
 *
 * The MAIN world tags every intercepted payload with its handler's `platform`
 * id; the isolated world resolves that id with `getHandlerByPlatform()`. Both
 * worlds now build their handler list from one factory, so a platform can no
 * longer be registered in only one of them — these tests fail the build if the
 * shared list loses a platform either world relies on, or if the isolated-world
 * registry fails to resolve an intercepted id (the Netflix/Disney+ bug).
 */


/** Platform ids the MAIN world can stamp onto an intercepted payload. */
const INTERCEPTED_PLATFORM_IDS = [
  'youtube',
  'udemy',
  'coursera',
  'deeplearningai',
  'linkedin',
  'hbomax',
  'youku',
  'netflix',
  'disneyplus',
  'wetv',
  'generic',
];

describe('subtitle handler world parity', () => {
  it('registers exactly the platform ids the MAIN world can intercept, in order, and returns fresh handler instances per call', () => {
    // Both worlds build from this one factory, so the drift this file used to
    // guard against is now structural. What is pinned here is the factory's
    // content and order: dropping a handler (or reordering `generic` out of the
    // last slot, where first-match-wins detection needs it) fails the build.
    expect(handlerPlatformIds(createIsolatedWorldHandlers())).toEqual(
      INTERCEPTED_PLATFORM_IDS,
    );

    // Facet: each call builds fresh instances (no shared state between worlds).
    const first = createIsolatedWorldHandlers();
    const second = createIsolatedWorldHandlers();
    expect(first[0]).not.toBe(second[0]);
  });

  it('resolves every intercepted platform id from the isolated-world registry', () => {
    // Regression guard for the Netflix/Disney+ bug: with only the old
    // isolated-world list registered, these two resolved to null and their
    // intercepted bodies were returned untouched.
    registerSubtitleHandlers(createIsolatedWorldHandlers());
    for (const platform of INTERCEPTED_PLATFORM_IDS) {
      expect(getHandlerByPlatform(platform)?.platform).toBe(platform);
    }
  });
});

// @vitest-environment jsdom

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
  it('normalizes BCP-47 and ISO 639-2 codes and extracts the language from subtitle URLs', () => {
    expect(normalizeDeepLearningAiLanguage('en-us')).toBe('en-us');
    expect(normalizeDeepLearningAiLanguage('ja-jp')).toBe('ja-jp');
    expect(normalizeDeepLearningAiLanguage('eng')).toBe('en');
    expect(normalizeDeepLearningAiLanguage('JPN')).toBe('ja');
    expect(normalizeDeepLearningAiLanguage('  hi-IN ')).toBe('hi-in');
    expect(normalizeDeepLearningAiLanguage('')).toBe('');

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
  it('finds lesson video tracks in the embedded __NEXT_DATA__ shape and accepts bare, nested, and subtitle-map payload shapes; returns null without video data', () => {
    // Facet: lesson video tracks inside the embedded __NEXT_DATA__ shape.
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

    // Facet: bare, nested, and subtitle-map payload shapes.
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

    const fromMap = extractDeepLearningAiVideoData({
      videoId: 7,
      subtitle: JSON.stringify({
        'en-us': { URI: ENG_VTT, NAME: 'ENGLISH' },
      }),
    });
    expect(fromMap?.videoId).toBe('7');
    expect(fromMap?.tracks).toEqual([
      {
        language: 'en-us',
        label: 'ENGLISH',
        url: ENG_VTT,
        isAutoGenerated: false,
        platform: DEEP_LEARNING_AI_PLATFORM,
        videoId: '7',
      },
    ]);

    // Facet: payloads without video data return null.
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

  it('detects DLAI hosts and gates /lesson, exposes CDN VTT + metadata patterns, extracts tRPC/DOM tracks, and parses VTT cues', () => {
    // Facet: host detection + watch-page gating on /lesson.
    const handler = new DeepLearningAiHandler();
    expect(handler.platform).toBe(DEEP_LEARNING_AI_PLATFORM);
    expect(handler.detect()).toBe(true);
    expect(handler.isWatchPage()).toBe(true);

    setLocation('learn.deeplearning.ai', '/courses/agentic-ai');
    expect(handler.isWatchPage()).toBe(false);

    setLocation('youtube.com', '/lesson/x');
    expect(handler.detect()).toBe(false);

    // Facet: intercepts only DLAI CDN subtitle VTTs, never manifests or thumbnails.
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

    // Facet: tRPC getLessonVideo + Next.js _next/data metadata endpoints.
    const metadata = handler.getMetadataPatterns();
    expect(metadata[0]!.pattern.test(
      'https://learn.deeplearning.ai/api/trpc/course.getLessonVideo?batch=1&input=%7B%220%22%3A%7B%22videoId%22%3A10172096%7D%7D',
    )).toBe(true);
    expect(metadata[0]!.pattern.test(
      'https://learn.deeplearning.ai/api/trpc/course.getLessonVideo,0,course.getLessonVideoSubtitle,1?input=x',
    )).toBe(true);
    expect(metadata[0]!.pattern.test(
      'https://platform-api.dlai.link/api/trpc/course.getLessonVideo?input=x',
    )).toBe(true);
    expect(metadata[0]!.pattern.test('https://learn.deeplearning.ai/api/auth/signin/google')).toBe(false);
    expect(metadata[0]!.pattern.test('https://learn.deeplearning.ai/courses/agentic-ai/lesson/pu5xbv/welcome!')).toBe(false);

    const nextData = handler.getMetadataPatterns().find((entry) =>
      entry.pattern.test(
        'https://learn.deeplearning.ai/learnext/_next/data/build-id/courses/agentic-ai/lesson/nae3i1/next-lesson.json',
      ),
    );
    expect(nextData).toBeDefined();
    expect(nextData?.pattern.test(
      'https://learn.deeplearning.ai/learnext/_next/data/build-id/courses/agentic-ai.json',
    )).toBe(false);

    // Facet: tracks from intercepted tRPC bodies + embedded __NEXT_DATA__ DOM payloads.
    document.body.innerHTML = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
      makeNextDataFixture(),
    )}</script>`;

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

    const domTracks = handler.extractAvailableTracks('', 'application/json', '');
    expect(domTracks).toHaveLength(2);
    expect(domTracks.map((t) => t.language).sort()).toEqual(['en-us', 'ja-jp']);

    document.body.innerHTML = '';
    expect(handler.extractAvailableTracks('', 'application/json', '')).toEqual([]);

    // Facet: parse intercepted VTT bodies into cues.
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

// @vitest-environment jsdom

const DISC_ENG_VTT =
  'https://video.deeplearning.ai/upv2/agentic-ai/lc-intro/subtitle/eng/1784-eng-4e9f8df.vtt';
const DISC_JPN_VTT =
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
                        'en-us': { URI: DISC_ENG_VTT, NAME: 'ENGLISH' },
                        'ja-jp': { URI: DISC_JPN_VTT, NAME: 'JAPANESE' },
                      }),
                      tracks: [
                        { kind: 'subtitles', label: 'ENGLISH', src: DISC_ENG_VTT, srcLang: 'en-us' },
                        { kind: 'subtitles', label: 'JAPANESE', src: DISC_JPN_VTT, srcLang: 'ja-jp' },
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
            expect.objectContaining({ language: 'en-us', url: DISC_ENG_VTT }),
            expect.objectContaining({ language: 'ja-jp', url: DISC_JPN_VTT }),
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

  it('stays silent and exhausts the retry budget when __NEXT_DATA__ is absent or carries no lesson video data, and cleanup stops pending retries', () => {
    // Facet: absent payload, or a payload without lesson video data — silent
    // across the full 100 retries × 100ms discovery budget.
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

    // Facet: cleanup() cancels the pending retry — a payload injected after
    // teardown is never emitted.
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
