
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Languages, Loader2, CheckCircle2, AlertCircle, Settings,
  ArrowRightLeft, Palette, ChevronDown, Search,
  Globe2, Sparkles, Activity, Square
} from 'lucide-react';
import type { Zap } from 'lucide-react';
import type { StatusResponse, TabTranslationStatus, ExtensionMessage } from '@/types/messages';
import { DEFAULT_SETTINGS, PROVIDER_PRESETS } from '@/types/config';
import type { ThemeName, DisplayMode, ExtensionSettings } from '@/types/config';
import { LANGUAGES } from '@/lib/languages';
import { STORAGE_KEYS } from '@/lib/constants';

const STATUS_CONFIG: Record<TabTranslationStatus, { icon: typeof Zap; label: string; color: string; badge: string }> = {
  idle: { icon: Globe2, label: 'Ready to Translate', color: 'text-zinc-400', badge: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
  translating: { icon: Loader2, label: 'Translating...', color: 'text-blue-400', badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  done: { icon: CheckCircle2, label: 'Translation Complete', color: 'text-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  error: { icon: AlertCircle, label: 'Translation Error', color: 'text-red-400', badge: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

const THEME_LABELS: Record<ThemeName, string> = {
  'dividing-line': 'Dividing Line', blockquote: 'Blockquote', paper: 'Paper',
  underline: 'Underline', 'dashed-underline': 'Dashed', highlight: 'Highlight',
  'wavy-underline': 'Wavy', bubble: 'Bubble', 'side-by-side': 'Side by Side',
  mask: 'Mask', 'fade-in': 'Fade In', italic: 'Italic',
  'dotted-border': 'Dotted', 'shadow-card': 'Card', minimal: 'Minimal',
  'gradient-accent': 'Gradient',
};

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

  const selectedOption = options.find((o) => o.value === value) || options[0];
  const filteredOptions = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  const baseStyles = "w-full flex items-center justify-between text-xs transition-all duration-300 focus:outline-none";
  let variantStyles = "";
  if (variant === 'default') {
    variantStyles = `bg-zinc-900/50 border rounded-xl px-3 py-2.5 shadow-sm ${isOpen ? 'border-blue-500/50 ring-2 ring-blue-500/20 bg-zinc-900 text-zinc-100' : 'border-zinc-800/80 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/80'}`;
  } else if (variant === 'ghost') {
    variantStyles = `px-3 py-2 rounded-lg ${isOpen ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`;
  } else if (variant === 'minimal') {
    variantStyles = "px-0 py-1 text-zinc-300 hover:text-zinc-100";
  }

  return (
    <div className="relative" ref={wrapperRef}>
      {label && <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 font-semibold px-1">{label}</label>}
      <button
        type="button"
        id={id}
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
        <div className={`absolute z-[100] w-[calc(100%+8px)] -left-1 mt-1.5 bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col origin-top animate-in fade-in zoom-in-95 duration-200`}>
          {options.length > 10 && (
            <div className="p-2 border-b border-zinc-800/80 bg-zinc-900/50 backdrop-blur-sm">
              <div className="relative">
                <input
                  type="text"
                  autoFocus
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-zinc-950/80 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-shadow placeholder:text-zinc-600"
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
                        ? 'bg-blue-500/10 text-blue-400 font-medium'
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

export default function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<StatusResponse>({
    status: 'idle',
    translatedCount: 0,
    totalCount: 0,
  });
  const [isTranslating, setIsTranslating] = useState(false);

  useEffect(() => {
    loadSettingsFromStorage();
    queryTabStatus();
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
      const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
      if (result[STORAGE_KEYS.SETTINGS]) {
        setSettings({ ...DEFAULT_SETTINGS, ...result[STORAGE_KEYS.SETTINGS] });
      }
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
    const updated = { ...settings, ...partial };
    setSettings(updated);
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
  }, [settings]);

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
      console.error('[LinguaLens] Toggle error:', error);
    }
  }, [isTranslating, status.status]);

  const statusConfig = STATUS_CONFIG[status.status];
  const StatusIcon = statusConfig.icon;
  const providerPreset = PROVIDER_PRESETS.find((p) => p.preset === settings.provider.preset);
  const sourceLanguages = LANGUAGES;
  const targetLanguages = LANGUAGES.filter((l) => l.code !== 'auto');
  const isActive = isTranslating || status.status === 'done';
  const progressPercent = status.totalCount > 0 ? Math.round((status.translatedCount / status.totalCount) * 100) : 0;

  return (
    <div className="w-[340px] min-h-[480px] bg-zinc-950 text-zinc-100 font-sans selection:bg-blue-500/30 relative shadow-2xl flex flex-col justify-between">
      {/* Decorative background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute top-10 -right-20 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      {/* Header section */}
      <div className="relative px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <div className={`w-8 h-8 rounded-[11px] bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20 z-10 transition-transform duration-500 ${isTranslating ? 'scale-95' : ''}`}>
              <Languages className="w-4 h-4 text-white" />
            </div>
            {isTranslating && (
              <div className="absolute inset-0 rounded-[11px] border border-blue-400 animate-ping opacity-50" />
            )}
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-zinc-100">LinguaLens</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isTranslating ? 'bg-blue-500 animate-pulse' : isActive ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
              <span className="text-[10px] uppercase tracking-wider font-medium text-zinc-500">{isActive ? (isTranslating ? 'Translating' : 'Active') : 'Ready'}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => chrome.windows.create({
              url: chrome.runtime.getURL('options.html'),
              type: 'popup', width: 1200, height: 800, focused: true,
            })}
            className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 border border-zinc-800/80 transition-all duration-200 hover:text-zinc-200"
            title="Full Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="px-5 space-y-4 pb-5 relative">
        {/* Language Flow */}
        <div className="bg-zinc-900/40 backdrop-blur-md border border-zinc-800/60 rounded-2xl p-1.5 shadow-inner flex items-center relative group z-30">
          <div className="w-[45%]">
            <CustomSelect
              id="source-language"
              variant="ghost"
              value={settings.sourceLanguage}
              onChange={(val) => updateSetting({ sourceLanguage: val })}
              options={sourceLanguages.map(l => ({ value: l.code, label: l.nativeName }))}
            />
          </div>
          
          <div className="w-[10%] flex justify-center z-10">
            <button
              onClick={() => {
                if (settings.sourceLanguage !== 'auto' && settings.targetLanguage !== 'auto') {
                  updateSetting({
                    sourceLanguage: settings.targetLanguage,
                    targetLanguage: settings.sourceLanguage
                  });
                }
              }}
              className={`p-1.5 rounded-full transition-all duration-300 ${
                settings.sourceLanguage === 'auto'
                  ? 'text-zinc-700 cursor-not-allowed opacity-50'
                  : 'bg-zinc-800 text-zinc-400 shadow-sm border border-zinc-700/50 hover:bg-zinc-700 hover:text-zinc-100 cursor-pointer hover:rotate-180 hover:scale-105'
              }`}
              disabled={settings.sourceLanguage === 'auto'}
            >
              <ArrowRightLeft className="w-3 h-3" />
            </button>
          </div>
          
          <div className="w-[45%]">
            <CustomSelect
              id="target-language"
              variant="ghost"
              value={settings.targetLanguage}
              onChange={(val) => updateSetting({ targetLanguage: val })}
              options={targetLanguages.map(l => ({ value: l.code, label: l.nativeName }))}
            />
          </div>
        </div>

        {/* Translation Status Summary */}
        {(status.totalCount > 0 || status.error) && (
          <div className={`rounded-xl border p-3 flex items-start gap-3 transition-colors ${
            status.error 
              ? 'bg-red-500/5 border-red-500/20' 
              : isTranslating 
                ? 'bg-blue-500/5 border-blue-500/20' 
                : 'bg-emerald-500/5 border-emerald-500/20'
          }`}>
            <div className={`p-1.5 rounded-lg flex-shrink-0 ${
              status.error ? 'bg-red-500/20 text-red-400' :
              isTranslating ? 'bg-blue-500/20 text-blue-400' :
              'bg-emerald-500/20 text-emerald-400'
            }`}>
              <StatusIcon className={`w-4 h-4 ${isTranslating ? 'animate-spin' : ''}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold text-zinc-200">{statusConfig.label}</h4>
              {status.error ? (
                <p className="text-[11px] text-red-400/80 leading-relaxed mt-1">{status.error}</p>
              ) : (
                <div className="mt-1.5">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                    <span>{status.translatedCount} of {status.totalCount} completed</span>
                    <span className="font-mono">{progressPercent}%</span>
                  </div>
                  <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${isTranslating ? 'bg-blue-500' : 'bg-emerald-500'}`} 
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Action Button */}
        <button
          onClick={handleToggleTranslation}
          className="w-full relative group rounded-2xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-transform active:scale-[0.98]"
        >
          {/* Gradient border */}
          <div className={`absolute inset-0 opacity-100 transition-opacity duration-300 ${
            isActive ? 'bg-gradient-to-r from-zinc-700 to-zinc-600' : 'bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 group-hover:opacity-80'
          }`} />
          {/* Shine effect */}
          {!isActive && (
            <div className="absolute inset-0 translate-x-[-100%] group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent z-10" />
          )}
          
          <div className="relative flex items-center justify-center gap-2.5 py-3.5 px-4 z-20">
            {isActive ? (
              <>
                <Square className="w-4 h-4 text-zinc-300 fill-zinc-300" />
                <span className="font-semibold text-sm text-zinc-100 tracking-wide">Restore Original</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-white" />
                <span className="font-semibold text-sm text-white tracking-wide">Translate Page</span>
              </>
            )}
          </div>
        </button>

        {/* Display Settings */}
        <div className="pt-2">
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-4 space-y-4 shadow-inner backdrop-blur-sm relative z-20">
            <div className="space-y-1.5">
                <CustomSelect
                  id="popup-theme"
                  label="Visual Theme"
                  icon={Palette}
                  value={settings.theme}
                  onChange={(val) => updateSetting({ theme: val as ThemeName })}
                  options={(Object.entries(THEME_LABELS) as [ThemeName, string][]).map(([value, label]) => ({ value, label }))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase tracking-wider text-zinc-500 font-semibold px-1 mb-2">Display Mode</label>
                <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800/50">
                  {([
                    { value: 'bilingual-below' as DisplayMode, label: 'Bilingual' },
                    { value: 'translation-only' as DisplayMode, label: 'Replace' },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateSetting({ displayMode: opt.value })}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                        settings.displayMode === opt.value
                          ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="bg-zinc-950/50 border-t border-zinc-900/80 px-5 py-3 flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-1.5 text-zinc-500 group">
          <Activity className="w-3.5 h-3.5 opacity-60 group-hover:text-blue-400 group-hover:opacity-100 transition-colors" />
          <span className="font-medium group-hover:text-zinc-300 transition-colors">{providerPreset?.displayName ?? settings.provider.displayName}</span>
        </div>
        <div className="flex items-center gap-1 bg-zinc-900 px-2 py-0.5 rounded-full border border-zinc-800/80">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
          <span className="text-zinc-400 font-mono tracking-tight">{settings.provider.model}</span>
        </div>
      </div>
    </div>
  );
}
