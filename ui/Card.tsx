/**
 * Shared Card component with variant support.
 */

import type { ReactNode } from 'react';

type CardVariant = 'default' | 'bordered' | 'elevated';

interface CardProps {
  variant?: CardVariant;
  title?: string;
  icon?: ReactNode;
  accent?: 'blue' | 'emerald' | 'amber' | 'red';
  className?: string;
  children: ReactNode;
}

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-zinc-900 border border-zinc-800 rounded-lg',
  bordered: 'border border-zinc-700 rounded-lg',
  elevated: 'bg-zinc-900 border border-zinc-800 rounded-lg shadow-lg shadow-black/20',
};

const accentBorders: Record<string, string> = {
  blue: 'border-l-blue-500',
  emerald: 'border-l-emerald-500',
  amber: 'border-l-amber-500',
  red: 'border-l-red-500',
};

export function Card({ variant = 'default', title, icon, accent, className = '', children }: CardProps) {
  return (
    <div className={`${variantStyles[variant]} ${accent ? `border-l-3 ${accentBorders[accent]}` : ''} p-4 ${className}`}>
      {(title || icon) && (
        <div className="flex items-center gap-2 mb-3">
          {icon && <span className="text-zinc-400 shrink-0">{icon}</span>}
          {title && <h3 className="text-sm font-medium text-zinc-200">{title}</h3>}
        </div>
      )}
      {children}
    </div>
  );
}
