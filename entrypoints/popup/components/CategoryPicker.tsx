import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, ChevronDown, Search, Sparkles, Tag, Save } from 'lucide-react';

/** Grouped categories for organized display */
const CATEGORY_GROUPS: { label: string; items: string[] }[] = [
  {
    label: 'Development',
    items: [
      'Software Development',
      'Web Development Documentation',
      'Programming Q&A',
      'Developer Blog',
      'Package Registry',
    ],
  },
  {
    label: 'Knowledge',
    items: ['Academic Research', 'Academic Journal', 'Encyclopedia', 'Online Education'],
  },
  {
    label: 'Media & News',
    items: [
      'News',
      'Financial News',
      'Technology News',
      'Technology Blog',
      'Video Platform',
      'Streaming Entertainment',
    ],
  },
  {
    label: 'Social & Commerce',
    items: ['Community Discussion', 'Social Media', 'Professional Networking', 'E-Commerce'],
  },
  {
    label: 'Other',
    items: ['Travel & Hospitality', 'Health & Medicine', 'Legal & Government', 'Gaming'],
  },
];

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
}

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
}: CategoryPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayLabel =
    currentValue === '__auto__'
      ? `Auto${detectedCategory ? ` (${detectedCategory})` : ''}`
      : currentValue;

  const filteredGroups = CATEGORY_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.toLowerCase().includes(search.toLowerCase())),
  })).filter((group) => group.items.length > 0);

  return (
    <div ref={wrapperRef} className="relative">
      {/* Compact trigger row */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
          isOpen
            ? 'bg-zinc-900 border border-blue-500/40 ring-1 ring-blue-500/20 shadow-lg shadow-blue-500/5'
            : 'bg-zinc-900/60 border border-zinc-800/60 hover:bg-zinc-900/80 hover:border-zinc-700/60'
        }`}
      >
        <Tag
          className={`w-3.5 h-3.5 shrink-0 transition-colors ${isOpen ? 'text-blue-400' : 'text-zinc-500'}`}
        />
        <div className="flex-1 min-w-0 text-left">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold leading-none mb-0.5">
            Category
          </div>
          <div className="text-xs text-zinc-200 font-medium truncate">{displayLabel}</div>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-all duration-300 ${
            isOpen ? 'rotate-180 text-blue-400' : 'text-zinc-600 group-hover:text-zinc-400'
          }`}
        />
      </button>

      {/* Dropdown panel — fixed to popup bounds */}
      {isOpen && (
        <div className="absolute left-0 right-0 mt-1.5 z-[9999] bg-zinc-900/98 backdrop-blur-2xl border border-zinc-700/50 rounded-xl shadow-2xl shadow-black/60 overflow-hidden animate-in fade-in slide-in-from-top-1 zoom-in-[0.98] duration-200">
          {/* Search */}
          <div className="p-2 border-b border-zinc-800/60">
            <div className="relative">
              <input
                type="text"
                autoFocus
                placeholder="Filter categories..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-zinc-950/80 border border-zinc-800 rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all placeholder:text-zinc-600"
              />
              <Search className="w-3 h-3 text-zinc-600 absolute left-2.5 top-[7px]" />
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-[280px] overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-zinc-700 hover:scrollbar-thumb-zinc-600 scrollbar-track-transparent">
            {/* Auto option */}
            {(!search || 'auto'.includes(search.toLowerCase())) && (
              <div className="px-1.5 pt-1.5">
                <button
                  onClick={() => {
                    onCategoryChange('__auto__');
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all flex items-center gap-2 ${
                    currentValue === '__auto__'
                      ? 'bg-blue-500/15 text-blue-400 font-medium'
                      : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100'
                  }`}
                >
                  <Sparkles className="w-3 h-3 shrink-0 opacity-70" />
                  <span className="truncate">
                    Auto Detect
                    {detectedCategory && currentValue === '__auto__'
                      ? ` (${detectedCategory})`
                      : ''}
                  </span>
                  {currentValue === '__auto__' && (
                    <CheckCircle2 className="w-3 h-3 shrink-0 text-blue-400 ml-auto" />
                  )}
                </button>
              </div>
            )}

            {/* Grouped categories */}
            {filteredGroups.map((group) => (
              <div key={group.label} className="px-1.5 pb-0.5">
                <div className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold px-2.5 pt-2.5 pb-1">
                  {group.label}
                </div>
                {group.items.map((item) => (
                  <button
                    key={item}
                    onClick={() => {
                      onCategoryChange(item);
                      setIsOpen(false);
                      setSearch('');
                    }}
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

            {/* Custom option */}
            {(!search || 'custom'.includes(search.toLowerCase())) && (
              <div className="px-1.5 pb-1.5 border-t border-zinc-800/40 mt-1 pt-1">
                <button
                  onClick={() => {
                    onCategoryChange('__custom__');
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] transition-all flex items-center gap-2 ${
                    isCustomEntry
                      ? 'bg-blue-500/15 text-blue-400 font-medium'
                      : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200'
                  }`}
                >
                  <span>Custom...</span>
                </button>
              </div>
            )}

            {/* Empty state */}
            {filteredGroups.length === 0 &&
              search &&
              !'auto'.includes(search.toLowerCase()) &&
              !'custom'.includes(search.toLowerCase()) && (
                <div className="px-4 py-4 text-[11px] text-zinc-600 text-center">
                  No matching categories
                </div>
              )}
          </div>
        </div>
      )}

      {/* Custom input (below dropdown trigger when custom selected) */}
      {(currentValue === '__custom__' || isCustomEntry) && !isOpen && (
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            placeholder="Enter custom category..."
            value={isCustomEntry ? currentValue : customCategoryInput}
            onChange={(e) => onCustomInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCustomSubmit();
            }}
            maxLength={50}
            className="flex-1 bg-zinc-950/80 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-zinc-600"
          />
          <button
            onClick={onCustomSubmit}
            className="px-3 py-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-xs rounded-xl font-medium transition-all duration-200 shadow-lg shadow-blue-500/20"
          >
            Set
          </button>
        </div>
      )}

      {/* Save as rule link */}
      {showSaveAsRule && !isOpen && (
        <button
          onClick={onSaveAsRule}
          className="flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 transition-colors group mt-2"
        >
          <Save className="w-3 h-3 group-hover:scale-110 transition-transform" />
          <span>Save as Rule for {activeHostname}</span>
        </button>
      )}
    </div>
  );
}
