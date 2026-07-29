/**
 * Selection bubble public surface for the textSelection orchestrator.
 */

export { buildFooterActions, setStatusLine, clearStatusLine } from './actions';
export {
  createTranslateChip,
  removeTranslateChip,
  getTranslateChip,
} from './chip';
export { buildDictionaryContent } from './contentDictionary';
export { buildErrorContent } from './contentError';
export { buildLoadingContent } from './contentLoading';
export { buildSentenceContent } from './contentSentence';
export { addToGlobalGlossary } from './glossaryAdd';
export type { GlossaryAddResult } from './glossaryAdd';
export { computeBubblePosition } from './position';
export {
  showLoading,
  applySentence,
  applyDictionary,
  applyError,
  removeDialog,
  getDialogEl,
  isPinned,
  setPinned,
  shouldDismissOnOutsideClick,
  reposition,
  setSpeakingState,
  showStatus,
  getPrimaryText,
  getOriginalText,
  getTargetLanguage,
  getSourceLanguage,
  __setDialogForTest,
} from './shell';
export type { ShellShowLoadingArgs } from './shell';
export { SpeakController } from './speak';
export {
  DIALOG_CLASS,
  DIALOG_LEGACY_CLASS,
  CHIP_CLASS,
} from './types';
export type {
  AnchorRect,
  BubbleActionHandlers,
  BubbleMode,
  SelectionActionId,
} from './types';
