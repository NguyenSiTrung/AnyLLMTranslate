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

import { type ReactNode, useRef, type RefObject } from 'react';
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
}

export function ViewerLayout({
  title = 'PDF Translator',
  subtitle,
  banner,
  left,
  right,
  leftPaneRef,
  headerExtra,
}: ViewerLayoutProps): React.ReactElement {
  const internalLeftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  // Use the external ref for scroll sync if provided, otherwise the internal one
  const leftRef = leftPaneRef ?? internalLeftRef;
  useSynchronizedScroll({ leftRef, rightRef });

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
      <main className="pdf-viewer-main">
        <section className="pdf-viewer-pane pdf-viewer-pane--left">
          <div className="pdf-viewer-pane-label">Original</div>
          <div ref={leftRef} className="pdf-viewer-pages pdf-viewer-pages--left" data-pane="left">
            {left}
          </div>
        </section>
        <section className="pdf-viewer-pane pdf-viewer-pane--right">
          <div className="pdf-viewer-pane-label">Translation</div>
          <div ref={rightRef} className="pdf-viewer-pages pdf-viewer-pages--right" data-pane="right">
            {right}
          </div>
        </section>
      </main>
    </div>
  );
}
