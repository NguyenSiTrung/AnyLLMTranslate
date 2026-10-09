import { describe, expect, it, vi } from 'vitest';
import { installPageLifecycle } from '../pageLifecycle';

function transition(type: 'pagehide' | 'pageshow', persisted: boolean): Event {
  return Object.assign(new Event(type), { persisted });
}

describe('installPageLifecycle (FR-16)', () => {
  it('tears down on pagehide and re-initializes on a persisted pageshow', () => {
    const teardown = vi.fn();
    const restore = vi.fn();
    const remove = installPageLifecycle(window, { teardown, restore });

    window.dispatchEvent(transition('pagehide', true));
    expect(teardown).toHaveBeenCalledTimes(1);
    window.dispatchEvent(transition('pageshow', true));
    expect(restore).toHaveBeenCalledTimes(1);

    // A second bfcache round trip works the same way.
    window.dispatchEvent(transition('pagehide', true));
    window.dispatchEvent(transition('pageshow', true));
    expect(teardown).toHaveBeenCalledTimes(2);
    expect(restore).toHaveBeenCalledTimes(2);
    remove();
  });

  it('beforeunload alone (a cancelled "Leave site?" dialog) tears nothing down', () => {
    const teardown = vi.fn();
    const restore = vi.fn();
    const remove = installPageLifecycle(window, { teardown, restore });
    window.dispatchEvent(new Event('beforeunload'));
    expect(teardown).not.toHaveBeenCalled();
    remove();
  });

  it('ignores a non-persisted pageshow and a pageshow without a prior teardown', () => {
    const teardown = vi.fn();
    const restore = vi.fn();
    const remove = installPageLifecycle(window, { teardown, restore });
    window.dispatchEvent(transition('pageshow', true));
    expect(restore).not.toHaveBeenCalled();
    window.dispatchEvent(transition('pagehide', false));
    window.dispatchEvent(transition('pageshow', false));
    expect(restore).not.toHaveBeenCalled();
    remove();
  });

  it('remove() detaches both listeners', () => {
    const teardown = vi.fn();
    const restore = vi.fn();
    installPageLifecycle(window, { teardown, restore })();
    window.dispatchEvent(transition('pagehide', true));
    window.dispatchEvent(transition('pageshow', true));
    expect(teardown).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
  });
});
