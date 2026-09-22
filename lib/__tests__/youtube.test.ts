import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAsrRealignCacheKey,
  canonicalizeAsrRealignInput,
  hashAsrRealignContent,
  youtubeWatchUrl,
  youtubeThumbnailUrl,
  stripYoutubeTitleSuffix,
  estimateAsrRealignEntryBytes,
  toAsrRealignSummary,
  pickLruKeysToEvict,
  sortAsrRealignSummaries,
  formatAsrRealignBytes,
  extractYoutubeVideoIdFromUrl,
  type YoutubeAsrRealignCacheEntry,
} from '@/lib/youtubeAsrRealignCache';
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
  flattenXmlWords,
  parseYoutubeJson3Words,
  parseYoutubeWords,
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
import type { AvailableSubtitleTrack, SubtitleCue } from '@/types/subtitle';
import {
  extractPlayerResponseFromWatchHtml,
  selectAsrTrack,
  buildJson3TimedtextUrl,
} from '@/lib/youtubeWatchPage';
import { YouTubeHandler } from '@/inject/subtitleHandlers/youtube';

const units = [
  { text: 'Hello', startMs: 0, endMs: 400 },
  { text: 'world', startMs: 400, endMs: 900 },
];

describe('youtubeAsrRealignCache pure helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn(async (_algo: string, data: ArrayBuffer) => {
          const bytes = new Uint8Array(data);
          const out = new Uint8Array(32);
          for (let i = 0; i < bytes.length; i++) out[i % 32] ^= bytes[i];
          return out.buffer;
        }),
      },
    });
  });

  it('covers canonicalization, hashing, URLs, summaries, formatting, and LRU eviction', async () => {
    expect(canonicalizeAsrRealignInput(units)).toBe('Hello\t0\t400\nworld\t400\t900');
    const a = await hashAsrRealignContent(units);
    const b = await hashAsrRealignContent([...units].reverse().reverse());
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    const c = await hashAsrRealignContent([{ ...units[0], text: 'Hello!' }, units[1]]);
    expect(c).not.toBe(a);

    expect(buildAsrRealignCacheKey('abc123', 'en', 'deadbeef')).toBe('ai:abc123:en:deadbeef');
    expect(youtubeWatchUrl('abc123')).toBe('https://www.youtube.com/watch?v=abc123');
    expect(youtubeThumbnailUrl('abc123')).toBe('https://i.ytimg.com/vi/abc123/mqdefault.jpg');
    expect(stripYoutubeTitleSuffix('My Video - YouTube')).toBe('My Video');
    expect(stripYoutubeTitleSuffix('Plain')).toBe('Plain');
    expect(extractYoutubeVideoIdFromUrl('https://www.youtube.com/watch?v=abc123&t=10')).toBe(
      'abc123',
    );
    expect(extractYoutubeVideoIdFromUrl('https://youtu.be/xyz789')).toBe('xyz789');
    expect(extractYoutubeVideoIdFromUrl('https://www.youtube.com/live/livestream1')).toBe(
      'livestream1',
    );
    expect(extractYoutubeVideoIdFromUrl('https://www.youtube.com/shorts/short1')).toBe('short1');
    expect(extractYoutubeVideoIdFromUrl('https://www.youtube.com/embed/emb1')).toBe('emb1');
    expect(extractYoutubeVideoIdFromUrl('https://example.com')).toBeUndefined();
    const entry: YoutubeAsrRealignCacheEntry = {
      key: 'ai:v:en:h',
      videoId: 'v',
      language: 'en',
      mode: 'ai',
      cueCount: 1,
      byteSize: 0,
      contentHash: 'h',
      createdAt: 10,
      lastUsedAt: 20,
      cues: [{ startTime: 0, endTime: 1, text: 'hi' }],
    };
    const bytes = estimateAsrRealignEntryBytes(entry);
    expect(bytes).toBeGreaterThan(10);
    const summary = toAsrRealignSummary({ ...entry, byteSize: bytes });
    expect(summary).not.toHaveProperty('cues');
    expect(summary.byteSize).toBe(bytes);
    expect(formatAsrRealignBytes(0)).toBe('0 B');
    expect(formatAsrRealignBytes(2048)).toMatch(/KB/);

    const sorted = sortAsrRealignSummaries(
      [
        { ...summary, key: 'a', lastUsedAt: 1, createdAt: 100 },
        { ...summary, key: 'b', lastUsedAt: 50, createdAt: 10 },
      ],
      'lastUsed',
    );
    expect(sorted.map((s) => s.key)).toEqual(['b', 'a']);

    // 2 existing + 1 incoming exceeds maxEntries=2 → evict oldest only
    // (byte budget high enough that size alone does not force a second victim)
    const victims = pickLruKeysToEvict(
      [
        { key: 'old', lastUsedAt: 1, byteSize: 100 },
        { key: 'new', lastUsedAt: 9, byteSize: 100 },
      ],
      { maxEntries: 2, maxBytes: 500, incomingBytes: 80 },
    );
    expect(victims).toEqual(['old']);
  });
});

/**
 * Unit tests for YouTube ASR sentence re-alignment (pure lib).
 */


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

describe('XML (srv1 / srv3) word parsing + hardening', () => {
  it('parses srv3/srv1 XML, ignores non-YouTube XML, prefers JSON3, treats tlang as non-ASR, and blocks tail-merge by word count', () => {
    // facet: srv3 <p t d>/<s t> word-level units with offsets
    const srv3 =
      '<?xml version="1.0" encoding="utf-8"?><timedtext format="3"><body>' +
      '<p t="1230" d="4560"><s t="0">Hello</s><s t="500">world</s><s t="1200">again.</s></p>' +
      '<p t="6000" d="2000"><s t="0">Bye</s></p>' +
      '</body></timedtext>';
    const srv3Words = flattenXmlWords(srv3);
    expect(srv3Words.map((w) => w.text)).toEqual(['Hello', 'world', 'again.', 'Bye']);
    expect(srv3Words[0]).toMatchObject({ startMs: 1230, endMs: 1730 });
    expect(srv3Words[1]).toMatchObject({ startMs: 1730 });
    // Last word of a paragraph ends at t + d.
    expect(srv3Words[2].endMs).toBe(5790);
    expect(srv3Words[3]).toMatchObject({ startMs: 6000, endMs: 8000 });

    // facet: srv1 <text start dur> (seconds) as one coarse token per cue
    const srv1 =
      '<?xml version="1.0"?><transcript>' +
      '<text start="1.5" dur="2.5">Tom &amp; Jerry &lt;3</text>' +
      '<text start="5" dur="1">Bye</text>' +
      '</transcript>';
    const srv1Words = flattenXmlWords(srv1);
    expect(srv1Words).toEqual([
      { text: 'Tom & Jerry <3', startMs: 1500, endMs: 4000 },
      { text: 'Bye', startMs: 5000, endMs: 6000 },
    ]);

    // facet: ignores non-YouTube XML (TTML <p begin/end>)
    const ttml = '<tt><body><div><p begin="00:00:01.000" end="00:00:03.000">Hi</p></div></body></tt>';
    expect(flattenXmlWords(ttml)).toEqual([]);
    expect(flattenXmlWords('')).toEqual([]);

    // facet: parseYoutubeWords prefers JSON3 and falls back to XML
    const jsonBody = JSON.stringify({
      events: [{ tStartMs: 0, dDurationMs: 900, segs: [{ utf8: 'Hi', tOffsetMs: 0 }] }],
    });
    expect(parseYoutubeWords(jsonBody).map((w) => w.text)).toEqual(['Hi']);
    expect(
      parseYoutubeWords(
        '<timedtext><text start="0" dur="1">Fallback</text></timedtext>',
      ).map((w) => w.text),
    ).toEqual(['Fallback']);
    expect(parseYoutubeWords('not-a-subtitle')).toEqual([]);

    // facet: treats a tlang (auto-translate) URL as non-ASR
    expect(isYoutubeAsrUrl('https://www.youtube.com/api/timedtext?v=x&lang=en&kind=asr')).toBe(true);
    expect(
      isYoutubeAsrUrl('https://www.youtube.com/api/timedtext?v=x&lang=en&kind=asr&tlang=vi'),
    ).toBe(false);

    // facet: does not tail-merge a long trailing cue on duration alone (cue path)
    const lang = resolveAsrLangConfig('en');
    const cues: SubtitleCue[] = [
      { startTime: 0, endTime: 3, text: 'This is the first sentence.' },
      { startTime: 3.1, endTime: 4.2, text: 'one two three four five six seven eight' },
    ];
    // 8 words in 1.1s: under the duration cap but far over maxWords (3/5) — the
    // real word count must block the merge (it used to be reported as 1 word).
    const out = resegmentFromCues(cues, lang);
    expect(out).toHaveLength(2);
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

const TRACKS = {
  captionTracks: [
    {
      baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en',
      name: { simpleText: 'English' },
      languageCode: 'en',
    },
    {
      baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en&kind=asr',
      name: { simpleText: 'English (auto-generated)' },
      languageCode: 'en',
      kind: 'asr',
    },
  ],
};

function playerResponseJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    videoDetails: {
      videoId: 'abc123',
      title: 'Sample Video - YouTube',
    },
    captions: {
      playerCaptionsTracklistRenderer: TRACKS,
    },
    ...overrides,
  });
}

function watchHtml(playerResponse: string, opts: { prefix?: string; suffix?: string } = {}): string {
  const { prefix = 'var ', suffix = ';' } = opts;
  return `<!doctype html><html><head><script>ytcfg.set({"a":1});</script></head>` +
    `<body><script>${prefix}ytInitialPlayerResponse = ${playerResponse}${suffix}` +
    `var ytInitialData = {};</script></body></html>`;
}

describe('extractPlayerResponseFromWatchHtml', () => {
  it('extracts standard and variant assignments, including braces and escaped strings', () => {
    const json = playerResponseJson();
    const result = extractPlayerResponseFromWatchHtml(watchHtml(json));
    expect(result).not.toBeNull();
    expect(result?.data?.videoDetails).toMatchObject({ videoId: 'abc123' });
    expect(JSON.parse(result!.rawJson)).toEqual(JSON.parse(json));

    const noVar = extractPlayerResponseFromWatchHtml(watchHtml(json, { prefix: '' }));
    expect(noVar?.data?.videoDetails).toMatchObject({ videoId: 'abc123' });
    const windowPrefix = extractPlayerResponseFromWatchHtml(
      watchHtml(json, { prefix: 'window.' }),
    );
    expect(windowPrefix?.data?.videoDetails).toMatchObject({ videoId: 'abc123' });
    const spaced = extractPlayerResponseFromWatchHtml(
      `<script>var ytInitialPlayerResponse =\n  ${json}\n;</script>`,
    );
    expect(spaced?.data?.videoDetails).toMatchObject({ videoId: 'abc123' });

    const unusual = JSON.stringify({
      videoDetails: { videoId: 'abc123', title: 'Weird {title} with "quotes" and \\ backslash' },
      captions: { playerCaptionsTracklistRenderer: TRACKS },
    });
    const unusualResult = extractPlayerResponseFromWatchHtml(watchHtml(unusual));
    expect(unusualResult?.data?.videoDetails).toMatchObject({ videoId: 'abc123' });
  });

  it('rejects unusable assignments but uses a later valid assignment', () => {
    const consent =
      '<html><body><form action="https://consent.youtube.com/save">…</form></body></html>';
    expect(extractPlayerResponseFromWatchHtml(consent)).toBeNull();
    expect(extractPlayerResponseFromWatchHtml('')).toBeNull();
    expect(
      extractPlayerResponseFromWatchHtml(
        '<script>var ytInitialPlayerResponse = {"videoDetails": {"videoId": "abc123";</script>',
      ),
    ).toBeNull();
    expect(
      extractPlayerResponseFromWatchHtml('<script>var ytInitialPlayerResponse = null;</script>'),
    ).toBeNull();
    expect(
      extractPlayerResponseFromWatchHtml(
        '<script>var ytInitialPlayerResponse = undefined;</script>',
      ),
    ).toBeNull();

    const good = playerResponseJson();
    const html =
      '<script>var ytInitialPlayerResponse = {broken;</script>' +
      `<script>var ytInitialPlayerResponse = ${good};</script>`;
    const result = extractPlayerResponseFromWatchHtml(html);
    expect(result?.data?.videoDetails).toMatchObject({ videoId: 'abc123' });
  });
});

describe('selectAsrTrack', () => {
  const asrTrack: AvailableSubtitleTrack = {
    language: 'en',
    label: 'English (auto-generated)',
    url: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en&kind=asr',
    isAutoGenerated: true,
    platform: 'youtube',
    videoId: 'abc123',
  };
  const humanTrack: AvailableSubtitleTrack = {
    language: 'en',
    label: 'English',
    url: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en',
    isAutoGenerated: false,
    platform: 'youtube',
    videoId: 'abc123',
  };

  it('selects the ASR track and reports no-tracks/no-asr appropriately', () => {
    expect(selectAsrTrack([])).toEqual({ ok: false, reason: 'no-tracks' });
    expect(selectAsrTrack([humanTrack])).toEqual({ ok: false, reason: 'no-asr' });
    expect(selectAsrTrack([humanTrack, asrTrack])).toEqual({ ok: true, track: asrTrack });
    const urlOnly: AvailableSubtitleTrack = { ...asrTrack, isAutoGenerated: false };
    expect(selectAsrTrack([urlOnly])).toEqual({ ok: true, track: urlOnly });
    const noUrl: AvailableSubtitleTrack = { ...asrTrack, url: undefined };
    expect(selectAsrTrack([noUrl])).toEqual({ ok: false, reason: 'no-asr' });
  });
});

describe('buildJson3TimedtextUrl', () => {
  it('ensures fmt=json3 while preserving query params and handling fallback URLs', () => {
    const appended = buildJson3TimedtextUrl(
      'https://www.youtube.com/api/timedtext?v=abc123&lang=en',
    );
    expect(appended).toContain('fmt=json3');
    expect(appended).toContain('v=abc123');
    expect(appended).toContain('lang=en');
    const replaced = buildJson3TimedtextUrl(
      'https://www.youtube.com/api/timedtext?v=abc123&lang=en&fmt=srv3',
    );
    expect(replaced).toContain('fmt=json3');
    expect(replaced).not.toContain('fmt=srv3');
    const preserved = buildJson3TimedtextUrl(
      'https://www.youtube.com/api/timedtext?v=abc123&lang=en&kind=asr&sig=xyz',
    );
    expect(preserved).toContain('kind=asr');
    expect(preserved).toContain('sig=xyz');
    expect(preserved).toContain('fmt=json3');
    expect(buildJson3TimedtextUrl('not a url at all')).toContain('fmt=json3');
    const fallback = buildJson3TimedtextUrl('weird?fmt=vtt&x=1');
    expect(fallback).toContain('fmt=json3');
    expect(fallback).not.toContain('fmt=vtt');
    expect(fallback).toContain('x=1');
  });
});

describe('adapter: extracted player response → YouTubeHandler.extractAvailableTracks', () => {
  it('parses tracks, exposes title metadata, and reports missing captions', () => {
    const html = watchHtml(playerResponseJson());
    const extracted = extractPlayerResponseFromWatchHtml(html);
    expect(extracted).not.toBeNull();

    const tracks = new YouTubeHandler().extractAvailableTracks(extracted!.rawJson);
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({
      language: 'en',
      label: 'English',
      isAutoGenerated: false,
      platform: 'youtube',
      videoId: 'abc123',
    });
    expect(tracks[1]).toMatchObject({
      language: 'en',
      isAutoGenerated: true,
      videoId: 'abc123',
    });
    expect(tracks[1]?.url).toContain('kind=asr');
    expect(selectAsrTrack(tracks).ok).toBe(true);

    const details = extracted?.data?.videoDetails as { title?: string } | undefined;
    expect(details?.title).toBe('Sample Video - YouTube');

    const noCaptions = extractPlayerResponseFromWatchHtml(
      watchHtml(playerResponseJson({ captions: undefined })),
    );
    const emptyTracks = new YouTubeHandler().extractAvailableTracks(noCaptions!.rawJson);
    expect(emptyTracks).toEqual([]);
    expect(selectAsrTrack(emptyTracks)).toEqual({ ok: false, reason: 'no-tracks' });
  });
});
