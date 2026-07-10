/**
 * MutationWatcher — observes DOM for dynamic content changes (SPAs).
 * Detects new translatable content and triggers re-extraction.
 * FR-1: Also detects SPA <body> replacement (Next.js App Router, Astro view
 * transitions, Turbo Drive) via a second observer on <html>, re-initializing
 * translation on the new body.
 */

import { MUTATION_DEBOUNCE_MS, DATA_ATTRS, SKIP_ELEMENTS, BLOCK_ELEMENTS } from '@/lib/constants';
import { deduplicateAncestors } from '@/lib/domUtils';

export type OnMutationCallback = (addedElements: Element[]) => void;
export type OnBodySwappedCallback = () => void;

export class MutationWatcher {
  private observer: MutationObserver | null = null;
  /** FR-1: second observer on <html> for body-swap detection */
  private bodySwapObserver: MutationObserver | null = null;
  /** FR-1: last-seen <body> element identity for swap detection */
  private lastSeenBody: Element | null = null;
  /** FR-1: debounce timer for body-swap callback */
  private bodySwapTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingElements: Element[] = [];
  private onMutation: OnMutationCallback;
  private onBodySwapped: OnBodySwappedCallback | null;
  private debounceMs: number;

  constructor(
    onMutation: OnMutationCallback,
    debounceMs = MUTATION_DEBOUNCE_MS,
    onBodySwapped?: OnBodySwappedCallback,
  ) {
    this.onMutation = onMutation;
    this.debounceMs = debounceMs;
    this.onBodySwapped = onBodySwapped ?? null;
  }

  /**
   * True when `el` is (or lives under) an extension-owned translation region.
   * Without the ancestor check, moving children into an original wrapper (LI/TD)
   * or characterData inside a marked paragraph re-queues the same content with
   * a new piece id — producing duplicate bilingual blocks / repeated errors.
   */
  private isExtensionOwned(el: Element): boolean {
    if (el.hasAttribute(DATA_ATTRS.TRANSLATED)) return true;
    if (el.hasAttribute(DATA_ATTRS.PIECE_ID)) return true;
    if (el.getAttribute(DATA_ATTRS.ROLE) === 'translation') return true;
    if (el.getAttribute(DATA_ATTRS.ROLE) === 'original') return true;
    if (el.classList.contains('anyllm-translate-translation')) return true;
    if (el.classList.contains('anyllm-inline-bilingual')) return true;
    // Descendants of already-translated / translation / original wrappers
    if (
      el.closest(
        `[${DATA_ATTRS.TRANSLATED}], [${DATA_ATTRS.PIECE_ID}], ` +
          `[${DATA_ATTRS.ROLE}="translation"], [${DATA_ATTRS.ROLE}="original"], ` +
          `.anyllm-translate-translation, .anyllm-inline-bilingual`,
      )
    ) {
      return true;
    }
    return false;
  }

  private processElement(el: Element): void {
    // Skip our own injected nodes and anything inside them
    if (this.isExtensionOwned(el)) return;

    // Skip non-translatable elements
    if (SKIP_ELEMENTS.has(el.tagName)) return;

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

  /** Start observing DOM mutations */
  start(root: Node = document.body): void {
    if (this.observer) return;

    // FR-1: track the initial body identity for swap detection
    this.lastSeenBody = document.body;

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          const el = mutation.target.parentElement;
          if (el) this.processElement(el);
          continue;
        }

        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
              this.processElement(node.parentElement);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              this.processElement(node as Element);
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
      characterData: true,
    });

    // FR-1: second observer on <html> for body-swap detection
    if (this.onBodySwapped) {
      this.bodySwapObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type !== 'childList') continue;
          // Check if a new <body> was added to <html>
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'BODY') {
              const newBody = node as Element;
              // Guard: only fire if the new body is a DIFFERENT identity than
              // the last-seen body (prevents double-fire for same node).
              if (newBody !== this.lastSeenBody) {
                this.lastSeenBody = newBody;
                this.scheduleBodySwap();
              }
            }
          }
        }
      });

      this.bodySwapObserver.observe(document.documentElement, {
        childList: true,
      });
    }
  }

  /** Stop observing mutations */
  stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.bodySwapObserver) {
      this.bodySwapObserver.disconnect();
      this.bodySwapObserver = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.bodySwapTimer) {
      clearTimeout(this.bodySwapTimer);
      this.bodySwapTimer = null;
    }

    this.pendingElements = [];
    this.lastSeenBody = null;
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

  /** FR-1: debounce the body-swap callback so rapid swaps coalesce */
  private scheduleBodySwap(): void {
    if (this.bodySwapTimer) return;
    this.bodySwapTimer = setTimeout(() => {
      this.bodySwapTimer = null;
      this.onBodySwapped?.();
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
    return deduplicateAncestors(elements);
  }
}
