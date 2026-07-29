/**
 * Shared types and class-name constants for the selection translate bubble.
 */

export const DIALOG_CLASS = 'anyllm-selection-dialog';
/** Legacy class retained on the dialog root for CSS/tests during migration. */
export const DIALOG_LEGACY_CLASS = 'anyllm-selection-tooltip';
export const CHIP_CLASS = 'anyllm-selection-btn';

export type BubblePlacement = 'above' | 'below';
export type BubbleMode = 'loading' | 'sentence' | 'dictionary' | 'error';

export interface AnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface PositionResult {
  left: number;
  top: number;
  placement: BubblePlacement;
}

export type SelectionActionId =
  | 'copy'
  | 'retry'
  | 'speak-original'
  | 'speak-translation'
  | 'glossary';

export interface BubbleActionHandlers {
  onCopy: () => void | Promise<void>;
  onRetry: () => void | Promise<void>;
  /** Speak the original (source) selection text. */
  onSpeakOriginal: () => void | Promise<void>;
  /** Speak the translated text. */
  onSpeakTranslation: () => void | Promise<void>;
  onGlossary: () => void | Promise<void>;
  onPin: () => void;
  onClose: () => void;
  onToggleOriginal?: () => void;
}
