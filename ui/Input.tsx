/**
 * Shared Input component with icon support and password toggle.
 */

import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  type?: 'text' | 'url' | 'password' | 'number' | 'email' | 'search';
  icon?: ReactNode;
  /** Trailing unit/label inside the field (e.g. "req/min", "ms"). */
  suffix?: string;
  error?: string;
  hint?: string;
}

export function Input({
  type = 'text',
  icon,
  suffix,
  error,
  hint,
  className = '',
  ...props
}: InputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const resolvedType = isPassword && showPassword ? 'text' : type;
  // Right padding: password toggle > unit suffix > default.
  const rightPad = isPassword ? 'pr-10' : suffix ? 'pr-[4.5rem]' : '';

  return (
    <div>
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
            {icon}
          </span>
        )}
        <input
          type={resolvedType}
          className={`w-full bg-zinc-800 border rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors ${
            icon ? 'pl-9' : ''
          } ${rightPad} ${
            error ? 'border-red-500/50' : 'border-zinc-700'
          } ${className}`}
          {...props}
        />
        {suffix && !isPassword && (
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-500 pointer-events-none select-none"
            aria-hidden="true"
          >
            {suffix}
          </span>
        )}
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      {hint && !error && <p className="text-xs text-zinc-500 mt-1">{hint}</p>}
    </div>
  );
}
