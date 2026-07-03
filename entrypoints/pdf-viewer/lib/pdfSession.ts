/**
 * Pure PDF session helpers — keep-alive coordination for the PDF viewer.
 *
 * A PDF viewer tab registers a session on mount so the background service
 * worker stays alive (via a keep-alive alarm) for the duration of long
 * content-heavy translation work. When the viewer closes, it deregisters;
 * when no sessions remain, the alarm is cleared.
 *
 * Mirrors the subtitle keep-alive pattern (`ensureKeepaliveAlarm` /
 * `clearKeepaliveAlarm` in services/background.ts) but the session set is the
 * pure data structure both sides operate on. The background owns the single
 * live `Set<number>` and the chrome.alarms calls; these helpers are the
 * decision + state-transition logic, kept pure for unit testing.
 *
 * Pattern: pure-helper-at-seams (cf. `getProviderReadiness`, `shouldAutoOpenPdf`).
 */

export type PdfSessionSet = Set<number>;

/**
 * Register a PDF viewer tab as an active session. Returns a NEW set
 * (immutable update) so React-style equality checks work and the input is
 * never mutated. Idempotent: re-registering an already-active tab is a no-op.
 */
export function registerPdfSession(sessions: PdfSessionSet, tabId: number): PdfSessionSet {
  if (sessions.has(tabId)) return sessions;
  const next = new Set(sessions);
  next.add(tabId);
  return next;
}

/**
 * Deregister a PDF viewer tab. Returns a NEW set. Safe to call with an unknown
 * tab id (no-op). Used on viewer unmount and on `chrome.tabs.onRemoved`.
 */
export function unregisterPdfSession(sessions: PdfSessionSet, tabId: number): PdfSessionSet {
  if (!sessions.has(tabId)) return sessions;
  const next = new Set(sessions);
  next.delete(tabId);
  return next;
}

/** True if at least one PDF viewer session is currently active. */
export function hasPdfSessions(sessions: PdfSessionSet): boolean {
  return sessions.size > 0;
}

/**
 * Decision: should the keep-alive alarm be armed right now?
 * Armed iff ≥1 PDF session is active. The background calls this after every
 * register/unregister to arm or clear the alarm accordingly.
 */
export function shouldArmKeepalive(sessions: PdfSessionSet): boolean {
  return sessions.size > 0;
}
