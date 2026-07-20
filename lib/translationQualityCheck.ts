/**
 * Opt-in quality self-check heuristics after a batch (FR-16).
 * Detects source-echo and dropped rich-translate <z> tags.
 */

export interface QualityIssue {
  id: string;
  kind:
    | 'source_echo'
    | 'dropped_z_tags'
    | 'unbalanced_z_tags'
    | 'unknown_z_id'
    | 'disallowed_tag'
    | 'incomplete_id_map';
  detail: string;
}

/** Allowed tags inside rich translations (beyond plain text). */
const ALLOWED_RICH_TAGS = new Set(['z', 'b', 'i', 'em', 'strong', 'code', 'br', 'a']);

/**
 * Count <z id="N"> open tags in text.
 */
export function countZTags(text: string): number {
  const opens = text.match(/<z\s+id=["']?\d+["']?\s*>/gi) ?? [];
  return opens.length;
}

/** Extract numeric z-tag ids from source or translation. */
export function extractZTagIds(text: string): number[] {
  const ids: number[] = [];
  const re = /<z\s+id=["']?(\d+)["']?\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    ids.push(Number(m[1]));
  }
  return ids;
}

/** True when every <z> open has a matching </z> (simple depth count). */
export function areZTagsBalanced(text: string): boolean {
  const opens = (text.match(/<z\s+id=["']?\d+["']?\s*>/gi) ?? []).length;
  const closes = (text.match(/<\/z>/gi) ?? []).length;
  return opens === closes;
}

/** Reject tags outside the rich allowlist (FR-16). */
export function findDisallowedTags(text: string): string[] {
  const found = new Set<string>();
  const re = /<\/?([a-zA-Z][\w-]*)\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = m[1]?.toLowerCase();
    if (!name) continue;
    if (!ALLOWED_RICH_TAGS.has(name)) found.add(name);
  }
  return [...found];
}

/**
 * FR-16: verify rich token ids/counts/balance/allowed tags for one piece.
 */
export function validateRichTranslation(opts: {
  id: string;
  source: string;
  translated: string;
}): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const { id, source, translated } = opts;
  if (!source.includes('<z')) return issues;

  const srcIds = extractZTagIds(source);
  const dstIds = extractZTagIds(translated);
  if (dstIds.length < srcIds.length) {
    issues.push({
      id,
      kind: 'dropped_z_tags',
      detail: `Source had ${srcIds.length} <z> tags, translation has ${dstIds.length}`,
    });
  }
  if (!areZTagsBalanced(translated)) {
    issues.push({
      id,
      kind: 'unbalanced_z_tags',
      detail: 'Unbalanced <z>…</z> in translation',
    });
  }
  const srcSet = new Set(srcIds);
  for (const zid of dstIds) {
    if (!srcSet.has(zid)) {
      issues.push({
        id,
        kind: 'unknown_z_id',
        detail: `Translation references unknown z id ${zid}`,
      });
      break;
    }
  }
  const bad = findDisallowedTags(translated);
  if (bad.length > 0) {
    issues.push({
      id,
      kind: 'disallowed_tag',
      detail: `Disallowed tags: ${bad.join(', ')}`,
    });
  }
  return issues;
}

/**
 * FR-16: reject incomplete id maps before DOM apply.
 * Returns missing piece ids that were requested but absent from the response.
 */
export function findMissingTranslationIds(
  requestedIds: Iterable<string>,
  resultIds: Iterable<string>,
): string[] {
  const have = new Set(resultIds);
  const missing: string[] = [];
  for (const id of requestedIds) {
    if (!have.has(id)) missing.push(id);
  }
  return missing;
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

  issues.push(...validateRichTranslation({ id, source, translated }));

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
