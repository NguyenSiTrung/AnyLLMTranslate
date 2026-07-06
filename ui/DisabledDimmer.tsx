/**
 * DisabledDimmer — DRY wrapper that visually dims + blocks interaction of its
 * children when `disabled` is true (FR-8).
 *
 * Replaces the repeated
 *   `${isDisabled ? 'opacity-50 pointer-events-none' : ''} transition-opacity`
 * className interpolation scattered across settings sections.
 *
 * @example
 *   <DisabledDimmer disabled={!subtitleSettings.enabled}>
 *     <div className="space-y-5">...controls...</div>
 *   </DisabledDimmer>
 */

import type { ReactNode } from 'react';

interface DisabledDimmerProps {
  /** When true, children are visually dimmed and non-interactive (pointer-events
   *  none). Does NOT set aria-hidden — inner controls remain in the a11y tree
   *  with their own disabled state, matching the original inline dimmer. */
  disabled: boolean;
  children: ReactNode;
  /** Optional extra className on the wrapping div. */
  className?: string;
}

export function DisabledDimmer({ disabled, children, className = '' }: DisabledDimmerProps) {
  return (
    <div
      className={`${disabled ? 'opacity-50 pointer-events-none' : ''} transition-opacity duration-200 ${className}`}
    >
      {children}
    </div>
  );
}
