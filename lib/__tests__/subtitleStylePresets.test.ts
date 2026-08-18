import { describe, it, expect } from 'vitest';
import {
  SUBTITLE_STYLE_PRESETS,
  resolveSubtitleStyle,
  resolveSubtitleFontFamily,
  withAlpha,
} from '@/lib/subtitleStylePresets';
import { DEFAULT_SUBTITLE_SETTINGS } from '@/types/config';

describe('subtitleStylePresets — preset table', () => {
  it('defines exactly the five approved presets with distinct signatures', () => {
    const ids = Object.keys(SUBTITLE_STYLE_PRESETS).sort();
    expect(ids).toEqual(
      ['classic', 'netflix', 'white-on-black', 'yellow-on-black', 'black-on-white'].sort(),
    );
    expect(SUBTITLE_STYLE_PRESETS.classic).toMatchObject({
      textColor: '#ffffff',
      originalTextColor: 'rgba(255,255,255,0.6)',
      backgroundStyle: 'black-box',
      shadowStrength: 0.5,
      borderRadius: 8,
    });
    expect(SUBTITLE_STYLE_PRESETS.netflix.backgroundStyle).toBe('none');
    expect(SUBTITLE_STYLE_PRESETS['yellow-on-black'].textColor).toBe('#f5c518');
    expect(SUBTITLE_STYLE_PRESETS['black-on-white']).toMatchObject({
      textColor: '#000000',
      backgroundStyle: 'white-box',
      shadowStrength: 0,
    });
  });

  it('DEFAULT_SUBTITLE_SETTINGS defaults to classic with no overrides', () => {
    expect(DEFAULT_SUBTITLE_SETTINGS.stylePreset).toBe('classic');
    expect(DEFAULT_SUBTITLE_SETTINGS.styleOverrides).toEqual({});
  });
});

describe('withAlpha', () => {
  it('converts hex to rgba at the given alpha and passes non-hex through', () => {
    expect(withAlpha('#ffffff', 1)).toBe('rgba(255,255,255,1)');
    expect(withAlpha('#f5c518', 0.6)).toBe('rgba(245,197,24,0.6)');
    expect(withAlpha('#000', 0.3)).toBe('rgba(0,0,0,0.3)');
    expect(withAlpha('rgba(1,2,3,0.5)', 0.9)).toBe('rgba(1,2,3,0.5)');
  });
});

describe('resolveSubtitleStyle', () => {
  it('resolves each approved preset base look at the given opacity', () => {
    expect(resolveSubtitleStyle('classic', undefined, 0.7)).toEqual({
      textColor: 'rgba(255,255,255,1)',
      originalTextColor: 'rgba(255,255,255,0.6)',
      backgroundColor: '0,0,0',
      backgroundOpacity: 0.7,
      borderRadius: 8,
      textShadow: '0 1px 3px rgba(0,0,0,0.5)',
    });
    expect(resolveSubtitleStyle('netflix', undefined, 0.7)).toMatchObject({
      backgroundColor: '0,0,0',
      backgroundOpacity: 0,
      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
    });
    expect(resolveSubtitleStyle('black-on-white', undefined, 1)).toMatchObject({
      textColor: 'rgba(0,0,0,1)',
      originalTextColor: 'rgba(0,0,0,0.6)',
      backgroundColor: '255,255,255',
      backgroundOpacity: 1,
      textShadow: 'none',
    });
  });

  it('merges per-field overrides and switches the box via backgroundStyle override', () => {
    const result = resolveSubtitleStyle(
      'netflix',
      { textColor: '#f5c518', shadowStrength: 0.2 },
      0.7,
    );
    expect(result.textColor).toBe('rgba(245,197,24,1)');
    expect(result.originalTextColor).toBe('rgba(245,197,24,0.6)');
    expect(result.textShadow).toBe('0 1px 3px rgba(0,0,0,0.2)');
    expect(result.backgroundOpacity).toBe(0); // netflix backgroundStyle still none

    const boxed = resolveSubtitleStyle('netflix', { backgroundStyle: 'black-box' }, 0.5);
    expect(boxed.backgroundOpacity).toBe(0.5);
    expect(boxed.backgroundColor).toBe('0,0,0');
  });

  it('unknown preset id falls back to classic', () => {
    // @ts-expect-error unknown id
    expect(resolveSubtitleStyle('nope', undefined, 0.7).textColor).toBe('rgba(255,255,255,1)');
  });
});

describe('resolveSubtitleFontFamily', () => {
  it('maps the three settings values to CSS stacks with system fallback', () => {
    expect(resolveSubtitleFontFamily('serif')).toBe('Georgia, serif');
    expect(resolveSubtitleFontFamily('monospace')).toBe('monospace');
    expect(resolveSubtitleFontFamily('system')).toBe('system-ui, sans-serif');
    expect(resolveSubtitleFontFamily(undefined)).toBe('system-ui, sans-serif');
  });
});
