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
  isYoutubeAsrUrl,
  parseYoutubeJson3Words,
  applyYoutubeAsrResegment,
  parseAiAsrSegmentRanges,
  normalizeSegmentRanges,
  cuesFromSegmentRanges,
  buildAiAsrResegmentBatches,
  buildAiAsrResegmentSystemPrompt,
  prepareAsrUnitsForAi,
  prepareYoutubeAsrAiInput,
  AI_ASR_BATCH_SIZE,
  type AsrWord,
  type YoutubeJson3Event,
  type AsrTimedUnit,
} from '@/lib/youtubeAsrResegment';
import type { SubtitleCue } from '@/types/subtitle';

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

function hangingArticleWords(): AsrWord[] {
  return [
    { text: 'I', startMs: 0, endMs: 200 },
    { text: 'went', startMs: 200, endMs: 500 },
    { text: 'to', startMs: 500, endMs: 700 },
    { text: 'the', startMs: 1500, endMs: 1700 },
    { text: 'store', startMs: 1700, endMs: 2200 },
    { text: 'yesterday.', startMs: 2200, endMs: 2800 },
  ];
}

describe('flatten / language / split / merge pipeline pieces', () => {
  it('flattens JSON3 words (skipping empties, coarse offsets), resolves language tables, and splits/merges word groups', () => {
    const words = flattenJson3Words(ASR_EVENTS);
    expect(words.length).toBeGreaterThan(5);
    expect(words[0]).toMatchObject({ text: 'Hello', startMs: 0 });
    expect(words[1].startMs).toBe(400);

    expect(
      flattenJson3Words([
        {
          tStartMs: 0,
          dDurationMs: 1000,
          segs: [{ utf8: '\n' }, { utf8: '  ' }, { utf8: 'Valid', tOffsetMs: 0 }],
        },
      ]),
    ).toEqual([expect.objectContaining({ text: 'Valid' })]);

    const coarse = flattenJson3Words([
      {
        tStartMs: 1000,
        dDurationMs: 2000,
        segs: [{ utf8: 'Hello ' }, { utf8: 'world' }],
      },
    ]);
    expect(coarse.length).toBeGreaterThanOrEqual(1);
    expect(coarse[0].startMs).toBe(1000);
    expect(flattenJson3Words([])).toEqual([]);
    expect(flattenJson3Words([{ tStartMs: 0, dDurationMs: 100 }])).toEqual([]);

    expect(DEFAULT_YOUTUBE_ASR_CONFIG.enable).toBe(true);
    expect(DEFAULT_YOUTUBE_ASR_CONFIG.aiEnable).toBe(false);

    const en = resolveAsrLangConfig('en');
    expect(resolveAsrLangConfig('en-US')).toEqual(en);
    expect(resolveAsrLangConfig('EN_us')).toEqual(en);
    expect(resolveAsrLangConfig('vi')).toEqual(DEFAULT_YOUTUBE_ASR_CONFIG.langsConfig.base);

    const splitCfg = en.splitConfig;
    const gapGroups = splitWords(
      [
        { text: 'Hello', startMs: 0, endMs: 300 },
        { text: 'there', startMs: 300, endMs: 600 },
        { text: 'Friend', startMs: 1600, endMs: 2000 },
      ],
      { ...splitCfg, minIntervalMs: 500 },
    );
    expect(gapGroups).toHaveLength(2);

    const maxWordGroups = splitWords(
      Array.from({ length: 10 }, (_, i) => ({
        text: `w${i}`,
        startMs: i * 100,
        endMs: i * 100 + 80,
      })),
      { ...splitCfg, maxWords: 4, minIntervalMs: 10_000 },
    );
    expect(maxWordGroups).toHaveLength(3);

    const punctGroups = splitWords(
      [
        { text: 'Done.', startMs: 0, endMs: 400 },
        { text: 'Next', startMs: 450, endMs: 700 },
      ],
      { ...splitCfg, minIntervalMs: 10_000, maxWords: 50 },
    );
    expect(punctGroups).toHaveLength(2);

    const mergeCfg = en.mergeConfig;
    const hang = mergeHangingGroups(
      [
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
      ],
      mergeCfg,
    );
    expect(hang).toHaveLength(1);

    const startWord = mergeHangingGroups(
      [
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
      ],
      mergeCfg,
    );
    expect(startWord).toHaveLength(1);

    expect(
      mergeEndCompatible(
        [
          {
            words: [
              { text: 'This', startMs: 0, endMs: 200 },
              { text: 'is', startMs: 200, endMs: 400 },
              { text: 'a', startMs: 400, endMs: 500 },
              { text: 'long', startMs: 500, endMs: 800 },
              { text: 'sentence', startMs: 800, endMs: 1200 },
            ],
          },
          { words: [{ text: 'ok', startMs: 1300, endMs: 1500 }] },
        ],
        [{ maxWords: 3, maxDurationMs: 1200 }],
      ),
    ).toHaveLength(1);

    expect(
      mergeEndCompatible(
        [
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
        ],
        [{ maxWords: 3, maxDurationMs: 1200 }],
      ),
    ).toHaveLength(2);
  });
});

describe('resegmentYoutubeAsr entry points', () => {
  it('word-level, hanging-article, cue-level, empty, and base-language paths', () => {
    const words = flattenJson3Words(ASR_EVENTS);
    const cues = resegmentYoutubeAsr({ words, language: 'en' });
    expect(cues.length).toBeGreaterThan(0);
    expect(cues.length).toBeLessThan(words.length);
    expect(cues.every((c) => c.text.trim().length > 0)).toBe(true);

    const hangCues = resegmentFromWords(hangingArticleWords(), resolveAsrLangConfig('en'));
    expect(hangCues.length).toBeLessThanOrEqual(2);
    expect(hangCues.map((c) => c.text).join(' ')).toMatch(/store/i);

    const coarse: SubtitleCue[] = [
      { startTime: 0, endTime: 1.0, text: 'I went to' },
      { startTime: 1.1, endTime: 2.5, text: 'the store yesterday.' },
      { startTime: 5.0, endTime: 6.0, text: 'Bye.' },
    ];
    const fromCues = resegmentYoutubeAsr({ cues: coarse, language: 'en' });
    expect(fromCues[0].text).toMatch(/store/i);

    expect(resegmentYoutubeAsr({})).toEqual([]);
    expect(resegmentYoutubeAsr({ words: [], cues: [] })).toEqual([]);

    const viWords: AsrWord[] = [
      { text: 'xin', startMs: 0, endMs: 200 },
      { text: 'chào', startMs: 200, endMs: 500 },
      { text: 'bạn', startMs: 1500, endMs: 1800 },
    ];
    expect(resegmentYoutubeAsr({ words: viWords, language: 'vi' })).toHaveLength(2);

    const lang = resolveAsrLangConfig('en');
    const long = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    expect(
      resegmentFromCues(
        [{ startTime: 0, endTime: 10, text: long }],
        { ...lang, splitConfig: { ...lang.splitConfig, maxWords: 10 } },
      ).length,
    ).toBeGreaterThan(1);
  });
});

describe('AI ASR parse / normalize / prepare', () => {
  const units: AsrTimedUnit[] = [
    { text: 'Hello', startMs: 0, endMs: 300 },
    { text: 'there', startMs: 300, endMs: 600 },
    { text: 'friend', startMs: 600, endMs: 1000 },
    { text: 'how', startMs: 1200, endMs: 1400 },
    { text: 'are', startMs: 1400, endMs: 1600 },
    { text: 'you', startMs: 1600, endMs: 1900 },
  ];

  it('parses ranges, normalizes partitions, builds cues/batches, prepares units', () => {
    expect(
      parseAiAsrSegmentRanges(
        JSON.stringify({ segments: [{ start: 0, end: 2 }, { start: 3, end: 5 }] }),
        6,
      ),
    ).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
    ]);
    expect(parseAiAsrSegmentRanges('```json\n{"segments":[{"start":0,"end":5}]}\n```', 6)).toEqual([
      { start: 0, end: 5 },
    ]);
    expect(parseAiAsrSegmentRanges('', 6)).toBeNull();
    expect(parseAiAsrSegmentRanges('not json', 6)).toBeNull();
    expect(parseAiAsrSegmentRanges('{"segments":[]}', 6)).toBeNull();

    const normalized = normalizeSegmentRanges(
      [
        { start: 0, end: 1 },
        { start: 1, end: 3 },
        { start: 4, end: 5 },
      ],
      6,
    );
    const covered = new Set<number>();
    for (const r of normalized) {
      for (let i = r.start; i <= r.end; i++) covered.add(i);
    }
    expect([...covered].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);

    const cues = cuesFromSegmentRanges(units, [
      { start: 0, end: 2 },
      { start: 3, end: 5 },
    ]);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toMatch(/Hello there friend/i);
    expect(cues[0].endTime).toBe(1);
    expect(cues[1].startTime).toBe(1.2);

    const many: AsrTimedUnit[] = Array.from({ length: AI_ASR_BATCH_SIZE + 5 }, (_, i) => ({
      text: `w${i}`,
      startMs: i * 100,
      endMs: i * 100 + 80,
    }));
    const batches = buildAiAsrResegmentBatches(many, 'en-US');
    expect(batches).toHaveLength(2);
    expect(batches[0].userPrompt).toContain('en-US');
    expect(buildAiAsrResegmentSystemPrompt()).toMatch(/do NOT translate/i);

    const words: AsrWord[] = [{ text: 'a', startMs: 0, endMs: 100 }];
    const cueUnits: SubtitleCue[] = [{ startTime: 0, endTime: 1, text: 'cue' }];
    expect(prepareAsrUnitsForAi(words, cueUnits)[0].text).toBe('a');
    expect(prepareAsrUnitsForAi(undefined, cueUnits)[0].text).toBe('cue');

    const body = JSON.stringify({
      events: [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          segs: [
            { utf8: 'Hi ', tOffsetMs: 0 },
            { utf8: 'there', tOffsetMs: 400 },
          ],
        },
      ],
    });
    expect(
      prepareYoutubeAsrAiInput({
        body,
        cues: [{ startTime: 0, endTime: 1, text: 'fallback' }],
      }),
    ).toHaveLength(2);
  });
});

describe('URL / JSON3 parse + coordinator gate', () => {
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

  it('detects ASR URLs, parses JSON3 words fail-open, and gates resegment application by platform/flags', () => {
    expect(isYoutubeAsrUrl(asrUrl)).toBe(true);
    expect(isYoutubeAsrUrl(humanUrl)).toBe(false);

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
    expect(words).toHaveLength(3);
    expect(words[1]).toMatchObject({ text: 'world', startMs: 500 });
    expect(parseYoutubeJson3Words('')).toEqual([]);
    expect(parseYoutubeJson3Words('not-json')).toEqual([]);

    const enabled = applyYoutubeAsrResegment({
      platform: 'youtube',
      url: asrUrl,
      body: fragmentedBody,
      cues: rawCues,
      language: 'en',
      enable: true,
    });
    expect(enabled.length).toBeGreaterThan(0);
    expect(enabled.length).toBeLessThanOrEqual(rawCues.length);
    expect(enabled.map((c) => c.text).join(' ')).toMatch(/store/i);

    expect(
      applyYoutubeAsrResegment({
        platform: 'youtube',
        url: asrUrl,
        body: fragmentedBody,
        cues: rawCues,
        language: 'en',
        enable: false,
      }),
    ).toEqual(rawCues);

    expect(
      applyYoutubeAsrResegment({
        platform: 'youtube',
        url: humanUrl,
        body: fragmentedBody,
        cues: rawCues,
        language: 'en',
        enable: true,
        isAutoGenerated: false,
      }),
    ).toEqual(rawCues);

    expect(
      applyYoutubeAsrResegment({
        platform: 'udemy',
        url: asrUrl,
        body: fragmentedBody,
        cues: rawCues,
        language: 'en',
        enable: true,
      }),
    ).toEqual(rawCues);

    const auto = applyYoutubeAsrResegment({
      platform: 'youtube',
      url: humanUrl,
      body: fragmentedBody,
      cues: rawCues,
      language: 'en',
      enable: true,
      isAutoGenerated: true,
    });
    expect(auto).not.toEqual(rawCues);

    const badBody = applyYoutubeAsrResegment({
      platform: 'youtube',
      url: asrUrl,
      body: '<<<not-json>>>',
      cues: rawCues,
      language: 'en',
      enable: true,
    });
    expect(badBody.length).toBeGreaterThan(0);
  });
});
