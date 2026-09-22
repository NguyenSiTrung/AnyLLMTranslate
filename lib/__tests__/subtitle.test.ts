import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hashKnobs,
  hashGlossary,
  generateSubtitleCacheKey,
  type GlossarySnapshot,
} from '@/lib/subtitleCacheKey';
import type { ProfileKnobs } from '@/lib/subtitleProfiles';
import { mergeProperNouns } from '@/lib/subtitleGlossary';
import { subtitleLanguagesMatch } from '@/lib/subtitleLanguageMatch';
import { parseASS, parseAssTimestamp, stripAssTags } from '@/lib/assParser';
import { parseTTML, parseTtmlTime } from '@/lib/ttmlParser';
import { concatVttSegments } from '@/lib/vttSegmentConcat';
import { buildSegmentOffsetMap } from '@/lib/dashSegmentOffsets';
import { applySegmentOffset } from '@/lib/applySegmentOffset';
import type { SubtitleCue } from '@/types/subtitle';
import { buildAppearanceSummaryChips } from '@/lib/subtitlePreviewSummary';
import {
  withRetry,
  isRetryableTranslationError,
  extractTranslationErrorStatus,
} from '@/lib/subtitleRetry';
import { ApiError } from '@/services/openaiCompatible';
import { PoolExhaustedError } from '@/services/providerPool';
import {
  SUBTITLE_STYLE_PRESETS,
  resolveSubtitleStyle,
  resolveSubtitleFontFamily,
  withAlpha,
} from '@/lib/subtitleStylePresets';
import { DEFAULT_SUBTITLE_SETTINGS } from '@/types/config';
import { shouldTeardownSubtitleSession } from '@/lib/subtitleTeardown';
import type { SubtitleSettings } from '@/types/config';

/**
 * Subtitle cache-key builder: knobs + glossary + deterministic hex digest.
 */

const KNOBS_A: ProfileKnobs = {
  register: 'neutral',
  faithfulness: 'literal',
  brevity: 'relaxed',
  profanity: 'preserve',
};
const KNOBS_B: ProfileKnobs = {
  register: 'casual',
  faithfulness: 'idiomatic',
  brevity: 'moderate',
  profanity: 'preserve',
};
const EMPTY_GLOSSARY: GlossarySnapshot = { globalEntries: [], properNouns: [] };

describe('subtitleCacheKey', () => {
  it('is deterministic, order-independent, sensitive to content/named-list, and generates SHA-256 cache keys', async () => {
    expect(hashKnobs(KNOBS_A)).toBe(hashKnobs(KNOBS_A));
    expect(hashKnobs(KNOBS_A)).not.toBe(hashKnobs(KNOBS_B));

    const a: GlossarySnapshot = {
      globalEntries: [
        { source: 'x', target: 'y' },
        { source: 'p', target: 'q' },
      ],
      properNouns: ['Alice', 'Bob'],
    };
    const b: GlossarySnapshot = {
      globalEntries: [
        { source: 'p', target: 'q' },
        { source: 'x', target: 'y' },
      ],
      properNouns: ['Bob', 'Alice'],
    };
    expect(hashGlossary(a)).toBe(hashGlossary(b));
    expect(hashGlossary(EMPTY_GLOSSARY)).not.toBe(
      hashGlossary({ globalEntries: [{ source: 'AI', target: 'x' }], properNouns: [] }),
    );
    const base: GlossarySnapshot = { globalEntries: [], properNouns: [] };
    const withId: GlossarySnapshot = {
      ...base,
      namedListId: 'L1',
      namedListEntries: [{ source: 'A', target: 'B' }],
    };
    const withId2: GlossarySnapshot = {
      ...base,
      namedListId: 'L2',
      namedListEntries: [{ source: 'A', target: 'B' }],
    };
    const edited: GlossarySnapshot = {
      ...base,
      namedListId: 'L1',
      namedListEntries: [{ source: 'A', target: 'C' }],
    };
    expect(hashGlossary(withId)).not.toBe(hashGlossary(base));
    expect(hashGlossary(withId)).not.toBe(hashGlossary(withId2));
    expect(hashGlossary(withId)).not.toBe(hashGlossary(edited));
            expect(hashGlossary(base)).toBe(
      hashGlossary({ ...base, namedListId: null, namedListEntries: [] }),
    );

    // namedList entry order is order-insensitive
    const orderA: GlossarySnapshot = {
      ...base,
      namedListId: 'L1',
      namedListEntries: [
        { source: 'p', target: 'q' },
        { source: 'a', target: 'b' },
      ],
    };
    const orderB: GlossarySnapshot = {
      ...base,
      namedListId: 'L1',
      namedListEntries: [
        { source: 'a', target: 'b' },
        { source: 'p', target: 'q' },
      ],
    };
    expect(hashGlossary(orderA)).toBe(hashGlossary(orderB));

    // is deterministic hex SHA-256 and differs by knobs/glossary/text
    const k1 = await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_A, EMPTY_GLOSSARY);
    const k2 = await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_A, EMPTY_GLOSSARY);
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^[0-9a-f]{64}$/);

    expect(await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_B, EMPTY_GLOSSARY)).not.toBe(
      k1,
    );
    expect(
      await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_A, {
        globalEntries: [{ source: 'AI', target: 'trí tuệ nhân tạo' }],
        properNouns: ['Alice'],
      }),
    ).not.toBe(k1);
    expect(await generateSubtitleCacheKey('World', 'en', 'vi', KNOBS_A, EMPTY_GLOSSARY)).not.toBe(
      k1,
    );
  });
});

describe('mergeProperNouns locks', () => {
  it('never overwrites/adds locked sources case-insensitively; keeps prior behavior without locks', () => {
    const glossary = new Map<string, string>([['Elsa', 'UserElsa']]);

    mergeProperNouns(
      glossary,
      { Elsa: 'AutoElsa', Anna: '安娜' },
      { lockedSources: new Set(['elsa']) },
    );

    expect(glossary.get('Elsa')).toBe('UserElsa');
    expect(glossary.get('Anna')).toBe('安娜');

    const emptyGlossary = new Map<string, string>();

    mergeProperNouns(
      emptyGlossary,
      { ELSA: '艾莎' },
      { lockedSources: new Set(['elsa']) },
    );

    expect(emptyGlossary.has('ELSA')).toBe(false);

    const unlocked = new Map<string, string>([['Elsa', 'old']]);

    mergeProperNouns(unlocked, { Elsa: 'new' });

    expect(unlocked.get('Elsa')).toBe('new');
  });
});

describe('subtitleLanguagesMatch', () => {
  it('matches exact, primary, script, and ISO 639-2 tags, with the zh script default', () => {
    // Exact, primary-subtag, script, and ISO 639-2 equivalences match; unrelated
    // languages do not.
    expect(subtitleLanguagesMatch('en-US', 'en-US')).toBe(true);
    expect(subtitleLanguagesMatch('en-US', 'en')).toBe(true);
    expect(subtitleLanguagesMatch('en', 'en-US')).toBe(true);
    expect(subtitleLanguagesMatch('zh-Hans-SG', 'zh-Hans')).toBe(true);
    expect(subtitleLanguagesMatch('zh-Hans', 'zh-Hans-SG')).toBe(true);
    expect(subtitleLanguagesMatch('eng', 'en')).toBe(true);
    expect(subtitleLanguagesMatch('en', 'eng')).toBe(true);
    expect(subtitleLanguagesMatch('eng-US', 'en')).toBe(true);
    expect(subtitleLanguagesMatch('en-US', 'eng')).toBe(true);
    expect(subtitleLanguagesMatch('vie', 'vi')).toBe(true);
    expect(subtitleLanguagesMatch('zho', 'zh-CN')).toBe(true);
    expect(subtitleLanguagesMatch('en-US', 'zh-Hans')).toBe(false);
    expect(subtitleLanguagesMatch('es', 'fr')).toBe(false);
    expect(subtitleLanguagesMatch('eng', 'fra')).toBe(false);

    // The UI uses `zh` for Simplified while Max exposes zh-Hans and zh-Hant as
    // separate tracks: a "Simplified" preference must not pass the gate for a
    // Traditional track just because both primary subtags are `zh`.
    expect(subtitleLanguagesMatch('zh-Hant', 'zh')).toBe(false);
    expect(subtitleLanguagesMatch('zh', 'zh-Hant')).toBe(false);
    expect(subtitleLanguagesMatch('zh-Hans', 'zh')).toBe(true);
    expect(subtitleLanguagesMatch('zh', 'zh-Hans')).toBe(true);
    expect(subtitleLanguagesMatch('zh-Hant', 'zh-TW')).toBe(true);
    expect(subtitleLanguagesMatch('zh-TW', 'zh-Hant')).toBe(true);
    expect(subtitleLanguagesMatch('zh', 'zh-TW')).toBe(false);
    expect(subtitleLanguagesMatch('zh-Hans', 'zh-Hans-SG')).toBe(true);
    expect(subtitleLanguagesMatch('zh-CN', 'zh-Hans')).toBe(true);

    // ISO 639-2 Chinese conversion still works alongside the script default.
    expect(subtitleLanguagesMatch('zho', 'zh-Hans')).toBe(true);
    expect(subtitleLanguagesMatch('zho', 'zh')).toBe(true);
    expect(subtitleLanguagesMatch('zho', 'zh-CN')).toBe(true);
    // ISO 639-2 Chinese is script-neutral in the standard, but this product
    // treats bare zh/zho/chi as Simplified (plan rule), so Traditional tags
    // must not match them.
    expect(subtitleLanguagesMatch('chi', 'zh-TW')).toBe(false);
    expect(subtitleLanguagesMatch('chi', 'zh-Hant')).toBe(false);
    expect(subtitleLanguagesMatch('zho', 'zh-Hant')).toBe(false);
  });
});

// @vitest-environment jsdom

describe('Subtitle parsers, segment concatenation and offset helpers', () => {
  it('parses ASS/TTML cues, concatenates VTT segments, maps DASH offsets, and applies time offsets', () => {
    expect(parseAssTimestamp('0:00:01.50')).toBeCloseTo(1.5);
    expect(stripAssTags('{\\an8}Hello\\NWorld')).toBe('Hello\nWorld');

    const ass = `[Script Info]\nTitle: test\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8}First line`;
    const assCues = parseASS(ass);
    expect(assCues[0]!.text).toBe('First line');

    expect(parseTtmlTime('00:00:12.340')).toBeCloseTo(12.34, 3);
    const ttml = `<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="00:00:12.340" end="00:00:15.670">Hello there</p></div></body></tt>`;
    expect(parseTTML(ttml)[0]!.text).toBe('Hello there');

    // concatenates VTT segments, maps DASH offsets, and applies segment time offsets
    const concatenated = concatVttSegments([
      'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nFirst',
      'WEBVTT\n\n00:00:02.000 --> 00:00:04.000\nSecond',
    ]);
    expect((concatenated.match(/^WEBVTT/gm) || []).length).toBe(1);
    expect(concatenated).toContain('First');

    const MPD_RELATIVE = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT60S">
  <Period>
    <AdaptationSet id="41" lang="en-US" contentType="text">
      <Representation id="t41" bandwidth="35" mimeType="text/vtt">
        <SegmentTemplate timescale="1000" startNumber="3" media="t/ff8956/t41/$Number$.vtt">
          <SegmentTimeline><S t="0" d="1000" r="1"/></SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const map = buildSegmentOffsetMap(MPD_RELATIVE, 'https://prd.media.max.com/asset/123/manifest.mpd');
    expect(map.size).toBe(2);

    const cue: SubtitleCue = { startTime: 1, endTime: 2, text: 'hi' };
    const offsetRes = applySegmentOffset([cue], 30000);
    expect(offsetRes[0]!.startTime).toBe(31);
    expect(offsetRes[0]!.endTime).toBe(32);
  });
});

describe('buildAppearanceSummaryChips', () => {
  it('maps position/display/size modes and clamps opacity percent', () => {
    expect(
      buildAppearanceSummaryChips({
        position: 'bottom',
        displayMode: 'bilingual',
        fontSizeMode: 'fixed',
        fontSize: 16,
        backgroundOpacity: 0.5,
      }),
    ).toEqual({
      position: 'Bottom',
      display: 'Bilingual',
      size: '16px',
      opacity: '50%',
    });

    expect(
      buildAppearanceSummaryChips({
        position: 'top',
        displayMode: 'translation-only',
        fontSizeMode: 'auto',
        fontSize: 22,
        backgroundOpacity: 0.33,
      }),
    ).toMatchObject({
      position: 'Top',
      display: 'Translated',
      size: 'Auto',
      opacity: '33%',
    });

    expect(
      buildAppearanceSummaryChips({
        position: 'bottom',
        displayMode: 'bilingual',
        fontSizeMode: 'fixed',
        fontSize: 12,
        backgroundOpacity: 1,
      }).opacity,
    ).toBe('100%');
  });
});

/**
 * Tests for the generic retry-with-backoff helper.
 * Operates on THROWN errors. The 4xx fail-fast predicate mirrors
 * fetchWithRetry (services/openaiCompatible.ts:384).
 */

class TransientError extends Error {}
const alwaysRetry = () => true;
const noRetryOn4xx = (e: unknown): boolean =>
  !(e instanceof ApiError && e.statusCode >= 400 && e.statusCode < 500);

describe('withRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('success, maxRetries rethrow, 4xx fail-fast, 5xx recover, exponential backoff', async () => {
    const ok = vi.fn().mockResolvedValue('ok');
    expect(
      await withRetry(ok, { maxRetries: 3, baseDelayMs: 10, shouldRetry: alwaysRetry }),
    ).toBe('ok');
    expect(ok).toHaveBeenCalledTimes(1);

    const fail = vi.fn().mockRejectedValue(new TransientError('boom'));
    const failP = withRetry(fail, { maxRetries: 2, baseDelayMs: 10, shouldRetry: alwaysRetry });
    const failAssert = expect(failP).rejects.toThrow('boom');
    await vi.runAllTimersAsync();
    await failAssert;
    expect(fail).toHaveBeenCalledTimes(3);

    const badReq = vi.fn().mockRejectedValue(new ApiError('Bad Request', 400));
    await expect(
      withRetry(badReq, { maxRetries: 5, baseDelayMs: 10, shouldRetry: noRetryOn4xx }),
    ).rejects.toThrow('Bad Request');
    expect(badReq).toHaveBeenCalledTimes(1);

    const recover = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Server Error', 503))
      .mockResolvedValueOnce('recovered');
    const recoverP = withRetry(recover, {
      maxRetries: 3,
      baseDelayMs: 10,
      shouldRetry: noRetryOn4xx,
    });
    await vi.advanceTimersByTimeAsync(10);
    await expect(recoverP).resolves.toBe('recovered');
    expect(recover).toHaveBeenCalledTimes(2);

    const backoff = vi.fn().mockRejectedValue(new TransientError('x'));
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const backoffP = withRetry(backoff, {
      maxRetries: 2,
      baseDelayMs: 100,
      shouldRetry: alwaysRetry,
    });
    const backoffAssert = expect(backoffP).rejects.toThrow('x');
    await vi.runAllTimersAsync();
    await backoffAssert;
    const delays = setTimeoutSpy.mock.calls
      .map((c) => c[1])
      .filter((d): d is number => typeof d === 'number' && d >= 100);
    expect(delays).toContain(100);
    expect(delays).toContain(200);
    setTimeoutSpy.mockRestore();
  });
});

describe('isRetryableTranslationError', () => {
  it('fails fast on 4xx, retries transient/statusless errors, and unwraps PoolExhaustedError.lastError', () => {
    // 4xx client errors (bad request, auth, missing model) fail fast.
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isRetryableTranslationError(new ApiError(`HTTP ${status}`, status))).toBe(false);
    }

    // Rate limits, request timeouts, and server errors are retried.
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(isRetryableTranslationError(new ApiError(`HTTP ${status}`, status))).toBe(true);
    }

    // Errors with no visible status (network, content, pool) are retried.
    expect(isRetryableTranslationError(new Error('fetch failed'))).toBe(true);
    expect(isRetryableTranslationError(new Error('Empty response from LLM'))).toBe(true);
    expect(isRetryableTranslationError(undefined)).toBe(true);
    expect(isRetryableTranslationError('boom')).toBe(true);

    // PoolExhaustedError.lastError is unwrapped to classify the underlying failure.
    const authExhausted = new PoolExhaustedError(
      'All providers are cooling down',
      new ApiError('Unauthorized', 401),
    );
    expect(extractTranslationErrorStatus(authExhausted)).toBe(401);
    expect(isRetryableTranslationError(authExhausted)).toBe(false);

    const rateLimited = new PoolExhaustedError(
      'All providers are cooling down',
      new ApiError('Too Many Requests', 429),
    );
    expect(isRetryableTranslationError(rateLimited)).toBe(true);

    // No status anywhere (all slots open before dispatch) — retry is correct.
    const statusless = new PoolExhaustedError(
      'All providers are cooling down',
      new Error('no healthy slot'),
    );
    expect(extractTranslationErrorStatus(statusless)).toBeUndefined();
    expect(isRetryableTranslationError(statusless)).toBe(true);
  });

  it('stops retrying a non-retryable failure after one attempt', async () => {
    vi.useFakeTimers();
    try {
      const unauthorized = vi.fn().mockRejectedValue(new ApiError('Unauthorized', 401));
      await expect(
        withRetry(unauthorized, {
          maxRetries: 2,
          baseDelayMs: 500,
          shouldRetry: isRetryableTranslationError,
        }),
      ).rejects.toThrow('Unauthorized');
      expect(unauthorized).toHaveBeenCalledTimes(1);

      const rateLimited = vi
        .fn()
        .mockRejectedValueOnce(new ApiError('Too Many Requests', 429))
        .mockResolvedValueOnce('recovered');
      const recoverP = withRetry(rateLimited, {
        maxRetries: 2,
        baseDelayMs: 500,
        shouldRetry: isRetryableTranslationError,
      });
      await vi.advanceTimersByTimeAsync(500);
      await expect(recoverP).resolves.toBe('recovered');
      expect(rateLimited).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('subtitleStylePresets — preset table', () => {
  it('defines exactly the five approved presets and defaults to classic with no overrides', () => {
    // Exactly the five approved presets, with distinct signatures.
    const ids = Object.keys(SUBTITLE_STYLE_PRESETS).sort();
    expect(ids).toEqual(
      ['classic', 'netflix', 'white-on-black', 'yellow-on-black', 'black-on-white'].sort(),
    );
    expect(SUBTITLE_STYLE_PRESETS.classic).toMatchObject({
      textColor: '#ffffff',
      originalTextColor: 'rgba(255,255,255,0.6)',
      backgroundStyle: 'black-box',
      shadowStrength: 0.5,
      borderRadius: 8,
    });
    expect(SUBTITLE_STYLE_PRESETS.netflix.backgroundStyle).toBe('none');
    expect(SUBTITLE_STYLE_PRESETS['yellow-on-black'].textColor).toBe('#f5c518');
    expect(SUBTITLE_STYLE_PRESETS['black-on-white']).toMatchObject({
      textColor: '#000000',
      backgroundStyle: 'white-box',
      shadowStrength: 0,
    });

    // DEFAULT_SUBTITLE_SETTINGS defaults to classic with no overrides.
    expect(DEFAULT_SUBTITLE_SETTINGS.stylePreset).toBe('classic');
    expect(DEFAULT_SUBTITLE_SETTINGS.styleOverrides).toEqual({});
  });
});

describe('withAlpha', () => {
  it('converts hex to rgba at the given alpha and passes non-hex through', () => {
    expect(withAlpha('#ffffff', 1)).toBe('rgba(255,255,255,1)');
    expect(withAlpha('#f5c518', 0.6)).toBe('rgba(245,197,24,0.6)');
    expect(withAlpha('#000', 0.3)).toBe('rgba(0,0,0,0.3)');
    expect(withAlpha('rgba(1,2,3,0.5)', 0.9)).toBe('rgba(1,2,3,0.5)');
  });
});

describe('resolveSubtitleStyle', () => {
  it('resolves preset base looks, merges per-field overrides, and falls back to classic for unknown ids', () => {
    // Each approved preset base look at the given opacity.
    expect(resolveSubtitleStyle('classic', undefined, 0.7)).toEqual({
      textColor: 'rgba(255,255,255,1)',
      originalTextColor: 'rgba(255,255,255,0.6)',
      backgroundColor: '0,0,0',
      backgroundOpacity: 0.7,
      borderRadius: 8,
      textShadow: '0 1px 3px rgba(0,0,0,0.5)',
    });
    expect(resolveSubtitleStyle('netflix', undefined, 0.7)).toMatchObject({
      backgroundColor: '0,0,0',
      backgroundOpacity: 0,
      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
    });
    expect(resolveSubtitleStyle('black-on-white', undefined, 1)).toMatchObject({
      textColor: 'rgba(0,0,0,1)',
      originalTextColor: 'rgba(0,0,0,0.6)',
      backgroundColor: '255,255,255',
      backgroundOpacity: 1,
      textShadow: 'none',
    });

    // Per-field overrides merge, and backgroundStyle switches the box.
    const result = resolveSubtitleStyle(
      'netflix',
      { textColor: '#f5c518', shadowStrength: 0.2 },
      0.7,
    );
    expect(result.textColor).toBe('rgba(245,197,24,1)');
    expect(result.originalTextColor).toBe('rgba(245,197,24,0.6)');
    expect(result.textShadow).toBe('0 1px 3px rgba(0,0,0,0.2)');
    expect(result.backgroundOpacity).toBe(0); // netflix backgroundStyle still none

    const boxed = resolveSubtitleStyle('netflix', { backgroundStyle: 'black-box' }, 0.5);
    expect(boxed.backgroundOpacity).toBe(0.5);
    expect(boxed.backgroundColor).toBe('0,0,0');

    // An unknown preset id falls back to classic.
    // @ts-expect-error unknown id
    expect(resolveSubtitleStyle('nope', undefined, 0.7).textColor).toBe('rgba(255,255,255,1)');
  });
});

describe('resolveSubtitleFontFamily', () => {
  it('maps the three settings values to CSS stacks with system fallback', () => {
    expect(resolveSubtitleFontFamily('serif')).toBe('Georgia, serif');
    expect(resolveSubtitleFontFamily('monospace')).toBe('monospace');
    expect(resolveSubtitleFontFamily('system')).toBe('system-ui, sans-serif');
    expect(resolveSubtitleFontFamily(undefined)).toBe('system-ui, sans-serif');
  });
});

function settings(overrides: Partial<SubtitleSettings> = {}): SubtitleSettings {
  return {
    position: 'bottom',
    fontSize: 16,
    fontSizeMode: 'fixed',
    backgroundOpacity: 0.7,
    enabled: true,
    fontFamily: 'system',
    stylePreset: 'classic',
    styleOverrides: {},
    displayMode: 'bilingual',
    translationTimeout: 30,
    preferredSubtitleLanguage: 'en',
    autoActivateSubtitles: false,
    disabledSubtitleSites: [],
    ...overrides,
  } as SubtitleSettings;
}

describe('shouldTeardownSubtitleSession', () => {
  it('tears down when subtitles are switched off or the active platform becomes disabled', () => {
    const cases: Array<[string, SubtitleSettings, SubtitleSettings]> = [
      ['subtitles switched off', settings({ enabled: true }), settings({ enabled: false })],
      [
        'active platform added to the disabled list',
        settings({ disabledSubtitleSites: [] }),
        settings({ disabledSubtitleSites: ['hbomax'] }),
      ],
      [
        'subtitles off and the platform disabled at once',
        settings({ enabled: true, disabledSubtitleSites: [] }),
        settings({ enabled: false, disabledSubtitleSites: ['hbomax'] }),
      ],
      [
        'missing disabledSubtitleSites list treated as empty',
        settings({ disabledSubtitleSites: undefined as unknown as string[] }),
        settings({ disabledSubtitleSites: ['hbomax'] }),
      ],
    ];

    for (const [label, prev, next] of cases) {
      expect(shouldTeardownSubtitleSession(prev, next, 'hbomax'), label).toBe(true);
    }
  });

  it('does not tear down when subtitles stay on or the active platform is unaffected', () => {
    const cases: Array<[string, SubtitleSettings, SubtitleSettings]> = [
      ['subtitles switched on', settings({ enabled: false }), settings({ enabled: true })],
      [
        'platform already disabled before the change',
        settings({ disabledSubtitleSites: ['hbomax'] }),
        settings({ disabledSubtitleSites: ['hbomax', 'youtube'] }),
      ],
      [
        'a different platform is disabled',
        settings({ disabledSubtitleSites: [] }),
        settings({ disabledSubtitleSites: ['youtube'] }),
      ],
      [
        'unrelated settings changes',
        settings({ fontSize: 16 }),
        settings({ fontSize: 24, displayMode: 'translation-only' }),
      ],
    ];

    for (const [label, prev, next] of cases) {
      expect(shouldTeardownSubtitleSession(prev, next, 'hbomax'), label).toBe(false);
    }
  });
});
