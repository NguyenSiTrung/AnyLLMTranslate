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
  isFrameworkOwnedEditor,
  isFocusedWithin,
  getElementText,
  readContentEditableText,
  isPlaceholderNode,
  replaceElementText,
  getDeepActiveElement,
  isCaretAtEnd,
  resolveEditableHost,
  resolveEventTarget,
  isInlineTranslating,
  tryFallbackUndo,
  cancelActiveRequest,
  undoMap,
  lastWrittenMap,
  PULSING_CLASS,
  TOAST_CLASS,
  COPY_PANEL_CLASS,
  removeToast,
  getActiveToast,
  showCopyPanel,
  removeCopyPanel,
  writeElementText,
  writeElementTextAsync,
  verifyWrite,
  isSyntheticInlineEvent,
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
