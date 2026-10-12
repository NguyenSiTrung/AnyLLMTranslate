/**
 * Loading overlay for inline translation (refer `Nqe`): three rolling dots
 * pinned inside the right edge of the field from trigger until the result is
 * written, cancelled or fails. Lives in a shadow root so page CSS cannot
 * restyle it; coexists with the pulse class on the field.
 */

const OVERLAY_WIDTH = 34;
const OVERLAY_HEIGHT = 14;
const EDGE_INSET = 8;

const OVERLAY_CSS = `
:host { all: initial; }
.dots { display: flex; gap: 4px; align-items: center; justify-content: center;
  width: ${OVERLAY_WIDTH}px; height: ${OVERLAY_HEIGHT}px; pointer-events: none; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: #f59e0b;
  animation: anyllm-roll 1s infinite ease-in-out; }
.dot:nth-child(2) { animation-delay: 0.15s; }
.dot:nth-child(3) { animation-delay: 0.3s; }
@keyframes anyllm-roll {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) { .dot { animation: none; opacity: 0.8; } }
`;

let host: HTMLElement | null = null;
let anchor: HTMLElement | null = null;
let detach: (() => void) | null = null;

function position(): void {
  if (!host || !anchor) return;
  if (!anchor.isConnected) {
    hideLoadingOverlay();
    return;
  }
  const rect = anchor.getBoundingClientRect();
  const left = Math.max(rect.left, rect.right - OVERLAY_WIDTH - EDGE_INSET);
  const top = rect.top + Math.max(0, (Math.min(rect.height, 40) - OVERLAY_HEIGHT) / 2);
  host.style.left = `${left}px`;
  host.style.top = `${top}px`;
}

/** Show the overlay on `field`, replacing any overlay already shown. */
export function showLoadingOverlay(field: HTMLElement): void {
  hideLoadingOverlay();

  const el = document.createElement('div');
  el.setAttribute('data-anyllm-owned', '1');
  el.setAttribute('data-anyllm-role', 'inline-overlay');
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, {
    position: 'fixed',
    zIndex: '2147483647',
    pointerEvents: 'none',
    width: `${OVERLAY_WIDTH}px`,
    height: `${OVERLAY_HEIGHT}px`,
  });
  const shadow = el.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${OVERLAY_CSS}</style><div class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>`;

  // An open modal <dialog> sits in the top layer above any z-index.
  (field.closest('dialog[open]') ?? document.body).appendChild(el);
  host = el;
  anchor = field;
  position();

  const onMove = () => position();
  window.addEventListener('scroll', onMove, true);
  window.addEventListener('resize', onMove);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(onMove) : null;
  observer?.observe(field);
  detach = () => {
    window.removeEventListener('scroll', onMove, true);
    window.removeEventListener('resize', onMove);
    observer?.disconnect();
  };
}

/** Remove the overlay (no-op when none is shown). */
export function hideLoadingOverlay(): void {
  detach?.();
  detach = null;
  host?.remove();
  host = null;
  anchor = null;
}

/** Test helper: the overlay host, if shown. */
export function getLoadingOverlay(): HTMLElement | null {
  return host;
}
