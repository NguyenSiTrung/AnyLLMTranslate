/**
 * Salvage partial translation maps from malformed LLM JSON (FR-12).
 * Complements parseTranslationResponse — extract what we can before error UI.
 */

/**
 * Try to salvage id→string pairs from a broken JSON-ish response.
 * Looks for "id": "value" patterns for the expected ids.
 */
export function salvageTranslationPairs(
  responseText: string,
  expectedIds: string[],
): Map<string, string> {
  const out = new Map<string, string>();
  if (!responseText || expectedIds.length === 0) return out;

  // Strip think blocks first.
  const clean = responseText
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/g, '')
    .trim();

  for (const id of expectedIds) {
    // Match "id": "..." with escaped quotes support (non-greedy).
    const re = new RegExp(
      `"${escapeRegExp(id)}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`,
      'm',
    );
    const m = clean.match(re);
    if (m?.[1] !== undefined) {
      try {
        // Decode JSON string escapes via JSON.parse on a quoted string.
        out.set(id, JSON.parse(`"${m[1]}"`) as string);
      } catch {
        out.set(id, m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'));
      }
    }
  }

  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Ids still missing after a primary parse/salvage pass.
 */
export function missingTranslationIds(
  found: Map<string, string>,
  expectedIds: string[],
): string[] {
  return expectedIds.filter((id) => !found.has(id));
}

/**
 * Whether a salvage map is worth keeping (at least one pair).
 */
export function isUsefulSalvage(map: Map<string, string>): boolean {
  return map.size > 0;
}
