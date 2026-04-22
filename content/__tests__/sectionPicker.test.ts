import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enterPickerMode, exitPickerMode, isPickerActive } from '@/content/sectionPicker';

beforeEach(() => {
  exitPickerMode();
  document.body.innerHTML = '';
});

afterEach(() => {
  exitPickerMode();
});

describe('sectionPicker', () => {
  it('enterPickerMode activates picker', () => {
    enterPickerMode(vi.fn());
    expect(isPickerActive()).toBe(true);
  });

  it('exitPickerMode deactivates picker', () => {
    enterPickerMode(vi.fn());
    exitPickerMode();
    expect(isPickerActive()).toBe(false);
  });

  it('does not activate twice', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    enterPickerMode(cb1);
    enterPickerMode(cb2);
    expect(isPickerActive()).toBe(true);
  });

  it('mouseover highlights block-level elements', () => {
    const div = document.createElement('div');
    div.style.display = 'block';
    Object.defineProperty(div, 'getBoundingClientRect', {
      value: () => ({ width: 200, height: 100, top: 0, left: 0, right: 200, bottom: 100 }),
    });
    document.body.appendChild(div);

    enterPickerMode(vi.fn());
    const evt = new MouseEvent('mouseover', { bubbles: true });
    Object.defineProperty(evt, 'target', { value: div });
    document.dispatchEvent(evt);

    expect(div.classList.contains('anyllm-section-highlight')).toBe(true);
  });

  it('Escape exits picker mode', () => {
    enterPickerMode(vi.fn());
    const evt = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(evt);
    expect(isPickerActive()).toBe(false);
  });

  it('click on highlighted element calls callback and exits', () => {
    const cb = vi.fn();
    const div = document.createElement('div');
    div.style.display = 'block';
    Object.defineProperty(div, 'getBoundingClientRect', {
      value: () => ({ width: 200, height: 100, top: 0, left: 0, right: 200, bottom: 100 }),
    });
    document.body.appendChild(div);

    enterPickerMode(cb);

    // First mouseover to highlight
    const moveEvt = new MouseEvent('mouseover', { bubbles: true });
    Object.defineProperty(moveEvt, 'target', { value: div });
    document.dispatchEvent(moveEvt);

    // Then click — dispatch from the element (not document) so it bubbles through capture
    const clickEvt = new MouseEvent('click', { bubbles: true, cancelable: true });
    div.dispatchEvent(clickEvt);

    expect(cb).toHaveBeenCalledWith(div);
    expect(isPickerActive()).toBe(false);
  });

  it('skips small elements', () => {
    const small = document.createElement('div');
    small.style.display = 'block';
    Object.defineProperty(small, 'getBoundingClientRect', {
      value: () => ({ width: 30, height: 30, top: 0, left: 0, right: 30, bottom: 30 }),
    });
    document.body.appendChild(small);

    enterPickerMode(vi.fn());
    const evt = new MouseEvent('mouseover', { bubbles: true });
    Object.defineProperty(evt, 'target', { value: small });
    document.dispatchEvent(evt);

    expect(small.classList.contains('anyllm-section-highlight')).toBe(false);
  });
});
