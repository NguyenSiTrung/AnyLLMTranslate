/**
 * MutationWatcher — observes DOM for dynamic content changes (SPAs).
 * Detects new translatable content and triggers re-extraction.
 * FR-1: Also detects SPA <body> replacement (Next.js App Router, Astro view
 * transitions, Turbo Drive) via a second observer on <html>, re-initializing
 * translation on the new body.
 */

import { MUTATION_DEBOUNCE_MS, DATA_ATTRS, SKIP_ELEMENTS, BLOCK_ELEMENTS } from '@/lib/constants';
import { deduplicateAncestors } from '@/lib/domUtils';
import { getRegisteredShadowRoots, registerShadowRoots } from './shadowDomRoots';

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
  /** FR-23: per-root observers for registered open shadow roots */
  private shadowObservers = new Map<ShadowRoot, MutationObserver>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingElements: Element[] = [];
  private onMutation: OnMutationCallback;
  private onBodySwapped: OnBodySwappedCallback | null;
  private debounceMs: number;
  /** FR-23: observe registered open shadow roots for dynamic content */
  private observeShadowRoots: boolean;

  constructor(
    onMutation: OnMutationCallback,
    debounceMs = MUTATION_DEBOUNCE_MS,
    onBodySwapped?: OnBodySwappedCallback,
    observeShadowRoots = false,
  ) {
    this.onMutation = onMutation;
    this.debounceMs = debounceMs;
    this.onBodySwapped = onBodySwapped ?? null;
    this.observeShadowRoots = observeShadowRoots;
  }

  /**
   * True when `el` is (or lives under) an extension-owned translation region.
   * Without the ancestor check, moving children into an original wrapper (LI/TD)
   * or characterData inside a marked paragraph re-queues the same content with
   * a new piece id — producing duplicate bilingual blocks / repeated errors.
   */
  private isExtensionOwned(el: Element): boolean {
    if (el.hasAttribute(DATA_ATTRS.OWNED)) return true;
    if (el.hasAttribute(DATA_ATTRS.TRANSLATED)) return true;
    if (el.hasAttribute(DATA_ATTRS.PIECE_ID)) return true;
    if (el.getAttribute(DATA_ATTRS.ROLE) === 'translation') return true;
    if (el.getAttribute(DATA_ATTRS.ROLE) === 'original') return true;
    if (el.classList.contains('anyllm-translate-translation')) return true;
    if (el.classList.contains('anyllm-inline-bilingual')) return true;
    // Descendants of extension-owned / already-translated / translation /
    // original wrappers
    if (
      el.closest(
        `[${DATA_ATTRS.OWNED}], [${DATA_ATTRS.TRANSLATED}], [${DATA_ATTRS.PIECE_ID}], ` +
          `[${DATA_ATTRS.ROLE}="translation"], [${DATA_ATTRS.ROLE}="original"], ` +
          `.anyllm-translate-translation, .anyllm-inline-bilingual`,
      )
    ) {
      return true;
    }
    return false;
  }

  /**
   * sm7n: extension-injected artifact nodes — translations, placeholders,
   * error chips, inline bilinguals/clones, and owned UI. Changes under these
   * must never enqueue source work (no self-trigger), unlike `role=original`
   * regions which are site content we must watch.
   */
  private artifactAncestor(el: Element): Element | null {
    return el.closest(
      `[${DATA_ATTRS.ROLE}="translation"], [${DATA_ATTRS.PIECE_ID}], ` +
        `[${DATA_ATTRS.OWNED}], .anyllm-inline-bilingual, ` +
        `.anyllm-inline-translation-only-clone`,
    );
  }

  /** sm7n: true when a changed node is itself (or sits inside) an artifact. */
  private isArtifactNode(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = node as Element;
    return (
      el.matches(
        `[${DATA_ATTRS.ROLE}="translation"], [${DATA_ATTRS.PIECE_ID}], ` +
          `[${DATA_ATTRS.OWNED}], .anyllm-inline-bilingual, ` +
          `.anyllm-inline-translation-only-clone`,
      ) || this.artifactAncestor(el) !== null
    );
  }

  /** sm7n: the marked original host containing `el`, or null. */
  private originalHostFor(el: Element): Element | null {
    return el.closest(`[${DATA_ATTRS.ROLE}="original"]`);
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

  /** Shared mutation path for document and shadow observers — added elements
   *  that expose new open roots are registered/observed, then processed
   *  through the same debounce/dedup pipeline as any other content. */
  private handleMutations(mutations: MutationRecord[]): void {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        const el = mutation.target.parentElement;
        if (el) {
          // sm7n: edits under injected artifacts never enqueue; site text
          // inside a marked original surfaces the original host instead of
          // the (extension-marked) text's parent element.
          if (this.artifactAncestor(el)) continue;
          const originalHost = this.originalHostFor(el);
          if (originalHost) {
            this.pendingElements.push(originalHost);
          } else {
            this.processElement(el);
          }
        }
        continue;
      }

      if (mutation.type === 'childList') {
        // sm7n: site structural edits inside a marked original — the target
        // itself is not inside an artifact and at least one changed node is
        // not extension-owned. Catches source replacement/removal without
        // self-triggering on injected translation nodes.
        const target = mutation.target;
        if (target instanceof Element && !this.artifactAncestor(target)) {
          const originalHost = this.originalHostFor(target);
          if (originalHost) {
            const siteChange = [
              ...mutation.addedNodes,
              ...mutation.removedNodes,
            ].some(
              (node) =>
                node.nodeType === Node.TEXT_NODE || !this.isArtifactNode(node),
            );
            if (siteChange) this.pendingElements.push(originalHost);
          }
        }
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
            this.processElement(node.parentElement);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            // Skip the subtree scan for extension-owned nodes — their shadow
            // roots (if any) are ours and must not be registered/observed.
            if (this.observeShadowRoots && !this.isExtensionOwned(el)) {
              this.registerAndObserveShadowRoots(el);
            }
            this.processElement(el);
          }
        }
      }
    }

    if (this.pendingElements.length > 0) {
      this.scheduleFlush();
    }
  }

  /** FR-23: observe a shadow root once; shares handleMutations/dedup. */
  private observeShadowRoot(root: ShadowRoot): void {
    if (this.shadowObservers.has(root)) return;
    const observer = new MutationObserver((mutations) => this.handleMutations(mutations));
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    this.shadowObservers.set(root, observer);
  }

  /** FR-23: register open roots discovered under `scope` and observe each. */
  private registerAndObserveShadowRoots(scope: ParentNode): void {
    for (const root of registerShadowRoots(scope)) {
      this.observeShadowRoot(root);
    }
  }

  /** Start observing DOM mutations */
  start(root: Node = document.body): void {
    if (this.observer) return;

    // FR-1: track the initial body identity for swap detection
    this.lastSeenBody = document.body;

    this.observer = new MutationObserver((mutations) => this.handleMutations(mutations));

    this.observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // FR-23: observe open roots registered during extraction, plus any open
    // roots already present under the observed root but not yet registered.
    if (this.observeShadowRoots) {
      for (const shadowRoot of getRegisteredShadowRoots()) {
        this.observeShadowRoot(shadowRoot);
      }
      if (root instanceof Element || root instanceof Document) {
        this.registerAndObserveShadowRoots(root);
      }
    }

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

    for (const shadowObserver of this.shadowObservers.values()) {
      shadowObserver.disconnect();
    }
    this.shadowObservers.clear();

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
    // Drop observers for roots whose host left the document — the global
    // registry keeps them so teardown cleanup still reaches detached trees.
    for (const [root, observer] of this.shadowObservers) {
      if (!root.isConnected) {
        observer.disconnect();
        this.shadowObservers.delete(root);
      }
    }

    if (this.pendingElements.length === 0) return;

    // Deduplicate — keep only root-level elements (remove children of other pending)
    const elements = this.deduplicateElements(this.pendingElements);
    this.pendingElements = [];

    this.onMutation(elements);

    // FR-23: the callback (extraction) may register roots that attached after
    // the delivery-time scan — attachShadow emits no mutation record. Observe
    // every registered root now; already-observed roots are skipped and
    // detached roots stay unobserved (the registry keeps them for teardown).
    if (this.observeShadowRoots) {
      for (const root of getRegisteredShadowRoots()) {
        if (root.isConnected) this.observeShadowRoot(root);
      }
    }
  }

  private deduplicateElements(elements: Element[]): Element[] {
    return deduplicateAncestors(elements);
  }
}
