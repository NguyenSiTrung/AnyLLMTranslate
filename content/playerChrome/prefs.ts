/**
 * Mini studio preferences bridge — reuses existing settings / coordinator paths.
 */

import { loadSettings, updateSettings } from '@/lib/config';
import { updateConfig } from '@/content/subtitleOverlay';
import {
  applySubtitleKnobOverride,
  getSubtitleKnobOverride,
  isInOverlayMode,
  isPlusSourceAvailable,
  getActiveTrackCueCount,
} from '@/content/subtitleCoordinator';
import { detectCurrentHandler } from '@/inject/subtitleHandlers/registry';
import {
  resolveActiveSubtitleListId,
  setSiteListSelection,
  normalizeSubtitleSiteHost,
} from '@/lib/namedGlossaryLists';
import type { ProfileKnobs } from '@/lib/subtitleProfiles';
import { resolveSubtitleStyle } from '@/lib/subtitleStylePresets';
import type {
  NamedGlossaryList,
  SubtitleDisplayMode,
  SubtitleStyleOverrides,
  SubtitleStylePresetId,
  SubtitleTranslationMode,
} from '@/types/config';
import type { ChromeStatus } from './types';
import { isContextInvalidated } from '@/lib/utils';

export interface MiniStudioSnapshot {
  enabled: boolean;
  displayMode: SubtitleDisplayMode;
  fontSize: number;
  position: 'top' | 'bottom';
  backgroundOpacity: number;
  stylePreset: SubtitleStylePresetId;
  styleOverrides: Partial<SubtitleStyleOverrides>;
  hasCustomStyle: boolean;
  knobs: Partial<ProfileKnobs>;
  lists: NamedGlossaryList[];
  activeListId: string | null;
  /** Settings-level translation mode (the per-session override is read live). */
  mode: SubtitleTranslationMode;
  /** True when the active source provides a complete track. */
  plusAvailable: boolean;
  /** Cue count of the active complete track (0 when none). */
  cueCount: number;
  /** Persisted dismissal of the one-time Plus hint. */
  plusHintDismissed: boolean;
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
      stylePreset: 'classic',
      styleOverrides: {},
      hasCustomStyle: false,
      knobs: {},
      lists: [],
      activeListId: null,
      mode: 'progressive',
      plusAvailable: false,
      cueCount: 0,
      plusHintDismissed: true,
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
    stylePreset: ss.stylePreset,
    styleOverrides: ss.styleOverrides ?? {},
    hasCustomStyle: Object.keys(ss.styleOverrides ?? {}).length > 0,
    knobs,
    lists: settings.namedGlossaryLists ?? [],
    activeListId,
    mode: ss.translationMode ?? 'progressive',
    plusAvailable: isPlusSourceAvailable(),
    cueCount: getActiveTrackCueCount(),
    plusHintDismissed: ss.plusHintDismissed === true,
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
  const style = resolveSubtitleStyle(next.stylePreset, next.styleOverrides, next.backgroundOpacity);
  updateConfig({
    fontSize: next.fontSize,
    position: next.position,
    backgroundOpacity: style.backgroundOpacity,
    displayMode: next.displayMode,
    textColor: style.textColor,
    originalTextColor: style.originalTextColor,
    backgroundColor: style.backgroundColor,
    borderRadius: style.borderRadius,
    textShadow: style.textShadow,
  });
}

export async function setStylePreset(presetId: SubtitleStylePresetId): Promise<void> {
  if (isContextInvalidated()) return;
  const settings = await loadSettings();
  const next = { ...settings.subtitleSettings, stylePreset: presetId, styleOverrides: {} };
  await updateSettings({ subtitleSettings: next });
  const style = resolveSubtitleStyle(presetId, {}, next.backgroundOpacity);
  updateConfig({
    backgroundOpacity: style.backgroundOpacity,
    textColor: style.textColor,
    originalTextColor: style.originalTextColor,
    backgroundColor: style.backgroundColor,
    borderRadius: style.borderRadius,
    textShadow: style.textShadow,
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

/** Persist the one-time Plus hint dismissal. updateSettings deep-merges, so
 *  other subtitle settings are preserved. */
export async function setPlusHintDismissed(): Promise<void> {
  if (isContextInvalidated()) return;
  const settings = await loadSettings();
  await updateSettings({
    subtitleSettings: { ...settings.subtitleSettings, plusHintDismissed: true },
  });
}
