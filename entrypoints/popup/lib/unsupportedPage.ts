export type UnsupportedPageInfo = {
  title: string;
  description: string;
};

export function getUnsupportedPageInfo(tab?: chrome.tabs.Tab): UnsupportedPageInfo | null {
  if (!tab?.id || !tab.url) {
    return {
      title: "This page can't be translated",
      description: 'Open a regular website to use page translation.',
    };
  }

  try {
    const url = new URL(tab.url);
    const isWebPage = url.protocol === 'http:' || url.protocol === 'https:';
    const isBrowserStore =
      url.hostname === 'chromewebstore.google.com' ||
      (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore')) ||
      url.hostname === 'microsoftedge.microsoft.com';

    // The extension's own PDF viewer is a chrome-extension:// page that
    // handles translation internally — don't show the "can't be translated"
    // message there.
    const isPdfViewer = url.protocol === 'chrome-extension:' && url.pathname === '/pdf-viewer.html';

    if (isPdfViewer) {
      return {
        title: 'PDF translation is active',
        description:
          'Use the translation controls in the PDF viewer tab. Page translation is not needed here.',
      };
    }

    if (!isWebPage || isBrowserStore) {
      return {
        title: "This page can't be translated",
        description:
          "Browser or extension pages don't allow translation. Open a regular website to translate.",
      };
    }
  } catch {
    return {
      title: "This page can't be translated",
      description: 'Open a regular website to use page translation.',
    };
  }

  return null;
}
