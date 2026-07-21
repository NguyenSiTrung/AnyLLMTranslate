/** Maximum entries in the rolling proper-noun glossary per subtitle session. */
export const MAX_ROLLING_GLOSSARY = 100;

/** Merge extracted proper nouns into the rolling glossary map.
 *  Stops adding when the map reaches MAX_ROLLING_GLOSSARY entries.
 *  Empty string values are skipped. Existing unlocked keys are overwritten. */
export function mergeProperNouns(
  glossary: Map<string, string>,
  properNouns: Record<string, string>,
  options?: { lockedSources?: Set<string> },
): void {
  const locked = options?.lockedSources;
  for (const [source, target] of Object.entries(properNouns)) {
    if (!target) continue;
    if (locked?.has(source.trim().toLowerCase())) continue;
    if (glossary.size >= MAX_ROLLING_GLOSSARY && !glossary.has(source)) continue;
    glossary.set(source, target);
  }
}

/** Format the rolling glossary as a prompt section. Returns '' when empty. */
export function formatRollingGlossary(glossary: Map<string, string>): string {
  if (glossary.size === 0) return '';
  const lines = [...glossary.entries()].map(
    ([source, target]) => `- "${source}" → "${target}"`,
  );
  return `Previously translated names in this content (use these consistently):\n${lines.join('\n')}`;
}
