/**
 * Translated PDF Generator — produces a new PDF with original pages as
 * backgrounds and translated text overlaid on top.
 *
 * Strategy:
 * 1. Embed each original page as a full-page background image.
 * 2. For each translated paragraph, draw a white rectangle to mask the
 *    original text, then draw the translated text at the same position.
 * 3. Skip math/figure paragraphs (where translated === original) so they
 *    remain visible from the background layer.
 * 4. Implement manual text wrapping for paragraphs that exceed their width.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { PageTranslations } from './pdfTranslation';

/** Options for generating a translated PDF. */
export interface GenerateTranslatedPdfOptions {
  /** Raw bytes of the original PDF file. */
  originalPdfBytes: Uint8Array;
  /** Map of 1-indexed page number → page translations. */
  pageTranslations: Map<number, PageTranslations>;
  /**
   * Raw bytes of a TrueType (.ttf) font to embed for translated text.
   * If not provided, falls back to Helvetica (standard PDF font).
   */
  fontBytes?: Uint8Array;
  /** Called after each page is processed. */
  onProgress?: (completedPages: number, totalPages: number) => void;
}

/** Right margin (PDF units) for heading full-width calculation. */
const HEADING_RIGHT_MARGIN = 20;

/** Minimum font size (PDF units). */
const MIN_FONT_SIZE = 12;
/** Maximum font size (PDF units). */
const MAX_FONT_SIZE = 32;

/**
 * Clamp font size to the allowed range.
 * Uses the paragraph's fontSize directly (already in PDF-space units).
 */
export function clampFontSize(fontSize: number): number {
  return Math.min(Math.max(fontSize, MIN_FONT_SIZE), MAX_FONT_SIZE);
}

/**
 * Break `text` into lines that each fit within `maxWidth` when rendered at
 * `fontSize` with `font`. Uses a greedy word-wrapping algorithm.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  font: { widthOfTextAtSize: (text: string, size: number) => number },
): string[] {
  if (maxWidth <= 0) return [text];

  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = currentLine + ' ' + words[i];
    const candidateWidth = font.widthOfTextAtSize(candidate, fontSize);
    if (candidateWidth <= maxWidth) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = words[i];
    }
  }
  lines.push(currentLine);

  return lines;
}

/**
 * Embed a font into the output PDFDocument. If custom font bytes are
 * provided, registers fontkit and embeds the TTF. Otherwise falls back
 * to the Helvetica standard font.
 */
async function embedFont(
  outputDoc: PDFDocument,
  fontBytes?: Uint8Array,
) {
  if (fontBytes && fontBytes.length > 0) {
    // Dynamic import of fontkit — it uses WASM and is only needed for
    // custom fonts. This also avoids bundling it when unused.
    const fontkit = await import('@pdf-lib/fontkit');
    outputDoc.registerFontkit(fontkit.default);
    return outputDoc.embedFont(fontBytes);
  }
  // Fallback to standard Helvetica (ASCII-only, no Unicode support).
  return outputDoc.embedFont(StandardFonts.Helvetica);
}

/**
 * Generate a translated PDF from the original PDF bytes and per-page
 * translation data.
 *
 * The output PDF has the same number of pages as the original. Each page
 * contains the original page as a background with translated text overlaid.
 */
export async function generateTranslatedPdf(
  options: GenerateTranslatedPdfOptions,
): Promise<Uint8Array> {
  const { originalPdfBytes, pageTranslations, fontBytes, onProgress } = options;

  // Load the original PDF (read-only source) and create a new output doc.
  const originalDoc = await PDFDocument.load(originalPdfBytes);
  const outputDoc = await PDFDocument.create();

  // Embed the font for drawing translated text.
  const customFont = await embedFont(outputDoc, fontBytes);

  const totalPages = originalDoc.getPageCount();

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    // Embed the original page as a drawable element.
    const [embeddedPage] = await outputDoc.embedPdf(originalDoc, [pageIndex]);
    const { width: pageWidth, height: pageHeight } = embeddedPage;

    // Create a new page with the same dimensions.
    const newPage = outputDoc.addPage([pageWidth, pageHeight]);

    // Draw the original page as a full-page background.
    newPage.drawPage(embeddedPage, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });

    // Process translations for this page (1-indexed).
    const pageNumber = pageIndex + 1;
    const translations = pageTranslations.get(pageNumber);

    if (translations?.originalParagraphs && translations.paragraphs.size > 0) {
      for (const para of translations.originalParagraphs) {
        const translatedText = translations.paragraphs.get(para.id);
        if (translatedText === undefined) continue;

        // Skip verbatim paragraphs (math/figures kept as-is).
        if (translatedText.trim() === para.text.trim()) continue;

        // Convert paragraph coordinates to PDF coordinate system.
        // PDF y-axis goes upward from bottom. The paragraph's y is the top
        // in PDF space (as extracted by pdfTextExtraction).
        const rectX = para.x;
        const rectY = para.y - para.height; // bottom of the rectangle in PDF coords
        const rectWidth = para.width;
        const rectHeight = para.height;

        // Draw white masking rectangle over original text.
        newPage.drawRectangle({
          x: rectX,
          y: rectY,
          width: rectWidth,
          height: rectHeight,
          color: rgb(1, 1, 1), // opaque white
        });

        // Determine drawing parameters.
        const fontSize = clampFontSize(para.fontSize);

        // For headings, use full available width.
        const textWidth = para.isHeading
          ? pageWidth - para.x - HEADING_RIGHT_MARGIN
          : para.width;

        // Wrap text into lines that fit within the available width.
        const lines = wrapText(translatedText, textWidth, fontSize, customFont);

        // Draw each line, starting from the top of the paragraph.
        // In PDF coords, we start at para.y (top) and move downward.
        const lineHeight = fontSize * 1.2;
        let currentY = para.y - fontSize; // baseline of first line

        for (const line of lines) {
          newPage.drawText(line, {
            x: para.x,
            y: currentY,
            size: fontSize,
            font: customFont,
            color: rgb(0, 0, 0),
          });
          currentY -= lineHeight;
        }
      }
    }

    onProgress?.(pageIndex + 1, totalPages);
  }

  return outputDoc.save();
}
