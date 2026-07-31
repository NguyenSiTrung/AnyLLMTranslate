/**
 * Mini studio preferences bridge — reuses existing settings / coordinator paths.
 */

import { loadSettings, updateSettings } from '@/lib/config';
import { updateConfig } from '@/content/subtitleOverlay';
import {
  applySubtitleKnobOverride,
  getSubtitleKnobOverride,
  isInOverlayMode,
} from '@/content/subtitleCoordinator';
import { detectCurrentHandler } from '@/inject/subtitleHandlers/registry';
import {
  resolveActiveSubtitleListId,
  setSiteListSelection,
  normalizeSubtitleSiteHost,
} from '@/lib/namedGlossaryLists';
import type { ProfileKnobs } from '@/lib/subtitleProfiles';
import type { NamedGlossaryList, SubtitleDisplayMode } from '@/types/config';
import type { ChromeStatus } from './types';
import { isContextInvalidated } from '@/lib/utils';

export interface MiniStudioSnapshot {
  enabled: boolean;
  displayMode: SubtitleDisplayMode;
  fontSize: number;
  position: 'top' | 'bottom';
  backgroundOpacity: number;
  knobs: Partial<ProfileKnobs>;
  lists: NamedGlossaryList[];
  activeListId: string | null;
  hostname: string;
  status: ChromeStatus;
}

export function getChromeStatus(args: {
  enabled: boolean;
  overlayActive: boolean;
}): ChromeStatus {
  if (!args.enabled) return 'disabled';
  if (args.overlayActive) return 'translating';
  return 'idle';
}

export async function loadMiniStudioSnapshot(): Promise<MiniStudioSnapshot> {
  const hostname = normalizeSubtitleSiteHost(
    typeof location !== 'undefined' ? location.hostname : '',
  );
  if (isContextInvalidated()) {
    return {
      enabled: false,
      displayMode: 'bilingual',
      fontSize: 20,
      position: 'bottom',
      backgroundOpacity: 0.75,
      knobs: {},
      lists: [],
      activeListId: null,
      hostname,
      status: 'disabled',
    };
  }
  const settings = await loadSettings();
  const ss = settings.subtitleSettings;
  const activeListId = resolveActiveSubtitleListId(
    settings.namedGlossaryLists ?? [],
    settings.subtitleListBySite ?? {},
    hostname,
  );
  const knobs = { ...getSubtitleKnobOverride() };
  hydrateLocalKnobs(knobs);
  return {
    enabled: ss.enabled,
    displayMode: ss.displayMode,
    fontSize: ss.fontSize,
    position: ss.position,
    backgroundOpacity: ss.backgroundOpacity,
    knobs,
    lists: settings.namedGlossaryLists ?? [],
    activeListId,
    hostname,
    status: getChromeStatus({
      enabled: ss.enabled,
      overlayActive: isInOverlayMode(),
    }),
  };
}

export async function setSubtitlesEnabled(enabled: boolean): Promise<void> {
  if (isContextInvalidated()) return;
  const settings = await loadSettings();
  const ss = { ...settings.subtitleSettings, enabled };
  if (enabled) {
    const platform = detectCurrentHandler()?.platform;
    if (platform) {
      ss.disabledSubtitleSites = (ss.disabledSubtitleSites ?? []).filter((p) => p !== platform);
    }
  }
  await updateSettings({ subtitleSettings: ss });
}

export async function setAppearance(partial: {
  fontSize?: number;
  position?: 'top' | 'bottom';
  backgroundOpacity?: number;
  displayMode?: SubtitleDisplayMode;
}): Promise<void> {
  if (isContextInvalidated()) return;
  const settings = await loadSettings();
  const next = { ...settings.subtitleSettings, ...partial };
  if (partial.fontSize != null) {
    next.fontSize = Math.max(12, Math.min(36, partial.fontSize));
  }
  if (partial.backgroundOpacity != null) {
    next.backgroundOpacity = Math.max(0, Math.min(1, partial.backgroundOpacity));
  }
  await updateSettings({ subtitleSettings: next });
  updateConfig({
    fontSize: next.fontSize,
    position: next.position,
    backgroundOpacity: next.backgroundOpacity,
    displayMode: next.displayMode,
  });
}

/** In-module knob map so sequential setTabKnob calls accumulate. */
let localKnobs: Partial<ProfileKnobs> = {};

export function hydrateLocalKnobs(knobs: Partial<ProfileKnobs>): void {
  localKnobs = { ...knobs };
}

export function setTabKnob(knob: keyof ProfileKnobs, value: string): void {
  if (value === 'auto') {
    const { [knob]: _removed, ...rest } = localKnobs;
    localKnobs = rest;
  } else {
    localKnobs = { ...localKnobs, [knob]: value } as Partial<ProfileKnobs>;
  }
  applySubtitleKnobOverride(Object.keys(localKnobs).length ? localKnobs : null);
}

export async function setActiveGlossaryList(listId: string | null): Promise<void> {
  if (isContextInvalidated()) return;
  const settings = await loadSettings();
  const hostname = normalizeSubtitleSiteHost(
    typeof location !== 'undefined' ? location.hostname : '',
  );
  const subtitleListBySite = setSiteListSelection(
    settings.subtitleListBySite ?? {},
    hostname,
    listId,
  );
  await updateSettings({ subtitleListBySite });
}
