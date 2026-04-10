/**
 * Shared Select component with custom ChevronDown icon.
 */

import type { SelectHTMLAttributes, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: SelectOption[];
  icon?: ReactNode;
}

export function Select({ options, icon, className = '', ...props }: SelectProps) {
  return (
    <div className="relative">
      {icon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
          {icon}
        </span>
      )}
      <select
        className={`w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-lg py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors cursor-pointer ${
          icon ? 'pl-9 pr-9' : 'px-3 pr-9'
        } ${className}`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
    </div>
  );
}
