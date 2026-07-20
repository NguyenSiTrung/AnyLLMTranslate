/**
 * Pure helpers for PDF viewer shell session state (reader vs compare).
 */

import type { PdfShellMode } from '@/lib/constants';

export type ReaderFocus = 'source' | 'result';
export type ResultArtifactKind = 'mono' | 'dual';

export interface PdfViewerSessionState {
  shellMode: PdfShellMode;
  readerFocus: ReaderFocus;
  resultKind: ResultArtifactKind | null;
}

export function initialSessionState(): PdfViewerSessionState {
  return { shellMode: 'reader', readerFocus: 'source', resultKind: null };
}

export function applyOpenTranslated(
  _state: PdfViewerSessionState,
  kind: ResultArtifactKind,
): PdfViewerSessionState {
  return { shellMode: 'reader', readerFocus: 'result', resultKind: kind };
}

export function applyOpenCompare(
  _state: PdfViewerSessionState,
  kind: ResultArtifactKind,
): PdfViewerSessionState {
  return { shellMode: 'compare', readerFocus: 'result', resultKind: kind };
}

export function applyShellMode(
  state: PdfViewerSessionState,
  mode: PdfShellMode,
): PdfViewerSessionState {
  if (mode === 'compare' && state.resultKind == null) {
    return state;
  }
  if (mode === 'reader') {
    return {
      ...state,
      shellMode: 'reader',
      readerFocus: state.resultKind ? 'result' : 'source',
    };
  }
  return { ...state, shellMode: 'compare' };
}

export function compareRightLabel(kind: ResultArtifactKind | null): string {
  if (kind === 'dual') return 'Bilingual result';
  return 'Translated';
}

export function readerPaneLabel(
  focus: ReaderFocus,
  kind: ResultArtifactKind | null,
): string {
  if (focus === 'source') return 'Original';
  return compareRightLabel(kind);
}
