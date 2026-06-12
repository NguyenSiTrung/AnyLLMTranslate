# Specification: PDF Translation Support

## Overview
This feature introduces a dedicated PDF translation viewer built into the AnyLLMTranslate extension. Because standard content scripts cannot run inside the browser's native sandboxed PDF viewer, this feature redirects PDF links to an embedded viewer page (using `PDF.js` bundled locally). The viewer provides a side-by-side bilingual interface: rendering the original PDF canvas on the left, and displaying the reflowed, LLM-translated text on the right.

## Functional Requirements
1. **Embedded PDF Viewer Page:**
   - Create a new entrypoint `entrypoints/pdf-viewer.html` and companion React/TypeScript application.
   - Bundle `PDF.js` locally within the extension to comply with Manifest V3 policies (no remote scripts).
2. **Access & Redirection:**
   - Detect navigation to PDF files or allow the user to click the extension popup/sidepanel on a PDF tab to redirect to `chrome-extension://<id>/pdf-viewer.html?file=<encoded_pdf_url>`.
   - Provide a manual input in the popup/options to paste a PDF URL and open it in the viewer.
   - Support local `file://` URLs, showing an instruction guide if the user hasn't enabled "Allow access to file URLs" in Chrome extension settings.
3. **Side-by-Side Bilingual UI:**
   - Split-screen layout:
     - **Left Pane:** Renders the original PDF pages using PDF.js canvas rendering.
     - **Right Pane:** Renders the translated text. The layout aligns page-for-page with the left pane.
   - Synchronized scrolling: Scrolling the left pane scrolls the right pane to the corresponding page, and vice versa.
4. **Translation Engine Integration:**
   - Extract text content from each page using PDF.js `page.getTextContent()`.
   - Send text blocks/paragraphs to the background script using the existing translation messaging protocol.
   - Apply user preferences (target language, translation provider, LLM context/category).
   - Show loading/spinner indicators on the right pane while translation is in progress.

## Non-Functional Requirements
- **Manifest V3 Compliance:** All dependencies (including PDF.js worker files) must be fully bundled and run locally. No CDNs or dynamic script injections.
- **Performance:** Load pages progressively (translate pages as they become visible in the viewport to conserve API tokens and avoid freezing).

## Acceptance Criteria
- [ ] Navigating to a PDF or clicking "Translate PDF" redirects successfully to the custom viewer page.
- [ ] The left pane renders the original PDF document pages correctly.
- [ ] The right pane successfully displays the translated text aligned page-by-page.
- [ ] Scrolling one pane synchronizes the scroll position of the other.
- [ ] Works correctly with both HTTP/HTTPS and local `file://` URLs (with appropriate permission handling).

## Out of Scope
- Direct visual editing/saving of the PDF file vectors (modifying the PDF binary itself).
- OCR (Optical Character Recognition) for scanned PDFs/images (requires text to be selectable/extractable via PDF.js).
