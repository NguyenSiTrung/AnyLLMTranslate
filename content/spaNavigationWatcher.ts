export interface SpaNavigationWatcherOptions {
  pollIntervalMs?: number;
}

/** Watch same-document navigation, including history calls from page scripts. */
export function startSpaNavigationWatcher(
  onNavigation: (url: string) => void,
  options: SpaNavigationWatcherOptions = {},
): () => void {
  const targetWindow = window;
  const getCurrentUrl = (): string => targetWindow.location?.href ?? '';
  let lastUrl = getCurrentUrl();
  let disposed = false;

  const handleNavigation = (): void => {
    if (disposed) return;
    const currentUrl = getCurrentUrl();
    if (!currentUrl || currentUrl === lastUrl) return;
    lastUrl = currentUrl;
    onNavigation(currentUrl);
  };

  targetWindow.addEventListener('popstate', handleNavigation);
  targetWindow.addEventListener('hashchange', handleNavigation);

  const originalPushState = targetWindow.history.pushState;
  const originalReplaceState = targetWindow.history.replaceState;
  const patchedPushState = function (
    this: History,
    ...args: Parameters<History['pushState']>
  ): void {
    originalPushState.apply(this, args);
    handleNavigation();
  };
  const patchedReplaceState = function (
    this: History,
    ...args: Parameters<History['replaceState']>
  ): void {
    originalReplaceState.apply(this, args);
    handleNavigation();
  };

  targetWindow.history.pushState = patchedPushState;
  targetWindow.history.replaceState = patchedReplaceState;

  const pollIntervalMs = options.pollIntervalMs ?? 500;
  const pollTimer = setInterval(handleNavigation, pollIntervalMs);

  return () => {
    disposed = true;
    targetWindow.removeEventListener('popstate', handleNavigation);
    targetWindow.removeEventListener('hashchange', handleNavigation);
    clearInterval(pollTimer);
    if (targetWindow.history.pushState === patchedPushState) {
      targetWindow.history.pushState = originalPushState;
    }
    if (targetWindow.history.replaceState === patchedReplaceState) {
      targetWindow.history.replaceState = originalReplaceState;
    }
  };
}
