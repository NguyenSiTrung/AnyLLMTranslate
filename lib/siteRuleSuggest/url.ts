/**
 * URL / hostname helpers for site-rule AI suggestions.
 */

export function parseSuggestUrl(
  input: string,
): { ok: true; url: URL } | { ok: false; error: string } {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'Enter a URL' };

  let candidate = raw;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Only http(s) URLs are supported' };
  }
  if (!url.hostname) return { ok: false, error: 'Invalid URL' };

  // Normalize hostname casing for downstream matching.
  url.hostname = url.hostname.toLowerCase();
  return { ok: true, url };
}

export function hostnameFromUrl(url: URL): string {
  return url.hostname.toLowerCase();
}

function stripWww(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host;
}

/**
 * v1 hostname pattern preference:
 * - strip leading www.
 * - if ≥3 labels (e.g. docs.example.com) → *.example.com (last two labels)
 * - else apex host (example.com)
 */
export function preferHostnamePattern(hostname: string): string {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  const noWww = stripWww(h);
  const parts = noWww.split('.').filter(Boolean);
  if (parts.length >= 3) {
    return `*.${parts.slice(-2).join('.')}`;
  }
  return noWww;
}

/**
 * Match a tab URL against a target hostname, ignoring leading www.
 * Also matches subdomains of the target (tab host ends with `.${target}`).
 */
export function tabUrlMatchesHostname(
  tabUrl: string | undefined,
  hostname: string,
): boolean {
  if (!tabUrl) return false;
  try {
    const tabHost = stripWww(new URL(tabUrl).hostname.toLowerCase());
    const target = stripWww(hostname.toLowerCase());
    if (!target) return false;
    return tabHost === target || tabHost.endsWith(`.${target}`);
  } catch {
    return false;
  }
}
