/**
 * WXT Background Service Worker entrypoint.
 * Wires up the message router and settings listener.
 */

import { handleMessage, initSettingsListener } from '@/services/background';

export default defineBackground(() => {
  // Listen for messages from content scripts and popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const result = handleMessage(message, sender);
    if (result) {
      result.then(sendResponse);
      return true; // Keep the message channel open for async response
    }
    return false;
  });

  // Re-create service when settings change
  initSettingsListener();

  // Clean up tab state when tab is closed
  chrome.tabs.onRemoved.addListener((tabId) => {
    // Dynamic import to avoid circular dependency
    import('@/services/background').then(({ tabStates }) => {
      tabStates.delete(tabId);
    });
  });

  console.log('[LinguaLens] Background service worker initialized');
});
