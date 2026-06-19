/**
 * Accessible Toggle switch component with focus-visible ring.
 */

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  id?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, description, id, disabled = false }: ToggleProps) {
  return (
    <div className="flex items-center justify-between">
      {label && (
        <div>
          <p className="text-sm font-medium text-zinc-200">{label}</p>
          {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
        </div>
      )}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label || id}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          checked ? 'bg-blue-600' : 'bg-zinc-700'
        }`}
      >
        <div
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  );
}
