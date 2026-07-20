import { useState, useEffect, useCallback, useRef, useLayoutEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ChevronDown, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { TYPOGRAPHY } from '../lib/typography';

export function CustomSelect({
  id,
  value,
  onChange,
  options,
  label,
  icon: Icon,
  variant = 'default',
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label?: string;
  icon?: LucideIcon;
  variant?: 'default' | 'ghost' | 'minimal';
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropUp, setDropUp] = useState(false);
  const [portalStyle, setPortalStyle] = useState<CSSProperties>({});
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside (check both wrapper and portal dropdown)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const clickedInsideWrapper = wrapperRef.current?.contains(target);
      const clickedInsideDropdown = dropdownRef.current?.contains(target);
      if (!clickedInsideWrapper && !clickedInsideDropdown) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calculate dropdown position using fixed positioning relative to the viewport
  const updatePosition = useCallback(() => {
    if (!isOpen || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const estimatedDropdownHeight = Math.min(220, options.length * 36);
    const shouldDropUp = spaceAbove > spaceBelow || spaceBelow < estimatedDropdownHeight;
    setDropUp(shouldDropUp);

    const style: CSSProperties = {
      position: 'fixed',
      left: rect.left - 4,
      width: rect.width + 8,
      zIndex: 99999,
    };
    if (shouldDropUp) {
      style.bottom = window.innerHeight - rect.top + 8;
    } else {
      style.top = rect.bottom + 8;
    }
    setPortalStyle(style);
  }, [isOpen, options.length]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition]);

  // Re-position on scroll/resize
  useEffect(() => {
    if (!isOpen) return;
    const handler = () => updatePosition();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [isOpen, updatePosition]);

  const selectedOption = options.find((o) => o.value === value) || options[0];
  const filteredOptions = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()),
  );

  const baseStyles =
    'w-full flex items-center justify-between transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50';
  let variantStyles = '';
  if (variant === 'default') {
    variantStyles = `bg-zinc-900/70 backdrop-blur-xl border rounded-xl px-3 py-2.5 shadow-lg shadow-black/20 ${
      isOpen
        ? 'border-blue-500/50 ring-2 ring-blue-500/20 bg-zinc-900 text-zinc-100'
        : 'border-zinc-700/50 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800/80 hover:shadow-lg hover:shadow-black/30'
    }`;
  } else if (variant === 'ghost') {
    variantStyles = `px-3 py-2 rounded-lg transition-all duration-200 ${
      isOpen
        ? 'bg-zinc-800/80 text-zinc-100 shadow-lg shadow-black/20'
        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
    }`;
  } else if (variant === 'minimal') {
    variantStyles = 'px-0 py-1 text-zinc-300 hover:text-zinc-100 transition-colors duration-200';
  }

  const dropdownContent = isOpen
    ? createPortal(
        <div
          ref={dropdownRef}
          style={portalStyle}
          className={`bg-zinc-900/98 backdrop-blur-2xl border border-zinc-700/50 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col ${
            dropUp
              ? 'origin-bottom animate-in fade-in slide-in-from-bottom-2 zoom-in-95'
              : 'origin-top animate-in fade-in slide-in-from-top-2 zoom-in-95'
          } duration-300 ease-out`}
        >
          {options.length > 10 && (
            <div className="p-2 border-b border-zinc-800/80 bg-zinc-900/50 backdrop-blur-sm">
              <div className="relative">
                <input
                  type="text"
                  autoFocus
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-zinc-950/80 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-zinc-600"
                />
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2" />
              </div>
            </div>
          )}
          <div className="max-h-52 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-zinc-700 hover:scrollbar-thumb-zinc-600 scrollbar-track-transparent">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-6 text-xs text-zinc-500 text-center flex flex-col items-center gap-2">
                <Search className="w-4 h-4 opacity-30" />
                No results
              </div>
            ) : (
              <div className="p-1.5 flex flex-col gap-0.5">
                {filteredOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center justify-between group ${
                      value === opt.value
                        ? 'bg-blue-500/15 text-blue-400 font-medium border border-blue-500/20'
                        : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {value === opt.value && (
                      <CheckCircle2 className="w-3.5 h-3.5 opacity-100 shrink-0 ml-2" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="relative" ref={wrapperRef}>
      {label && <label className={TYPOGRAPHY.label}>{label}</label>}
      <button
        type="button"
        id={id}
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`${baseStyles} ${variantStyles}`}
      >
        <span className="flex items-center gap-2 truncate font-medium">
          {Icon && <Icon className="w-3.5 h-3.5 opacity-70" />}
          {selectedOption?.label}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 opacity-50 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180 opacity-100 text-blue-400' : ''}`}
        />
      </button>
      {dropdownContent}
    </div>
  );
}
