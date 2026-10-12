/**
 * Tail gate and tail removal for the trailing-key gesture (refer `qR`, `pde`,
 * `Z5`, `rqe`).
 *
 * The gate decides whether the field really ends with the burst the user just
 * typed; removal strips that burst (and the period macOS inserts for a
 * double-space) before the text is translated.
 */

import { isSpaceTriggerKey, matchesTriggerChar } from './triggerKeys';

const TRAILING_NEWLINES = /[\r\n]+$/;
const WHITESPACE_CLASS = /[\s\u00a0\u3000]/;
const SENTENCE_END = new Set(['.', '。']);

/** For Space, any whitespace counts as part of the burst. */
function isBurstChar(ch: string, key: string): boolean {
  if (isSpaceTriggerKey(key)) return WHITESPACE_CLASS.test(ch) && ch !== '\n' && ch !== '\r';
  return matchesTriggerChar(ch, key);
}

function countTrailingRun(text: string, key: string): number {
  let count = 0;
  for (let i = text.length - 1; i >= 0 && isBurstChar(text[i], key); i--) count++;
  return count;
}

/** Last non-empty line, ignoring trailing newlines. */
function lastLine(text: string): string {
  const trimmed = text.replace(TRAILING_NEWLINES, '');
  const index = trimmed.lastIndexOf('\n');
  return index === -1 ? trimmed : trimmed.slice(index + 1);
}

/**
 * True when the last non-empty line ends with at least `min(tapCount, 2)`
 * consecutive trigger chars. Two, not tapCount: macOS turns a double-space
 * into ". ", and some composers collapse runs of spaces.
 */
export function passesTailGate(text: string, key: string, tapCount: number): boolean {
  const run = countTrailingRun(lastLine(text), key);
  return run > 0 && run >= Math.min(tapCount, 2);
}

export interface RemoveTailOptions {
  /** The tail gate passed: delete the whole run instead of capping at tapCount. */
  tailMatched: boolean;
}

export interface RemoveTailResult {
  text: string;
  /** Trigger chars deleted (excluding newlines and a dropped period). */
  removed: number;
}

/** Strip the gesture burst from the end of the draft. */
export function removeTail(
  text: string,
  key: string,
  tapCount: number,
  options: RemoveTailOptions,
): RemoveTailResult {
  let result = text.replace(TRAILING_NEWLINES, '');
  const run = countTrailingRun(result, key);
  const removed = options.tailMatched ? run : Math.min(run, Math.max(0, tapCount));
  result = result.slice(0, result.length - removed);

  if (removed > 0 && removed < 3 && SENTENCE_END.has(result.slice(-1)) && !matchesTriggerChar('.', key)) {
    result = result.slice(0, -1);
  }
  return { text: result, removed };
}

const URL_PATTERN = /https?:\/\/[^\s\u3000]+/g;
const PLACEHOLDER = /\uE000(\d+)\uE001/g;

export interface ProtectedText {
  text: string;
  /** Put the original URLs back into (a transformation of) the masked text. */
  restore: (masked: string) => string;
}

/**
 * Mask `http(s)://…` spans with private-use placeholders so `//xx`-style
 * prefix parsing never matches inside a URL.
 */
export function protectUrls(text: string): ProtectedText {
  const urls: string[] = [];
  const masked = text.replace(URL_PATTERN, (url) => {
    urls.push(url);
    return `\uE000${urls.length - 1}\uE001`;
  });
  return {
    text: masked,
    restore: (value) =>
      urls.length === 0 ? value : value.replace(PLACEHOLDER, (match, index: string) => urls[Number(index)] ?? match),
  };
}
