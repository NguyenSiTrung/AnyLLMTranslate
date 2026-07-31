import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MutationWatcher } from '../mutationWatcher';

describe('MutationWatcher — body-swap detection (FR-1)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // Ensure a clean <body> exists
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  it('fires onBodySwapped when <body> is replaced or removed and re-added', async () => {
    // Scenario 1: <body> replaced with a new node
    const onMutation = vi.fn();
    const onBodySwapped = vi.fn();
    const watcher = new MutationWatcher(onMutation, 100, onBodySwapped);
    watcher.start(document.body);

    const oldBody = document.body;
    const newBody = document.createElement('body');
    newBody.innerHTML = '<p>New content</p>';
    document.documentElement.replaceChild(newBody, oldBody);

    // Allow MutationObserver microtask + 100ms debounce to fire
    await new Promise((r) => setTimeout(r, 150));

    expect(onBodySwapped).toHaveBeenCalledTimes(1);
    watcher.stop();

    // Scenario 2: body removed and re-added
    const onMutation2 = vi.fn();
    const onBodySwapped2 = vi.fn();
    const watcher2 = new MutationWatcher(onMutation2, 100, onBodySwapped2);
    watcher2.start(document.body);

    const currentBody = document.body;
    document.documentElement.removeChild(currentBody);

    await new Promise((r) => setTimeout(r, 50));

    const readdedBody = document.createElement('body');
    readdedBody.innerHTML = '<p>Re-added body</p>';
    document.documentElement.appendChild(readdedBody);

    // Wait for debounce (100ms) + buffer
    await new Promise((r) => setTimeout(r, 150));

    expect(onBodySwapped2).toHaveBeenCalledTimes(1);
    watcher2.stop();

    // Mutations under <html> or inside the current body are not body swaps.
    const onMutation3 = vi.fn();
    const onBodySwapped3 = vi.fn();
    const watcher3 = new MutationWatcher(onMutation3, 100, onBodySwapped3);
    watcher3.start(document.body);

    // Add a <div> to <head> (child of <html>, but not a body swap)
    const div = document.createElement('div');
    div.textContent = 'Head content';
    document.head.appendChild(div);

    await new Promise((r) => setTimeout(r, 50));

    expect(onBodySwapped3).not.toHaveBeenCalled();

    // Add content inside <body> — this is a normal mutation, not a body swap
    const p = document.createElement('p');
    p.textContent = 'New paragraph';
    document.body.appendChild(p);

    await new Promise((r) => setTimeout(r, 50));

    expect(onBodySwapped3).not.toHaveBeenCalled();
    watcher3.stop();

    // Repeated mutations on one replacement body still fire only once.
    const onMutation4 = vi.fn();
    const onBodySwapped4 = vi.fn();
    const watcher4 = new MutationWatcher(onMutation4, 100, onBodySwapped4);
    watcher4.start(document.body);
    const oldBody4 = document.body;
    const newBody4 = document.createElement('body');
    document.documentElement.replaceChild(newBody4, oldBody4);

    await new Promise((r) => setTimeout(r, 150));
    const p4 = document.createElement('p');
    p4.textContent = 'Content in new body';
    newBody4.appendChild(p4);

    await new Promise((r) => setTimeout(r, 50));
    expect(onBodySwapped4).toHaveBeenCalledTimes(1);
    watcher4.stop();

    // Stopping both observers prevents later body replacement callbacks.
    const onMutation5 = vi.fn();
    const onBodySwapped5 = vi.fn();
    const watcher5 = new MutationWatcher(onMutation5, 100, onBodySwapped5);
    watcher5.start(document.body);
    watcher5.stop();
    const oldBody5 = document.body;
    const newBody5 = document.createElement('body');
    document.documentElement.replaceChild(newBody5, oldBody5);

    await new Promise((r) => setTimeout(r, 50));
    expect(onBodySwapped5).not.toHaveBeenCalled();

    // Normal content changes still reach onMutation when body-swap mode is on.
    const onMutation6 = vi.fn();
    const onBodySwapped6 = vi.fn();
    const watcher6 = new MutationWatcher(onMutation6, 50, onBodySwapped6);
    watcher6.start(document.body);
    const p6 = document.createElement('p');
    p6.textContent = 'A new paragraph with text.';
    document.body.appendChild(p6);

    await new Promise((r) => setTimeout(r, 200));
    expect(onMutation6).toHaveBeenCalled();
    expect(onBodySwapped6).not.toHaveBeenCalled();
    watcher6.stop();
  });
});

describe('MutationWatcher — skip already-translated regions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('does not re-queue children moved into a marked original wrapper', async () => {
    const onMutation = vi.fn();
    const watcher = new MutationWatcher(onMutation, 30);
    watcher.start(document.body);

    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = 'List item content that is long enough';
    li.appendChild(span);
    document.body.appendChild(li);

    // Allow the initial add to flush (if any)
    await new Promise((r) => setTimeout(r, 100));
    onMutation.mockClear();

    // Simulate ensureOriginalWrapper: mark wrapper as original/translated and
    // move existing children into it (childList adds under the wrapper).
    const wrapper = document.createElement('span');
    wrapper.setAttribute('data-anyllm-role', 'original');
    wrapper.setAttribute('data-anyllm-translated', '');
    while (li.firstChild) {
      wrapper.appendChild(li.firstChild);
    }
    li.appendChild(wrapper);

    await new Promise((r) => setTimeout(r, 150));

    expect(onMutation).not.toHaveBeenCalled();
    watcher.stop();

    document.body.innerHTML = '';
    const onMutation2 = vi.fn();
    const watcher2 = new MutationWatcher(onMutation2, 30);
    watcher2.start(document.body);

    const p = document.createElement('p');
    p.setAttribute('data-anyllm-role', 'original');
    p.setAttribute('data-anyllm-translated', '');
    const text = document.createTextNode('Hello world text content');
    p.appendChild(text);
    document.body.appendChild(p);

    await new Promise((r) => setTimeout(r, 100));
    onMutation2.mockClear();

    text.textContent = 'Hello world text content updated';

    await new Promise((r) => setTimeout(r, 150));

    expect(onMutation2).not.toHaveBeenCalled();
    watcher2.stop();

    document.body.innerHTML = '';
    const onMutation3 = vi.fn();
    const watcher3 = new MutationWatcher(onMutation3, 30);
    watcher3.start(document.body);

    const existing = document.createElement('p');
    existing.setAttribute('data-anyllm-translated', '');
    existing.textContent = 'Already translated paragraph';
    document.body.appendChild(existing);

    await new Promise((r) => setTimeout(r, 100));
    onMutation3.mockClear();

    const fresh = document.createElement('p');
    fresh.textContent = 'Brand new dynamic paragraph content.';
    document.body.appendChild(fresh);

    await new Promise((r) => setTimeout(r, 150));

    expect(onMutation3).toHaveBeenCalled();
    const added = onMutation3.mock.calls[0][0] as Element[];
    expect(added.some((el) => el === fresh || el.contains(fresh) || fresh.contains(el))).toBe(true);
    watcher3.stop();
  });
});
