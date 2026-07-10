import { describe, it, expect } from 'vitest';
import {
  parseShortcutKeys,
  formatGestureLabel,
  buildGestureRow,
  buildGlobalRows,
  countGlobalBound,
  filterShortcutRows,
  formatCheatsheet,
  groupRowsByScope,
  PAGE_SHORTCUT_ROWS,
  DEFAULT_GLOBAL_SHORTCUTS,
  GLOBAL_COMMAND_ORDER,
} from '@/lib/shortcutDisplay';

describe('parseShortcutKeys', () => {
  it('splits modifier chords', () => {
    expect(parseShortcutKeys('Alt+A')).toEqual(['Alt', 'A']);
    expect(parseShortcutKeys('Ctrl+Shift+Y')).toEqual(['Ctrl', 'Shift', 'Y']);
  });

  it('returns empty for blank', () => {
    expect(parseShortcutKeys('')).toEqual([]);
    expect(parseShortcutKeys('   ')).toEqual([]);
  });

  it('keeps gesture compounds as a single token', () => {
    expect(parseShortcutKeys('Space × 3')).toEqual(['Space × 3']);
  });

  it('keeps media keys as a single token', () => {
    expect(parseShortcutKeys('MediaNextTrack')).toEqual(['MediaNextTrack']);
  });
});

describe('formatGestureLabel / buildGestureRow', () => {
  it('formats Space × N', () => {
    expect(formatGestureLabel(3)).toBe('Space × 3');
  });

  it('builds gesture row with window meta in description', () => {
    const row = buildGestureRow(3, 800);
    expect(row.scope).toBe('gesture');
    expect(row.shortcut).toBe('Space × 3');
    expect(row.keyLabel).toBe('Space × 3');
    expect(row.description).toMatch(/800/);
  });
});

describe('buildGlobalRows', () => {
  it('maps known commands and uses API shortcut when present', () => {
    const rows = buildGlobalRows([
      { name: 'translate-page', shortcut: 'Alt+B', description: 'ignored if meta exists' },
      { name: 'translate-input-box', shortcut: '' },
    ]);
    const page = rows.find((r) => r.id === 'translate-page');
    const inline = rows.find((r) => r.id === 'translate-input-box');
    expect(page?.shortcut).toBe('Alt+B');
    expect(page?.label).toBe('Translate page');
    expect(inline?.shortcut).toBe('');
    expect(inline?.label).toBe('Inline translate');
  });

  it('fills missing known commands with defaults when API omits them', () => {
    const rows = buildGlobalRows([]);
    expect(rows.map((r) => r.id)).toEqual([...GLOBAL_COMMAND_ORDER]);
    expect(rows.find((r) => r.id === 'translate-page')?.shortcut).toBe(
      DEFAULT_GLOBAL_SHORTCUTS['translate-page'],
    );
    expect(rows.find((r) => r.id === 'translate-input-box')?.shortcut).toBe('');
  });

  it('never uses Alt+T or Alt+O as defaults', () => {
    const rows = buildGlobalRows([]);
    for (const r of rows) {
      expect(r.shortcut).not.toMatch(/Alt\+T/i);
      expect(r.shortcut).not.toMatch(/Alt\+O/i);
    }
  });
});

describe('PAGE_SHORTCUT_ROWS', () => {
  it('includes hover, selection, section picker, escape', () => {
    const labels = PAGE_SHORTCUT_ROWS.map((r) => r.shortcut);
    expect(labels).toEqual(expect.arrayContaining(['Alt+H', 'Alt+D', 'Alt+Q', 'Escape']));
    expect(PAGE_SHORTCUT_ROWS.every((r) => r.scope === 'page')).toBe(true);
  });
});

describe('countGlobalBound', () => {
  it('counts non-empty shortcuts', () => {
    const rows = buildGlobalRows([
      { name: 'translate-page', shortcut: 'Alt+A' },
      { name: 'translate-input-box', shortcut: '' },
    ]);
    const { bound, total } = countGlobalBound(rows);
    expect(total).toBe(5);
    expect(bound).toBeGreaterThanOrEqual(1);
    expect(bound).toBeLessThan(total);
  });
});

describe('filterShortcutRows', () => {
  const sample = [
    ...buildGlobalRows([]),
    ...PAGE_SHORTCUT_ROWS,
    buildGestureRow(3, 800),
  ];

  it('filters by scope', () => {
    expect(filterShortcutRows(sample, '', 'page').every((r) => r.scope === 'page')).toBe(true);
  });

  it('filters by query on label and key', () => {
    const hover = filterShortcutRows(sample, 'hover', 'all');
    expect(hover.some((r) => r.label.toLowerCase().includes('hover'))).toBe(true);
    const byKey = filterShortcutRows(sample, 'alt+h', 'all');
    expect(byKey.some((r) => r.id.includes('hover') || r.shortcut.toLowerCase() === 'alt+h')).toBe(
      true,
    );
  });
});

describe('formatCheatsheet + groupRowsByScope', () => {
  it('formats grouped plain text', () => {
    const rows = filterShortcutRows(
      [...buildGlobalRows([]), ...PAGE_SHORTCUT_ROWS, buildGestureRow(3, 800)],
      '',
      'all',
    );
    const text = formatCheatsheet(rows);
    expect(text).toContain('AnyLLMTranslate shortcuts');
    expect(text).toContain('Global');
    expect(text).toContain('Translate page:');
    expect(text).toContain('Page');
    expect(text).toContain('Gestures');
    expect(text).toMatch(/not set/i);
  });

  it('groups by scope', () => {
    const g = groupRowsByScope([
      ...buildGlobalRows([]).slice(0, 1),
      PAGE_SHORTCUT_ROWS[0]!,
      buildGestureRow(2, 500),
    ]);
    expect(g.global).toHaveLength(1);
    expect(g.page).toHaveLength(1);
    expect(g.gesture).toHaveLength(1);
  });
});
