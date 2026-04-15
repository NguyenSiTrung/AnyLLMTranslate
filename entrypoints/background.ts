/**
 * WXT Background Service Worker entrypoint.
 * Wires up the message router, settings listener, keyboard commands, and context menus.
 */

import { handleMessage, initSettingsListener, scheduleEviction, initEvictionSchedule } from '@/services/background';

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
      id: 'translate-subtitles',
      title: 'Translate Subtitles',
      contexts: ['page'],
      documentUrlPatterns: [
        '*://*.youtube.com/*',
        '*://*.udemy.com/*',
        '*://*.coursera.org/*',
      ],
    });
  });
}

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

  // FR-3: Schedule daily cache eviction via chrome.alarms
  initEvictionSchedule();
  scheduleEviction();

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
      case 'translate-subtitles':
        sendToActiveTab({ action: 'startSubtitleTranslation' });
        break;
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
