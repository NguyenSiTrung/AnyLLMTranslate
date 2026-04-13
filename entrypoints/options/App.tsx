import { useState, useEffect, useRef } from 'react';
import {
  Settings, Zap, Palette, Globe, BookOpen, Subtitles, Keyboard, Wrench,
  Languages, Check,
} from 'lucide-react';
import { useSettingsStore, initStorageSync } from '@/stores/settingsStore';
import { ToastProvider } from '@/ui/ToastProvider';
import { GeneralSection } from './sections/GeneralSection';
import { ProviderSection } from './sections/ProviderSection';
import { ThemesSection } from './sections/ThemesSection';
import { SiteRulesSection } from './sections/SiteRulesSection';
import { DictionarySection } from './sections/DictionarySection';
import { SubtitlesSection } from './sections/SubtitlesSection';
import { ShortcutsSection } from './sections/ShortcutsSection';
import { AdvancedSection } from './sections/AdvancedSection';

/* ── Grouped Navigation ─────────────────────────────────────── */

interface TabDef {
  id: string;
  label: string;
  icon: typeof Settings;
}

interface TabGroup {
  label: string;
  tabs: TabDef[];
}

const TAB_GROUPS: TabGroup[] = [
  {
    label: 'DISPLAY',
    tabs: [
      { id: 'general', label: 'General', icon: Settings },
      { id: 'themes', label: 'Themes', icon: Palette },
    ],
  },
  {
    label: 'TRANSLATION',
    tabs: [
      { id: 'provider', label: 'Provider', icon: Zap },
      { id: 'dictionary', label: 'Dictionary', icon: BookOpen },
      { id: 'site-rules', label: 'Site Rules', icon: Globe },
    ],
  },
  {
    label: 'MEDIA',
    tabs: [
      { id: 'subtitles', label: 'Subtitles', icon: Subtitles },
    ],
  },
  {
    label: 'SYSTEM',
    tabs: [
      { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
      { id: 'advanced', label: 'Advanced', icon: Wrench },
    ],
  },
];

const ALL_TAB_IDS = TAB_GROUPS.flatMap((g) => g.tabs.map((t) => t.id));
type TabId = string;

/* ── Component ───────────────────────────────────────────────── */

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [showSaved, setShowSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const loadFromStorage = useSettingsStore((s) => s.loadFromStorage);
  const isLoaded = useSettingsStore((s) => s.isLoaded);

  useEffect(() => {
    loadFromStorage();
    const cleanup = initStorageSync();
    return cleanup;
  }, [loadFromStorage]);

  // Auto-save feedback: listen for store updates
  useEffect(() => {
    const unsub = useSettingsStore.subscribe(() => {
      setShowSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setShowSaved(false), 2000);
    });
    return () => {
      unsub();
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  /* Keyboard navigation within sidebar */
  const handleSidebarKeyDown = (e: React.KeyboardEvent) => {
    const idx = ALL_TAB_IDS.indexOf(activeTab);
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      const next = ALL_TAB_IDS[(idx + 1) % ALL_TAB_IDS.length];
      setActiveTab(next);
      document.getElementById(`tab-${next}`)?.focus();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = ALL_TAB_IDS[(idx - 1 + ALL_TAB_IDS.length) % ALL_TAB_IDS.length];
      setActiveTab(prev);
      document.getElementById(`tab-${prev}`)?.focus();
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950">
        <div className="animate-pulse text-zinc-400">Loading settings...</div>
      </div>
    );
  }

  const renderSection = () => {
    switch (activeTab) {
      case 'general': return <GeneralSection />;
      case 'provider': return <ProviderSection />;
      case 'themes': return <ThemesSection />;
      case 'site-rules': return <SiteRulesSection />;
      case 'dictionary': return <DictionarySection />;
      case 'subtitles': return <SubtitlesSection />;
      case 'shortcuts': return <ShortcutsSection />;
      case 'advanced': return <AdvancedSection />;
      default: return <GeneralSection />;
    }
  };

  return (
    <ToastProvider>
      {/* Skip to main content — accessibility */}
      <a
        href="#settings-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:text-sm"
      >
        Skip to content
      </a>
      <div className="settings-layout">
        {/* ── Sidebar ── */}
        <nav
          className="settings-sidebar"
          aria-label="Settings navigation"
        >
          {/* Brand header */}
          <div className="sidebar-header">
            <Languages className="sidebar-brand-icon" />
            <span className="sidebar-brand-name">AnyLLMTranslate</span>
            <span className="sidebar-version">v0.1.0</span>
          </div>

          {/* Grouped tab list */}
          <div
            className="sidebar-tabs"
            role="tablist"
            aria-orientation="vertical"
            onKeyDown={handleSidebarKeyDown}
          >
            {TAB_GROUPS.map((group) => (
              <div key={group.label} className="sidebar-group">
                {/* Group label */}
                <div className="sidebar-group-label">{group.label}</div>
                {/* Group tabs */}
                {group.tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      id={`tab-${tab.id}`}
                      role="tab"
                      tabIndex={isActive ? 0 : -1}
                      aria-selected={isActive}
                      aria-controls={`panel-${tab.id}`}
                      onClick={() => setActiveTab(tab.id)}
                      className={`sidebar-tab ${isActive ? 'sidebar-tab--active' : ''}`}
                    >
                      {isActive && (
                        <div className="sidebar-tab-indicator" />
                      )}
                      <Icon className="sidebar-tab-icon" />
                      <span className="sidebar-tab-label">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Auto-save badge in footer */}
          <div className="sidebar-footer">
            <div className={`sidebar-save-badge ${showSaved ? 'sidebar-save-badge--visible' : ''}`}>
              <Check className="sidebar-save-icon" />
              <span>Auto-saved</span>
            </div>
          </div>
        </nav>

        {/* ── Content Area ── */}
        <main
          className="settings-content"
          id={`panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
        >
          <div id="settings-content" className="settings-content-inner">
            <div key={activeTab} className="tab-content-enter">
              {renderSection()}
            </div>
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
