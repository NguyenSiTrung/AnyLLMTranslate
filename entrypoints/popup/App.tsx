
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Languages, Loader2, CheckCircle2, AlertCircle, Settings,
  ArrowRightLeft, Palette, ChevronDown, Search,
  Globe2, Sparkles, Activity, Square, Subtitles, FileText, Tag, Save
} from 'lucide-react';
import type { Zap } from 'lucide-react';
import type { StatusResponse, TabTranslationStatus, ExtensionMessage } from '@/types/messages';
import { DEFAULT_SETTINGS, PROVIDER_PRESETS } from '@/types/config';
import type { ThemeName, DisplayMode, ExtensionSettings } from '@/types/config';
import { LANGUAGES } from '@/lib/languages';
import { STORAGE_KEYS } from '@/lib/constants';
import { loadSettings, updateSettings } from '@/lib/config';
import { PREDEFINED_CATEGORIES } from '@/lib/categories';
import type { CategoryInfo } from '@/types/messages';

const STATUS_CONFIG: Record<TabTranslationStatus, { icon: typeof Zap; label: string; color: string; badge: string }> = {
  idle: { icon: Globe2, label: 'Ready to Translate', color: 'text-zinc-400', badge: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
  translating: { icon: Loader2, label: 'Translating...', color: 'text-blue-400', badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  done: { icon: CheckCircle2, label: 'Translation Complete', color: 'text-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  error: { icon: AlertCircle, label: 'Translation Error', color: 'text-red-400', badge: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

const CONNECTION_STATUS_CONFIG: Record<'unknown' | 'success' | 'error', { color: string }> = {
  unknown: { color: 'bg-zinc-500/50' },
  success: { color: 'bg-emerald-500/50' },
  error: { color: 'bg-red-500/50' },
};

const THEME_LABELS: Record<ThemeName, string> = {
  'dividing-line': 'Dividing Line', blockquote: 'Blockquote', paper: 'Paper',
  underline: 'Underline', 'dashed-underline': 'Dashed', highlight: 'Highlight',
  'wavy-underline': 'Wavy', bubble: 'Bubble', 'side-by-side': 'Side by Side',
  mask: 'Mask', 'fade-in': 'Fade In', italic: 'Italic',
  'dotted-border': 'Dotted', 'shadow-card': 'Card', minimal: 'Minimal',
  'gradient-accent': 'Gradient', custom: 'Custom',
};

const TYPOGRAPHY = {
  label: 'text-[11px] uppercase tracking-wider text-zinc-500 font-semibold',
  body: 'text-xs text-zinc-300',
  small: 'text-[11px] text-zinc-400',
  tiny: 'text-[10px] text-zinc-500',
} as const;

const SPACING = {
  xs: 'space-y-1',
  sm: 'space-y-2',
  md: 'space-y-3',
  lg: 'space-y-4',
} as const;

function CustomSelect({
  id,
  value,
  onChange,
  options,
  label,
  icon: Icon,
  variant = 'default'
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label?: string;
  icon?: typeof Zap;
  variant?: 'default' | 'ghost' | 'minimal';
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropUp, setDropUp] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const estimatedDropdownHeight = Math.min(220, options.length * 36);

      // Show dropdown above if there's more space above than below
      setDropUp(spaceAbove > spaceBelow || spaceBelow < estimatedDropdownHeight);
    }
  }, [isOpen, options.length]);

  const selectedOption = options.find((o) => o.value === value) || options[0];
  const filteredOptions = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  const baseStyles = "w-full flex items-center justify-between transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50";
  let variantStyles = "";
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
    variantStyles = "px-0 py-1 text-zinc-300 hover:text-zinc-100 transition-colors duration-200";
  }

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
        <ChevronDown className={`w-3.5 h-3.5 opacity-50 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180 opacity-100 text-blue-400' : ''}`} />
      </button>

      {isOpen && (
        <div className={`absolute z-[9999] w-[calc(100%+8px)] -left-1 bg-zinc-900/98 backdrop-blur-2xl border border-zinc-700/50 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col ${
          dropUp
            ? 'bottom-full mb-2 origin-bottom animate-in fade-in slide-in-from-bottom-2 zoom-in-95'
            : 'mt-2 origin-top animate-in fade-in slide-in-from-top-2 zoom-in-95'
        } duration-300 ease-out`}>
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
                    {value === opt.value && <CheckCircle2 className="w-3.5 h-3.5 opacity-100 shrink-0 ml-2" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  icon: Icon,
}: {
  checked: boolean;
  onChange: () => void;
  label?: string;
  icon?: typeof Zap;
}) {
  return (
    <div className="flex items-center justify-between py-2 px-1">
      {label && (
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon className="w-4 h-4 text-zinc-400 shrink-0" />}
          <span className={TYPOGRAPHY.body}>{label}</span>
        </div>
      )}
      <button
        onClick={onChange}
        className={`relative w-11 h-6 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50 shrink-0 ${
          checked
            ? 'bg-gradient-to-r from-blue-600 to-blue-500 shadow-lg shadow-blue-500/30'
            : 'bg-zinc-700 hover:bg-zinc-600'
        }`}
      >
        <span
          className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

/** Grouped categories for organized display */
const CATEGORY_GROUPS: { label: string; items: string[] }[] = [
  {
    label: 'Development',
    items: ['Software Development', 'Web Development Documentation', 'Programming Q&A', 'Developer Blog', 'Package Registry'],
  },
  {
    label: 'Knowledge',
    items: ['Academic Research', 'Academic Journal', 'Encyclopedia', 'Online Education'],
  },
  {
    label: 'Media & News',
    items: ['News', 'Financial News', 'Technology News', 'Technology Blog', 'Video Platform', 'Streaming Entertainment'],
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

function CategoryPicker({
  currentValue,
  isCustomEntry,
  effectiveCategory,
  customCategoryInput,
  onCategoryChange,
  onCustomInputChange,
  onCustomSubmit,
  showSaveAsRule,
  onSaveAsRule,
  activeHostname,
  categoryOptions,
}: {
  currentValue: string;
  isCustomEntry: boolean;
  effectiveCategory?: string;
  customCategoryInput: string;
  onCategoryChange: (value: string) => void;
  onCustomInputChange: (value: string) => void;
  onCustomSubmit: () => void;
  showSaveAsRule: boolean;
  onSaveAsRule: () => void;
  activeHostname: string | null;
  categoryOptions: { value: string; label: string }[];
}) {
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

  const displayLabel = currentValue === '__auto__'
    ? `Auto${effectiveCategory ? ` · ${effectiveCategory}` : ''}`
    : isCustomEntry
      ? currentValue
      : currentValue;

  const filteredGroups = CATEGORY_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item =>
      item.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(group => group.items.length > 0);

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
        <Tag className={`w-3.5 h-3.5 shrink-0 transition-colors ${isOpen ? 'text-blue-400' : 'text-zinc-500'}`} />
        <div className="flex-1 min-w-0 text-left">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold leading-none mb-0.5">Category</div>
          <div className="text-xs text-zinc-200 font-medium truncate">{displayLabel}</div>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-all duration-300 ${
          isOpen ? 'rotate-180 text-blue-400' : 'text-zinc-600 group-hover:text-zinc-400'
        }`} />
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
                  onClick={() => { onCategoryChange('__auto__'); setIsOpen(false); setSearch(''); }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all flex items-center gap-2 ${
                    currentValue === '__auto__'
                      ? 'bg-blue-500/15 text-blue-400 font-medium'
                      : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100'
                  }`}
                >
                  <Sparkles className="w-3 h-3 shrink-0 opacity-70" />
                  <span className="truncate">Auto Detect</span>
                  {effectiveCategory && currentValue === '__auto__' && (
                    <span className="ml-auto text-[10px] text-zinc-500 truncate max-w-[100px]">{effectiveCategory}</span>
                  )}
                  {currentValue === '__auto__' && <CheckCircle2 className="w-3 h-3 shrink-0 text-blue-400 ml-auto" />}
                </button>
              </div>
            )}

            {/* Grouped categories */}
            {filteredGroups.map((group) => (
              <div key={group.label} className="px-1.5 pb-0.5">
                <div className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold px-2.5 pt-2.5 pb-1">{group.label}</div>
                {group.items.map((item) => (
                  <button
                    key={item}
                    onClick={() => { onCategoryChange(item); setIsOpen(false); setSearch(''); }}
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
                  onClick={() => { onCategoryChange('__custom__'); setIsOpen(false); setSearch(''); }}
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
            {filteredGroups.length === 0 && search && !('auto'.includes(search.toLowerCase())) && !('custom'.includes(search.toLowerCase())) && (
              <div className="px-4 py-4 text-[11px] text-zinc-600 text-center">No matching categories</div>
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
            onKeyDown={(e) => { if (e.key === 'Enter') onCustomSubmit(); }}
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

export default function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<StatusResponse>({
    status: 'idle',
    translatedCount: 0,
    totalCount: 0,
  });
  const [isTranslating, setIsTranslating] = useState(false);
  const [activeHostname, setActiveHostname] = useState<string | null>(null);
  const [categoryInfo, setCategoryInfo] = useState<CategoryInfo | null>(null);
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  useEffect(() => {
    loadSettingsFromStorage();
    queryTabStatus();

    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url) {
          try {
            const url = new URL(tab.url);
            if (url.protocol === 'http:' || url.protocol === 'https:') {
              setActiveHostname(url.hostname);
            }
          } catch { /* invalid URL */ }
        }
      } catch { /* tab query failed */ }
    })();

    // Load current category info from content script
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          try {
            const catInfo = await chrome.tabs.sendMessage(tab.id, { action: 'getPageCategory' });
            if (catInfo) setCategoryInfo(catInfo as CategoryInfo);
          } catch { /* content script not loaded */ }
        }
      } catch { /* tab query failed */ }
    })();

    const storageListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[STORAGE_KEYS.SETTINGS]) {
        setSettings({ ...DEFAULT_SETTINGS, ...changes[STORAGE_KEYS.SETTINGS].newValue });
      }
    };
    chrome.storage.onChanged.addListener(storageListener);

    const messageListener = (message: ExtensionMessage) => {
      if (message.action === 'statusUpdate') {
        setStatus(message.status);
        setIsTranslating(message.status.status === 'translating');
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      chrome.storage.onChanged.removeListener(storageListener);
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  async function loadSettingsFromStorage() {
    try {
      const loaded = await loadSettings();
      setSettings(loaded);
    } catch { /* defaults */ }
  }

  async function queryTabStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        try {
          // Query the specific content script directly (the true source of state)
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'getStatus' });
          if (response) {
            setStatus(response as StatusResponse);
            setIsTranslating(response.status === 'translating');
          }
        } catch {
          // Content script not loaded or inaccessible tab (e.g. chrome://) -> defaults to idle
          setStatus({ status: 'idle', translatedCount: 0, totalCount: 0 });
          setIsTranslating(false);
        }
      }
    } catch { /* tab query failed */ }
  }

  const updateSetting = useCallback(async (partial: Partial<ExtensionSettings>) => {
    const updated = await updateSettings(partial);
    setSettings(updated);
  }, []);

  const updateSubtitleSetting = useCallback(async (partial: Partial<typeof settings.subtitleSettings>) => {
    const updated = await updateSettings({
      subtitleSettings: { ...settings.subtitleSettings, ...partial },
    });
    setSettings(updated);
  }, [settings]);

  const isAlwaysTranslate = activeHostname
    ? settings.siteRules.some(r => r.hostname === activeHostname && r.alwaysTranslate)
    : false;

  const handleToggleAlwaysTranslate = useCallback(async () => {
    if (!activeHostname) return;
    const existingRuleIndex = settings.siteRules.findIndex(r => r.hostname === activeHostname);
    const newRules = [...settings.siteRules];
    if (existingRuleIndex >= 0) {
      newRules[existingRuleIndex] = {
        ...newRules[existingRuleIndex],
        alwaysTranslate: !newRules[existingRuleIndex].alwaysTranslate,
      };
    } else {
      newRules.push({
        id: crypto.randomUUID(),
        hostname: activeHostname,
        includeSelectors: [],
        excludeSelectors: [],
        alwaysTranslate: true,
        neverTranslate: false,
        builtIn: false,
      });
    }
    await updateSetting({ siteRules: newRules });
  }, [activeHostname, settings.siteRules, updateSetting]);

  const handleCategoryChange = useCallback(async (value: string) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      if (value === '__custom__') {
        setCustomCategoryInput('');
        return;
      }

      const category = value === '__auto__' ? null : value;
      await chrome.runtime.sendMessage({
        action: 'setCategoryOverride',
        tabId: tab.id,
        category,
      });

      // Update local state
      setCategoryInfo(prev => ({
        ...prev,
        override: category ?? undefined,
        effective: category ?? prev?.siteRule ?? prev?.autoDetected,
      }));
    } catch { /* failed */ }
  }, []);

  const handleCustomCategorySubmit = useCallback(async () => {
    const trimmed = customCategoryInput.trim().slice(0, 50);
    if (!trimmed) return;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      await chrome.runtime.sendMessage({
        action: 'setCategoryOverride',
        tabId: tab.id,
        category: trimmed,
      });
      setCategoryInfo(prev => ({
        ...prev,
        override: trimmed,
        effective: trimmed,
      }));
      setCustomCategoryInput('');
    } catch { /* failed */ }
  }, [customCategoryInput]);

  const handleSaveAsRule = useCallback(async () => {
    if (!activeHostname || !categoryInfo?.override) return;
    const existingRuleIndex = settings.siteRules.findIndex(r => r.hostname === activeHostname);
    const newRules = [...settings.siteRules];
    if (existingRuleIndex >= 0) {
      newRules[existingRuleIndex] = {
        ...newRules[existingRuleIndex],
        category: categoryInfo.override,
      };
    } else {
      newRules.push({
        id: crypto.randomUUID(),
        hostname: activeHostname,
        includeSelectors: [],
        excludeSelectors: [],
        alwaysTranslate: false,
        neverTranslate: false,
        builtIn: false,
        category: categoryInfo.override,
      });
    }
    await updateSetting({ siteRules: newRules });

    // Clear the temporary override (SiteRule now handles it)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.runtime.sendMessage({
          action: 'setCategoryOverride',
          tabId: tab.id,
          category: null,
        });
      }
    } catch { /* failed */ }

    setCategoryInfo(prev => ({
      ...prev,
      siteRule: categoryInfo.override,
      override: undefined,
      effective: categoryInfo.override,
    }));
  }, [activeHostname, categoryInfo, settings.siteRules, updateSetting]);

  const handleToggleTranslation = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      if (isTranslating || status.status === 'done') {
        await chrome.tabs.sendMessage(tab.id, { action: 'stopTranslation' });
        setIsTranslating(false);
        setStatus({ status: 'idle', translatedCount: 0, totalCount: 0 });
      } else {
        await chrome.tabs.sendMessage(tab.id, { action: 'startTranslation' });
        setIsTranslating(true);
        setStatus((prev) => ({ ...prev, status: 'translating' }));
      }
    } catch (error) {
      console.error('[AnyLLMTranslate] Toggle error:', error);
    }
  }, [isTranslating, status.status]);

  const statusConfig = STATUS_CONFIG[status.status];
  const connectionStatus = settings.provider.connectionStatus ?? 'unknown';
  const connectionStatusConfig = CONNECTION_STATUS_CONFIG[connectionStatus];
  const StatusIcon = statusConfig.icon;
  const providerPreset = PROVIDER_PRESETS.find((p) => p.preset === settings.provider.preset);
  const sourceLanguages = LANGUAGES;
  const targetLanguages = LANGUAGES.filter((l) => l.code !== 'auto');
  const isActive = isTranslating || status.status === 'done';
  const progressPercent = status.totalCount > 0 ? Math.round((status.translatedCount / status.totalCount) * 100) : 0;

  const showCategoryDropdown = settings.enableContextAwareTranslation && settings.enableLLMPageCategoryDetection && activeHostname;
  const currentCategoryValue = categoryInfo?.override ?? categoryInfo?.siteRule ?? '__auto__';
  const isCustomEntry = currentCategoryValue !== '__auto__' && !PREDEFINED_CATEGORIES.includes(currentCategoryValue as typeof PREDEFINED_CATEGORIES[number]);
  const effectiveCategoryDisplay = categoryInfo?.effective;
  const showSaveAsRule = Boolean(categoryInfo?.override && activeHostname);

  const categoryOptions = [
    { value: '__auto__', label: `Auto${effectiveCategoryDisplay && !categoryInfo?.override ? ` (${effectiveCategoryDisplay})` : ''}` },
    ...PREDEFINED_CATEGORIES.map(c => ({ value: c, label: c })),
    { value: '__custom__', label: 'Custom...' },
  ];

  return (
    <div className="w-[340px] min-h-[480px] bg-zinc-950 text-zinc-100 font-sans selection:bg-blue-500/30 relative shadow-2xl flex flex-col">
      {/* Enhanced decorative background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-20 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute top-10 -right-20 w-48 h-48 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-10 w-40 h-40 bg-indigo-500/5 rounded-full blur-3xl" />
      </div>

      {/* Header section */}
      <div className="relative px-5 py-5 flex items-center justify-between border-b border-zinc-900/80">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <div className={`w-9 h-9 rounded-[12px] bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20 z-10 transition-all duration-500 ${isTranslating ? 'scale-95' : ''}`}>
              <Languages className="w-4.5 h-4.5 text-white" />
            </div>
            {isTranslating && (
              <div className="absolute inset-0 rounded-[12px] border border-blue-400 animate-ping opacity-50" />
            )}
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-zinc-100">AnyLLMTranslate</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="relative">
                <span className={`w-1.5 h-1.5 rounded-full ${isTranslating ? 'bg-blue-500' : isActive ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                {isTranslating && <span className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-50" />}
              </span>
              <span className={TYPOGRAPHY.tiny}>{isActive ? (isTranslating ? 'Translating' : 'Active') : 'Ready'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => chrome.windows.create({
              url: chrome.runtime.getURL('options.html'),
              type: 'popup', width: 1200, height: 800, focused: true,
            })}
            className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 border border-zinc-800/80 transition-all duration-200 hover:text-zinc-200 hover:shadow-lg hover:shadow-black/20"
            title="Full Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4 relative flex-1 overflow-y-auto">
        {/* Language Flow Card */}
        <div className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-800/80 rounded-2xl p-2 shadow-lg shadow-black/20">
          <div className="flex items-center relative">
            <div className="flex-1">
              <CustomSelect
                id="source-language"
                variant="ghost"
                value={settings.sourceLanguage}
                onChange={(val) => updateSetting({ sourceLanguage: val })}
                options={sourceLanguages.map(l => ({ value: l.code, label: l.nativeName }))}
              />
            </div>

            <div className="flex justify-center z-10 px-1">
              <button
                onClick={() => {
                  if (settings.sourceLanguage !== 'auto' && settings.targetLanguage !== 'auto') {
                    updateSetting({
                      sourceLanguage: settings.targetLanguage,
                      targetLanguage: settings.sourceLanguage
                    });
                  }
                }}
                className={`p-2 rounded-full transition-all duration-300 ${
                  settings.sourceLanguage === 'auto'
                    ? 'text-zinc-700 cursor-not-allowed opacity-50'
                    : 'bg-zinc-800 text-zinc-400 shadow-md border border-zinc-700/50 hover:bg-zinc-700 hover:text-zinc-100 cursor-pointer hover:rotate-180 hover:scale-110 hover:shadow-lg hover:shadow-blue-500/20'
                }`}
                disabled={settings.sourceLanguage === 'auto'}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1">
              <CustomSelect
                id="target-language"
                variant="ghost"
                value={settings.targetLanguage}
                onChange={(val) => updateSetting({ targetLanguage: val })}
                options={targetLanguages.map(l => ({ value: l.code, label: l.nativeName }))}
              />
            </div>
          </div>
        </div>

        {/* Translation Status Summary */}
        {(status.totalCount > 0 || status.error) && (
          <div className={`rounded-2xl border p-4 flex items-start gap-3 transition-all ${
            status.error
              ? 'bg-red-500/10 border-red-500/30 shadow-lg shadow-red-500/10'
              : isTranslating
                ? 'bg-blue-500/10 border-blue-500/30 shadow-lg shadow-blue-500/10'
                : 'bg-emerald-500/10 border-emerald-500/30 shadow-lg shadow-emerald-500/10'
          }`}>
            <div className={`p-2 rounded-xl flex-shrink-0 ${
              status.error ? 'bg-red-500/20 text-red-400' :
              isTranslating ? 'bg-blue-500/20 text-blue-400' :
              'bg-emerald-500/20 text-emerald-400'
            }`}>
              <StatusIcon className={`w-5 h-5 ${isTranslating ? 'animate-spin' : ''}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold text-zinc-200">{statusConfig.label}</h4>
              {status.error ? (
                <p className="text-[11px] text-red-400/80 leading-relaxed mt-1">{status.error}</p>
              ) : (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1.5">
                    <span>{status.translatedCount} of {status.totalCount} completed</span>
                    <span className="font-mono font-semibold">{progressPercent}%</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${isTranslating ? 'bg-gradient-to-r from-blue-500 to-cyan-500' : 'bg-gradient-to-r from-emerald-500 to-teal-500'}`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Action Button - Hero Style */}
        <button
          onClick={handleToggleTranslation}
          className="w-full relative group rounded-2xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 focus:ring-offset-zinc-950 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className={`absolute inset-0 transition-all duration-500 ${
            isActive
              ? 'bg-gradient-to-r from-zinc-700 via-zinc-600 to-zinc-700'
              : 'bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 bg-[length:200%_200%] animate-gradient-x'
          }`} />

          {!isActive && (
            <div className="absolute inset-0 translate-x-[-100%] group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent z-10" />
          )}

          <div className="relative flex items-center justify-center gap-2.5 py-4 px-4 z-20">
            {isActive ? (
              <>
                <Square className="w-4.5 h-4.5 text-zinc-300 fill-zinc-300" />
                <span className="font-semibold text-sm text-zinc-100 tracking-wide">Restore Original</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4.5 h-4.5 text-white" />
                <span className="font-semibold text-sm text-white tracking-wide">Translate Page</span>
              </>
            )}
          </div>
        </button>

        {/* Site Rule Toggle */}
        {activeHostname && (
          <Toggle
            checked={isAlwaysTranslate}
            onChange={handleToggleAlwaysTranslate}
            label={`Always translate ${activeHostname}`}
            icon={Globe2}
          />
        )}

        {/* Page Category Selector — top-level per-page action */}
        {showCategoryDropdown && (
          <CategoryPicker
            currentValue={currentCategoryValue}
            isCustomEntry={isCustomEntry}
            effectiveCategory={effectiveCategoryDisplay}
            customCategoryInput={customCategoryInput}
            onCategoryChange={handleCategoryChange}
            onCustomInputChange={setCustomCategoryInput}
            onCustomSubmit={handleCustomCategorySubmit}
            showSaveAsRule={showSaveAsRule}
            onSaveAsRule={handleSaveAsRule}
            activeHostname={activeHostname}
            categoryOptions={categoryOptions}
          />
        )}

        {/* Collapsible Settings Section */}
        <div className="border-t border-zinc-900/80 pt-4">
          <button
            onClick={() => setSettingsExpanded(!settingsExpanded)}
            className="w-full flex items-center justify-between text-zinc-400 hover:text-zinc-200 transition-colors group"
          >
            <span className={TYPOGRAPHY.label}>Display Settings</span>
            <ChevronDown className={`w-4 h-4 transition-all duration-300 ${settingsExpanded ? 'rotate-180' : ''} group-hover:text-zinc-200`} />
          </button>

          {settingsExpanded && (
            <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-800/80 rounded-2xl p-4 shadow-lg shadow-black/20">
                <div className={SPACING.sm}>
                  <CustomSelect
                    id="popup-theme"
                    label="Visual Theme"
                    icon={Palette}
                    value={settings.theme}
                    onChange={(val) => updateSetting({ theme: val as ThemeName })}
                    options={(Object.entries(THEME_LABELS) as [ThemeName, string][]).map(([value, label]) => ({ value, label }))}
                  />
                </div>

                <div className={SPACING.sm}>
                  <label className={TYPOGRAPHY.label}>Display Mode</label>
                  <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800/50">
                    {([
                      { value: 'bilingual-below' as DisplayMode, label: 'Bilingual' },
                      { value: 'translation-only' as DisplayMode, label: 'Replace' },
                    ]).map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => updateSetting({ displayMode: opt.value })}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                          settings.displayMode === opt.value
                            ? 'bg-zinc-800 text-zinc-100 shadow-md'
                            : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Toggle
                  checked={settings.subtitleSettings.enabled}
                  onChange={() => updateSubtitleSetting({ enabled: !settings.subtitleSettings.enabled })}
                  label="Subtitle Translation"
                  icon={Subtitles}
                />
              </div>
            </div>
          )}
        </div>

        {/* Collapsible Advanced Section */}
        <div className="border-t border-zinc-900/80 pt-4">
          <button
            onClick={() => setAdvancedExpanded(!advancedExpanded)}
            className="w-full flex items-center justify-between text-zinc-400 hover:text-zinc-200 transition-colors group"
          >
            <span className={TYPOGRAPHY.label}>Advanced</span>
            <ChevronDown className={`w-4 h-4 transition-all duration-300 ${advancedExpanded ? 'rotate-180' : ''} group-hover:text-zinc-200`} />
          </button>

          {advancedExpanded && (
            <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-800/80 rounded-2xl p-4 shadow-lg shadow-black/20">
                <Toggle
                  checked={settings.enableContextAwareTranslation}
                  onChange={() => updateSetting({ enableContextAwareTranslation: !settings.enableContextAwareTranslation })}
                  label="Context-Aware Translation"
                  icon={FileText}
                />

                <div className={`pl-5 ${!settings.enableContextAwareTranslation ? 'opacity-40 pointer-events-none' : ''}`}>
                  <Toggle
                    checked={settings.enableLLMPageCategoryDetection}
                    onChange={() => updateSetting({ enableLLMPageCategoryDetection: !settings.enableLLMPageCategoryDetection })}
                    label="Page Category Detection"
                    icon={Tag}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Enhanced Footer */}
      <div className="bg-zinc-950/80 border-t border-zinc-900/80 px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-zinc-500 group">
          <Activity className="w-3.5 h-3.5 opacity-60 group-hover:text-blue-400 group-hover:opacity-100 transition-colors" />
          <span className={TYPOGRAPHY.small}>{providerPreset?.displayName ?? settings.provider.displayName}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-zinc-900/80 backdrop-blur px-2.5 py-1 rounded-full border border-zinc-800/80 shadow-sm">
          <span className="relative">
            <span className={`w-1.5 h-1.5 rounded-full ${connectionStatusConfig.color}`} />
            {connectionStatus === 'success' && <span className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-50" />}
          </span>
          <span className={TYPOGRAPHY.small}>{settings.provider.model}</span>
        </div>
      </div>
    </div>
  );
}
