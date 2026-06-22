/**
 * WXT Background Service Worker entrypoint.
 * Wires up the message router, settings listener, keyboard commands, and context menus.
 */

import { handleMessage, initSettingsListener, scheduleEviction, initEvictionSchedule, initSubtitleSessionCleanup, openPdfViewer } from '@/services/background';
import { initTabCleanup } from '@/services/categoryStore';
import { warmDebugCache } from '@/services/debugLog';

/** Send message to the active tab's content script */
async function sendToActiveTab(message: Record<string, unknown>): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, message);
  }
}

/** Set up context menus (called once on install) */
function setupContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'translate-page',
      title: 'Translate This Page',
      contexts: ['page'],
    });

    chrome.contextMenus.create({
      id: 'translate-selection',
      title: 'Translate Selection',
      contexts: ['selection'],
    });

    chrome.contextMenus.create({
      id: 'translate-section',
      title: 'Translate This Section',
      contexts: ['page'],
    });

    chrome.contextMenus.create({
      id: 'translate-subtitles',
      title: 'Translate Subtitles',
      contexts: ['page'],
      documentUrlPatterns: [
        '*://*.youtube.com/*',
        '*://*.udemy.com/*',
        '*://*.coursera.org/*',
        '*://*.linkedin.com/*',
        '*://*.max.com/*',
        '*://*.hbomax.com/*',
      ],
    });

    // PDF translator — shown for any link/page that resolves to a .pdf URL.
    // `link` covers clicking a download link, `page` covers opening a tab on a
    // bare .pdf URL where the browser renders its built-in PDF viewer.
    chrome.contextMenus.create({
      id: 'open-pdf-translator',
      title: 'Open in PDF Translator',
      contexts: ['link', 'page'],
      targetUrlPatterns: ['*://*/*.pdf', '*://*/*.pdf?*', 'file://*/*.pdf', 'file://*/*.pdf?*'],
    });
  });
}

export default defineBackground(() => {
  // Listen for messages from content scripts and popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const result = handleMessage(message, sender);
    if (result) {
      result
        .then(sendResponse)
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'Unknown error';
          sendResponse({ success: false, error: message });
        });
      return true; // Keep the message channel open for async response
    }
    return false;
  });

  // Re-create service when settings change
  initSettingsListener();

  // Warm the debug log cache so LLM logs respect the user's debugMode setting
  // at startup rather than the first call (which would be a few seconds in).
  warmDebugCache().catch(() => { /* best-effort */ });

  // FR-3: Schedule daily cache eviction via chrome.alarms
  initEvictionSchedule();
  scheduleEviction();

  // Initialize tab-scoped category override cleanup
  initTabCleanup();

  // Tear down subtitle sessions + page-translation tracking when tabs close
  initSubtitleSessionCleanup();

  // Set up context menus on install
  chrome.runtime.onInstalled.addListener(() => {
    setupContextMenus();
  });

  // Handle context menu clicks
  chrome.contextMenus.onClicked.addListener((info) => {
    switch (info.menuItemId) {
      case 'translate-page':
        sendToActiveTab({ action: 'startTranslation' });
        break;
      case 'translate-selection':
        // Selection text is in info.selectionText
        if (info.selectionText) {
          sendToActiveTab({
            action: 'translateSelectedText',
            text: info.selectionText,
          });
        }
        break;
      case 'translate-section':
        sendToActiveTab({ action: 'enterSectionPicker' });
        break;
      case 'translate-subtitles':
        sendToActiveTab({ action: 'startSubtitleTranslation' });
        break;
      case 'open-pdf-translator': {
        // Prefer the link URL when the user right-clicked a link, otherwise
        // fall back to the page's own URL (e.g. a tab that landed on a bare
        // .pdf URL that the browser renders natively).
        const pdfUrl = info.linkUrl || info.pageUrl;
        if (pdfUrl) openPdfViewer(pdfUrl);
        break;
      }
    }
  });

  // Handle global keyboard shortcuts (chrome.commands)
  chrome.commands.onCommand.addListener((command) => {
    switch (command) {
      case 'translate-page':
        sendToActiveTab({ action: 'startTranslation' });
        break;
      case 'translate-subtitles':
        sendToActiveTab({ action: 'startSubtitleTranslation' });
        break;
      case 'toggle-display':
        sendToActiveTab({ action: 'toggleTranslation' });
        break;
      case 'restore-page':
        sendToActiveTab({ action: 'stopTranslation' });
        break;
    }
  });

  console.log('[AnyLLMTranslate] Background service worker initialized');
});
