import { useState, useEffect } from 'react';
import {
  Settings, Zap, Palette, Globe, BookOpen, Subtitles, Keyboard, Wrench,
  Languages,
} from 'lucide-react';
import { useSettingsStore, initStorageSync } from '@/stores/settingsStore';
import { GeneralSection } from './sections/GeneralSection';
import { ProviderSection } from './sections/ProviderSection';
import { ThemesSection } from './sections/ThemesSection';
import { SiteRulesSection } from './sections/SiteRulesSection';
import { DictionarySection } from './sections/DictionarySection';
import { SubtitlesSection } from './sections/SubtitlesSection';
import { ShortcutsSection } from './sections/ShortcutsSection';
import { AdvancedSection } from './sections/AdvancedSection';

const TABS = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'provider', label: 'Translation Provider', icon: Zap },
  { id: 'themes', label: 'Display Themes', icon: Palette },
  { id: 'site-rules', label: 'Site Rules', icon: Globe },
  { id: 'dictionary', label: 'Custom Dictionary', icon: BookOpen },
  { id: 'subtitles', label: 'Subtitles', icon: Subtitles },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Keyboard },
  { id: 'advanced', label: 'Advanced', icon: Wrench },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const loadFromStorage = useSettingsStore((s) => s.loadFromStorage);
  const isLoaded = useSettingsStore((s) => s.isLoaded);

  useEffect(() => {
    loadFromStorage();
    const cleanup = initStorageSync();
    return cleanup;
  }, [loadFromStorage]);

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
    <div className="flex min-h-screen bg-zinc-950">
      {/* Sidebar */}
      <nav className="w-64 border-r border-zinc-800 bg-zinc-950 flex flex-col shrink-0" aria-label="Settings navigation">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-zinc-800">
          <Languages className="w-6 h-6 text-blue-400" />
          <span className="text-base font-semibold tracking-tight text-zinc-100">LinguaLens</span>
          <span className="text-[10px] text-zinc-500 ml-auto font-mono">v0.1.0</span>
        </div>

        {/* Tab List */}
        <div className="flex-1 py-3 space-y-0.5 overflow-y-auto" role="tablist" aria-orientation="vertical">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-all duration-150 cursor-pointer ${
                  isActive
                    ? 'text-blue-400 bg-blue-500/10 border-r-2 border-blue-400'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Content Area */}
      <main
        className="flex-1 overflow-y-auto"
        id={`panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
      >
        <div className="max-w-3xl mx-auto px-8 py-8">
          {renderSection()}
        </div>
      </main>
    </div>
  );
}
