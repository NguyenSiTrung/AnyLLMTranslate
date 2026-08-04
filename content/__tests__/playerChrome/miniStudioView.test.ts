/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import {
  buildMiniStudioView,
  setStatusPill,
  updatePreview,
  fillSelect,
  PREVIEW_FONT_SCALE,
} from '@/content/playerChrome/miniStudioView';
import { PLAYER_CHROME_PANEL_CLASS } from '@/content/playerChrome/types';

describe('buildMiniStudioView', () => {
  it('builds the panel skeleton with header, preview, sections, and footer; labels knobs and options with capitalized text; renders section titles', () => {
    const v = buildMiniStudioView();
    expect(v.panel.className).toBe(PLAYER_CHROME_PANEL_CLASS);
    expect(v.panel.hidden).toBe(true);
    expect(v.panel.getAttribute('role')).toBe('dialog');
    expect(v.panel.querySelector('.panel-header h2')?.textContent).toBe('Subtitles');
    expect(v.closeBtn.dataset.action).toBe('close');
    expect(v.closeBtn.getAttribute('aria-label')).toBe('Close');
    expect(v.optionsBtn.dataset.action).toBe('open-options');
    expect(v.enable.input.dataset.action).toBe('enable');
    expect(v.fontSize.input.dataset.action).toBe('fontSize');
    expect(v.opacity.input.dataset.action).toBe('opacity');
    expect(v.displayMode.inputs[0].dataset.action).toBe('displayMode');
    expect(v.position.inputs[0].dataset.action).toBe('position');
    expect(v.knobSelects).toHaveLength(4);
    expect(v.knobSelects.map((s) => s.dataset.knob)).toEqual([
      'faithfulness',
      'brevity',
      'register',
      'profanity',
    ]);
    expect(v.glossary.dataset.action).toBe('glossary');
    expect(v.style.textContent).toContain('backdrop-filter');

    const labels = v.knobSelects.map(
      (s) => v.panel.querySelector(`label[for="${s.id}"]`)?.textContent,
    );
    expect(labels).toEqual(['Faithfulness', 'Brevity', 'Register', 'Profanity']);
    expect(v.knobSelects[0].options[0].textContent).toBe('Auto');
    expect(v.knobSelects[0].options[1].textContent).toBe('Literal');

    const titles = [...v.panel.querySelectorAll('.section-title')].map((el) => el.textContent);
    expect(titles).toEqual(['Appearance', 'Translation style', 'Glossary']);
  });
});

describe('setStatusPill', () => {
  it('maps status to data-status and label text', () => {
    const v = buildMiniStudioView();
    setStatusPill(v.statusPill, v.statusLabel, 'translating');
    expect(v.statusPill.dataset.status).toBe('translating');
    expect(v.statusLabel.textContent).toBe('Translating');
    setStatusPill(v.statusPill, v.statusLabel, 'disabled');
    expect(v.statusPill.dataset.status).toBe('disabled');
    expect(v.statusLabel.textContent).toBe('Off');
    setStatusPill(v.statusPill, v.statusLabel, 'waiting');
    expect(v.statusLabel.textContent).toBe('Waiting for captions');
  });
});

describe('updatePreview', () => {
  it('reflects font size, opacity, position, and display mode', () => {
    const v = buildMiniStudioView();
    updatePreview(v.preview, {
      fontSize: 20,
      backgroundOpacity: 0.5,
      position: 'top',
      displayMode: 'translation-only',
    });
    expect(v.preview.cue.style.fontSize).toBe(`${Math.round(20 * PREVIEW_FONT_SCALE)}px`);
    expect(v.preview.cue.style.getPropertyValue('--preview-bg')).toBe('0.5');
    expect(v.preview.root.dataset.position).toBe('top');
    expect(v.preview.root.dataset.display).toBe('translation-only');
  });
});

describe('fillSelect', () => {
  it('fills capitalized options, selects current, falls back to first', () => {
    const v = buildMiniStudioView();
    fillSelect(v.glossary, ['auto', 'literal'], 'literal');
    expect(v.glossary.options).toHaveLength(2);
    expect(v.glossary.options[0].textContent).toBe('Auto');
    expect(v.glossary.value).toBe('literal');
    fillSelect(v.glossary, ['auto', 'literal'], 'missing');
    expect(v.glossary.value).toBe('auto');
  });
});
