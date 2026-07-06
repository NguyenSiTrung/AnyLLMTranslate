/**
 * FR-9 — Target-language-driven preview cues for the Subtitles mini-player.
 *
 * The Subtitles settings preview used to hardcode Vietnamese sample cues. To
 * tie the preview to the user's configured target language, this module maps a
 * handful of common target-language codes to a small set of sample cues
 * (original English → translated). Languages without an explicit sample fall
 * back to a neutral placeholder that keeps the bilingual/translation-only
 * display behaviour visible without inventing translations.
 *
 * Pure + dependency-free so it is trivially unit-testable.
 */

import type { PreviewCue } from '@/entrypoints/options/components/SubtitlePreview';

/** A small catalogue keyed by BCP-47 target-language code. */
const SAMPLE_CUES: Record<string, PreviewCue[]> = {
  vi: [
    { original: 'Hello world', translated: 'Xin chào thế giới' },
    { original: 'How are you today?', translated: 'Hôm nay bạn thế nào?' },
    { original: 'Welcome back', translated: 'Chào mừng trở lại' },
  ],
  ja: [
    { original: 'Hello world', translated: 'こんにちは世界' },
    { original: 'How are you today?', translated: '今日の調子はどうですか？' },
    { original: 'Welcome back', translated: 'おかえりなさい' },
  ],
  ko: [
    { original: 'Hello world', translated: '안녕하세요 세계' },
    { original: 'How are you today?', translated: '오늘 어떻게 지내세요?' },
    { original: 'Welcome back', translated: '다시 오신 것을 환영합니다' },
  ],
  zh: [
    { original: 'Hello world', translated: '你好，世界' },
    { original: 'How are you today?', translated: '你今天怎么样？' },
    { original: 'Welcome back', translated: '欢迎回来' },
  ],
  es: [
    { original: 'Hello world', translated: 'Hola mundo' },
    { original: 'How are you today?', translated: '¿Cómo estás hoy?' },
    { original: 'Welcome back', translated: 'Bienvenido de nuevo' },
  ],
  fr: [
    { original: 'Hello world', translated: 'Bonjour le monde' },
    { original: 'How are you today?', translated: 'Comment allez-vous aujourd\'hui ?' },
    { original: 'Welcome back', translated: 'Bon retour' },
  ],
};

/** Neutral fallback cues (used when no samples exist for the target language). */
const FALLBACK_CUES: PreviewCue[] = [
  { original: 'Hello world', translated: 'Hello world (translated)' },
  { original: 'How are you today?', translated: 'How are you today? (translated)' },
  { original: 'Welcome back', translated: 'Welcome back (translated)' },
];

/**
 * Resolve the preview cues for a target language code. Falls back to a neutral
 * placeholder set when no explicit samples are catalogued.
 */
export function getPreviewCuesForLanguage(targetLanguage: string | undefined): PreviewCue[] {
  if (!targetLanguage) return FALLBACK_CUES;
  return SAMPLE_CUES[targetLanguage] ?? FALLBACK_CUES;
}

/**
 * FR-9 — derive a short Style chip label from the active translation-style
 * knob overrides. Reflects the single most salient overridden knob, or the
 * resolved register when nothing is overridden (mirrors how users think about
 * style: register first). Returns undefined when no chip should render.
 */
export function resolveStyleChipLabel(
  overrides: { register?: string; faithfulness?: string; brevity?: string; profanity?: string } | undefined,
): string | undefined {
  const o = overrides ?? {};
  if (o.register && o.register !== 'auto') {
    return o.register.charAt(0).toUpperCase() + o.register.slice(1);
  }
  if (o.faithfulness && o.faithfulness !== 'auto') {
    return o.faithfulness.charAt(0).toUpperCase() + o.faithfulness.slice(1);
  }
  if (o.brevity && o.brevity !== 'auto') {
    return o.brevity.charAt(0).toUpperCase() + o.brevity.slice(1);
  }
  if (o.profanity && o.profanity !== 'auto') {
    return o.profanity.charAt(0).toUpperCase() + o.profanity.slice(1);
  }
  return undefined;
}
