/**
 * Keyboard Shortcuts Section — display current bindings, link to Chrome management.
 * Refactored with shared components.
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
      {/* Section header */}
      <Card accent="blue" className="mb-8">
        <div className="flex items-center gap-3">
          <KeyboardIcon className="w-5 h-5 text-blue-400" />
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Keyboard Shortcuts</h2>
            <p className="text-xs text-zinc-500">View and customize keyboard shortcuts for AnyLLMTranslate.</p>
          </div>
        </div>
      </Card>

      {/* Current Shortcuts */}
      <div className="space-y-3 mb-6">
        {DEFAULT_SHORTCUTS.map((shortcut, idx) => (
          <Card
            key={shortcut.action}
            variant="default"
            className="animate-stagger"
            style={{ '--stagger-delay': idx } as React.CSSProperties}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-200">{shortcut.action}</p>
                <p className="text-xs text-zinc-500">{shortcut.description}</p>
              </div>
              <kbd className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 font-mono">
                {shortcut.shortcut}
              </kbd>
            </div>
          </Card>
        ))}
      </div>

      {/* Chrome Shortcuts Link */}
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
  );
}
