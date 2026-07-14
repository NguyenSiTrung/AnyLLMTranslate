/**
 * Opt-in quality self-check heuristics after a batch (FR-16).
 * Detects source-echo and dropped rich-translate <z> tags.
 */

export interface QualityIssue {
  id: string;
  kind: 'source_echo' | 'dropped_z_tags';
  detail: string;
}

/**
 * Count <z id="N"> open tags in text.
 */
export function countZTags(text: string): number {
  const opens = text.match(/<z\s+id=["']?\d+["']?\s*>/gi) ?? [];
  return opens.length;
}

/**
 * Detect obvious failures for a single piece.
 * sourceEcho: translation equals source when languages should differ.
 */
export function detectPieceQualityIssues(opts: {
  id: string;
  source: string;
  translated: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const { id, source, translated, sourceLanguage, targetLanguage } = opts;

  if (!translated?.trim()) return issues;

  // Source echo when langs differ (or auto) and text is non-trivial.
  const langsDiffer =
    !sourceLanguage ||
    sourceLanguage === 'auto' ||
    !targetLanguage ||
    sourceLanguage.split('-')[0]?.toLowerCase() !==
      targetLanguage.split('-')[0]?.toLowerCase();

  if (
    langsDiffer &&
    source.trim().length >= 12 &&
    source.trim() === translated.trim()
  ) {
    issues.push({
      id,
      kind: 'source_echo',
      detail: 'Translation equals source text',
    });
  }

  const srcZ = countZTags(source);
  const dstZ = countZTags(translated);
  if (srcZ > 0 && dstZ < srcZ) {
    issues.push({
      id,
      kind: 'dropped_z_tags',
      detail: `Source had ${srcZ} <z> tags, translation has ${dstZ}`,
    });
  }

  return issues;
}

/**
 * Scan a batch map for quality issues.
 */
export function detectBatchQualityIssues(
  sources: Map<string, string>,
  translations: Map<string, string>,
  opts?: { sourceLanguage?: string; targetLanguage?: string },
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  for (const [id, source] of sources) {
    const translated = translations.get(id);
    if (translated === undefined) continue;
    issues.push(
      ...detectPieceQualityIssues({
        id,
        source,
        translated,
        sourceLanguage: opts?.sourceLanguage,
        targetLanguage: opts?.targetLanguage,
      }),
    );
  }
  return issues;
}

/** Stricter instruction appended on automatic re-prompt. */
export const QUALITY_REPAIR_INSTRUCTION =
  'IMPORTANT: Do not copy the source text as the translation when languages differ. ' +
  'Preserve every <z id="N">…</z> tag exactly. Return complete JSON for all ids.';
