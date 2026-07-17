/**
 * Pure state machine for the Scientific PDF setup wizard.
 * Steps: intro → install → poll → test → done
 */

export type ScientificPdfWizardStep =
  | 'intro'
  | 'install'
  | 'poll'
  | 'test'
  | 'done';

export const SCIENTIFIC_PDF_WIZARD_STEPS: readonly ScientificPdfWizardStep[] = [
  'intro',
  'install',
  'poll',
  'test',
  'done',
] as const;

export const SCIENTIFIC_PDF_WIZARD_STEP_LABELS: Record<ScientificPdfWizardStep, string> = {
  intro: 'Intro',
  install: 'Install',
  poll: 'Start server',
  test: 'Test',
  done: 'Done',
};

export type ScientificPdfWizardEvent =
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'HEALTH_OK' }
  | { type: 'HEALTH_FAIL' }
  | { type: 'TEST_OK' }
  | { type: 'TEST_FAIL' }
  | { type: 'RESET' }
  | { type: 'SKIP_TO'; step: ScientificPdfWizardStep };

export interface ScientificPdfWizardState {
  step: ScientificPdfWizardStep;
  /** Consecutive failed health polls on the poll step (UI can show hints). */
  healthFailCount: number;
  /** Last test/health error message for the test step. */
  lastError: string | null;
  completed: boolean;
}

export function initialScientificPdfWizardState(
  entry: ScientificPdfWizardStep = 'intro',
): ScientificPdfWizardState {
  return {
    step: entry,
    healthFailCount: 0,
    lastError: null,
    completed: false,
  };
}

/**
 * When reopening the wizard after prior setup, land on poll (re-check health)
 * rather than the success screen.
 */
export function resolveScientificPdfWizardEntry(args: {
  setupCompletedAt?: string;
  enabled?: boolean;
}): ScientificPdfWizardStep {
  if (args.setupCompletedAt || args.enabled) {
    return 'poll';
  }
  return 'intro';
}

export function scientificPdfWizardStepIndex(step: ScientificPdfWizardStep): number {
  return SCIENTIFIC_PDF_WIZARD_STEPS.indexOf(step) + 1;
}

export function reduceScientificPdfWizard(
  state: ScientificPdfWizardState,
  event: ScientificPdfWizardEvent,
): ScientificPdfWizardState {
  if (event.type === 'RESET') {
    return initialScientificPdfWizardState('intro');
  }

  if (event.type === 'SKIP_TO') {
    return {
      ...state,
      step: event.step,
      completed: event.step === 'done' ? true : state.completed,
      lastError: event.step === 'done' ? null : state.lastError,
    };
  }

  switch (state.step) {
    case 'intro':
      if (event.type === 'NEXT') {
        return { ...state, step: 'install', lastError: null };
      }
      return state;

    case 'install':
      if (event.type === 'NEXT') {
        return { ...state, step: 'poll', healthFailCount: 0, lastError: null };
      }
      if (event.type === 'BACK') {
        return { ...state, step: 'intro', lastError: null };
      }
      return state;

    case 'poll':
      if (event.type === 'HEALTH_OK') {
        return { ...state, step: 'test', healthFailCount: 0, lastError: null };
      }
      if (event.type === 'HEALTH_FAIL') {
        return {
          ...state,
          healthFailCount: state.healthFailCount + 1,
          lastError: 'Server offline — start the Docker container and retry.',
        };
      }
      if (event.type === 'BACK') {
        return { ...state, step: 'install', lastError: null };
      }
      // Allow manual advance only after a successful health (NEXT ignored without HEALTH_OK)
      return state;

    case 'test':
      if (event.type === 'TEST_OK' || event.type === 'NEXT') {
        // NEXT on test after HEALTH_OK is health-only completion (optional full test)
        return {
          ...state,
          step: 'done',
          completed: true,
          lastError: null,
        };
      }
      if (event.type === 'TEST_FAIL') {
        return {
          ...state,
          lastError: 'Connection test failed. Check the bridge logs and try again.',
        };
      }
      if (event.type === 'BACK') {
        return { ...state, step: 'poll', healthFailCount: 0, lastError: null };
      }
      return state;

    case 'done':
      if (event.type === 'BACK') {
        return { ...state, step: 'test', completed: false, lastError: null };
      }
      return state;

    default:
      return state;
  }
}

/** ISO timestamp helper for setupCompletedAt when wizard finishes. */
export function scientificPdfSetupCompletedAt(now: Date = new Date()): string {
  return now.toISOString();
}
