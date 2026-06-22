/**
 * Detect that the active document is a PDF rendered by the browser's native
 * viewer, and notify the background so it can auto-open the bundled translator.
 *
 * Uses `document.contentType === 'application/pdf'` — the only signal that
 * catches extensionless URLs like https://arxiv.org/pdf/2606.20543 without
 * requiring webNavigation/webRequest permissions.
 *
 * Dependencies are injected so the module is pure and unit-testable.
 */

export interface DetectPdfDeps {
  /** `document.contentType` — 'application/pdf' for the native PDF viewer. */
  contentType: string | undefined;
  /** `location.href` of the document. */
  href: string;
  /** `chrome.runtime.getURL('')` — extension's own origin (loop guard). */
  viewerOrigin: string;
  /** Sending tab id. */
  tabId: number;
  /** chrome.runtime.sendMessage (injected). */
  sendMessage: (msg: unknown) => Promise<unknown>;
}

/** If the document is a PDF not already inside our viewer, notify the background.
 *  Returns true when a message was sent. */
export function detectPdfAndNotify(deps: DetectPdfDeps): boolean {
  const { contentType, href, viewerOrigin, tabId, sendMessage } = deps;
  if (contentType !== 'application/pdf') return false;
  // Defensive double-guard: background also checks, but skipping the message
  // entirely avoids a round-trip and a debug-log entry on every viewer load.
  if (viewerOrigin && href.startsWith(viewerOrigin)) return false;
  // Fire-and-forget; the background decides whether to actually open.
  sendMessage({ action: 'PDF_DETECTED', url: href, tabId }).catch(() => { /* SW asleep */ });
  return true;
}
