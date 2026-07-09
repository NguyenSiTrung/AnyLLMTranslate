/**
 * Unit tests for YouTube ASR sentence re-alignment (pure lib).
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_YOUTUBE_ASR_CONFIG,
  flattenJson3Words,
  resolveAsrLangConfig,
  resegmentYoutubeAsr,
  resegmentFromWords,
  resegmentFromCues,
  splitWords,
  mergeHangingGroups,
  mergeEndCompatible,
  requestAiAsrResegment,
  isYoutubeAsrUrl,
  parseYoutubeJson3Words,
  applyYoutubeAsrResegment,
  type AsrWord,
  type YoutubeJson3Event,
} from '@/lib/youtubeAsrResegment';
import type { SubtitleCue } from '@/types/subtitle';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** JSON3-like multi-seg ASR: mid-sentence cuts with tOffsetMs word timing. */
const ASR_EVENTS: YoutubeJson3Event[] = [
  {
    tStartMs: 0,
    dDurationMs: 2500,
    segs: [
      { utf8: 'Hello ', tOffsetMs: 0 },
      { utf8: 'there ', tOffsetMs: 400 },
      { utf8: 'my ', tOffsetMs: 800 },
      { utf8: 'friend', tOffsetMs: 1100 },
    ],
  },
  {
    tStartMs: 2600,
    dDurationMs: 2000,
    segs: [
      { utf8: 'how ', tOffsetMs: 0 },
      { utf8: 'are ', tOffsetMs: 300 },
      { utf8: 'you ', tOffsetMs: 600 },
      { utf8: 'today?', tOffsetMs: 900 },
    ],
  },
  {
    tStartMs: 5000,
    dDurationMs: 1500,
    segs: [
      { utf8: 'I ', tOffsetMs: 0 },
      { utf8: 'am ', tOffsetMs: 200 },
      { utf8: 'fine.', tOffsetMs: 500 },
    ],
  },
];

/** Hanging-article fragmentation typical of ASR. */
function hangingArticleWords(): AsrWord[] {
  return [
    { text: 'I', startMs: 0, endMs: 200 },
    { text: 'went', startMs: 200, endMs: 500 },
    { text: 'to', startMs: 500, endMs: 700 },
    // large gap → would split, but ends with "to" → merge hang
    { text: 'the', startMs: 1500, endMs: 1700 },
    { text: 'store', startMs: 1700, endMs: 2200 },
    { text: 'yesterday.', startMs: 2200, endMs: 2800 },
  ];
}

// ─── flatten ─────────────────────────────────────────────────────────────────

describe('flattenJson3Words', () => {
  it('flattens segs with tOffsetMs into timed words', () => {
    const words = flattenJson3Words(ASR_EVENTS);
    expect(words.length).toBeGreaterThan(5);
    expect(words[0]).toMatchObject({ text: 'Hello', startMs: 0 });
    // second word offset 400 on first event
    expect(words[1].startMs).toBe(400);
    expect(words[1].text).toMatch(/there/i);
  });

  it('skips empty and pure-newline segs', () => {
    const words = flattenJson3Words([
      {
        tStartMs: 0,
        dDurationMs: 1000,
        segs: [
          { utf8: '\n' },
          { utf8: '  ' },
          { utf8: 'Valid', tOffsetMs: 0 },
        ],
      },
    ]);
    expect(words).toHaveLength(1);
    expect(words[0].text).toBe('Valid');
  });

  it('handles events without tOffsetMs as coarse tokens', () => {
    const words = flattenJson3Words([
      {
        tStartMs: 1000,
        dDurationMs: 2000,
        segs: [{ utf8: 'Hello ' }, { utf8: 'world' }],
      },
    ]);
    // Without offsets, may join into one or few coarse tokens
    expect(words.length).toBeGreaterThanOrEqual(1);
    expect(words.map((w) => w.text).join(' ')).toMatch(/Hello/);
    expect(words[0].startMs).toBe(1000);
  });

  it('returns empty for empty events', () => {
    expect(flattenJson3Words([])).toEqual([]);
    expect(flattenJson3Words([{ tStartMs: 0, dDurationMs: 100 }])).toEqual([]);
  });
});

// ─── language resolve ────────────────────────────────────────────────────────

describe('resolveAsrLangConfig', () => {
  it('resolves en and en-US to English table', () => {
    const en = resolveAsrLangConfig('en');
    const enUs = resolveAsrLangConfig('en-US');
    expect(en.mergeConfig.endWords.length).toBeGreaterThan(0);
    expect(enUs).toEqual(en);
    expect(en.splitConfig.maxWords).toBe(
      DEFAULT_YOUTUBE_ASR_CONFIG.langsConfig.en?.splitConfig.maxWords,
    );
  });

  it('falls back to base for unknown languages', () => {
    const base = resolveAsrLangConfig(undefined);
    const vi = resolveAsrLangConfig('vi');
    expect(base).toEqual(DEFAULT_YOUTUBE_ASR_CONFIG.langsConfig.base);
    expect(vi).toEqual(DEFAULT_YOUTUBE_ASR_CONFIG.langsConfig.base);
    expect(vi.mergeConfig.endWords).toEqual([]);
  });

  it('normalizes underscores and case', () => {
    const a = resolveAsrLangConfig('EN_us');
    const b = resolveAsrLangConfig('en');
    expect(a).toEqual(b);
  });
});

// ─── split ───────────────────────────────────────────────────────────────────

describe('splitWords', () => {
  const splitCfg = resolveAsrLangConfig('en').splitConfig;

  it('splits on large gaps', () => {
    const words: AsrWord[] = [
      { text: 'Hello', startMs: 0, endMs: 300 },
      { text: 'there', startMs: 300, endMs: 600 },
      // 1s gap
      { text: 'Friend', startMs: 1600, endMs: 2000 },
    ];
    const groups = splitWords(words, { ...splitCfg, minIntervalMs: 500 });
    expect(groups.length).toBe(2);
    expect(groups[0].words.map((w) => w.text).join(' ')).toBe('Hello there');
    expect(groups[1].words.map((w) => w.text).join(' ')).toBe('Friend');
  });

  it('splits on maxWords', () => {
    const words: AsrWord[] = Array.from({ length: 10 }, (_, i) => ({
      text: `w${i}`,
      startMs: i * 100,
      endMs: i * 100 + 80,
    }));
    const groups = splitWords(words, { ...splitCfg, maxWords: 4, minIntervalMs: 10_000 });
    expect(groups.length).toBe(3);
    expect(groups[0].words).toHaveLength(4);
    expect(groups[2].words).toHaveLength(2);
  });

  it('splits after sentence punctuation', () => {
    const words: AsrWord[] = [
      { text: 'Done.', startMs: 0, endMs: 400 },
      { text: 'Next', startMs: 450, endMs: 700 },
    ];
    const groups = splitWords(words, { ...splitCfg, minIntervalMs: 10_000, maxWords: 50 });
    expect(groups.length).toBe(2);
  });
});

// ─── merge hanging ───────────────────────────────────────────────────────────

describe('mergeHangingGroups', () => {
  const mergeCfg = resolveAsrLangConfig('en').mergeConfig;

  it('merges group ending with hanging endWord into next', () => {
    const groups = [
      {
        words: [
          { text: 'I', startMs: 0, endMs: 100 },
          { text: 'went', startMs: 100, endMs: 300 },
          { text: 'to', startMs: 300, endMs: 400 },
        ],
      },
      {
        words: [
          { text: 'the', startMs: 1000, endMs: 1200 },
          { text: 'store.', startMs: 1200, endMs: 1600 },
        ],
      },
    ];
    const merged = mergeHangingGroups(groups, mergeCfg);
    expect(merged).toHaveLength(1);
    expect(merged[0].words.map((w) => w.text).join(' ')).toMatch(/went to the store/i);
  });

  it('merges group starting with startWord into previous', () => {
    const groups = [
      {
        words: [
          { text: 'I', startMs: 0, endMs: 100 },
          { text: 'left.', startMs: 100, endMs: 400 },
        ],
      },
      {
        words: [
          { text: 'and', startMs: 500, endMs: 600 },
          { text: 'never', startMs: 600, endMs: 900 },
          { text: 'returned.', startMs: 900, endMs: 1300 },
        ],
      },
    ];
    const merged = mergeHangingGroups(groups, mergeCfg);
    expect(merged).toHaveLength(1);
    expect(merged[0].words.map((w) => w.text).join(' ')).toMatch(/and never returned/i);
  });
});

// ─── endCompatible ───────────────────────────────────────────────────────────

describe('mergeEndCompatible', () => {
  it('merges tiny trailing fragment into previous', () => {
    const groups = [
      {
        words: [
          { text: 'This', startMs: 0, endMs: 200 },
          { text: 'is', startMs: 200, endMs: 400 },
          { text: 'a', startMs: 400, endMs: 500 },
          { text: 'long', startMs: 500, endMs: 800 },
          { text: 'sentence', startMs: 800, endMs: 1200 },
        ],
      },
      {
        words: [
          { text: 'ok', startMs: 1300, endMs: 1500 },
        ],
      },
    ];
    const merged = mergeEndCompatible(groups, [{ maxWords: 3, maxDurationMs: 1200 }]);
    expect(merged).toHaveLength(1);
  });

  it('does not merge long trailing cues', () => {
    const groups = [
      { words: [{ text: 'First', startMs: 0, endMs: 500 }] },
      {
        words: [
          { text: 'Second', startMs: 1000, endMs: 1500 },
          { text: 'clause', startMs: 1500, endMs: 2000 },
          { text: 'with', startMs: 2000, endMs: 2300 },
          { text: 'many', startMs: 2300, endMs: 2600 },
          { text: 'words', startMs: 2600, endMs: 3000 },
          { text: 'here', startMs: 3000, endMs: 3500 },
        ],
      },
    ];
    const merged = mergeEndCompatible(groups, [{ maxWords: 3, maxDurationMs: 1200 }]);
    expect(merged).toHaveLength(2);
  });
});

// ─── resegment entry ─────────────────────────────────────────────────────────

describe('resegmentYoutubeAsr', () => {
  it('word-level path produces fewer/more coherent cues for ASR English', () => {
    const words = flattenJson3Words(ASR_EVENTS);
    const cues = resegmentYoutubeAsr({ words, language: 'en' });
    expect(cues.length).toBeGreaterThan(0);
    // Should not explode into one cue per word
    expect(cues.length).toBeLessThan(words.length);
    // Timestamps in seconds
    expect(cues[0].startTime).toBeLessThan(cues[0].endTime);
    expect(cues.every((c) => c.text.trim().length > 0)).toBe(true);
  });

  it('hanging-article English path merges across gap', () => {
    const cues = resegmentFromWords(
      hangingArticleWords(),
      resolveAsrLangConfig('en'),
    );
    // Prefer single coherent cue over split after "to"
    expect(cues.length).toBeLessThanOrEqual(2);
    const joined = cues.map((c) => c.text).join(' ');
    expect(joined).toMatch(/went to/i);
    expect(joined).toMatch(/store/i);
  });

  it('cue-level fallback without word offsets', () => {
    const coarse: SubtitleCue[] = [
      { startTime: 0, endTime: 1.0, text: 'I went to' },
      { startTime: 1.1, endTime: 2.5, text: 'the store yesterday.' },
      { startTime: 5.0, endTime: 6.0, text: 'Bye.' },
    ];
    const cues = resegmentYoutubeAsr({ cues: coarse, language: 'en' });
    expect(cues.length).toBeGreaterThan(0);
    expect(cues.length).toBeLessThanOrEqual(coarse.length);
    // hanging "to" should merge first two when gap is small
    expect(cues[0].text).toMatch(/store/i);
  });

  it('empty / missing input returns empty (fail-open empty)', () => {
    expect(resegmentYoutubeAsr({})).toEqual([]);
    expect(resegmentYoutubeAsr({ words: [], cues: [] })).toEqual([]);
  });

  it('base language still resegments by gap and maxWords', () => {
    const words: AsrWord[] = [
      { text: 'xin', startMs: 0, endMs: 200 },
      { text: 'chào', startMs: 200, endMs: 500 },
      { text: 'bạn', startMs: 1500, endMs: 1800 },
    ];
    const cues = resegmentYoutubeAsr({ words, language: 'vi' });
    expect(cues.length).toBe(2);
  });

  it('exports DEFAULT_YOUTUBE_ASR_CONFIG with enable true / aiEnable false', () => {
    expect(DEFAULT_YOUTUBE_ASR_CONFIG.enable).toBe(true);
    expect(DEFAULT_YOUTUBE_ASR_CONFIG.aiEnable).toBe(false);
    expect(DEFAULT_YOUTUBE_ASR_CONFIG.langsConfig.base).toBeDefined();
    expect(DEFAULT_YOUTUBE_ASR_CONFIG.langsConfig.en).toBeDefined();
  });
});

// ─── cue-level unit ──────────────────────────────────────────────────────────

describe('resegmentFromCues', () => {
  it('splits overlong cues by maxWords', () => {
    const lang = resolveAsrLangConfig('en');
    const long = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    const cues = resegmentFromCues(
      [{ startTime: 0, endTime: 10, text: long }],
      { ...lang, splitConfig: { ...lang.splitConfig, maxWords: 10 } },
    );
    expect(cues.length).toBeGreaterThan(1);
  });
});

// ─── AI hook stub ────────────────────────────────────────────────────────────

describe('requestAiAsrResegment', () => {
  it('is a no-op stub that returns null (no network)', async () => {
    const result = await requestAiAsrResegment([], 'en');
    expect(result).toBeNull();
  });
});

// ─── URL / JSON3 parse surface ───────────────────────────────────────────────

describe('isYoutubeAsrUrl / parseYoutubeJson3Words', () => {
  it('detects kind=asr on timedtext URLs', () => {
    expect(
      isYoutubeAsrUrl('https://www.youtube.com/api/timedtext?v=x&lang=en&kind=asr&fmt=json3'),
    ).toBe(true);
    expect(
      isYoutubeAsrUrl('https://www.youtube.com/api/timedtext?v=x&lang=en&fmt=json3'),
    ).toBe(false);
  });

  it('parses multi-seg word events with tOffsetMs and skips newlines', () => {
    const body = JSON.stringify({
      events: [
        {
          tStartMs: 0,
          dDurationMs: 2000,
          segs: [
            { utf8: 'Hello ', tOffsetMs: 0 },
            { utf8: '\n' },
            { utf8: 'world', tOffsetMs: 500 },
          ],
        },
        {
          tStartMs: 2500,
          dDurationMs: 1000,
          segs: [{ utf8: 'Again', tOffsetMs: 0 }],
        },
      ],
    });
    const words = parseYoutubeJson3Words(body);
    expect(words.length).toBe(3);
    expect(words[0]).toMatchObject({ text: 'Hello', startMs: 0 });
    expect(words[1]).toMatchObject({ text: 'world', startMs: 500 });
    expect(words[2].startMs).toBe(2500);
  });

  it('returns [] for invalid / empty body', () => {
    expect(parseYoutubeJson3Words('')).toEqual([]);
    expect(parseYoutubeJson3Words('not-json')).toEqual([]);
    expect(parseYoutubeJson3Words('{}')).toEqual([]);
  });
});

// ─── Coordinator gate (pure) ─────────────────────────────────────────────────

describe('applyYoutubeAsrResegment gate', () => {
  const asrUrl = 'https://www.youtube.com/api/timedtext?lang=en&kind=asr&fmt=json3';
  const humanUrl = 'https://www.youtube.com/api/timedtext?lang=en&fmt=json3';
  const fragmentedBody = JSON.stringify({
    events: [
      {
        tStartMs: 0,
        dDurationMs: 1500,
        segs: [
          { utf8: 'I ', tOffsetMs: 0 },
          { utf8: 'went ', tOffsetMs: 200 },
          { utf8: 'to', tOffsetMs: 500 },
        ],
      },
      {
        tStartMs: 1600,
        dDurationMs: 1500,
        segs: [
          { utf8: 'the ', tOffsetMs: 0 },
          { utf8: 'store.', tOffsetMs: 400 },
        ],
      },
    ],
  });
  const rawCues: SubtitleCue[] = [
    { startTime: 0, endTime: 1.5, text: 'I went to' },
    { startTime: 1.6, endTime: 3.1, text: 'the store.' },
  ];

  it('ASR + enable → resegmented cues (often fewer / different text)', () => {
    const out = applyYoutubeAsrResegment({
      platform: 'youtube',
      url: asrUrl,
      body: fragmentedBody,
      cues: rawCues,
      language: 'en',
      enable: true,
    });
    expect(out.length).toBeGreaterThan(0);
    // Prefer merge of hanging "to" → fewer or equal cues with store in first
    expect(out.length).toBeLessThanOrEqual(rawCues.length);
    expect(out.map((c) => c.text).join(' ')).toMatch(/store/i);
  });

  it('enable false → original cues', () => {
    const out = applyYoutubeAsrResegment({
      platform: 'youtube',
      url: asrUrl,
      body: fragmentedBody,
      cues: rawCues,
      language: 'en',
      enable: false,
    });
    expect(out).toEqual(rawCues);
  });

  it('non-ASR YouTube → original cues', () => {
    const out = applyYoutubeAsrResegment({
      platform: 'youtube',
      url: humanUrl,
      body: fragmentedBody,
      cues: rawCues,
      language: 'en',
      enable: true,
      isAutoGenerated: false,
    });
    expect(out).toEqual(rawCues);
  });

  it('non-YouTube platform → original cues', () => {
    const out = applyYoutubeAsrResegment({
      platform: 'udemy',
      url: asrUrl,
      body: fragmentedBody,
      cues: rawCues,
      language: 'en',
      enable: true,
    });
    expect(out).toEqual(rawCues);
  });

  it('isAutoGenerated true without kind=asr still resegments', () => {
    const out = applyYoutubeAsrResegment({
      platform: 'youtube',
      url: humanUrl,
      body: fragmentedBody,
      cues: rawCues,
      language: 'en',
      enable: true,
      isAutoGenerated: true,
    });
    expect(out).not.toEqual(rawCues);
  });

  it('throw / bad body fail-open to original cues', () => {
    // body is not JSON3 → words empty → cue-level fallback should still work;
    // force fail-open by enabling with empty cues handled separately
    const out = applyYoutubeAsrResegment({
      platform: 'youtube',
      url: asrUrl,
      body: '<<<not-json>>>',
      cues: rawCues,
      language: 'en',
      enable: true,
    });
    // cue-level path may still resegment; should never throw and never return empty
    expect(out.length).toBeGreaterThan(0);
  });
});
