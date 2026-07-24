/**
 * Shared chrome for the first-run setup wizard (backdrop, progress, footer slots).
 */
import type { ReactNode, RefObject } from 'react';
import type { WizardStep } from '@/lib/setupWizard';
import { wizardStepIndex, WIZARD_STEPS } from '@/lib/setupWizard';
import { Button } from '@/ui/Button';
import { WizardProgress } from './WizardProgress';

interface WizardShellProps {
  title: string;
  titleId: string;
  step: WizardStep;
  showSkip: boolean;
  onSkip: () => void;
  onGoToCompletedStep?: (step: WizardStep) => void;
  footer: ReactNode;
  children: ReactNode;
  skipConfirm?: ReactNode;
  dialogRef: RefObject<HTMLDivElement | null>;
}

export function WizardShell({
  title,
  titleId,
  step,
  showSkip,
  onSkip,
  onGoToCompletedStep,
  footer,
  children,
  skipConfirm,
  dialogRef,
}: WizardShellProps) {
  const currentIndex = wizardStepIndex(step);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4 sm:p-6"
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-2xl my-auto flex max-h-[min(92vh,760px)] min-h-0 flex-col overflow-hidden rounded-2xl border border-cyan-500/15 bg-zinc-950 shadow-2xl shadow-cyan-950/40 animate-scale-in motion-reduce:animate-none"
      >
        <div
          className="h-1 w-full shrink-0 bg-gradient-to-r from-cyan-500 via-sky-500 to-amber-400"
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -top-24 -right-16 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="absolute top-40 -left-20 h-40 w-40 rounded-full bg-sky-500/5 blur-3xl" />
        </div>

        <div className="relative flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800/90 px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
              Step {currentIndex} of {WIZARD_STEPS.length}
            </p>
            <h2 id={titleId} className="truncate text-lg font-semibold text-zinc-100">
              {title}
            </h2>
            <WizardProgress step={step} onGoToCompleted={onGoToCompletedStep} />
          </div>
          {showSkip && (
            <Button variant="ghost" size="sm" className="shrink-0" onClick={onSkip}>
              Skip for now
            </Button>
          )}
        </div>

        <div className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-5 sm:p-6">
          <div key={step} className="animate-fade-in-up motion-reduce:animate-none">
            {children}
          </div>
        </div>

        <div className="relative flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-zinc-800/90 bg-zinc-950/95 px-5 py-3.5 sm:px-6">
          {footer}
        </div>

        {skipConfirm}
      </div>
    </div>
  );
}
