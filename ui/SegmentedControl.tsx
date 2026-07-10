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
  id?: string;    // DOM id for testing and accessibility
  disabled?: boolean;
  /** Active fill color. Default blue for most tabs; cyan for Subtitle Studio. */
  accent?: 'blue' | 'cyan';
  /**
   * Layout of options.
   * - `row` (default): single horizontal strip — use for short labels (7d / 30d / All).
   * - `grid`: 2-column pill grid — use for 4 long labels in narrow cards (e.g. Formal / Idiomatic).
   */
  layout?: 'row' | 'grid';
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  id,
  disabled = false,
  accent = 'blue',
  layout = 'row',
}: SegmentedControlProps<T>) {
  const sizeStyles = {
    sm: 'py-1 px-3 text-xs',
    md: 'py-1.5 px-4 text-sm',
  };
  const activeStyles =
    accent === 'cyan'
      ? 'bg-cyan-600 text-white shadow-sm shadow-cyan-900/40'
      : 'bg-blue-600 text-white shadow-sm shadow-blue-900/40';

  const multiRow = layout === 'grid';

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled}
      id={id}
      className={
        multiRow
          ? 'grid grid-cols-2 gap-0.5 rounded-lg bg-zinc-900 border border-zinc-700/60 p-1 w-full min-w-0'
          : 'inline-flex items-center gap-0.5 rounded-lg bg-zinc-900 border border-zinc-700/60 p-1 w-full min-w-0'
      }
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`
              ${multiRow ? 'w-full' : 'flex-1 min-w-0'}
              flex items-center justify-center gap-1.5 rounded-md font-medium
              whitespace-nowrap transition-all duration-200 cursor-pointer
              disabled:cursor-not-allowed disabled:opacity-60
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60
              ${sizeStyles[size]}
              ${
                active
                  ? activeStyles
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 disabled:hover:text-zinc-400 disabled:hover:bg-transparent'
              }
            `}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            <span className="truncate">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
