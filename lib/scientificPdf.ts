/**
 * Pure helpers for Scientific PDF bridge settings and readiness.
 * No network I/O — client lives in scientificPdfClient.ts.
 */

import {
  DEFAULT_SCIENTIFIC_PDF_PORT,
  DEFAULT_SCIENTIFIC_PDF_SETTINGS,
  type ScientificPdfSettings,
} from '@/types/config';

/** Re-export default port for Docker docs and client alignment. */
export { DEFAULT_SCIENTIFIC_PDF_PORT };

/** Bridge readiness for UI badges (wizard + viewer). */
export type ScientificPdfStatus = 'not_configured' | 'offline' | 'ready';

export const DEFAULT_SCIENTIFIC_PDF_SERVER_URL =
  DEFAULT_SCIENTIFIC_PDF_SETTINGS.serverUrl;

/**
 * Normalize a user-entered server URL:
 * - trim whitespace
 * - strip trailing slashes (except bare origin paths)
 * - if missing protocol, assume http://
 * - empty / invalid → default loopback URL
 */
export function normalizeScientificPdfServerUrl(input: string | undefined | null): string {
  const raw = (input ?? '').trim();
  if (!raw) return DEFAULT_SCIENTIFIC_PDF_SERVER_URL;

  let candidate = raw;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)) {
    candidate = `http://${candidate}`;
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return DEFAULT_SCIENTIFIC_PDF_SERVER_URL;
    }
    // Drop path/query/hash — base URL only
    url.pathname = '';
    url.search = '';
    url.hash = '';
    // URL.toString() keeps trailing slash after empty path for some hosts; strip it
    return url.toString().replace(/\/$/, '');
  } catch {
    return DEFAULT_SCIENTIFIC_PDF_SERVER_URL;
  }
}

/**
 * True when the host is loopback (IPv4 127.0.0.0/8, ::1, or "localhost").
 * Used for privacy soft-warn / confirm on non-loopback serverUrl.
 */
export function isLoopbackServerUrl(serverUrl: string): boolean {
  try {
    const { hostname } = new URL(normalizeScientificPdfServerUrl(serverUrl));
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost') return true;
    if (host === '::1') return true;
    // IPv4 loopback 127.0.0.0/8
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const c = Number(m[3]);
      const d = Number(m[4]);
      if ([a, b, c, d].some((n) => n > 255)) return false;
      return a === 127;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Soft privacy warning: non-loopback serverUrl may send PDF + API keys to a remote host.
 * Empty/invalid URL is treated as default loopback (no warn).
 */
export function shouldWarnNonLoopbackServerUrl(serverUrl: string): boolean {
  const normalized = normalizeScientificPdfServerUrl(serverUrl);
  return !isLoopbackServerUrl(normalized);
}

/**
 * Resolve UI status from settings + last health probe.
 *
 * - not_configured: feature disabled or wizard never completed (and no recent ready health)
 * - offline: enabled (or setup done) but health failed / unknown
 * - ready: health ok (within optional TTL handled by caller via healthOk)
 */
export function resolveScientificPdfStatus(args: {
  settings: Pick<ScientificPdfSettings, 'enabled' | 'setupCompletedAt'>;
  /** Result of last successful GET /health within TTL, if any */
  healthOk: boolean | null;
}): ScientificPdfStatus {
  const { settings, healthOk } = args;
  if (healthOk === true) return 'ready';

  const configured =
    settings.enabled === true ||
    (typeof settings.setupCompletedAt === 'string' && settings.setupCompletedAt.length > 0);

  if (!configured) return 'not_configured';
  return 'offline';
}

/** Merge partial stored settings onto defaults (no credentials ever). */
export function mergeScientificPdfSettings(
  partial?: Partial<ScientificPdfSettings> | null,
): ScientificPdfSettings {
  if (!partial) return { ...DEFAULT_SCIENTIFIC_PDF_SETTINGS };
  const merged: ScientificPdfSettings = {
    enabled: partial.enabled ?? DEFAULT_SCIENTIFIC_PDF_SETTINGS.enabled,
    serverUrl: normalizeScientificPdfServerUrl(
      partial.serverUrl ?? DEFAULT_SCIENTIFIC_PDF_SETTINGS.serverUrl,
    ),
  };
  if (typeof partial.setupCompletedAt === 'string' && partial.setupCompletedAt.length > 0) {
    merged.setupCompletedAt = partial.setupCompletedAt;
  }
  return merged;
}

/**
 * Primary install for new users — helper script (down if exists → build → start → health).
 * Run from the AnyLLMTranslate **repo root**.
 */
export function scientificPdfDockerComposeUpCommand(): string {
  return './scripts/scientific-pdf-docker.sh up';
}

/** Stop / remove the bridge container. */
export function scientificPdfDockerComposeDownCommand(): string {
  return './scripts/scientific-pdf-docker.sh down';
}

/** Rebuild image from scratch (after Dockerfile/bridge code changes). */
export function scientificPdfDockerComposeRebuildCommand(): string {
  return './scripts/scientific-pdf-docker.sh rebuild';
}

/** Health check once the container is up. */
export function scientificPdfHealthCurlCommand(
  port: number = DEFAULT_SCIENTIFIC_PDF_PORT,
): string {
  // Script health uses default port; keep curl form when port overridden.
  if (port === DEFAULT_SCIENTIFIC_PDF_PORT) {
    return './scripts/scientific-pdf-docker.sh health';
  }
  return `curl -sS http://127.0.0.1:${port}/health`;
}

/** Follow live bridge logs (useful while a Scientific job runs). */
export function scientificPdfDockerLogsCommand(): string {
  return './scripts/scientific-pdf-docker.sh logs';
}

/**
 * Fallback one-liner after the image already exists (compose build is preferred).
 * @deprecated Prefer {@link scientificPdfDockerComposeUpCommand} for first-time setup.
 */
export function scientificPdfDockerRunCommand(
  port: number = DEFAULT_SCIENTIFIC_PDF_PORT,
): string {
  return [
    'docker run --rm -d',
    `--name anyllm-scientific-pdf`,
    `-p ${port}:${port}`,
    '-v anyllm-scientific-pdf-data:/data',
    'anyllm-scientific-pdf-bridge:latest',
  ].join(' ');
}

/** Ordered setup commands shown in the Options wizard Install step. */
export function scientificPdfSetupCommands(port: number = DEFAULT_SCIENTIFIC_PDF_PORT): Array<{
  title: string;
  command: string;
  hint: string;
}> {
  return [
    {
      title: '1. Build & start (from repo root)',
      command: scientificPdfDockerComposeUpCommand(),
      hint: 'Stops any old container, builds the image, starts it, and checks health. Needs Docker Desktop. First build is slow.',
    },
    {
      title: '2. Check health again (optional)',
      command: scientificPdfHealthCurlCommand(port),
      hint: 'Expect JSON with "status":"ok". Then click “Check health” in this wizard.',
    },
    {
      title: '3. View logs (optional)',
      command: scientificPdfDockerLogsCommand(),
      hint: 'Leave this running in a second terminal while you translate a PDF. Ctrl+C stops logs only.',
    },
  ];
}
