/**
 * pdfViewMode — load/save the PDF viewer's Split vs Translation-only preference.
 *
 * Stored in chrome.storage.local under a dedicated key (separate from
 * ExtensionSettings). Defaults to 'split' when absent, unknown, corrupted,
 * or when chrome.storage is unavailable.
 */

import { STORAGE_KEYS, type PdfViewMode } from '@/lib/constants';

const VALID: readonly PdfViewMode[] = ['split', 'translation-only'];

/** Load the saved view mode, defaulting to 'split' for any abnormal state. */
export async function loadPdfViewMode(): Promise<PdfViewMode> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.PDF_VIEW_MODE);
    const raw = result[STORAGE_KEYS.PDF_VIEW_MODE];
    if (typeof raw === 'string' && (VALID as readonly string[]).includes(raw)) {
      return raw as PdfViewMode;
    }
    return 'split';
  } catch {
    return 'split';
  }
}

/** Persist the view mode under its dedicated storage key. */
export async function savePdfViewMode(mode: PdfViewMode): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.PDF_VIEW_MODE]: mode });
}
