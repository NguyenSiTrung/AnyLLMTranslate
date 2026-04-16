/**
 * Shared Card component with variant support.
 * bordered variant: subtle bg-zinc-900/50 for depth on dark background.
 * Title uses category-label style (xs, uppercase, tracked) for clear hierarchy.
 */

import type { ReactNode } from 'react';

type CardVariant = 'default' | 'bordered' | 'elevated';

interface CardProps {
  variant?: CardVariant;
  title?: string;
  icon?: ReactNode;
  accent?: 'blue' | 'emerald' | 'amber' | 'red';
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-zinc-900 border border-zinc-800 rounded-xl',
  bordered: 'bg-zinc-900/50 border border-zinc-700/60 rounded-xl',
  elevated: 'bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg shadow-black/30',
};

const accentBorders: Record<string, string> = {
  blue: 'border-l-blue-500',
  emerald: 'border-l-emerald-500',
  amber: 'border-l-amber-500',
  red: 'border-l-red-500',
};

export function Card({ variant = 'default', title, icon, accent, className = '', style, children }: CardProps) {
  return (
    <div className={`${variantStyles[variant]} ${accent ? `border-l-4 ${accentBorders[accent]}` : ''} p-5 ${className}`} style={style}>
      {(title || icon) && (
        <div className="flex items-center gap-2 mb-4">
          {icon && <span className="text-zinc-500 shrink-0">{icon}</span>}
          {title && (
            <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">
              {title}
            </h3>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
