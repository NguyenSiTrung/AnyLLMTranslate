import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ChevronDown, Search, Sparkles, Tag, Save, Pencil } from 'lucide-react';
import {
  CATEGORY_GROUPS,
  filterCategoryGroups,
  matchesAutoOption,
  matchesCustomOption,
  type CategorySourceKind,
} from '@/lib/categories';
import { truncateHost } from '../lib/truncateHost';

export interface CategoryPickerProps {
  currentValue: string;
  isCustomEntry: boolean;
  detectedCategory?: string;
  customCategoryInput: string;
  onCategoryChange: (value: string) => void;
  onCustomInputChange: (value: string) => void;
  onCustomSubmit: () => void;
  showSaveAsRule: boolean;
  onSaveAsRule: () => void;
  activeHostname: string | null;
  /** Where the effective category came from. */
  sourceKind?: CategorySourceKind;
}

const SOURCE_CHIP: Record<CategorySourceKind, { label: string; className: string }> = {
  auto: {
    label: 'Auto',
    className: 'bg-zinc-800 text-zinc-400 border-zinc-700/60',
  },
  tab: {
    label: 'This tab',
    className: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  },
  rule: {
    label: 'Site rule',
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  },
};

export function CategoryPicker({
  currentValue,
  isCustomEntry,
  detectedCategory,
  customCategoryInput,
  onCategoryChange,
  onCustomInputChange,
  onCustomSubmit,
  showSaveAsRule,
  onSaveAsRule,
  activeHostname,
  sourceKind = 'auto',
}: CategoryPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showCustomInline, setShowCustomInline] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [portalStyle, setPortalStyle] = useState<CSSProperties>({});
  const [savedFlash, setSavedFlash] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setSearch('');
    setShowCustomInline(false);
  }, []);

  // Close on click outside (trigger + portaled panel)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const insideWrapper = wrapperRef.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (!insideWrapper && !insideDropdown) {
        closeMenu();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeMenu]);

  // Escape closes
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu();
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, closeMenu]);

  const updatePosition = useCallback(() => {
    if (!isOpen || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const estimatedHeight = 320;
    const shouldDropUp = spaceAbove > spaceBelow || spaceBelow < estimatedHeight;
    setDropUp(shouldDropUp);

    const style: CSSProperties = {
      position: 'fixed',
      left: Math.max(4, rect.left),
      width: Math.min(rect.width, window.innerWidth - 8),
      zIndex: 99999,
      maxHeight: Math.min(360, shouldDropUp ? spaceAbove - 12 : spaceBelow - 12),
    };
    if (shouldDropUp) {
      style.bottom = window.innerHeight - rect.top + 6;
    } else {
      style.top = rect.bottom + 6;
    }
    setPortalStyle(style);
  }, [isOpen]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition, showCustomInline, search]);

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

  // Focus custom input when inline custom opens
  useEffect(() => {
    if (showCustomInline && isOpen) {
      customInputRef.current?.focus();
    }
  }, [showCustomInline, isOpen]);

  // Seed draft when entering custom mode with an existing custom value
  useEffect(() => {
    if (showCustomInline && isCustomEntry && !customCategoryInput && currentValue !== '__custom__') {
      onCustomInputChange(currentValue);
    }
  }, [
    showCustomInline,
    isCustomEntry,
    customCategoryInput,
    currentValue,
    onCustomInputChange,
  ]);

  const displayLabel =
    currentValue === '__auto__'
      ? detectedCategory
        ? detectedCategory
        : 'Auto detect'
      : currentValue === '__custom__'
        ? customCategoryInput.trim() || 'Custom…'
        : currentValue;

  const filteredGroups = filterCategoryGroups(CATEGORY_GROUPS, search);
  const showAuto = matchesAutoOption(search);
  const showCustom = matchesCustomOption(search);
  const empty =
    filteredGroups.length === 0 &&
    !showAuto &&
    !showCustom &&
    Boolean(search.trim());

  const chip = SOURCE_CHIP[sourceKind];

  const selectItem = (value: string) => {
    onCategoryChange(value);
    closeMenu();
  };

  const handleCustomApply = () => {
    onCustomSubmit();
    closeMenu();
  };

  const handleSave = () => {
    onSaveAsRule();
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
  };

  const hostShort = activeHostname ? truncateHost(activeHostname, 22) : '';

  const dropdown = isOpen
    ? createPortal(
        <div
          ref={dropdownRef}
          style={portalStyle}
          role="listbox"
          aria-label="Page category"
          className={`bg-zinc-900/98 backdrop-blur-2xl border border-zinc-700/50 rounded-xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col ${
            dropUp
              ? 'origin-bottom animate-in fade-in slide-in-from-bottom-1 zoom-in-[0.98]'
              : 'origin-top animate-in fade-in slide-in-from-top-1 zoom-in-[0.98]'
          } duration-200`}
        >
          <div className="p-2 border-b border-zinc-800/60 shrink-0">
            <div className="relative">
              <input
                type="text"
                autoFocus={!showCustomInline}
                placeholder="Filter categories…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-zinc-950/80 border border-zinc-800 rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all placeholder:text-zinc-600"
              />
              <Search className="w-3 h-3 text-zinc-600 absolute left-2.5 top-[7px]" />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-zinc-700 hover:scrollbar-thumb-zinc-600 scrollbar-track-transparent">
            {showAuto && (
              <div className="px-1.5 pt-1.5 sticky top-0 bg-zinc-900/98 z-10">
                <button
                  type="button"
                  role="option"
                  aria-selected={currentValue === '__auto__'}
                  onClick={() => selectItem('__auto__')}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all flex items-center gap-2 ${
                    currentValue === '__auto__'
                      ? 'bg-blue-500/15 text-blue-400 font-medium'
                      : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100'
                  }`}
                >
                  <Sparkles className="w-3 h-3 shrink-0 opacity-70" />
                  <span className="truncate flex-1 min-w-0">
                    Auto detect
                    {detectedCategory ? (
                      <span className="text-zinc-500 font-normal"> · {detectedCategory}</span>
                    ) : null}
                  </span>
                  {currentValue === '__auto__' && (
                    <CheckCircle2 className="w-3 h-3 shrink-0 text-blue-400" />
                  )}
                </button>
              </div>
            )}

            {filteredGroups.map((group) => (
              <div key={group.label} className="px-1.5 pb-0.5">
                <div className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold px-2.5 pt-2.5 pb-1">
                  {group.label}
                </div>
                {group.items.map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="option"
                    aria-selected={currentValue === item}
                    onClick={() => selectItem(item)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] transition-all flex items-center justify-between ${
                      currentValue === item
                        ? 'bg-blue-500/15 text-blue-400 font-medium'
                        : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200'
                    }`}
                  >
                    <span className="truncate">{item}</span>
                    {currentValue === item && <CheckCircle2 className="w-3 h-3 shrink-0 ml-1" />}
                  </button>
                ))}
              </div>
            ))}

            {showCustom && (
              <div className="px-1.5 pb-1.5 border-t border-zinc-800/40 mt-1 pt-1">
                {!showCustomInline ? (
                  <button
                    type="button"
                    role="option"
                    aria-selected={isCustomEntry}
                    onClick={() => {
                      setShowCustomInline(true);
                      if (isCustomEntry && currentValue !== '__custom__') {
                        onCustomInputChange(currentValue);
                      } else if (!isCustomEntry) {
                        onCategoryChange('__custom__');
                        onCustomInputChange('');
                      }
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] transition-all flex items-center gap-2 ${
                      isCustomEntry
                        ? 'bg-blue-500/15 text-blue-400 font-medium'
                        : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200'
                    }`}
                  >
                    <Pencil className="w-3 h-3 shrink-0 opacity-70" />
                    <span>Custom category…</span>
                  </button>
                ) : (
                  <div className="px-1 py-1.5 space-y-1.5">
                    <div className="text-[10px] text-zinc-500 px-1.5">Custom category</div>
                    <div className="flex gap-1.5">
                      <input
                        ref={customInputRef}
                        type="text"
                        placeholder="e.g. Scientific paper"
                        value={customCategoryInput}
                        onChange={(e) => onCustomInputChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCustomApply();
                          }
                        }}
                        maxLength={50}
                        className="flex-1 min-w-0 bg-zinc-950/80 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-zinc-600"
                      />
                      <button
                        type="button"
                        onClick={handleCustomApply}
                        disabled={!customCategoryInput.trim()}
                        className="shrink-0 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-[11px] rounded-lg font-medium transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {empty && (
              <div className="px-4 py-4 text-[11px] text-zinc-600 text-center">
                No matching categories
              </div>
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        ref={buttonRef}
        onClick={() => {
          if (isOpen) closeMenu();
          else setIsOpen(true);
        }}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-all duration-200 group ${
          isOpen
            ? 'bg-zinc-900 border border-blue-500/40 ring-1 ring-blue-500/20'
            : 'bg-transparent border border-transparent hover:bg-zinc-900/50 hover:border-zinc-800/60'
        }`}
      >
        <Tag
          className={`w-3.5 h-3.5 shrink-0 transition-colors ${isOpen ? 'text-blue-400' : 'text-zinc-500'}`}
        />
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold shrink-0">
              Category
            </span>
            <span
              className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md border shrink-0 ${chip.className}`}
            >
              {chip.label}
            </span>
          </div>
          <div className="text-xs text-zinc-200 font-medium truncate mt-0.5">{displayLabel}</div>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-all duration-300 ${
            isOpen ? 'rotate-180 text-blue-400' : 'text-zinc-600 group-hover:text-zinc-400'
          }`}
        />
      </button>

      {dropdown}

      {/* Save as rule — outside menu so it stays visible after pick */}
      {showSaveAsRule && !isOpen && (
        <button
          type="button"
          onClick={handleSave}
          title={activeHostname ? `Save as rule for ${activeHostname}` : 'Save as rule'}
          className="flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 transition-colors group mt-1.5 px-0.5"
        >
          <Save className="w-3 h-3 group-hover:scale-110 transition-transform shrink-0" />
          <span className="truncate">
            {savedFlash
              ? 'Saved as site rule'
              : `Save as site rule for ${hostShort || 'this site'}`}
          </span>
        </button>
      )}
    </div>
  );
}
