/**
 * Mini studio view — panel DOM composition, status pill, and live preview.
 * Pure presentation: no settings reads/writes happen here.
 */

import type { ChromeStatus } from './types';
import { PLAYER_CHROME_PANEL_CLASS } from './types';
import { MINI_STUDIO_CSS } from './miniStudioCss';
import {
  buildToggle,
  buildSegmented,
  buildSlider,
  buildSelect,
  type ToggleWidget,
  type SegmentedWidget,
  type SliderWidget,
  type SelectWidget,
} from './widgets';
import { SUBTITLE_STYLE_PRESETS, type ResolvedSubtitleStyle } from '@/lib/subtitleStylePresets';
import type { SubtitleStylePresetId } from '@/types/config';

/** Preview cue renders at a reduced scale of the real overlay font size. */
export const PREVIEW_FONT_SCALE = 0.6;

const KNOB_OPTIONS: { knob: string; opts: string[] }[] = [
  { knob: 'faithfulness', opts: ['auto', 'literal', 'balanced', 'idiomatic'] },
  { knob: 'brevity', opts: ['auto', 'relaxed', 'moderate', 'terse'] },
  { knob: 'register', opts: ['auto', 'formal', 'neutral', 'casual'] },
  { knob: 'profanity', opts: ['auto', 'preserve', 'soften', 'remove'] },
];

const STATUS_LABEL: Record<ChromeStatus, string> = {
  idle: 'Ready',
  waiting: 'Waiting for captions',
  translating: 'Translating',
  error: 'Translation error',
  disabled: 'Off',
};

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function fillSelect(select: HTMLSelectElement, values: string[], current: string): void {
  select.innerHTML = '';
  for (const value of values) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = capitalize(value);
    select.appendChild(opt);
  }
  select.value = values.includes(current) ? current : values[0] ?? '';
}

/** Fill the style select with the five presets (+ Custom when overridden). */
export function fillStyleSelect(
  select: HTMLSelectElement,
  current: SubtitleStylePresetId,
  hasCustom: boolean,
): void {
  select.innerHTML = '';
  for (const id of Object.keys(SUBTITLE_STYLE_PRESETS) as SubtitleStylePresetId[]) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = SUBTITLE_STYLE_PRESETS[id].label;
    select.appendChild(opt);
  }
  if (hasCustom) {
    const opt = document.createElement('option');
    opt.value = 'custom';
    opt.textContent = 'Custom';
    select.appendChild(opt);
  }
  select.value = hasCustom ? 'custom' : current;
}

export interface PreviewElements {
  root: HTMLElement;
  cue: HTMLElement;
  original: HTMLElement;
  translated: HTMLElement;
}

export interface MiniStudioView {
  style: HTMLStyleElement;
  panel: HTMLElement;
  enable: ToggleWidget;
  displayMode: SegmentedWidget;
  styleSelect: SelectWidget;
  fontSize: SliderWidget;
  fontValue: HTMLElement;
  position: SegmentedWidget;
  opacity: SliderWidget;
  opacityValue: HTMLElement;
  knobSelects: HTMLSelectElement[];
  glossary: HTMLSelectElement;
  statusPill: HTMLElement;
  statusLabel: HTMLElement;
  preview: PreviewElements;
  closeBtn: HTMLButtonElement;
  optionsBtn: HTMLButtonElement;
}

const CLOSE_SVG = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;

export function buildMiniStudioView(): MiniStudioView {
  const style = document.createElement('style');
  style.setAttribute('data-anyllm-mini-studio', '1');
  style.textContent = MINI_STUDIO_CSS;

  const panel = document.createElement('div');
  panel.className = PLAYER_CHROME_PANEL_CLASS;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Subtitle mini studio');
  panel.hidden = true;
  panel.innerHTML = `
    <div class="panel-header">
      <h2>Subtitles</h2>
      <span class="status-pill" data-role="status" data-status="idle" aria-live="polite">
        <span class="status-dot"></span>
        <span class="status-label" data-role="statusLabel">Ready</span>
      </span>
      <button type="button" class="close-btn" data-action="close" aria-label="Close">${CLOSE_SVG}</button>
    </div>
    <div class="preview" data-role="preview" data-position="bottom" data-display="bilingual">
      <div class="preview-cue" data-role="previewCue">
        <div class="preview-original">Hello, world.</div>
        <div class="preview-translated">Bonjour le monde.</div>
      </div>
    </div>
    <div class="row-inline enable-row">
      <label for="anyllm-ms-enable">Enable subtitles</label>
    </div>
    <div class="section">
      <h3 class="section-title">Appearance</h3>
      <div class="row"><span class="row-label">Display</span></div>
      <div class="row"><span class="row-label">Style</span></div>
      <div class="row">
        <label for="anyllm-ms-font">Font size <span data-role="fontValue">18</span>px</label>
      </div>
      <div class="row"><span class="row-label">Position</span></div>
      <div class="row">
        <label for="anyllm-ms-opacity">Background <span data-role="opacityValue">70</span>%</label>
      </div>
    </div>
    <div class="section">
      <h3 class="section-title">Translation style</h3>
      <div class="knobs" data-role="knobs"></div>
    </div>
    <div class="section">
      <h3 class="section-title">Glossary</h3>
      <div class="row">
        <label for="anyllm-ms-list">Glossary list</label>
      </div>
    </div>
    <button type="button" class="footer-btn" data-action="open-options">Open Subtitle Studio ↗</button>
  `;

  // Widgets appended into their labeled rows (order in panel.innerHTML above).
  const enable = buildToggle({ id: 'anyllm-ms-enable', action: 'enable' });
  panel.querySelector('.enable-row')?.appendChild(enable.root);

  const displayMode = buildSegmented({
    name: 'anyllm-ms-display',
    action: 'displayMode',
    options: [
      { value: 'bilingual', label: 'Bilingual' },
      { value: 'translation-only', label: 'Translation only' },
    ],
  });
  const rows = panel.querySelectorAll('.section .row');
  // rows: 0=Display, 1=Style, 2=Font size, 3=Position, 4=Background, 5=Glossary list
  rows[0]?.appendChild(displayMode.root);

  const styleSelect = buildSelect({ id: 'anyllm-ms-style', action: 'stylePreset' });
  rows[1]?.appendChild(styleSelect.root);

  const fontSize = buildSlider({
    id: 'anyllm-ms-font',
    action: 'fontSize',
    min: 12,
    max: 36,
    step: 1,
  });
  rows[2]?.appendChild(fontSize.root);

  const position = buildSegmented({
    name: 'anyllm-ms-position',
    action: 'position',
    options: [
      { value: 'bottom', label: 'Bottom' },
      { value: 'top', label: 'Top' },
    ],
  });
  rows[3]?.appendChild(position.root);

  const opacity = buildSlider({
    id: 'anyllm-ms-opacity',
    action: 'opacity',
    min: 0,
    max: 100,
    step: 5,
  });
  rows[4]?.appendChild(opacity.root);

  const glossary = buildSelect({ id: 'anyllm-ms-list', action: 'glossary' });
  rows[5]?.appendChild(glossary.root);

  const knobSelects: HTMLSelectElement[] = [];
  const knobsRoot = panel.querySelector('[data-role="knobs"]') as HTMLElement;
  for (const { knob, opts } of KNOB_OPTIONS) {
    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('label');
    label.textContent = capitalize(knob);
    label.htmlFor = `anyllm-ms-knob-${knob}`;
    const widget = buildSelect({ id: `anyllm-ms-knob-${knob}`, action: 'knob', knob });
    fillSelect(widget.select, opts, 'auto');
    row.append(label, widget.root);
    knobsRoot.appendChild(row);
    knobSelects.push(widget.select);
  }

  return {
    style,
    panel,
    enable,
    displayMode,
    styleSelect,
    fontSize,
    fontValue: panel.querySelector('[data-role="fontValue"]') as HTMLElement,
    position,
    opacity,
    opacityValue: panel.querySelector('[data-role="opacityValue"]') as HTMLElement,
    knobSelects,
    glossary: glossary.select,
    statusPill: panel.querySelector('[data-role="status"]') as HTMLElement,
    statusLabel: panel.querySelector('[data-role="statusLabel"]') as HTMLElement,
    preview: {
      root: panel.querySelector('[data-role="preview"]') as HTMLElement,
      cue: panel.querySelector('[data-role="previewCue"]') as HTMLElement,
      original: panel.querySelector('.preview-original') as HTMLElement,
      translated: panel.querySelector('.preview-translated') as HTMLElement,
    },
    closeBtn: panel.querySelector('[data-action="close"]') as HTMLButtonElement,
    optionsBtn: panel.querySelector('[data-action="open-options"]') as HTMLButtonElement,
  };
}

export function setStatusPill(pill: HTMLElement, label: HTMLElement, status: ChromeStatus): void {
  pill.dataset.status = status;
  label.textContent = STATUS_LABEL[status] ?? status;
}

export function updatePreview(
  preview: PreviewElements,
  args: {
    fontSize: number;
    backgroundOpacity: number;
    position: 'top' | 'bottom';
    displayMode: string;
    style: ResolvedSubtitleStyle;
  },
): void {
  preview.cue.style.fontSize = `${Math.round(args.fontSize * PREVIEW_FONT_SCALE)}px`;
  const bgOpacity = args.style.backgroundOpacity === 0 ? 0 : args.backgroundOpacity;
  preview.cue.style.setProperty('--preview-bg', String(bgOpacity));
  preview.cue.style.setProperty('--preview-bg-color', args.style.backgroundColor);
  preview.cue.style.borderRadius = `${args.style.borderRadius}px`;
  preview.cue.style.textShadow = args.style.textShadow;
  preview.original.style.color = args.style.originalTextColor;
  preview.translated.style.color = args.style.textColor;
  preview.root.dataset.position = args.position;
  preview.root.dataset.display = args.displayMode;
}
