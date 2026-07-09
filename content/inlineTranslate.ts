/**
 * Re-export barrel for import stability.
 * Implementation lives under content/inlineTranslate/.
 */
export {
  initInlineTranslate,
  setInlineTranslateEnabled,
  updateInlineTranslateConfig,
  getInlineTranslateConfig,
  translateFocusedInput,
  isEditableElement,
  isCodeEditor,
  getElementText,
  replaceElementText,
  getDeepActiveElement,
  isCaretAtEnd,
  isInlineTranslating,
  tryFallbackUndo,
  cancelActiveRequest,
  undoMap,
  PULSING_CLASS,
  TOAST_CLASS,
  removeToast,
  getActiveToast,
  writeElementText,
  joinDualMode,
  isUrlBlocked,
  isCurrentPageBlocked,
  resolveBlocklistPatterns,
  createGestureController,
  parseLanguagePrefix,
  type InlineTranslateConfig,
  type InlineTranslateRuntimeConfig,
} from './inlineTranslate/index';

// Test-only shape: previous code exported `activeToast` as a let binding.
// Consumers of the test helper use removeToast / getActiveToast instead.
export { getActiveToast as activeToast } from './inlineTranslate/index';
