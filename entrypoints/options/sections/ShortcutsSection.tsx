/**
 * Keyboard Shortcuts Section — display current bindings, link to Chrome management.
 * Header uses inline SectionHeader pattern (consistent with GeneralSection).
 */

import { Keyboard as KeyboardIcon, ExternalLink } from 'lucide-react';
import { Card } from '@/ui/Card';

const DEFAULT_SHORTCUTS = [
  { action: 'Toggle Translation', shortcut: 'Alt+T', description: 'Start or stop translating the current page' },
  { action: 'Open Options', shortcut: 'Alt+O', description: 'Open the AnyLLMTranslate settings page' },
];

export function ShortcutsSection() {
  return (
    <div className="animate-fade-in-up">
      {/* Inline section header — consistent with GeneralSection */}
      <div className="flex items-center gap-3 mb-7">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600/15 border border-blue-500/20">
          <KeyboardIcon className="w-4 h-4 text-blue-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-zinc-100 leading-tight">Keyboard Shortcuts</h2>
          <p className="text-xs text-zinc-500 mt-0.5">View and customize keyboard shortcuts for AnyLLMTranslate.</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Current Shortcuts */}
        <div className="animate-stagger" style={{ '--stagger-delay': '0' } as React.CSSProperties}>
          <Card title="Active Shortcuts" variant="bordered" className="p-0 overflow-hidden">
            <div className="divide-y divide-zinc-800">
              {DEFAULT_SHORTCUTS.map((shortcut, idx) => (
                <div
                  key={shortcut.action}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-zinc-800/30 transition-colors animate-stagger"
                  style={{ '--stagger-delay': idx } as React.CSSProperties}
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{shortcut.action}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{shortcut.description}</p>
                  </div>
                  <kbd className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 font-mono shrink-0">
                    {shortcut.shortcut}
                  </kbd>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Chrome Shortcuts Link */}
        <div className="animate-stagger" style={{ '--stagger-delay': '1' } as React.CSSProperties}>
          <Card variant="bordered">
            <div className="flex items-start gap-3">
              <KeyboardIcon className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-zinc-200 mb-1">Customize Shortcuts</p>
                <p className="text-xs text-zinc-400 mb-3">
                  Chrome manages extension keyboard shortcuts. Click the link below to customize your shortcuts in Chrome settings.
                </p>
                <a
                  href="chrome://extensions/shortcuts"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    try {
                      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
                    } catch {
                      // Fallback: user will need to type the URL manually
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Chrome Shortcuts Settings
                </a>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
