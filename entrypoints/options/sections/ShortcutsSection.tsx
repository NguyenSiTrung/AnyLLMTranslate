/**
 * Shortcut Studio — live global commands, page keys, gestures, copy & manage.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Keyboard as KeyboardIcon,
  Globe2,
  AppWindow,
  Hand,
  Lightbulb,
  ExternalLink,
} from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { stagger } from '@/lib/styleUtils';
import { useSettingsStore } from '@/stores/settingsStore';
import { useToast } from '@/ui/ToastProvider';
import {
  type ScopeFilter,
  type ShortcutDisplayRow,
  PAGE_SHORTCUT_ROWS,
  buildGestureRow,
  buildGlobalRows,
  countGlobalBound,
  filterShortcutRows,
  formatCheatsheet,
  groupRowsByScope,
} from '@/lib/shortcutDisplay';
import { ShortcutStudioBar } from '../components/ShortcutStudioBar';
import { ShortcutGroup } from '../components/ShortcutGroup';

const BROWSER_SHORTCUTS_URL = 'chrome://extensions/shortcuts';

export interface ShortcutsSectionProps {
  onNavigateToInline?: () => void;
}

async function loadChromeCommands(): Promise<
  Array<{ name: string; description?: string; shortcut?: string }>
> {
  try {
    if (typeof chrome !== 'undefined' && chrome.commands?.getAll) {
      const list = await chrome.commands.getAll();
      return list.map((c) => ({
        name: c.name ?? '',
        description: c.description,
        shortcut: c.shortcut,
      }));
    }
  } catch {
    // fall through to defaults
  }
  return [];
}

export function ShortcutsSection({ onNavigateToInline }: ShortcutsSectionProps = {}) {
  const tapCount = useSettingsStore((s) => s.inlineTranslate.tapCount);
  const timeWindowMs = useSettingsStore((s) => s.inlineTranslate.timeWindowMs);
  const { success: showSuccess, error: showError } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [globalRows, setGlobalRows] = useState<ShortcutDisplayRow[]>(() => buildGlobalRows([]));

  const refreshCommands = useCallback(async () => {
    const commands = await loadChromeCommands();
    setGlobalRows(buildGlobalRows(commands));
  }, []);

  useEffect(() => {
    void refreshCommands();
  }, [refreshCommands]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void refreshCommands();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refreshCommands]);

  const gestureRow = useMemo(
    () => buildGestureRow(tapCount, timeWindowMs),
    [tapCount, timeWindowMs],
  );

  const allRows = useMemo(
    () => [...globalRows, ...PAGE_SHORTCUT_ROWS, gestureRow],
    [globalRows, gestureRow],
  );

  const visibleRows = useMemo(
    () => filterShortcutRows(allRows, searchQuery, scope),
    [allRows, searchQuery, scope],
  );

  const grouped = useMemo(() => groupRowsByScope(visibleRows), [visibleRows]);
  const { bound, total } = useMemo(() => countGlobalBound(globalRows), [globalRows]);

  const handleCopy = async () => {
    const text = formatCheatsheet(visibleRows);
    try {
      await navigator.clipboard.writeText(text);
      showSuccess('Cheatsheet copied');
    } catch {
      showError('Could not copy cheatsheet');
    }
  };

  const handleManage = () => {
    try {
      chrome.tabs.create({ url: BROWSER_SHORTCUTS_URL });
    } catch {
      showError(`Open ${BROWSER_SHORTCUTS_URL} manually in the address bar`);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setScope('all');
  };

  const noMatches = visibleRows.length === 0;

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Shortcut Studio"
        description="See every trigger — live browser bindings, page keys, and gestures."
        icon={<KeyboardIcon className="w-4 h-4" />}
        accentColor="orange"
      />

      <div className="space-y-4">
        <div className="animate-stagger" style={stagger(0)}>
          <ShortcutStudioBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            scope={scope}
            onScopeChange={setScope}
            bound={bound}
            total={total}
            onCopy={() => void handleCopy()}
            onManage={handleManage}
          />
        </div>

        {noMatches ? (
          <div
            className="animate-stagger rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-10 text-center"
            style={stagger(1)}
          >
            <p className="text-sm text-zinc-400">No shortcuts match your filters.</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <>
            <div className="animate-stagger" style={stagger(1)}>
              <ShortcutGroup
                title="Global commands"
                description="Managed by the browser. Values refresh when you return to this tab."
                icon={<Globe2 className="w-3.5 h-3.5" />}
                rows={grouped.global}
              />
            </div>
            <div className="animate-stagger" style={stagger(2)}>
              <ShortcutGroup
                title="On this page"
                description="Content-script keys while a web page is focused. Not customizable here."
                icon={<AppWindow className="w-3.5 h-3.5" />}
                rows={grouped.page}
              />
            </div>
            <div className="animate-stagger" style={stagger(3)}>
              <ShortcutGroup
                title="Gestures"
                description="Input-field gesture from Inline settings."
                icon={<Hand className="w-3.5 h-3.5" />}
                rows={grouped.gesture}
                rowAction={
                  onNavigateToInline
                    ? (row) =>
                        row.id === 'gesture-inline' ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={onNavigateToInline}
                          >
                            Configure on Inline
                          </Button>
                        ) : null
                    : undefined
                }
              />
            </div>
          </>
        )}

        <div className="animate-stagger" style={stagger(4)}>
          <Card
            title="Tips"
            description="How shortcuts work in Chromium browsers."
            icon={<Lightbulb className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <ul className="space-y-2 text-xs text-zinc-400 list-disc pl-4">
              <li>
                Global shortcuts are managed by the browser; this studio shows live assignments.
              </li>
              <li>
                Chrome allows only four default suggested keys — the fifth command may need manual
                binding.
              </li>
              <li>
                Page shortcuts work when a web page is focused (not only inside this options UI).
              </li>
              <li>
                Open{' '}
                <button
                  type="button"
                  className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
                  onClick={handleManage}
                >
                  browser shortcuts
                  <ExternalLink className="w-3 h-3" />
                </button>{' '}
                to rebind global commands.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
