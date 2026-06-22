/**
 * Pure decision logic for auto-opening the bundled PDF viewer.
 *
 * Extracted from the background service worker so every safeguard branch can
 * be unit-tested without chrome API mocking. The background handler owns all
 * I/O (reading settings, reading/writing the dedupe set in storage.session,
 * calling openPdfViewer); this function only decides.
 */

import type { ExtensionSettings } from '@/types/config';
import { getProviderReadiness } from '@/lib/providerReadiness';

export interface ShouldAutoOpenInput {
  /** The PDF document's URL (native viewer location.href). */
  url: string;
  /** `chrome.runtime.getURL('')` — the extension's own origin. */
  viewerOrigin: string;
  /** Loaded extension settings. */
  settings: ExtensionSettings;
  /** Dedupe key for this tab+url (see buildSessionKey). */
  sessionKey: string;
  /** Set of session keys already auto-opened this browser session. */
  openedSessionKeys: Set<string>;
}

export interface ShouldAutoOpenResult {
  open: boolean;
  /** Why the decision was made — used for debug logging only. */
  reason: string;
}

/** Build a dedupe key from tab id + url origin+pathname.
 *  Strips #hash and ?query so anchor navigation (#page=3) does not re-open. */
export function buildSessionKey(tabId: number, url: string): string {
  let path = url;
  try {
    const u = new URL(url);
    path = `${u.origin}${u.pathname}`;
  } catch {
    // fall through with raw url
  }
  return `${tabId}::${path}`;
}

export function shouldAutoOpenPdf(input: ShouldAutoOpenInput): ShouldAutoOpenResult {
  const { url, viewerOrigin, settings, sessionKey, openedSessionKeys } = input;
  const mode = settings.pdfSettings?.autoOpen ?? 'off';

  // 1. Infinite-loop guard: the PDF viewer page itself loads a PDF.
  if (viewerOrigin && url.startsWith(viewerOrigin)) {
    return { open: false, reason: 'viewer-origin (infinite-loop guard)' };
  }

  // 2. Setting gate.
  if (mode === 'off') {
    return { open: false, reason: 'autoOpen is off' };
  }
  // 'prompt' mode shows an in-page banner handled by the content script; the
  // background never auto-opens in prompt mode.
  if (mode === 'prompt') {
    return { open: false, reason: 'prompt mode — banner handled client-side' };
  }

  // 3. Provider readiness gate — never auto-open into a viewer that can't translate.
  if (!getProviderReadiness(settings.provider).canTranslate) {
    return { open: false, reason: 'provider not ready' };
  }

  // 4. Per-site opt-out.
  try {
    const hostname = new URL(url).hostname;
    if (settings.pdfSettings?.neverAutoOpenSites?.includes(hostname)) {
      return { open: false, reason: `hostname ${hostname} blocked` };
    }
  } catch {
    // Malformed URL — refuse to auto-open rather than guess.
    return { open: false, reason: 'malformed url' };
  }

  // 5. Dedupe — one auto-open per tab+document this browser session.
  if (openedSessionKeys.has(sessionKey)) {
    return { open: false, reason: 'already opened this session' };
  }

  return { open: true, reason: 'auto-open' };
}
