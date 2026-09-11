/**
 * Pure helpers for PDF auto-open site exceptions.
 * Normalizes user input (hostname or URL) to a lowercase HTTP(S) hostname and
 * deduplicates case-insensitively. No I/O — used by the PDF settings editor.
 */

/** Normalize a hostname/URL input to a lowercase HTTP(S) hostname, or null. */
export function normalizePdfSiteException(input: string): string | null {
  const raw = input.trim();
  if (!raw || /^(file|mailto):/i.test(raw)) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      return null;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return hostname && !hostname.includes(' ') ? hostname : null;
  } catch {
    return null;
  }
}

/** Append a normalized host when valid and not already present (any case). */
export function addPdfSiteException(current: string[], input: string): string[] {
  const hostname = normalizePdfSiteException(input);
  if (!hostname || current.some((item) => item.toLowerCase() === hostname))
    return current;
  return [...current, hostname];
}
