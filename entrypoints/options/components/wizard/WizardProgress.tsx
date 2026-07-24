/**
 * Segment progress for the 4-step setup wizard.
 */
import {
  type WizardStep,
  WIZARD_STEP_LABELS,
  WIZARD_STEPS,
  wizardStepIndex,
} from '@/lib/setupWizard';

interface WizardProgressProps {
  step: WizardStep;
  onGoToCompleted?: (step: WizardStep) => void;
}

export function WizardProgress({ step, onGoToCompleted }: WizardProgressProps) {
  const currentIndex = wizardStepIndex(step);

  return (
    <nav className="mt-3" aria-label="Setup progress">
      <ol className="flex items-center gap-1.5">
        {WIZARD_STEPS.map((s) => {
          const idx = wizardStepIndex(s);
          const isCompleted = idx < currentIndex;
          const isCurrent = s === step;
          const clickable = Boolean(isCompleted && onGoToCompleted && s !== 'ready');
          return (
            <li key={s} className="flex min-w-0 flex-1 items-center gap-1.5">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => {
                  if (clickable) onGoToCompleted?.(s);
                }}
                className={`flex w-full min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
                  isCurrent
                    ? 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/40'
                    : isCompleted
                      ? 'bg-cyan-500/10 text-cyan-400/90 hover:bg-cyan-500/20 cursor-pointer'
                      : 'bg-zinc-800/80 text-zinc-500 cursor-default'
                }`}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                    isCurrent
                      ? 'bg-cyan-500 text-zinc-950'
                      : isCompleted
                        ? 'bg-cyan-600 text-white'
                        : 'bg-zinc-700 text-zinc-400'
                  }`}
                  aria-hidden="true"
                >
                  {isCompleted ? '✓' : idx}
                </span>
                <span className="hidden truncate sm:inline">{WIZARD_STEP_LABELS[s]}</span>
              </button>
              {idx < WIZARD_STEPS.length && (
                <span
                  className={`hidden h-0.5 w-2 shrink-0 sm:block ${
                    isCompleted ? 'bg-cyan-600/60' : 'bg-zinc-700'
                  }`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
      <div
        className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-800"
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-sky-400 transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${(currentIndex / WIZARD_STEPS.length) * 100}%` }}
        />
      </div>
    </nav>
  );
}
