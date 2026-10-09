/**
 * FR-8: translation-only inline copy sync is debounced. Its own file keeps the
 * module-level rAF write queue (lib/performance) fresh for the fake clock.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPageState, showInlineLoadingPlaceholder } from '@/content/translationDisplay';

describe('translation-only inline copy sync (FR-8)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    document.body.innerHTML = '';
    setPageState('translation-only');
  });

  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.removeAttribute('data-anyllm-state');
  });

  it('runs one sync pass for N inline placeholders and still renders every clone', () => {
    const N = 8;
    const hosts = Array.from({ length: N }, (_, i) => {
      const p = document.createElement('p');
      p.textContent = `Short ${i}`;
      document.body.appendChild(p);
      return p;
    });

    const createSpy = vi.spyOn(document, 'createElement');
    try {
      hosts.forEach((p, i) => showInlineLoadingPlaceholder(p, `inline-${i}`));
      expect(document.querySelectorAll('.anyllm-inline-translation-only-clone')).toHaveLength(0);

      vi.advanceTimersToNextFrame();

      // N placeholders + one clone each: a pass per placeholder would build
      // 1 + 2 + … + N clones (O(N²)).
      const spans = createSpy.mock.calls.filter(([tag]) => tag === 'span');
      expect(spans).toHaveLength(2 * N);
    } finally {
      createSpy.mockRestore();
    }

    const clones = document.querySelectorAll('.anyllm-inline-translation-only-clone');
    expect(clones).toHaveLength(N);
    expect([...clones].map((c) => c.getAttribute('data-anyllm-inline-clone-for'))).toEqual(
      hosts.map((_, i) => `inline-${i}`),
    );
  });
});
