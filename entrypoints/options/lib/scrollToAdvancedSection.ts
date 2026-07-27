export const ADVANCED_SECTION_IDS = {
  prompt: 'advanced-section-prompt',
  performance: 'advanced-section-performance',
  quality: 'advanced-section-quality',
  context: 'advanced-section-context',
  pdf: 'advanced-section-pdf',
  developer: 'advanced-section-developer',
} as const;

export type AdvancedSectionId =
  (typeof ADVANCED_SECTION_IDS)[keyof typeof ADVANCED_SECTION_IDS];

export const ADVANCED_SECTION_HIGHLIGHT_MS = 1200;

let highlightTimer: ReturnType<typeof setTimeout> | null = null;
let highlightedEl: HTMLElement | null = null;

export function prefersReducedMotion(win: Window = window): boolean {
  try {
    return Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    return false;
  }
}

function clearHighlight(): void {
  if (highlightTimer != null) {
    clearTimeout(highlightTimer);
    highlightTimer = null;
  }
  if (highlightedEl) {
    highlightedEl.removeAttribute('data-advanced-section-highlight');
    highlightedEl = null;
  }
}

/**
 * Scrolls the Advanced tab section into view, moves focus, and briefly highlights it.
 * @returns false if the element is not in the document.
 */
export function scrollToAdvancedSection(
  sectionId: string,
  opts?: { document?: Document; window?: Window },
): boolean {
  const doc = opts?.document ?? document;
  const win = opts?.window ?? window;
  const el = doc.getElementById(sectionId);
  if (!el) return false;

  const reduced = prefersReducedMotion(win);
  el.scrollIntoView({
    behavior: reduced ? 'auto' : 'smooth',
    block: 'start',
  });

  if (typeof (el as HTMLElement).focus === 'function') {
    (el as HTMLElement).focus({ preventScroll: true });
  }

  clearHighlight();
  el.setAttribute('data-advanced-section-highlight', 'true');
  highlightedEl = el as HTMLElement;
  highlightTimer = setTimeout(() => {
    if (highlightedEl === el) {
      el.removeAttribute('data-advanced-section-highlight');
      highlightedEl = null;
    }
    highlightTimer = null;
  }, ADVANCED_SECTION_HIGHLIGHT_MS);

  return true;
}
