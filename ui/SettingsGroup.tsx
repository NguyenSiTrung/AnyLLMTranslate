/**
 * SettingsGroup — lightweight within-card section divider.
 * Groups related fields/toggles under a scannable label without nesting another Card.
 */

import type { ReactNode } from 'react';

interface SettingsGroupProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** Optional trailing chip (counts, status). */
  extra?: ReactNode;
}

export function SettingsGroup({
  title,
  description,
  children,
  className = '',
  extra,
}: SettingsGroupProps) {
  return (
    <div className={className}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            {title}
          </p>
          {description && (
            <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-600">{description}</p>
          )}
        </div>
        {extra}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
