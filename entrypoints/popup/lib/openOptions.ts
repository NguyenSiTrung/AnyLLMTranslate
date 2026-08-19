const OPTIONS_PAGE = 'options.html';

/**
 * Open the full Options UI in a focused popup window.
 *
 * If a settings window is already open, focus it instead of opening a second
 * one. When a deep link is requested (`query`), the existing options tab is
 * navigated to the new URL so `?section=…` / `?setup=…` still apply; a bare
 * open just focuses the current view so in-progress edits are not lost.
 */
export async function openOptionsWindow(query = ''): Promise<void> {
  const url = chrome.runtime.getURL(`${OPTIONS_PAGE}${query}`);
  const baseUrl = chrome.runtime.getURL(OPTIONS_PAGE);

  try {
    const windows = await chrome.windows.getAll({ populate: true });
    for (const win of windows) {
      if (win.id == null) continue;
      const tab = win.tabs?.find((t) => t.url?.startsWith(baseUrl));
      if (!tab || tab.id == null) continue;

      await chrome.windows.update(win.id, { focused: true });
      if (query) {
        await chrome.tabs.update(tab.id, { url, active: true });
      }
      return;
    }
  } catch {
    // Fall through to creating a new window.
  }

  await chrome.windows.create({
    url,
    type: 'popup',
    width: 1200,
    height: 800,
    focused: true,
  });
}
