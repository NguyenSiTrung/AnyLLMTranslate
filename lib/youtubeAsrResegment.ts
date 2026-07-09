/**
 * YouTube ASR (auto-generated caption) sentence re-alignment — PURE module.
 *
 * Re-chunks fragmented YouTube ASR captions into more coherent sentence-level
 * cues before translation (Immersive Translate free-path intent, not bit-identical).
 *
 * Pipeline (word-level preferred):
 *   1. Flatten JSON3 segs (+ tOffsetMs) → timed words
 *   2. Split on gap / breakWords / sentence punctuation / maxWords
 *   3. Merge hanging endWords / startWords
 *  4. endCompatible merge of tiny trailing fragments
 *   5. Emit SubtitleCue[]
 *
 * When only coarse cues exist (no word offsets): cue-level gap + hanging merge.
 *
 * No Chrome APIs. Fail-open is the caller's responsibility (catch + passthrough).
 */

import type { SubtitleCue } from '@/types/subtitle';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Single timed word (milliseconds). */
export interface AsrWord {
  text: string;
  startMs: number;
  endMs: number;
}

/** YouTube JSON3 segment with optional word offset. */
export interface YoutubeJson3Seg {
  utf8?: string;
  tOffsetMs?: number;
  acAsr?: boolean;
}

/** YouTube JSON3 event (one ASR “bubble”). */
export interface YoutubeJson3Event {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: YoutubeJson3Seg[];
}

/** Split rules for one language. */
export interface AsrSplitConfig {
  /** Split when silence between words exceeds this (ms). */
  minIntervalMs: number;
  /** Force a new cue after this many words. */
  maxWords: number;
  /**
   * Case-insensitive tokens that force a split *after* the word
   * (clause breakers such as "but", "so" when configured).
   */
  breakWords: string[];
}

/** Merge rules for hanging fragments. */
export interface AsrMergeConfig {
  /** If a cue's last token is in this list, merge into the next cue. */
  endWords: string[];
  /** If a cue's first token is in this list, merge into the previous cue. */
  startWords: string[];
}

/** Merge a tiny trailing cue into the previous one when both bounds match. */
export interface AsrEndCompatibleConfig {
  maxWords: number;
  maxDurationMs: number;
}

/** Per-language resegment rules. */
export interface AsrLangConfig {
  splitConfig: AsrSplitConfig;
  mergeConfig: AsrMergeConfig;
  endCompatibleConfigs: AsrEndCompatibleConfig[];
}

/**
 * Full ASR resegment config (algorithm defaults + feature flags).
 * User-facing enable/aiEnable also live on SubtitleSettings.youtubeAsrResegment;
 * this constant is the single source for language rule tables.
 */
export interface YoutubeAsrConfig {
  enable: boolean;
  /**
   * Reserved: future AI resegment. Always false in v1 production path.
   * @see requestAiAsrResegment
   */
  aiEnable: boolean;
  /**
   * Tokenize cue text into words for cue-level fallback.
   * String form is compiled with the `g` flag.
   */
  wordsRegex: string | RegExp;
  langsConfig: {
    base: AsrLangConfig;
    en?: AsrLangConfig;
    [lang: string]: AsrLangConfig | undefined;
  };
}

export interface ResegmentYoutubeAsrInput {
  /** Preferred: word stream from JSON3 flatten. */
  words?: AsrWord[];
  /** Fallback when words are unavailable (srv3 / coarse cues). */
  cues?: SubtitleCue[];
  /** BCP-47 or ISO source language (e.g. en, en-US, vi). */
  language?: string;
  /** Override algorithm config (defaults to DEFAULT_YOUTUBE_ASR_CONFIG). */
  config?: YoutubeAsrConfig;
}

// ─── English / base defaults (Immersive-style intent) ────────────────────────

const EN_END_WORDS = [
  'the', 'a', 'an', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'about', 'like', 'through', 'after', 'over', 'between', 'out',
  'against', 'during', 'without', 'before', 'under', 'around', 'among',
  'and', 'or', 'but', 'so', 'if', 'when', 'that', 'this', 'these', 'those',
  'my', 'your', 'his', 'her', 'its', 'our', 'their',
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
  'i', "i'm", "it's", "that's", "there's", "he's", "she's", "we're", "they're",
  "don't", "doesn't", "didn't", "won't", "can't", "couldn't", "wouldn't",
];

const EN_START_WORDS = [
  'and', 'or', 'but', 'so', 'because', 'then', 'than', 'though', 'although',
  'which', 'who', 'whom', 'whose', 'where', 'when', 'while', 'if',
];

const EN_BREAK_WORDS = [
  // Light: primarily rely on punctuation + gap; a few strong clause markers
];

const BASE_LANG_CONFIG: AsrLangConfig = {
  splitConfig: {
    minIntervalMs: 700,
    maxWords: 18,
    breakWords: [],
  },
  mergeConfig: {
    endWords: [],
    startWords: [],
  },
  endCompatibleConfigs: [
    { maxWords: 3, maxDurationMs: 1200 },
    { maxWords: 5, maxDurationMs: 800 },
  ],
};

const EN_LANG_CONFIG: AsrLangConfig = {
  splitConfig: {
    minIntervalMs: 550,
    maxWords: 16,
    breakWords: [...EN_BREAK_WORDS],
  },
  mergeConfig: {
    endWords: [...EN_END_WORDS],
    startWords: [...EN_START_WORDS],
  },
  endCompatibleConfigs: [
    { maxWords: 3, maxDurationMs: 1500 },
    { maxWords: 5, maxDurationMs: 900 },
  ],
};

/**
 * Default algorithm + feature flags for YouTube ASR resegment.
 * Tunable values live here for settings/tests/call sites.
 */
export const DEFAULT_YOUTUBE_ASR_CONFIG: YoutubeAsrConfig = {
  enable: true,
  aiEnable: false,
  wordsRegex: /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?|[.!?;:…]+/gu,
  langsConfig: {
    base: BASE_LANG_CONFIG,
    en: EN_LANG_CONFIG,
  },
};

// ─── Language resolve ────────────────────────────────────────────────────────

/**
 * Resolve language config: exact code → primary subtag → `base`.
 * e.g. `en-US` → `en` → base; `vi` → base (no vi table).
 */
export function resolveAsrLangConfig(
  language: string | undefined,
  config: YoutubeAsrConfig = DEFAULT_YOUTUBE_ASR_CONFIG,
): AsrLangConfig {
  const langs = config.langsConfig;
  if (!language || !language.trim()) return langs.base;

  const normalized = language.trim().toLowerCase().replace(/_/g, '-');
  const exact = langs[normalized];
  if (exact) return exact;

  const primary = normalized.split('-')[0];
  const primaryCfg = primary ? langs[primary] : undefined;
  if (primaryCfg) return primaryCfg;

  return langs.base;
}

// ─── Flatten JSON3 ───────────────────────────────────────────────────────────

/**
 * Flatten YouTube JSON3 events into a word stream.
 * Uses `tOffsetMs` when present; otherwise places the whole event as one token
 * at `tStartMs` (coarse). Skips empty / pure-newline segs.
 */
export function flattenJson3Words(events: YoutubeJson3Event[]): AsrWord[] {
  const words: AsrWord[] = [];

  for (const event of events) {
    if (!event.segs || event.segs.length === 0) continue;

    const baseMs = event.tStartMs ?? 0;
    const durationMs = event.dDurationMs ?? 0;
    const eventEndMs = baseMs + durationMs;

    // Collect non-empty text segs with offsets
    const raw: { text: string; offsetMs: number; hasExplicitOffset: boolean }[] = [];
    for (const seg of event.segs) {
      const utf8 = seg.utf8 ?? '';
      // Skip pure newlines / whitespace-only
      if (!utf8 || utf8 === '\n' || utf8.trim().length === 0) continue;
      raw.push({
        text: utf8.replace(/\n/g, ' ').replace(/\s+/g, ' '),
        offsetMs: seg.tOffsetMs ?? 0,
        hasExplicitOffset: typeof seg.tOffsetMs === 'number',
      });
    }
    if (raw.length === 0) continue;

    // Word-level only when JSON3 provides tOffsetMs (ASR word stream).
    // Multiple segs without offsets are coarse event text — join into one token.
    const hasOffsets = raw.some((r) => r.hasExplicitOffset);

    if (!hasOffsets) {
      // Single coarse token for the event
      const text = raw.map((r) => r.text).join('').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      words.push({
        text,
        startMs: baseMs,
        endMs: eventEndMs > baseMs ? eventEndMs : baseMs + 500,
      });
      continue;
    }

    for (let i = 0; i < raw.length; i++) {
      const startMs = baseMs + raw[i].offsetMs;
      // next absolute start or event end
      const nextStartMs =
        i + 1 < raw.length
          ? baseMs + raw[i + 1].offsetMs
          : eventEndMs > startMs
            ? eventEndMs
            : startMs + 400;
      const endMs = Math.max(startMs + 50, nextStartMs);
      const text = raw[i].text.trim();
      if (!text) continue;
      words.push({ text, startMs, endMs });
    }
  }

  return words;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lastToken(text: string): string {
  const parts = text.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? '').toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function firstToken(text: string): string {
  const parts = text.trim().split(/\s+/);
  return (parts[0] ?? '').toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function wordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function endsWithSentencePunct(text: string): boolean {
  return /[.!?…]["')\]]*\s*$/u.test(text.trim());
}

function normalizeJoin(parts: string[]): string {
  return parts
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:…])/g, '$1')
    .trim();
}

function toSet(words: string[]): Set<string> {
  return new Set(words.map((w) => w.toLowerCase()));
}

interface WordGroup {
  words: AsrWord[];
}

function groupText(g: WordGroup): string {
  return normalizeJoin(g.words.map((w) => w.text));
}

function groupStartMs(g: WordGroup): number {
  return g.words[0]?.startMs ?? 0;
}

function groupEndMs(g: WordGroup): number {
  return g.words[g.words.length - 1]?.endMs ?? groupStartMs(g);
}

// ─── Split ───────────────────────────────────────────────────────────────────

export function splitWords(words: AsrWord[], splitConfig: AsrSplitConfig): WordGroup[] {
  if (words.length === 0) return [];

  const breakSet = toSet(splitConfig.breakWords);
  const groups: WordGroup[] = [];
  let current: AsrWord[] = [];

  const flush = () => {
    if (current.length > 0) {
      groups.push({ words: current });
      current = [];
    }
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    current.push(w);

    const next = words[i + 1];
    const gapMs = next ? next.startMs - w.endMs : 0;
    const token = lastToken(w.text);
    const shouldSplit =
      !next ||
      gapMs >= splitConfig.minIntervalMs ||
      current.length >= splitConfig.maxWords ||
      endsWithSentencePunct(w.text) ||
      (token.length > 0 && breakSet.has(token));

    if (shouldSplit) flush();
  }

  flush();
  return groups;
}

// ─── Merge hanging ───────────────────────────────────────────────────────────

export function mergeHangingGroups(groups: WordGroup[], mergeConfig: AsrMergeConfig): WordGroup[] {
  if (groups.length <= 1) return groups;

  const endSet = toSet(mergeConfig.endWords);
  const startSet = toSet(mergeConfig.startWords);

  // Work on a mutable list of groups
  let list = groups.map((g) => ({ words: [...g.words] }));

  // Pass 1: endWords — if group ends with hanging word, merge into next
  let changed = true;
  while (changed) {
    changed = false;
    const next: WordGroup[] = [];
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      const text = groupText(g);
      const last = lastToken(text);
      if (i < list.length - 1 && last && endSet.has(last)) {
        // merge g into following
        list[i + 1] = { words: [...g.words, ...list[i + 1].words] };
        changed = true;
        // skip pushing g
      } else {
        next.push(g);
      }
    }
    list = next;
  }

  // Pass 2: startWords — if group starts with hanging word, merge into previous
  changed = true;
  while (changed) {
    changed = false;
    const next: WordGroup[] = [];
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      const text = groupText(g);
      const first = firstToken(text);
      if (next.length > 0 && first && startSet.has(first)) {
        const prev = next[next.length - 1];
        next[next.length - 1] = { words: [...prev.words, ...g.words] };
        changed = true;
      } else {
        next.push(g);
      }
    }
    list = next;
  }

  return list;
}

// ─── endCompatible ───────────────────────────────────────────────────────────

/**
 * Merge a tiny trailing fragment into the previous cue when size/duration
 * match endCompatibleConfigs. Does **not** merge across a large silence gap
 * (default 700ms) so intentional pauses stay as separate cues.
 */
export function mergeEndCompatible(
  groups: WordGroup[],
  configs: AsrEndCompatibleConfig[],
  maxGapMs = 700,
): WordGroup[] {
  if (groups.length <= 1 || configs.length === 0) return groups;

  const list = groups.map((g) => ({ words: [...g.words] }));

  // Only consider the trailing fragment(s) — Immersive-style tail merge
  let guard = 0;
  while (list.length > 1 && guard < 20) {
    guard++;
    const last = list[list.length - 1];
    const prev = list[list.length - 2];
    const gap = groupStartMs(last) - groupEndMs(prev);
    if (gap > maxGapMs) break;

    const text = groupText(last);
    const wc = last.words.length > 0 ? last.words.length : wordCount(text);
    const dur = groupEndMs(last) - groupStartMs(last);
    const matches = configs.some((c) => wc <= c.maxWords && dur <= c.maxDurationMs);
    if (!matches) break;
    list[list.length - 2] = { words: [...prev.words, ...last.words] };
    list.pop();
  }

  return list;
}

// ─── Groups → cues ───────────────────────────────────────────────────────────

function groupsToCues(groups: WordGroup[]): SubtitleCue[] {
  return groups
    .map((g) => {
      const text = groupText(g);
      if (!text) return null;
      const startMs = groupStartMs(g);
      const endMs = Math.max(groupEndMs(g), startMs + 100);
      return {
        startTime: startMs / 1000,
        endTime: endMs / 1000,
        text,
      } satisfies SubtitleCue;
    })
    .filter((c): c is SubtitleCue => c !== null);
}

// ─── Word-level pipeline ─────────────────────────────────────────────────────

export function resegmentFromWords(words: AsrWord[], langConfig: AsrLangConfig): SubtitleCue[] {
  if (words.length === 0) return [];
  const split = splitWords(words, langConfig.splitConfig);
  const merged = mergeHangingGroups(split, langConfig.mergeConfig);
  const ended = mergeEndCompatible(merged, langConfig.endCompatibleConfigs);
  return groupsToCues(ended);
}

// ─── Cue-level fallback ──────────────────────────────────────────────────────

/**
 * Reduced resegment when only coarse cues exist (no word offsets).
 * - Merge cues with small gaps when previous ends with hanging endWord
 * - Merge cues that start with startWords into previous
 * - endCompatible on tiny tails
 * - Split overlong cues by maxWords (whitespace tokens)
 */
export function resegmentFromCues(cues: SubtitleCue[], langConfig: AsrLangConfig): SubtitleCue[] {
  if (cues.length === 0) return [];

  // Convert each cue to a pseudo-word group (one word = whole cue text)
  // then also split overlong cues by maxWords.
  const maxWords = langConfig.splitConfig.maxWords;
  const minGapMs = langConfig.splitConfig.minIntervalMs;

  // Expand overlong cues into multi-word groups with proportional timing
  let groups: WordGroup[] = [];
  for (const cue of cues) {
    const text = cue.text.trim();
    if (!text) continue;
    const startMs = Math.round(cue.startTime * 1000);
    const endMs = Math.round(cue.endTime * 1000);
    const tokens = text.split(/\s+/).filter(Boolean);
    if (tokens.length <= maxWords) {
      groups.push({
        words: [{ text, startMs, endMs: Math.max(endMs, startMs + 100) }],
      });
      continue;
    }
    // Chunk by maxWords with proportional times
    const duration = Math.max(endMs - startMs, tokens.length * 100);
    const msPerToken = duration / tokens.length;
    for (let i = 0; i < tokens.length; i += maxWords) {
      const slice = tokens.slice(i, i + maxWords);
      const s = startMs + Math.round(i * msPerToken);
      const e = startMs + Math.round(Math.min(tokens.length, i + maxWords) * msPerToken);
      groups.push({
        words: [{ text: slice.join(' '), startMs: s, endMs: Math.max(e, s + 100) }],
      });
    }
  }

  // Gap-based split is already implicit (each cue is a group). Merge across
  // small gaps when hanging words apply; also merge when gap < minInterval
  // AND hanging end/start — pure gap merge without hanging is aggressive, so
  // only hanging + endCompatible.
  const endSet = toSet(langConfig.mergeConfig.endWords);
  const startSet = toSet(langConfig.mergeConfig.startWords);

  // First: merge adjacent groups when gap is small and hanging applies
  const gapMerged: WordGroup[] = [];
  for (const g of groups) {
    if (gapMerged.length === 0) {
      gapMerged.push(g);
      continue;
    }
    const prev = gapMerged[gapMerged.length - 1];
    const gap = groupStartMs(g) - groupEndMs(prev);
    const prevLast = lastToken(groupText(prev));
    const gFirst = firstToken(groupText(g));
    const hanging =
      (prevLast && endSet.has(prevLast)) || (gFirst && startSet.has(gFirst));
    if (gap >= 0 && gap < minGapMs && hanging) {
      gapMerged[gapMerged.length - 1] = { words: [...prev.words, ...g.words] };
    } else {
      gapMerged.push(g);
    }
  }
  groups = gapMerged;

  groups = mergeHangingGroups(groups, langConfig.mergeConfig);
  groups = mergeEndCompatible(groups, langConfig.endCompatibleConfigs);
  return groupsToCues(groups);
}

// ─── Public entry ────────────────────────────────────────────────────────────

/**
 * Re-align YouTube ASR content into sentence-like SubtitleCue[].
 * Prefer `words` when available; otherwise uses `cues` fallback.
 * Returns empty array for empty input (caller may treat as fail-open).
 */
export function resegmentYoutubeAsr(input: ResegmentYoutubeAsrInput): SubtitleCue[] {
  const config = input.config ?? DEFAULT_YOUTUBE_ASR_CONFIG;
  const langConfig = resolveAsrLangConfig(input.language, config);

  if (input.words && input.words.length > 0) {
    return resegmentFromWords(input.words, langConfig);
  }

  if (input.cues && input.cues.length > 0) {
    return resegmentFromCues(input.cues, langConfig);
  }

  return [];
}

// ─── URL / body helpers (pure; used by coordinator gate) ─────────────────────

/** True when timedtext URL is YouTube auto-generated (`kind=asr`). */
export function isYoutubeAsrUrl(url: string): boolean {
  try {
    const u = new URL(url, 'https://www.youtube.com');
    return u.searchParams.get('kind') === 'asr';
  } catch {
    return /[?&]kind=asr(?:&|$)/i.test(url);
  }
}

/** Extract source language from a YouTube timedtext URL (`tlang` then `lang`). */
export function extractLanguageFromTimedtextUrl(url: string): string {
  try {
    const u = new URL(url, 'https://www.youtube.com');
    return u.searchParams.get('tlang') || u.searchParams.get('lang') || '';
  } catch {
    return '';
  }
}

/**
 * Parse a YouTube JSON3 body into timed words. Returns [] for non-JSON / empty.
 */
export function parseYoutubeJson3Words(body: string): AsrWord[] {
  if (!body || !body.trim()) return [];
  try {
    const data = JSON.parse(body) as { events?: YoutubeJson3Event[] };
    if (!Array.isArray(data.events)) return [];
    return flattenJson3Words(data.events);
  } catch {
    return [];
  }
}

export interface ApplyYoutubeAsrResegmentOptions {
  platform: string;
  url: string;
  body: string;
  cues: SubtitleCue[];
  /** Track/source language (BCP-47). Falls back to URL lang param. */
  language?: string;
  /** Feature flag (settings.youtubeAsrResegment.enable). */
  enable: boolean;
  /**
   * Optional track metadata. When true, treats as ASR even if URL lacks kind=asr.
   * When false, still allows kind=asr URL detection.
   */
  isAutoGenerated?: boolean;
}

/**
 * Coordinator gate: resegment only for YouTube ASR when enabled.
 * Fail-open: on throw or empty output, returns original `cues`.
 *
 * Pipeline order (documented for callers):
 *   parse → **resegment (here)** → progressive translate → adaptCueTimings on display path
 * Cache keys that hash source text must use the returned (post-resegment) cues.
 */
export function applyYoutubeAsrResegment(options: ApplyYoutubeAsrResegmentOptions): SubtitleCue[] {
  const { platform, url, body, cues, language, enable, isAutoGenerated } = options;

  if (!enable) return cues;
  if (platform !== 'youtube') return cues;
  if (cues.length === 0) return cues;

  const isAsr = isAutoGenerated === true || isYoutubeAsrUrl(url);
  if (!isAsr) return cues;

  try {
    const words = parseYoutubeJson3Words(body);
    const lang = language || extractLanguageFromTimedtextUrl(url) || 'en';
    const result = resegmentYoutubeAsr({
      words: words.length > 0 ? words : undefined,
      cues: words.length > 0 ? undefined : cues,
      language: lang,
    });
    // Empty resegment is treated as failure → keep original
    if (result.length === 0) return cues;
    return result;
  } catch {
    return cues;
  }
}

/**
 * Future AI/BYOK resegment hook — **not implemented** in v1.
 * No network call. Always returns null so callers use local rules.
 *
 * When implemented: accept word events + language, return resegmented cues
 * via the user's provider pool; mutually exclusive preference when
 * `aiEnable` is true.
 */
export async function requestAiAsrResegment(
  _events: YoutubeJson3Event[] | AsrWord[],
  _language: string,
): Promise<SubtitleCue[] | null> {
  // Design-only stub: AI resegment is out of scope for v1.
  return null;
}
