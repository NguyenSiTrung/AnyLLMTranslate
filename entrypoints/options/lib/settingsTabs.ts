/**
 * Shared settings-tab registry for the options page.
 *
 * Single source of truth for sidebar groups, tab order/labels/icons, and
 * `?section=` deep-link resolution (e.g. `options.html?section=speech` from
 * the in-player mini studio or content-script settings links).
 */

import {
  BarChart3,
  BookOpen,
  FileText,
  Globe,
  Keyboard,
  Layers,
  Palette,
  Settings,
  Subtitles,
  TextCursorInput,
  Volume2,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export type TabId =
  | 'general'
  | 'themes'
  | 'providers'
  | 'dictionary'
  | 'site-rules'
  | 'subtitles'
  | 'speech'
  | 'pdf'
  | 'statistics'
  | 'shortcuts'
  | 'inline'
  | 'advanced';

export interface TabDef {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

export interface TabGroup {
  label: string;
  tabs: TabDef[];
}

export const TAB_GROUPS: TabGroup[] = [
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
      { id: 'providers', label: 'Providers', icon: Layers },
      { id: 'dictionary', label: 'Custom terms', icon: BookOpen },
      { id: 'site-rules', label: 'Site Rules', icon: Globe },
    ],
  },
  {
    label: 'MEDIA',
    tabs: [
      { id: 'subtitles', label: 'Subtitles', icon: Subtitles },
      { id: 'speech', label: 'Speech', icon: Volume2 },
      { id: 'pdf', label: 'PDF', icon: FileText },
    ],
  },
  {
    label: 'SYSTEM',
    tabs: [
      { id: 'statistics', label: 'Statistics', icon: BarChart3 },
      { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
      { id: 'inline', label: 'Inline Translate', icon: TextCursorInput },
      { id: 'advanced', label: 'Advanced', icon: Wrench },
    ],
  },
];

export const ALL_TAB_IDS: TabId[] = TAB_GROUPS.flatMap((group) =>
  group.tabs.map((tab) => tab.id),
);

export function isSettingsTabId(value: string | null): value is TabId {
  return value !== null && ALL_TAB_IDS.includes(value as TabId);
}

/** Resolve a `?section=` deep link to a known tab, or null when invalid. */
export function resolveRequestedSettingsTab(value: string | null): TabId | null {
  return isSettingsTabId(value) ? value : null;
}
