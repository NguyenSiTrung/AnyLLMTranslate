/**
 * Shared Button component with variant support.
 */

import { forwardRef, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'destructive' | 'warning' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 hover:bg-blue-500 text-white disabled:bg-zinc-700 disabled:text-zinc-500',
  secondary: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300',
  /** Soft destructive — secondary risk (e.g. clear cache). */
  danger: 'bg-red-600/20 hover:bg-red-600/30 border border-red-600/30 text-red-400',
  /** Solid destructive — permanent / high-severity actions (e.g. reset all). */
  destructive:
    'bg-rose-600 hover:bg-rose-500 text-white shadow-sm shadow-rose-950/40 border border-rose-500/40 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:border-transparent disabled:shadow-none',
  /** Caution — recoverable cost risk (amber). */
  warning:
    'bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:border-zinc-700',
  ghost: 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-2.5 text-sm gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    icon,
    loading = false,
    disabled,
    children,
    className = '',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 cursor-pointer ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : icon ? <span className="shrink-0">{icon}</span> : null}
      {children}
    </button>
  );
});
