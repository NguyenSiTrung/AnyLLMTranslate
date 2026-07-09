/**
 * Accessible Toggle switch component with focus-visible ring.
 * Aligns to top so multi-line descriptions don't collide with the control.
 */

import type { ReactNode } from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** Optional badge/chip next to the label (e.g. Experimental). */
  labelExtra?: ReactNode;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  id,
  ariaLabel,
  disabled = false,
  labelExtra,
}: ToggleProps) {
  return (
    <div className={`flex items-start justify-between gap-4 ${disabled ? 'opacity-60' : ''}`}>
      {label && (
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-zinc-200">{label}</p>
            {labelExtra}
          </div>
          {description && (
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{description}</p>
          )}
        </div>
      )}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel || label || id}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? 'bg-blue-600' : 'bg-zinc-700'
        }`}
      >
        <div
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200 ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  );
}
