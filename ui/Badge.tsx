/**
 * Shared Badge component for status indicators.
 */

import type { ReactNode } from 'react';

type BadgeVariant = 'info' | 'success' | 'warning';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  info: 'bg-zinc-700 text-zinc-400',
  success: 'bg-emerald-500/15 text-emerald-400',
  warning: 'bg-amber-500/15 text-amber-400',
};

export function Badge({ variant = 'info', children, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded ${variantStyles[variant]} ${className}`}>
      {children}
    </span>
  );
}
