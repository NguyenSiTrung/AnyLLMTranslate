/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import {
  buildToggle,
  buildSegmented,
  buildSlider,
  buildSelect,
} from '@/content/playerChrome/widgets';

describe('buildToggle', () => {
  it('creates a checkbox with data-action inside a toggle root', () => {
    const w = buildToggle({ id: 't1', action: 'enable' });
    expect(w.root.className).toBe('toggle');
    expect(w.input.type).toBe('checkbox');
    expect(w.input.id).toBe('t1');
    expect(w.input.dataset.action).toBe('enable');
    expect(w.root.contains(w.input)).toBe(true);
    expect(w.root.querySelector('.track')).toBeTruthy();
    expect(w.root.querySelector('.thumb')).toBeTruthy();
  });
});

describe('buildSegmented', () => {
  const opts = [
    { value: 'bilingual', label: 'Bilingual' },
    { value: 'translation-only', label: 'Translation only' },
  ];

  it('creates radio options and preserves matching and fallback selection', () => {
    const w = buildSegmented({ name: 'display', action: 'displayMode', options: opts });
    expect(w.root.getAttribute('role')).toBe('radiogroup');
    expect(w.inputs).toHaveLength(2);
    expect(w.inputs[0].type).toBe('radio');
    expect(w.inputs[0].name).toBe('display');
    expect(w.inputs[0].dataset.action).toBe('displayMode');
    expect(w.root.textContent).toContain('Bilingual');
    expect(w.root.textContent).toContain('Translation only');
    w.setValue('translation-only');
    expect(w.inputs[1].checked).toBe(true);
    expect(w.value()).toBe('translation-only');
    w.setValue('nope');
    expect(w.inputs[0].checked).toBe(true);
    expect(w.value()).toBe('bilingual');
  });
});

describe('buildSlider', () => {
  it('creates a range input and keeps programmatic and event fill updates in sync', () => {
    const w = buildSlider({ id: 's1', action: 'fontSize', min: 12, max: 36, step: 1 });
    expect(w.input.type).toBe('range');
    expect(w.input.min).toBe('12');
    expect(w.input.max).toBe('36');
    expect(w.input.step).toBe('1');
    expect(w.input.dataset.action).toBe('fontSize');
    expect(w.input.className).toBe('glass-range');
    w.setValue(24);
    expect(w.input.value).toBe('24');
    expect(w.input.style.getPropertyValue('--fill')).toBe('50%');
    const opacity = buildSlider({ id: 's2', action: 'opacity', min: 0, max: 100, step: 5 });
    opacity.input.value = '25';
    opacity.input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(opacity.input.style.getPropertyValue('--fill')).toBe('25%');
  });
});

describe('buildSelect', () => {
  it('wraps a select and preserves optional knob metadata', () => {
    const w = buildSelect({ id: 'g1', action: 'glossary' });
    expect(w.root.className).toBe('select-wrap');
    expect(w.select.id).toBe('g1');
    expect(w.select.dataset.action).toBe('glossary');
    expect(w.root.contains(w.select)).toBe(true);
    const knob = buildSelect({ id: 'k1', action: 'knob', knob: 'brevity' });
    expect(knob.select.dataset.knob).toBe('brevity');
  });
});
