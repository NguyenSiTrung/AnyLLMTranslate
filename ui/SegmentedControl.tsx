/**
 * SegmentedControl — single-choice radio group styled as a pill container.
 * Replaces scattered "flex gap-3 buttons" pattern throughout settings sections.
 * Fully accessible: role="radiogroup" + aria-checked on each option.
 */

import type { ReactNode } from 'react';

interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string; // aria-label for the group
  size?: 'sm' | 'md';
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
}: SegmentedControlProps<T>) {
  const sizeStyles = {
    sm: 'py-1 px-3 text-xs',
    md: 'py-1.5 px-4 text-sm',
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-lg bg-zinc-900 border border-zinc-700/60 p-1 w-full"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`
              flex-1 flex items-center justify-center gap-1.5 rounded-md font-medium
              transition-all duration-200 cursor-pointer
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60
              ${sizeStyles[size]}
              ${
                active
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/40'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }
            `}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
