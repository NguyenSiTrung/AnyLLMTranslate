/**
 * Per-film proper-noun pre-scan.
 *
 * A single dedicated LLM call that extracts proper nouns from the full
 * (deduplicated) source corpus BEFORE chunk 0 translates. The result seeds the
 * per-session rolling glossary so the opening of a film knows names that only
 * appear later. Caller persists the result (services/filmGlossaryStore.ts).
 *
 * Distinct from services/subtitlePrompt.ts: the pre-scan *extracts names*, it
 * does not translate lines. Never throws — returns {} on any failure so callers
 * treat it as a no-op seed.
 *
 * See docs/superpowers/specs/2026-06-23-subtitle-per-film-proper-noun-extraction-design.md.
 */

import type { TranslationService } from '@/types/translation';
import type { ProfileKnobs } from '@/lib/subtitleProfiles';
import type { SubtitleCue } from '@/types/subtitle';
import { MAX_ROLLING_GLOSSARY } from '@/lib/subtitleGlossary';
import { getLanguageName } from '@/lib/languages';

/** Knob → instruction lines for the pre-scan prompt. Same vocabulary as the
 *  chunk-translator prompt so name choices match across pre-scan and chunks. */
const REGISTER_LINES: Record<string, string> = {
  formal: 'Prefer formal name forms.',
  casual: 'Prefer casual/idiomatic name forms (e.g. a nickname over a formal transliteration).',
};
const FAITHFULNESS_LINES: Record<string, string> = {
  literal: 'Prefer faithful transliteration of names.',
  idiomatic: 'Prefer idiomatic name rendering in the target language.',
};

/** Build the pre-scan system prompt. Exported for unit testing. */
export function buildPreScanPrompt(
  targetLanguage: string,
  knobs: ProfileKnobs,
): string {
  const name = getLanguageName(targetLanguage);
  const display = name !== targetLanguage ? `${name} (${targetLanguage})` : targetLanguage;

  const lines: string[] = [
    `You are a proper-noun extractor for subtitles. List every proper noun (character names, place names, brands, technical terms) that appears in the transcript below, and give its translation to ${display}.`,
    '',
    'Rules:',
    `- Include at most ${MAX_ROLLING_GLOSSARY} entries. Prioritise the most frequent and most distinctive names.`,
    '- Skip common words, pronouns, and generic terms that are not proper nouns.',
    '- For each entry, the key is the exact source form as it appears in the transcript and the value is the target-language translation.',
  ];

  const knobLines: string[] = [];
  if (knobs.register !== 'neutral') knobLines.push(REGISTER_LINES[knobs.register]);
  if (knobs.faithfulness !== 'balanced') knobLines.push(FAITHFULNESS_LINES[knobs.faithfulness]);
  if (knobLines.length > 0) {
    lines.push('', ...knobLines);
  }

  lines.push(
    '',
    'Respond ONLY with valid JSON in this exact format: {"properNouns": {"SourceName": "TranslatedName"}}',
  );

  return lines.join('\n');
}

/** Run the pre-scan. Returns {source: target}; returns {} on any failure. */
export async function preScanNames(
  service: TranslationService,
  sourceLanguage: string,
  targetLanguage: string,
  cues: SubtitleCue[],
  knobs: ProfileKnobs,
): Promise<Record<string, string>> {
  if (cues.length === 0) return {};

  try {
    // Dedupe the source corpus to bound token cost.
    const unique = [...new Set(cues.map((c) => c.text).filter((t) => t.trim()))];
    if (unique.length === 0) return {};

    const texts = new Map<string, string>();
    unique.forEach((text, i) => texts.set(`n${i + 1}`, text));

    const result = await service.translate({
      texts,
      sourceLanguage,
      targetLanguage,
      // Route the service to use OUR pre-scan prompt verbatim (bypasses both
      // the web-page and subtitle prompt builders). See openaiCompatible.ts routing.
      preScanSystemPrompt: buildPreScanPrompt(targetLanguage, knobs),
    });

    if (!result.success) return {};
    return result.properNouns ?? {};
  } catch {
    return {};
  }
}
