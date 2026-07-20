/**
 * ViewerLayout — Shell for the PDF viewer.
 *
 * - reader: single full-width scroll pane
 * - compare: two panes (original | result) with synchronized scroll
 */

import {
  type ReactNode,
  useState,
  type RefObject,
  type RefCallback,
  type ReactElement,
} from 'react';
import type { PdfShellMode } from '@/lib/constants';
import { useSynchronizedScroll } from '../hooks/useSynchronizedScroll';

export interface ViewerLayoutProps {
  title?: string;
  subtitle?: string;
  banner?: ReactNode;
  headerExtra?: ReactNode;
  mode: PdfShellMode;
  /** reader mode */
  reader?: ReactNode;
  readerPaneRef?: RefObject<HTMLDivElement | null>;
  readerLabel?: string;
  /** compare mode */
  left?: ReactNode;
  right?: ReactNode;
  leftPaneRef?: RefObject<HTMLDivElement | null>;
  rightPaneRef?: RefObject<HTMLDivElement | null>;
  leftLabel?: string;
  rightLabel?: string;
  /** Optional absolute overlay inside main (setup card) */
  mainOverlay?: ReactNode;
}

export function ViewerLayout({
  title = 'PDF Translator',
  subtitle,
  banner,
  headerExtra,
  mode,
  reader,
  readerPaneRef,
  readerLabel = 'Original',
  left,
  right,
  leftPaneRef,
  rightPaneRef,
  leftLabel = 'Original',
  rightLabel = 'Translated',
  mainOverlay,
}: ViewerLayoutProps): ReactElement {
  const [leftEl, setLeftEl] = useState<HTMLDivElement | null>(null);
  const [rightEl, setRightEl] = useState<HTMLDivElement | null>(null);

  const bindRef =
    (
      setEl: (el: HTMLDivElement | null) => void,
      external?: RefObject<HTMLDivElement | null>,
    ): RefCallback<HTMLDivElement> =>
    (el) => {
      setEl(el);
      if (external) {
        (external as { current: HTMLDivElement | null }).current = el;
      }
    };

  useSynchronizedScroll({
    leftEl: mode === 'compare' ? leftEl : null,
    rightEl: mode === 'compare' ? rightEl : null,
  });

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
      <main
        className={
          mode === 'compare' ? 'pdf-viewer-main' : 'pdf-viewer-main pdf-viewer-main--single'
        }
        style={{ position: 'relative' }}
      >
        {mode === 'reader' ? (
          <section className="pdf-viewer-pane pdf-viewer-pane--reader">
            <div className="pdf-viewer-pane-label">{readerLabel}</div>
            <div
              ref={bindRef(setLeftEl, readerPaneRef)}
              className="pdf-viewer-pages"
              data-pane="reader"
              aria-label={`${readerLabel} PDF`}
            >
              {reader}
            </div>
          </section>
        ) : (
          <>
            <section className="pdf-viewer-pane pdf-viewer-pane--left">
              <div className="pdf-viewer-pane-label">{leftLabel}</div>
              <div
                ref={bindRef(setLeftEl, leftPaneRef)}
                className="pdf-viewer-pages pdf-viewer-pages--left"
                data-pane="left"
                aria-label="Original PDF"
              >
                {left}
              </div>
            </section>
            <section className="pdf-viewer-pane pdf-viewer-pane--right">
              <div className="pdf-viewer-pane-label">{rightLabel}</div>
              <div
                ref={bindRef(setRightEl, rightPaneRef)}
                className="pdf-viewer-pages pdf-viewer-pages--right"
                data-pane="right"
                aria-label={`${rightLabel} PDF`}
              >
                {right}
              </div>
            </section>
          </>
        )}
        {mainOverlay}
      </main>
    </div>
  );
}
