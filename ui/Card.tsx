/**
 * Shared Card component with variant support.
 * bordered variant: subtle bg for depth on dark background.
 * Optional description + headerExtra keep section headers scannable.
 */

import type { ReactNode } from 'react';

type CardVariant = 'default' | 'bordered' | 'elevated';

interface CardProps {
  variant?: CardVariant;
  title?: string;
  /** Short subtitle under the title — sets expectation for the card. */
  description?: string;
  icon?: ReactNode;
  accent?: 'blue' | 'emerald' | 'amber' | 'red' | 'cyan';
  /** Badge, status chip, or action aligned to the header right. */
  headerExtra?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-white/[0.02] border border-white/5 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
  bordered: 'bg-white/[0.01] border border-white/10 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-200',
  elevated: 'bg-white/[0.02] border border-white/5 rounded-xl shadow-lg shadow-black/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
};

const accentBorders: Record<string, string> = {
  blue: 'border-l-blue-500',
  emerald: 'border-l-emerald-500',
  amber: 'border-l-amber-500',
  red: 'border-l-red-500',
  cyan: 'border-l-cyan-500',
};

const accentIcon: Record<string, string> = {
  blue: 'text-blue-400',
  emerald: 'text-emerald-400',
  amber: 'text-amber-400',
  red: 'text-rose-400',
  cyan: 'text-cyan-400',
};

export function Card({
  variant = 'default',
  title,
  description,
  icon,
  accent,
  headerExtra,
  className = '',
  style,
  children,
}: CardProps) {
  const showHeader = Boolean(title || icon || headerExtra);

  return (
    <div
      className={`${variantStyles[variant]} ${accent ? `border-l-4 ${accentBorders[accent]}` : ''} p-5 ${className}`}
      style={style}
    >
      {showHeader && (
        <div className={`flex items-start gap-2.5 ${description ? 'mb-5' : 'mb-4'}`}>
          {icon && (
            <span className={`mt-0.5 shrink-0 ${accent ? accentIcon[accent] : 'text-zinc-500'}`}>
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            {title && (
              <h3 className="text-sm font-semibold text-zinc-100 tracking-tight">{title}</h3>
            )}
            {description && (
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{description}</p>
            )}
          </div>
          {headerExtra ? <div className="shrink-0 pt-0.5">{headerExtra}</div> : null}
        </div>
      )}
      {children}
    </div>
  );
}
