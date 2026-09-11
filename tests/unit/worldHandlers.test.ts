/**
 * Coverage guard for the shared platform subtitle handlers.
 *
 * The MAIN world tags every intercepted payload with its handler's `platform`
 * id; the isolated world resolves that id with `getHandlerByPlatform()`. Both
 * worlds now build their handler list from one factory, so a platform can no
 * longer be registered in only one of them — these tests fail the build if the
 * shared list loses a platform either world relies on, or if the isolated-world
 * registry fails to resolve an intercepted id (the Netflix/Disney+ bug).
 */

import { describe, it, expect } from 'vitest';
import {
  createIsolatedWorldHandlers,
  handlerPlatformIds,
} from '@/inject/subtitleHandlers/worldHandlers';
import {
  registerSubtitleHandlers,
  getHandlerByPlatform,
} from '@/inject/subtitleHandlers/registry';

/** Platform ids the MAIN world can stamp onto an intercepted payload. */
const INTERCEPTED_PLATFORM_IDS = [
  'youtube',
  'udemy',
  'coursera',
  'deeplearningai',
  'linkedin',
  'hbomax',
  'youku',
  'netflix',
  'disneyplus',
  'wetv',
  'generic',
];

describe('subtitle handler world parity', () => {
  it('registers exactly the platform ids the MAIN world can intercept, in order', () => {
    // Both worlds build from this one factory, so the drift this file used to
    // guard against is now structural. What is pinned here is the factory's
    // content and order: dropping a handler (or reordering `generic` out of the
    // last slot, where first-match-wins detection needs it) fails the build.
    expect(handlerPlatformIds(createIsolatedWorldHandlers())).toEqual(
      INTERCEPTED_PLATFORM_IDS,
    );
  });

  it('returns fresh handler instances per call', () => {
    const first = createIsolatedWorldHandlers();
    const second = createIsolatedWorldHandlers();
    expect(first[0]).not.toBe(second[0]);
  });

  it('resolves every intercepted platform id from the isolated-world registry', () => {
    // Regression guard for the Netflix/Disney+ bug: with only the old
    // isolated-world list registered, these two resolved to null and their
    // intercepted bodies were returned untouched.
    registerSubtitleHandlers(createIsolatedWorldHandlers());
    for (const platform of INTERCEPTED_PLATFORM_IDS) {
      expect(getHandlerByPlatform(platform)?.platform).toBe(platform);
    }
  });
});
