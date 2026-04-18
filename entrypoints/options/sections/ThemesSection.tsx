/**
 * Display Themes Section — gallery grid with enhanced previews and selection animation.
 * Header uses inline SectionHeader pattern (consistent with GeneralSection).
 */

import { useSettingsStore } from '@/stores/settingsStore';
import type { ThemeName } from '@/types/config';
import { Check, Palette } from 'lucide-react';
import { ThemePreview } from '../ThemePreview';

interface ThemeCard {
  id: ThemeName;
  label: string;
  description: string;
  preview: {
    borderStyle?: string;
    background?: string;
    textColor: string;
    extra?: string;
  };
}

const THEMES: ThemeCard[] = [
  { id: 'dividing-line', label: 'Dividing Line', description: 'Classic separator', preview: { borderStyle: 'border-t border-zinc-600', textColor: 'text-zinc-400' } },
  { id: 'blockquote', label: 'Blockquote', description: 'Left accent bar', preview: { borderStyle: 'border-l-3 border-blue-500 pl-3', textColor: 'text-zinc-400', extra: 'italic' } },
  { id: 'paper', label: 'Paper Note', description: 'Warm background', preview: { background: 'bg-amber-950/40', borderStyle: 'border border-amber-800/50 rounded', textColor: 'text-amber-300' } },
  { id: 'underline', label: 'Underline', description: 'Bottom accent', preview: { borderStyle: 'border-b-2 border-blue-500', textColor: 'text-zinc-400' } },
  { id: 'dashed-underline', label: 'Dashed Underline', description: 'Dashed bottom', preview: { borderStyle: 'border-b-2 border-dashed border-violet-500', textColor: 'text-zinc-400' } },
  { id: 'highlight', label: 'Highlight', description: 'Marker effect', preview: { background: 'bg-yellow-500/20', textColor: 'text-zinc-300' } },
  { id: 'wavy-underline', label: 'Wavy Underline', description: 'Wavy decoration', preview: { borderStyle: 'decoration-wavy underline decoration-orange-500 underline-offset-4', textColor: 'text-zinc-400' } },
  { id: 'bubble', label: 'Speech Bubble', description: 'Tooltip style', preview: { background: 'bg-sky-950/60', borderStyle: 'border border-sky-800 rounded-xl', textColor: 'text-sky-200' } },
  { id: 'side-by-side', label: 'Side by Side', description: 'Column layout', preview: { borderStyle: 'border-l-2 border-zinc-600 pl-3', textColor: 'text-zinc-400' } },
  { id: 'mask', label: 'Blur Mask', description: 'Hover to reveal', preview: { textColor: 'text-zinc-400', extra: 'blur-xs hover:blur-none transition-all cursor-pointer' } },
  { id: 'fade-in', label: 'Fade In', description: 'Delayed appear', preview: { textColor: 'text-zinc-500' } },
  { id: 'italic', label: 'Italic', description: 'Simple italic', preview: { textColor: 'text-zinc-500', extra: 'italic' } },
  { id: 'dotted-border', label: 'Dotted Border', description: 'Dotted frame', preview: { borderStyle: 'border border-dotted border-zinc-600 rounded', textColor: 'text-zinc-400' } },
  { id: 'shadow-card', label: 'Shadow Card', description: 'Elevated card', preview: { background: 'bg-zinc-800', borderStyle: 'rounded-lg shadow-lg', textColor: 'text-zinc-300' } },
  { id: 'minimal', label: 'Minimal', description: 'Subtle text', preview: { textColor: 'text-zinc-600' } },
  { id: 'gradient-accent', label: 'Gradient Accent', description: 'Gradient bg', preview: { background: 'bg-gradient-to-br from-indigo-950 to-blue-950', borderStyle: 'rounded-md border-l-3 border-indigo-500', textColor: 'text-indigo-300' } },
];

export function ThemesSection() {
  const currentTheme = useSettingsStore((s) => s.theme);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  return (
    <div className="animate-fade-in-up">
      {/* Inline section header — consistent with GeneralSection */}
      <div className="sticky top-0 z-10 backdrop-blur-md bg-[#09090b]/80 pt-4 pb-4 mb-3 -mt-4 flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-pink-600/15 border border-pink-500/20">
          <Palette className="w-4 h-4 text-pink-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-zinc-100 leading-tight">Display Themes</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Choose how translated text appears on web pages.</p>
        </div>
      </div>

      <div className="mb-4 animate-stagger" style={{ '--stagger-delay': '0' } as React.CSSProperties}>
        <ThemePreview />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {THEMES.map((theme, idx) => {
          const isActive = currentTheme === theme.id;
          return (
            <button
              key={theme.id}
              id={`theme-${theme.id}`}
              onClick={() => updateSettings({ theme: theme.id })}
              className={`relative text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer animate-stagger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                isActive
                  ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/30 animate-select-bounce scale-[1.01]'
                  : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-800/50 hover:scale-[1.02] active:scale-[0.98]'
              }`}
              style={{ '--stagger-delay': Math.min(idx + 1, 5) } as React.CSSProperties}
            >
              {/* Active indicator */}
              {isActive && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center animate-scale-in">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}

              {/* Theme name */}
              <div className="mb-2">
                <span className="text-sm font-medium text-zinc-200">{theme.label}</span>
                <span className="text-xs text-zinc-500 ml-2">{theme.description}</span>
              </div>

              {/* Preview */}
              <div className="space-y-1">
                <p className="text-xs text-zinc-400">The quick brown fox jumps.</p>
                <div className={`text-xs px-2 py-1 ${theme.preview.borderStyle ?? ''} ${theme.preview.background ?? ''} ${theme.preview.textColor} ${theme.preview.extra ?? ''}`}>
                  Con cáo nâu nhanh nhẹn nhảy.
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
