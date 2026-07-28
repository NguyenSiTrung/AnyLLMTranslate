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
  });

  it('does NOT fire onBodySwapped for mutations under <html> or inside <body>', async () => {
    const onMutation = vi.fn();
    const onBodySwapped = vi.fn();
    const watcher = new MutationWatcher(onMutation, 100, onBodySwapped);
    watcher.start(document.body);

    // Add a <div> to <head> (child of <html>, but not a body swap)
    const div = document.createElement('div');
    div.textContent = 'Head content';
    document.head.appendChild(div);

    await new Promise((r) => setTimeout(r, 50));

    expect(onBodySwapped).not.toHaveBeenCalled();

    // Add content inside <body> — this is a normal mutation, not a body swap
    const p = document.createElement('p');
    p.textContent = 'New paragraph';
    document.body.appendChild(p);

    await new Promise((r) => setTimeout(r, 50));

    expect(onBodySwapped).not.toHaveBeenCalled();
    watcher.stop();
  });

  it('does NOT double-fire for the same body identity', async () => {
    const onMutation = vi.fn();
    const onBodySwapped = vi.fn();
    const watcher = new MutationWatcher(onMutation, 100, onBodySwapped);
    watcher.start(document.body);

    // Trigger a body swap
    const oldBody = document.body;
    const newBody = document.createElement('body');
    document.documentElement.replaceChild(newBody, oldBody);

    // Wait for debounce (100ms) + buffer
    await new Promise((r) => setTimeout(r, 150));

    // Now trigger some mutations on the new body (not a swap)
    const p = document.createElement('p');
    p.textContent = 'Content in new body';
    newBody.appendChild(p);

    await new Promise((r) => setTimeout(r, 50));

    // Should have fired exactly once — not again for the same body
    expect(onBodySwapped).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it('stops both observers on stop()', async () => {
    const onMutation = vi.fn();
    const onBodySwapped = vi.fn();
    const watcher = new MutationWatcher(onMutation, 100, onBodySwapped);
    watcher.start(document.body);
    watcher.stop();

    // Replace body after stop — should NOT fire
    const oldBody = document.body;
    const newBody = document.createElement('body');
    document.documentElement.replaceChild(newBody, oldBody);

    await new Promise((r) => setTimeout(r, 50));

    expect(onBodySwapped).not.toHaveBeenCalled();
  });

  it('still fires onMutation for normal content changes with body-swap enabled', async () => {
    const onMutation = vi.fn();
    const onBodySwapped = vi.fn();
    const watcher = new MutationWatcher(onMutation, 50, onBodySwapped);
    watcher.start(document.body);

    // Add a paragraph to body — should trigger onMutation (after debounce)
    const p = document.createElement('p');
    p.textContent = 'A new paragraph with text.';
    document.body.appendChild(p);

    // Wait for debounce + idle callback
    await new Promise((r) => setTimeout(r, 200));

    expect(onMutation).toHaveBeenCalled();
    expect(onBodySwapped).not.toHaveBeenCalled();
    watcher.stop();
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
  });

  it('does not re-queue characterData changes inside a translated paragraph', async () => {
    const onMutation = vi.fn();
    const watcher = new MutationWatcher(onMutation, 30);
    watcher.start(document.body);

    const p = document.createElement('p');
    p.setAttribute('data-anyllm-role', 'original');
    p.setAttribute('data-anyllm-translated', '');
    const text = document.createTextNode('Hello world text content');
    p.appendChild(text);
    document.body.appendChild(p);

    await new Promise((r) => setTimeout(r, 100));
    onMutation.mockClear();

    text.textContent = 'Hello world text content updated';

    await new Promise((r) => setTimeout(r, 150));

    expect(onMutation).not.toHaveBeenCalled();
    watcher.stop();
  });

  it('still queues genuine new content outside translated regions', async () => {
    const onMutation = vi.fn();
    const watcher = new MutationWatcher(onMutation, 30);
    watcher.start(document.body);

    const existing = document.createElement('p');
    existing.setAttribute('data-anyllm-translated', '');
    existing.textContent = 'Already translated paragraph';
    document.body.appendChild(existing);

    await new Promise((r) => setTimeout(r, 100));
    onMutation.mockClear();

    const fresh = document.createElement('p');
    fresh.textContent = 'Brand new dynamic paragraph content.';
    document.body.appendChild(fresh);

    await new Promise((r) => setTimeout(r, 150));

    expect(onMutation).toHaveBeenCalled();
    const added = onMutation.mock.calls[0][0] as Element[];
    expect(added.some((el) => el === fresh || el.contains(fresh) || fresh.contains(el))).toBe(true);
    watcher.stop();
  });
});
