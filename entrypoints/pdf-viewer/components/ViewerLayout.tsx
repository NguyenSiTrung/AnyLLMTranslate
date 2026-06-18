/**
 * ViewerLayout — Two-pane shell for the PDF viewer.
 *
 * Each pane has its own scroll container. Synchronization is delegated to
 * `useSynchronizedScroll`, which mirrors scroll offsets between them.
 *
 * The layout is a CSS grid so that the right pane can be a flex column
 * (label + scroll container) without disturbing the left pane's vertical
 * canvas stack.
 */

import { type ReactNode, useState, type RefObject, type RefCallback } from 'react';
import type { PdfViewMode } from '@/lib/constants';
import { useSynchronizedScroll } from '../hooks/useSynchronizedScroll';

export interface ViewerLayoutProps {
  /** Title shown in the header (defaults to the file URL or "PDF Translator"). */
  title?: string;
  /** Optional subtitle / secondary line (e.g. file URL). */
  subtitle?: string;
  /** Top banner — e.g. file-scheme permission warning. */
  banner?: ReactNode;
  /** Left pane content (original PDF canvases). */
  left: ReactNode;
  /** Right pane content (translated text). */
  right: ReactNode;
  /** Optional external ref to the left scroll container (for canvas virtualization). */
  leftPaneRef?: RefObject<HTMLDivElement | null>;
  /** Optional extra content to place on the right side of the header. */
  headerExtra?: ReactNode;
  /** Whether to render the split (two-pane) layout or translation-only (single column). Defaults to 'split'. */
  viewMode?: PdfViewMode;
}

export function ViewerLayout({
  title = 'PDF Translator',
  subtitle,
  banner,
  left,
  right,
  leftPaneRef,
  headerExtra,
  viewMode = 'split',
}: ViewerLayoutProps): React.ReactElement {
  // Track the pane elements in STATE via callback refs. Unlike ref objects,
  // state updates trigger re-render, so useSynchronizedScroll's effect re-runs
  // (detaching stale listeners, attaching fresh ones) when a pane element
  // mounts/unmounts — e.g. Split → Translation → Split. A plain ref would miss
  // the remount because ref mutations don't cause re-render.
  const [leftEl, setLeftEl] = useState<HTMLDivElement | null>(null);
  const [rightEl, setRightEl] = useState<HTMLDivElement | null>(null);

  // Merge the external leftPaneRef (used by App's useVisiblePages) with the
  // internal state-setting callback ref. The external ref is read-only here.
  const externalLeftRef = leftPaneRef ?? null;
  const leftRefCallback: RefCallback<HTMLDivElement> = (el) => {
    setLeftEl(el);
    if (externalLeftRef) {
      (externalLeftRef as { current: HTMLDivElement | null }).current = el;
    }
  };
  const rightRefCallback: RefCallback<HTMLDivElement> = (el) => {
    setRightEl(el);
  };
  useSynchronizedScroll({ leftEl, rightEl });

  return (
    <div className="pdf-viewer-root">
      <header className="pdf-viewer-header">
        <div className="pdf-viewer-header-left">
          <h1>{title}</h1>
          {subtitle && <p className="pdf-viewer-subtitle">{subtitle}</p>}
        </div>
        {headerExtra && <div className="pdf-viewer-header-right">{headerExtra}</div>}
      </header>
      {banner && <div className="pdf-viewer-banner-wrap">{banner}</div>}
      {viewMode === 'translation-only' ? (
        <main className="pdf-viewer-main pdf-viewer-main--single">
          <section className="pdf-viewer-pane pdf-viewer-pane--right">
            <div className="pdf-viewer-pane-label">Translation</div>
            <div ref={rightRefCallback} className="pdf-viewer-pages pdf-viewer-pages--right" data-pane="right">
              {right}
            </div>
          </section>
        </main>
      ) : (
        <main className="pdf-viewer-main">
          <section className="pdf-viewer-pane pdf-viewer-pane--left">
            <div className="pdf-viewer-pane-label">Original</div>
            <div ref={leftRefCallback} className="pdf-viewer-pages pdf-viewer-pages--left" data-pane="left">
              {left}
            </div>
          </section>
          <section className="pdf-viewer-pane pdf-viewer-pane--right">
            <div className="pdf-viewer-pane-label">Translation</div>
            <div ref={rightRefCallback} className="pdf-viewer-pages pdf-viewer-pages--right" data-pane="right">
              {right}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
