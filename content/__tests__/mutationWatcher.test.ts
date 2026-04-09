import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MutationWatcher } from '../mutationWatcher';

describe('content/mutationWatcher', () => {
  let callback: ReturnType<typeof vi.fn>;
  let watcher: MutationWatcher;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    callback = vi.fn();
    watcher = new MutationWatcher(callback, 100);
  });

  afterEach(() => {
    watcher.stop();
    vi.useRealTimers();
  });

  describe('lifecycle', () => {
    it('starts as inactive', () => {
      expect(watcher.isActive).toBe(false);
    });

    it('becomes active after start', () => {
      watcher.start();
      expect(watcher.isActive).toBe(true);
    });

    it('becomes inactive after stop', () => {
      watcher.start();
      watcher.stop();
      expect(watcher.isActive).toBe(false);
    });

    it('does not duplicate observer on multiple starts', () => {
      watcher.start();
      watcher.start();
      expect(watcher.isActive).toBe(true);
      watcher.stop();
      expect(watcher.isActive).toBe(false);
    });
  });

  describe('mutation detection', () => {
    it('detects added block elements', async () => {
      watcher.start();

      const div = document.createElement('div');
      div.textContent = 'Dynamic content loaded';
      document.body.appendChild(div);

      // Wait for MutationObserver to fire
      await vi.advanceTimersByTimeAsync(0);
      // Wait for debounce
      await vi.advanceTimersByTimeAsync(150);

      expect(callback).toHaveBeenCalledTimes(1);
      const elements = callback.mock.calls[0][0] as Element[];
      expect(elements.length).toBe(1);
      expect(elements[0].textContent).toBe('Dynamic content loaded');
    });

    it('skips extension-injected elements', async () => {
      watcher.start();

      const translation = document.createElement('div');
      translation.setAttribute('data-lingua-role', 'translation');
      translation.textContent = 'Injected translation';
      document.body.appendChild(translation);

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(150);

      expect(callback).not.toHaveBeenCalled();
    });

    it('skips script and style elements', async () => {
      watcher.start();

      const script = document.createElement('script');
      script.textContent = 'console.log("hidden")';
      document.body.appendChild(script);

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(150);

      expect(callback).not.toHaveBeenCalled();
    });

    it('deduplicates nested elements', async () => {
      watcher.start();

      const container = document.createElement('article');
      const p1 = document.createElement('p');
      p1.textContent = 'Paragraph one';
      const p2 = document.createElement('p');
      p2.textContent = 'Paragraph two';
      container.appendChild(p1);
      container.appendChild(p2);
      document.body.appendChild(container);

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(150);

      // Should report the article container, not individual paragraphs
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
