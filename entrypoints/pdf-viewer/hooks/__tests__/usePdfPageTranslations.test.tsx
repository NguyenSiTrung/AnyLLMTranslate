/**
 * Tests for PDF page translation viewport wiring.
 *
 * The regression this protects against: if the IntersectionObserver root is
 * set to the inner content wrapper instead of the actual scroll pane, every
 * page slot appears visible and the viewer starts translating the whole PDF.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';
import { usePdfPageTranslations } from '../usePdfPageTranslations';

const observerInstances: Array<{ options?: IntersectionObserverInit; observe: ReturnType<typeof vi.fn> }> = [];
const OriginalIntersectionObserver = globalThis.IntersectionObserver;

beforeEach(() => {
  observerInstances.length = 0;
  globalThis.IntersectionObserver = vi.fn((callback: IntersectionObserverCallback, options?: IntersectionObserverInit) => {
    void callback;
    const instance = {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
      takeRecords: vi.fn(() => []),
      root: options?.root ?? null,
      rootMargin: options?.rootMargin ?? '',
      thresholds: [],
      options,
    };
    observerInstances.push(instance);
    return instance;
  }) as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  globalThis.IntersectionObserver = OriginalIntersectionObserver;
  document.body.innerHTML = '';
});

describe('usePdfPageTranslations', () => {
  it('uses the scroll pane, not the inner content wrapper, as IntersectionObserver root', () => {
    const scrollPane = document.createElement('div');
    scrollPane.setAttribute('data-pane', 'right');
    const contentWrapper = document.createElement('div');
    const slot = document.createElement('div');
    slot.setAttribute('data-page-slot', '1');
    contentWrapper.appendChild(slot);
    scrollPane.appendChild(contentWrapper);
    document.body.appendChild(scrollPane);

    renderHook(() => {
      const containerRef = useRef<HTMLElement | null>(contentWrapper);
      return usePdfPageTranslations({
        pages: [{} as PDFPageProxy],
        pdfUrl: 'https://example.com/file.pdf',
        containerRef,
      });
    });

    expect(observerInstances.length).toBeGreaterThan(0);
    for (const instance of observerInstances) {
      expect(instance.options?.root).toBe(scrollPane);
    }
  });
});
