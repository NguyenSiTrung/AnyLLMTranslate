/**
 * FR-16: bfcache-safe content-script lifecycle. `beforeunload` fires before a
 * "Leave site?" dialog the user may cancel, and pages restored from the
 * back/forward cache never re-run the content script — so teardown runs on
 * `pagehide` and a persisted `pageshow` re-initializes what was torn down.
 */

export interface PageLifecycleHooks {
  teardown(): void;
  restore(): void;
}

/** Install the listeners; the returned function removes them. */
export function installPageLifecycle(target: Window, hooks: PageLifecycleHooks): () => void {
  let tornDown = false;
  const onPageHide = () => {
    if (tornDown) return;
    tornDown = true;
    hooks.teardown();
  };
  const onPageShow = (event: Event) => {
    if (!tornDown || !(event as PageTransitionEvent).persisted) return;
    tornDown = false;
    hooks.restore();
  };
  target.addEventListener('pagehide', onPageHide);
  target.addEventListener('pageshow', onPageShow);
  return () => {
    target.removeEventListener('pagehide', onPageHide);
    target.removeEventListener('pageshow', onPageShow);
  };
}
