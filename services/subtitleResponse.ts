/**
 * Subtitle-specific response parsing — extracts the optional `properNouns`
 * field from an LLM translation response. The shared `parseTranslationResponse`
 * in `services/base.ts` is unchanged; this is called only on the subtitle path.
 */

/** Extract the properNouns field from a subtitle translation response.
 *  Returns undefined when the field is absent, empty, or malformed. */
export function extractProperNouns(
  responseText: string,
): Record<string, string> | undefined {
  // Clean the response the same way parseTranslationResponse does:
  // strip  illegal blocks and unclosed tails.
  const cleanText = responseText
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/g, '')
    .trim();

  let parsed: Record<string, unknown> | null = null;

  try {
    parsed = JSON.parse(cleanText);
  } catch {
    // Try extracting from markdown code fences
    const jsonMatch = cleanText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch?.[1]) {
      try {
        parsed = JSON.parse(jsonMatch[1]);
      } catch {
        // Try finding outermost braces
        const first = cleanText.indexOf('{');
        const last = cleanText.lastIndexOf('}');
        if (first !== -1 && last > first) {
          try {
            parsed = JSON.parse(cleanText.substring(first, last + 1));
          } catch {
            return undefined;
          }
        }
      }
    } else {
      const first = cleanText.indexOf('{');
      const last = cleanText.lastIndexOf('}');
      if (first !== -1 && last > first) {
        try {
          parsed = JSON.parse(cleanText.substring(first, last + 1));
        } catch {
          return undefined;
        }
      }
    }
  }

  if (!parsed || typeof parsed !== 'object') return undefined;

  const raw = (parsed as Record<string, unknown>).properNouns;
  if (!raw || typeof raw !== 'object') return undefined;

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      result[key] = value;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
