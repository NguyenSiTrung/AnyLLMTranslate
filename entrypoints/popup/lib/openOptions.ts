/** Open the full Options UI in a focused popup window. */
export function openOptionsWindow(query = ''): void {
  const url = chrome.runtime.getURL(`options.html${query}`);
  chrome.windows.create({
    url,
    type: 'popup',
    width: 1200,
    height: 800,
    focused: true,
  });
}
