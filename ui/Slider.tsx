/**
 * Shared Slider (range input) with value label and min/max labels.
 */

import type { InputHTMLAttributes } from 'react';

interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  label?: string;
  minLabel?: string;
  maxLabel?: string;
  formatValue?: (value: number) => string;
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  minLabel,
  maxLabel,
  formatValue,
  id,
  ...props
}: SliderProps) {
  const displayValue = formatValue ? formatValue(value) : String(value);
  const labelId = id ? `${id}-label` : undefined;

  return (
    <div>
      {label && (
        <label id={labelId} className="block text-sm font-medium text-zinc-200 mb-2" htmlFor={id}>
          {label}: {displayValue}
        </label>
      )}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-labelledby={labelId}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={displayValue}
        className="w-full accent-blue-500 cursor-pointer"
        {...props}
      />
      {(minLabel || maxLabel) && (
        <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
          <span>{minLabel ?? min}</span>
          <span>{maxLabel ?? max}</span>
        </div>
      )}
    </div>
  );
}
