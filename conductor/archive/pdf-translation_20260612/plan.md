# Plan: PDF Translation Support

## Phase 1: Foundation & Setup
<!-- execution: sequential -->

- [ ] Task 1.1: Install and bundle `pdfjs-dist` inside the extension
  - [ ] Add `pdfjs-dist` to dependencies in `package.json`
  - [ ] Configure WXT in `wxt.config.ts` to copy the PDF.js worker file and assets as web-accessible resources so they can load locally inside the extension context
- [ ] Task 1.2: Create the PDF viewer HTML/React entrypoint
  - [ ] Create `entrypoints/pdf-viewer.html` and its React mounting script `entrypoints/pdf-viewer/main.tsx`
  - [ ] Add the `pdf-viewer` entrypoint to `wxt.config.ts`
  - [ ] Build a basic container layout to verify mounting and bundle loading
- [ ] Task 1.3: Conductor - User Manual Verification 'Phase 1: Foundation & Setup' (Protocol in workflow.md)

## Phase 2: PDF Renderer & UI Layout
<!-- execution: parallel -->

- [ ] Task 2.1: Render original PDF pages in the left pane
  <!-- files: entrypoints/pdf-viewer/components/PdfCanvasRenderer.tsx -->
  - [ ] Set up the PDF.js loading task in a React hook/component
  - [ ] Render all PDF pages sequentially on HTML canvas elements in the left container
- [ ] Task 2.2: Implement the two-pane layout structure and sidebar
  <!-- files: entrypoints/pdf-viewer/components/ViewerLayout.tsx, entrypoints/pdf-viewer/App.tsx -->
  - [ ] Implement a split-pane container using CSS flexbox or grid (left for PDF canvas, right for translated text)
  - [ ] Add basic styling with modern aesthetics (smooth dark mode, clear borders, responsive scrollbars)
- [ ] Task 2.3: Implement synchronized scrolling between panes
  <!-- files: entrypoints/pdf-viewer/hooks/useSynchronizedScroll.ts -->
  - [ ] Write a custom hook to listen to scroll events on one pane and update the scroll position of the other
  - [ ] Use `IntersectionObserver` to track the active page index
- [ ] Task 2.4: Conductor - User Manual Verification 'Phase 2: PDF Renderer & UI Layout' (Protocol in workflow.md)
  <!-- depends: Task 2.1, Task 2.2, Task 2.3 -->

## Phase 3: Translation Integration
<!-- execution: sequential -->

- [ ] Task 3.1: Write PDF text extraction helper
  - [ ] Implement a utility using `page.getTextContent()` to extract text elements along with their positions
  - [ ] Group extracted text items into paragraphs/blocks based on font size and line spacing
- [ ] Task 3.2: Implement on-demand viewport-based translation
  - [ ] Set up an observer to detect when a page becomes visible in the viewport
  - [ ] Batch request translations from the background script only for visible pages
  - [ ] Cache translations locally using existing cache manager or simple in-memory cache to avoid redundant LLM calls
- [ ] Task 3.3: Render translated text in the right pane
  - [ ] Render the translated paragraphs aligned page-by-page
  - [ ] Add loading skeletons and retry states for pages in progress of translation
- [ ] Task 3.4: Conductor - User Manual Verification 'Phase 3: Translation Integration' (Protocol in workflow.md)

## Phase 4: Redirection Triggers & Entrypoints
<!-- execution: parallel -->

- [ ] Task 4.1: Add "Translate PDF" option to the extension popup
  <!-- files: entrypoints/popup/App.tsx -->
  - [ ] Add a button to open the current PDF in the viewer if the active tab is a PDF URL
  - [ ] Add an input box where users can paste any PDF URL to open it
- [ ] Task 4.2: Update context menus and background listener
  <!-- files: entrypoints/background.ts -->
  - [ ] Add a context menu item "Open in PDF Translator" for links ending in `.pdf`
  - [ ] Listen for messages from the popup or context menu to open the `pdf-viewer.html` tab
- [ ] Task 4.3: Support local `file://` URLs and permissions UI
  <!-- files: entrypoints/pdf-viewer/components/FilePermissionGuide.tsx -->
  - [ ] Check if the extension has access to local files using `chrome.extension.isAllowedFileSchemeAccess()`
  - [ ] Display an onboarding modal/banner instructing the user how to enable "Allow access to file URLs" if access is denied
- [ ] Task 4.4: Conductor - User Manual Verification 'Phase 4: Redirection Triggers & Entrypoints' (Protocol in workflow.md)
  <!-- depends: Task 4.1, Task 4.2, Task 4.3 -->
