import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MutationWatcher } from '../mutationWatcher';

describe('MutationWatcher — body-swap detection (FR-1)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // Ensure a clean <body> exists
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  it('fires onBodySwapped when <body> is replaced with a new node', async () => {
    const onMutation = vi.fn();
    const onBodySwapped = vi.fn();
    const watcher = new MutationWatcher(onMutation, 100, onBodySwapped);
    watcher.start(document.body);

    // Replace <body> with a new <body> element
    const oldBody = document.body;
    const newBody = document.createElement('body');
    newBody.innerHTML = '<p>New content</p>';
    document.documentElement.replaceChild(newBody, oldBody);

    // Allow MutationObserver microtask + 100ms debounce to fire
    await new Promise((r) => setTimeout(r, 150));

    expect(onBodySwapped).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it('does NOT fire onBodySwapped for unrelated mutations under <html>', async () => {
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
    watcher.stop();
  });

  it('does NOT fire onBodySwapped for mutations inside <body>', async () => {
    const onMutation = vi.fn();
    const onBodySwapped = vi.fn();
    const watcher = new MutationWatcher(onMutation, 100, onBodySwapped);
    watcher.start(document.body);

    // Add content inside <body> — this is a normal mutation, not a body swap
    const p = document.createElement('p');
    p.textContent = 'New paragraph';
    document.body.appendChild(p);

    await new Promise((r) => setTimeout(r, 50));

    expect(onBodySwapped).not.toHaveBeenCalled();
    watcher.stop();
  });

  it('fires onBodySwapped when body is removed and re-added', async () => {
    const onMutation = vi.fn();
    const onBodySwapped = vi.fn();
    const watcher = new MutationWatcher(onMutation, 100, onBodySwapped);
    watcher.start(document.body);

    // Remove body
    const oldBody = document.body;
    document.documentElement.removeChild(oldBody);

    await new Promise((r) => setTimeout(r, 50));

    // Re-add a new body
    const newBody = document.createElement('body');
    newBody.innerHTML = '<p>Re-added body</p>';
    document.documentElement.appendChild(newBody);

    // Wait for debounce (100ms) + buffer
    await new Promise((r) => setTimeout(r, 150));

    expect(onBodySwapped).toHaveBeenCalledTimes(1);
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
