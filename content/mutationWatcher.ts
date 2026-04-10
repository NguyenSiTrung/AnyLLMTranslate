/**
 * MutationWatcher — observes DOM for dynamic content changes (SPAs).
 * Detects new translatable content and triggers re-extraction.
 */

import { MUTATION_DEBOUNCE_MS, DATA_ATTRS, SKIP_ELEMENTS, BLOCK_ELEMENTS } from '@/lib/constants';

export type OnMutationCallback = (addedElements: Element[]) => void;

export class MutationWatcher {
  private observer: MutationObserver | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingElements: Element[] = [];
  private onMutation: OnMutationCallback;
  private debounceMs: number;

  constructor(onMutation: OnMutationCallback, debounceMs = MUTATION_DEBOUNCE_MS) {
    this.onMutation = onMutation;
    this.debounceMs = debounceMs;
  }

  /** Start observing DOM mutations */
  start(root: Node = document.body): void {
    if (this.observer) return;

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue;

        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const el = node as Element;

          // Skip our own injected nodes
          if (el.hasAttribute(DATA_ATTRS.TRANSLATED)) continue;
          if (el.getAttribute(DATA_ATTRS.ROLE) === 'translation') continue;
          if (el.classList.contains('lingua-lens-translation')) continue;

          // Skip non-translatable elements
          if (SKIP_ELEMENTS.has(el.tagName)) continue;

          // Only care about block-level elements (contain translatable text)
          if (BLOCK_ELEMENTS.has(el.tagName) || el.tagName === 'BODY') {
            this.pendingElements.push(el);
          } else {
            // For non-block elements, check if they contain text
            if (el.textContent?.trim() && el.textContent.trim().length > 2) {
              this.pendingElements.push(el);
            }
          }
        }
      }

      if (this.pendingElements.length > 0) {
        this.scheduleFlush();
      }
    });

    this.observer.observe(root, {
      childList: true,
      subtree: true,
    });
  }

  /** Stop observing mutations */
  stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.pendingElements = [];
  }

  /** Whether the watcher is active */
  get isActive(): boolean {
    return this.observer !== null;
  }

  private scheduleFlush(): void {
    if (this.debounceTimer) return;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      // Defer to idle callback for non-critical processing
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => this.flush(), { timeout: 2000 });
      } else {
        this.flush();
      }
    }, this.debounceMs);
  }

  private flush(): void {
    if (this.pendingElements.length === 0) return;

    // Deduplicate — keep only root-level elements (remove children of other pending)
    const elements = this.deduplicateElements(this.pendingElements);
    this.pendingElements = [];

    this.onMutation(elements);
  }

  private deduplicateElements(elements: Element[]): Element[] {
    const unique: Element[] = [];

    for (const el of elements) {
      const isChildOfAnother = elements.some(
        (other) => other !== el && other.contains(el),
      );
      if (!isChildOfAnother) {
        unique.push(el);
      }
    }

    return unique;
  }
}
