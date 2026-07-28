/**
 * DangerZone — destructive-action panel for settings screens.
 *
 * Design goals:
 * - Visually isolated from normal settings (rose wash + soft glow)
 * - Severity ladder: caution (amber, reversible cost) vs critical (rose, permanent)
 * - Action-row layout: icon + copy left, primary control right (responsive stack)
 * - Accessible: labelled region, semantic list of actions
 */

import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface DangerZoneProps {
  /** Short guidance under the title. */
  description?: string;
  children: ReactNode;
  className?: string;
  id?: string;
}

export function DangerZone({
  description = 'These actions can erase data or incur extra API usage. Proceed carefully.',
  children,
  className = '',
  id = 'danger-zone',
}: DangerZoneProps) {
  const headingId = `${id}-heading`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`relative overflow-hidden rounded-xl border border-rose-500/30 bg-gradient-to-br from-rose-500/[0.08] via-zinc-950/60 to-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${className}`}
    >
      {/* Ambient glow — pure decoration */}
      <div
        className="pointer-events-none absolute -right-20 -top-24 h-48 w-48 rounded-full bg-rose-500/15 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-16 -left-12 h-36 w-36 rounded-full bg-rose-900/20 blur-3xl"
        aria-hidden="true"
      />

      <header className="relative flex items-start gap-3 border-b border-rose-500/20 px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-400/35 bg-rose-500/15 shadow-[0_0_20px_rgba(244,63,94,0.12)]">
          <AlertTriangle className="h-4 w-4 text-rose-400" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={headingId} className="text-sm font-semibold tracking-tight text-rose-50">
              Danger Zone
            </h3>
            <span className="inline-flex items-center rounded-full border border-rose-400/25 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-300/90">
              Proceed carefully
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-rose-100/45">{description}</p>
        </div>
      </header>

      <ul className="relative m-0 list-none divide-y divide-rose-500/15 p-0">{children}</ul>
    </section>
  );
}

type DangerSeverity = 'caution' | 'critical';

interface DangerActionProps {
  icon: ReactNode;
  title: string;
  description: string;
  /** Optional live context (cache size, counts, tips). */
  meta?: ReactNode;
  severity?: DangerSeverity;
  /** Primary control — usually a Button. */
  action: ReactNode;
  /** Optional anchor target for jump-to-section navigation. */
  id?: string;
  className?: string;
  tabIndex?: number;
}

const severityConfig: Record<
  DangerSeverity,
  { badge: string; badgeClass: string; iconWrap: string }
> = {
  caution: {
    badge: 'Recoverable',
    badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    iconWrap: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  },
  critical: {
    badge: 'Permanent',
    badgeClass: 'border-rose-500/35 bg-rose-500/15 text-rose-300',
    iconWrap: 'border-rose-500/35 bg-rose-500/15 text-rose-400',
  },
};

export function DangerAction({
  icon,
  title,
  description,
  meta,
  severity = 'caution',
  action,
  id,
  className = '',
  tabIndex,
}: DangerActionProps) {
  const config = severityConfig[severity];

  return (
    <li
      id={id}
      tabIndex={tabIndex}
      className={`group px-5 py-4 transition-colors duration-150 hover:bg-rose-500/[0.04] ${className}`}
    >
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-1 gap-3">
          <div
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${config.iconWrap}`}
            aria-hidden="true"
          >
            <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-zinc-100">{title}</p>
              <span
                className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${config.badgeClass}`}
              >
                {config.badge}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">{description}</p>
            {meta ? <div className="mt-2">{meta}</div> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center pl-11 sm:pl-0 sm:justify-end">{action}</div>
      </div>
    </li>
  );
}
