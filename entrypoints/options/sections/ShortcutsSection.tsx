/**
 * Keyboard Shortcuts Section — display current bindings, link to Chrome management.
 */

import { Keyboard, ExternalLink } from 'lucide-react';

const DEFAULT_SHORTCUTS = [
  { action: 'Toggle Translation', shortcut: 'Alt+T', description: 'Start or stop translating the current page' },
  { action: 'Open Options', shortcut: 'Alt+O', description: 'Open the LinguaLens settings page' },
];

export function ShortcutsSection() {
  return (
    <div>
      <h2 className="text-xl font-semibold text-zinc-100 mb-1">Keyboard Shortcuts</h2>
      <p className="text-sm text-zinc-500 mb-8">View and customize keyboard shortcuts for LinguaLens.</p>

      {/* Current Shortcuts */}
      <div className="space-y-3 mb-6">
        {DEFAULT_SHORTCUTS.map((shortcut) => (
          <div
            key={shortcut.action}
            className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-lg"
          >
            <div>
              <p className="text-sm font-medium text-zinc-200">{shortcut.action}</p>
              <p className="text-xs text-zinc-500">{shortcut.description}</p>
            </div>
            <kbd className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 font-mono">
              {shortcut.shortcut}
            </kbd>
          </div>
        ))}
      </div>

      {/* Chrome Shortcuts Link */}
      <div className="border border-zinc-800 bg-zinc-900 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Keyboard className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
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
                // chrome:// URLs can't be opened directly, show the path to follow
                try {
                  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
                } catch {
                  alert('Navigate to chrome://extensions/shortcuts in your browser address bar.');
                }
              }}
              className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Chrome Shortcuts Settings
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
