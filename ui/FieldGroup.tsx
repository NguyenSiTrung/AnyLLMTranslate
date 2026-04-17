/**
 * Unified FieldGroup component — replaces 3 duplicated definitions.
 * Wraps label + description + children + error/hint.
 */

import type { ReactNode } from 'react';

interface FieldGroupProps {
  label: string;
  description?: string;
  error?: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}

export function FieldGroup({ label, description, error, hint, htmlFor, children }: FieldGroupProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-200 mb-1" htmlFor={htmlFor}>
        {label}
      </label>
      {description && <p className="text-xs text-zinc-500 leading-relaxed mb-3">{description}</p>}
      {children}
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      {hint && !error && <p className="text-xs text-zinc-500 leading-relaxed mt-2">{hint}</p>}
    </div>
  );
}
