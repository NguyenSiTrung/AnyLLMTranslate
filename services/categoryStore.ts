/**
 * Tab-scoped category override store.
 * In-memory Map<tabId, category> — lost on service worker restart (by design).
 */

/** Internal tab → category map */
const categoryOverrides = new Map<number, string>();

/** Guard: prevent duplicate chrome.tabs.onRemoved listener registration */
let tabCleanupInitialized = false;

/** Set a temporary category override for a tab */
export function setCategoryOverride(tabId: number, category: string | null): void {
  if (category === null || category === '') {
    categoryOverrides.delete(tabId);
  } else {
    categoryOverrides.set(tabId, category.trim().slice(0, 50));
  }
}

/** Get the current category override for a tab (undefined = no override) */
export function getCategoryOverride(tabId: number): string | undefined {
  return categoryOverrides.get(tabId);
}

/** Initialize tab cleanup listener — clears override when tab is closed.
 *  Guards against duplicate registration across SW restarts. */
export function initTabCleanup(): void {
  if (tabCleanupInitialized) return;
  tabCleanupInitialized = true;
  chrome.tabs.onRemoved.addListener((tabId) => {
    categoryOverrides.delete(tabId);
  });
}

/** Reset all overrides (for testing) */
export function _resetCategoryStore(): void {
  categoryOverrides.clear();
  tabCleanupInitialized = false;
}
