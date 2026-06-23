/**
 * Profile-driven system prompt for subtitle translation.
 *
 * Distinct from buildSystemPrompt() in base.ts (which serves the web-page
 * path): this prompt tells the model the texts are spoken subtitles and adapts
 * its instructions to the resolved ProfileKnobs. Web-page-only rules (HTML
 * preservation, math/formula preservation) are intentionally absent — they are
 * noise for spoken dialogue.
 *
 * See docs/superpowers/specs/2026-06-23-subtitle-profiles-and-prompt-design.md.
 */

import { getLanguageName } from '@/lib/languages';
import type { ProfileKnobs, Register, Faithfulness, Brevity, Profanity } from '@/lib/subtitleProfiles';

/** Fixed Part A — subtitle identity block. {{targetLanguage}} is substituted in. */
const SUBTITLE_IDENTITY = `You are a professional subtitle translator for film, TV, and video.
The texts are short spoken lines, not web prose or documents. Translate them to {{targetLanguage}}.

Subtitle rules:
- Translate as natural spoken dialogue that a viewer reads at a glance while listening.
- Preserve the meaning and tone of the original line.
- Keep each translation roughly the same length as the source so it fits on screen.
- Maintain continuity of names and references across lines.
- When a line is prefixed with [Speaker Name], that identifies who is speaking. Use this to maintain dialogue flow and speaker-appropriate tone. Do not translate or repeat the speaker name in the output.`;

/** Fixed Part D — JSON output contract (parser depends on this; must not change). */
const JSON_CONTRACT = `Respond ONLY with valid JSON in this exact format: {"translations": {"id1": "...", "id2": "..."}, "properNouns": {"SourceName": "TranslatedName"}}
The keys in "translations" must exactly match the input keys.
In "properNouns", include proper nouns (character names, place names, brands, technical terms) from the source texts and their translations.`;

/** Knob → instruction line. Default values are omitted (emit nothing). */
const REGISTER_LINE: Record<Exclude<Register, 'neutral'>, string> = {
  formal: 'Use formal, polite register appropriate for professional or academic speech.',
  casual: 'Use natural, everyday conversational register — how people actually talk.',
};

const FAITHFULNESS_LINE: Record<Exclude<Faithfulness, 'balanced'>, string> = {
  literal: 'Prefer precise, faithful translation — preserve technical terms and exact meaning over style.',
  idiomatic: 'Prefer idiomatic, natural phrasing in the target language over word-for-word translation.',
};

const BREVITY_LINE: Record<Exclude<Brevity, 'relaxed' | 'moderate'>, string> = {
  terse: 'Be concise — trim filler words where it keeps the subtitle readable in time.',
};

const PROFANITY_LINE: Record<Exclude<Profanity, 'preserve'>, string> = {
  soften: 'Soften strong profanity; tone down slurs.',
  remove: 'Remove strong profanity entirely.',
};

/** Build the profile-driven subtitle system prompt. */
export function buildSubtitleSystemPrompt(
  targetLanguage: string,
  knobs: ProfileKnobs,
  glossaryBlock?: string,
  rollingGlossaryBlock?: string,
): string {
  const targetLanguageName = getLanguageName(targetLanguage);
  const displayTargetLanguage = targetLanguageName !== targetLanguage
    ? `${targetLanguageName} (${targetLanguage})`
    : targetLanguage;

  // Part A — identity.
  let prompt = SUBTITLE_IDENTITY.replace(/\{\{targetLanguage\}\}/g, displayTargetLanguage);

  // Part B — knob-driven instructions (only non-default lines).
  const knobLines: string[] = [];
  if (knobs.register !== 'neutral') {
    knobLines.push(REGISTER_LINE[knobs.register]);
  }
  if (knobs.faithfulness !== 'balanced') {
    knobLines.push(FAITHFULNESS_LINE[knobs.faithfulness]);
  }
  if (knobs.brevity !== 'relaxed' && knobs.brevity !== 'moderate') {
    knobLines.push(BREVITY_LINE[knobs.brevity]);
  }
  if (knobs.profanity !== 'preserve') {
    knobLines.push(PROFANITY_LINE[knobs.profanity]);
  }
  if (knobLines.length > 0) {
    prompt += '\n\n' + knobLines.join('\n');
  }

  // Part C — glossary (user's global glossary).
  if (glossaryBlock) {
    prompt += '\n\n' + glossaryBlock;
  }

  // Part C2 — rolling proper-noun glossary (per-session continuity).
  if (rollingGlossaryBlock) {
    prompt += '\n\n' + rollingGlossaryBlock;
  }

  // Part D — JSON contract.
  prompt += '\n\n' + JSON_CONTRACT;

  return prompt.trim();
}
