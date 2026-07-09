/**
 * Shared Badge component for status indicators.
 */

import type { ReactNode } from 'react';

type BadgeVariant = 'info' | 'success' | 'warning' | 'danger' | 'experimental';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  info: 'bg-zinc-700/80 text-zinc-400 border border-zinc-600/40',
  success: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
  warning: 'bg-amber-500/15 text-amber-400 border border-amber-500/25',
  danger: 'bg-rose-500/15 text-rose-300 border border-rose-500/25',
  experimental: 'bg-sky-500/15 text-sky-300 border border-sky-500/25',
};

export function Badge({ variant = 'info', children, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded ${variantStyles[variant]} ${className}`}>
      {children}
    </span>
  );
}
