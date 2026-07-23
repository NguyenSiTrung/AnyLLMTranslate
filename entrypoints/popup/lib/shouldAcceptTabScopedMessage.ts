/**
 * Whether a live tab-scoped update (statusUpdate, pageCategoryUpdate, …)
 * should be applied to the popup UI for the currently observed tab.
 *
 * Content scripts on every open tab broadcast status over chrome.runtime.
 * Without this gate, a translating background tab overwrites the active tab's
 * progress strip when the user opens the popup on a different page.
 *
 * @param activeTabId - Tab the popup is currently bound to (from tabs.query).
 * @param fromTabId - Origin tab of the message (prefer sender.tab.id).
 */
export function shouldAcceptTabScopedMessage(
  activeTabId: number | null | undefined,
  fromTabId: number | null | undefined,
): boolean {
  if (activeTabId == null || activeTabId <= 0) return false;
  if (fromTabId == null || fromTabId <= 0) return false;
  return fromTabId === activeTabId;
}
