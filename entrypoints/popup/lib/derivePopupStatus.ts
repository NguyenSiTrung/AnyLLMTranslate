import type { TabTranslationStatus } from '@/types/messages';

export type PopupStatusKind = 'ready' | 'translating' | 'active' | 'error' | 'blocked' | 'setup';

export interface DerivePopupStatusInput {
  status: TabTranslationStatus;
  isTranslating: boolean;
  hasError: boolean;
  unsupported: boolean;
  needsSetup: boolean;
  readingAreaReady: boolean;
}

export interface PopupStatusView {
  kind: PopupStatusKind;
  chipLabel: string;
  /** True when action zone should render the progress/error detail strip. */
  showProgress: boolean;
}

const CHIP: Record<PopupStatusKind, string> = {
  ready: 'Ready',
  translating: 'Translating',
  active: 'Active',
  error: 'Error',
  blocked: 'Unavailable',
  setup: 'Setup',
};

export function derivePopupStatus(input: DerivePopupStatusInput): PopupStatusView {
  let kind: PopupStatusKind = 'ready';

  if (input.needsSetup) {
    kind = 'setup';
  } else if (input.unsupported) {
    kind = 'blocked';
  } else if (input.hasError || input.status === 'error') {
    kind = 'error';
  } else if (input.isTranslating || input.status === 'translating') {
    kind = 'translating';
  } else if (input.status === 'done' || input.readingAreaReady) {
    kind = 'active';
  }

  return {
    kind,
    chipLabel: CHIP[kind],
    showProgress: kind === 'translating' || kind === 'active',
  };
}
