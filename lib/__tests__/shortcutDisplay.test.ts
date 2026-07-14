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

describe('parseShortcutKeys / gestures', () => {
  it('parses chords, blanks, and single-token gestures/media keys', () => {
    expect(parseShortcutKeys('Alt+A')).toEqual(['Alt', 'A']);
    expect(parseShortcutKeys('Ctrl+Shift+Y')).toEqual(['Ctrl', 'Shift', 'Y']);
    expect(parseShortcutKeys('')).toEqual([]);
    expect(parseShortcutKeys('   ')).toEqual([]);
    expect(parseShortcutKeys('Space × 3')).toEqual(['Space × 3']);
    expect(parseShortcutKeys('MediaNextTrack')).toEqual(['MediaNextTrack']);
    expect(formatGestureLabel(3)).toBe('Space × 3');
    const row = buildGestureRow(3, 800);
    expect(row).toMatchObject({ scope: 'gesture', shortcut: 'Space × 3', keyLabel: 'Space × 3' });
    expect(row.description).toMatch(/800/);
  });
});

describe('buildGlobalRows / PAGE_SHORTCUT_ROWS', () => {
  it('maps API shortcuts, fills defaults, and never uses Alt+T/O', () => {
    const rows = buildGlobalRows([
      { name: 'translate-page', shortcut: 'Alt+B', description: 'ignored if meta exists' },
      { name: 'translate-input-box', shortcut: '' },
    ]);
    expect(rows.find((r) => r.id === 'translate-page')).toMatchObject({
      shortcut: 'Alt+B',
      label: 'Translate page',
    });
    expect(rows.find((r) => r.id === 'translate-input-box')?.shortcut).toBe('');

    const defaults = buildGlobalRows([]);
    expect(defaults.map((r) => r.id)).toEqual([...GLOBAL_COMMAND_ORDER]);
    expect(defaults.find((r) => r.id === 'translate-page')?.shortcut).toBe(
      DEFAULT_GLOBAL_SHORTCUTS['translate-page'],
    );
    for (const r of defaults) {
      expect(r.shortcut).not.toMatch(/Alt\+T/i);
      expect(r.shortcut).not.toMatch(/Alt\+O/i);
    }

    const labels = PAGE_SHORTCUT_ROWS.map((r) => r.shortcut);
    expect(labels).toEqual(expect.arrayContaining(['Alt+H', 'Alt+D', 'Alt+Q', 'Escape']));
    expect(PAGE_SHORTCUT_ROWS.every((r) => r.scope === 'page')).toBe(true);
  });
});

describe('count / filter / cheatsheet', () => {
  const sample = [...buildGlobalRows([]), ...PAGE_SHORTCUT_ROWS, buildGestureRow(3, 800)];

  it('counts bound globals and filters by scope/query', () => {
    const rows = buildGlobalRows([
      { name: 'translate-page', shortcut: 'Alt+A' },
      { name: 'translate-input-box', shortcut: '' },
    ]);
    const { bound, total } = countGlobalBound(rows);
    expect(total).toBe(5);
    expect(bound).toBeGreaterThanOrEqual(1);
    expect(bound).toBeLessThan(total);

    expect(filterShortcutRows(sample, '', 'page').every((r) => r.scope === 'page')).toBe(true);
    expect(filterShortcutRows(sample, 'hover', 'all').some((r) => r.label.toLowerCase().includes('hover'))).toBe(
      true,
    );
    expect(
      filterShortcutRows(sample, 'alt+h', 'all').some(
        (r) => r.id.includes('hover') || r.shortcut.toLowerCase() === 'alt+h',
      ),
    ).toBe(true);
  });

  it('groups scopes and formats a cheatsheet', () => {
    const rows = filterShortcutRows(sample, '', 'all');
    const text = formatCheatsheet(rows);
    expect(text).toContain('AnyLLMTranslate shortcuts');
    expect(text).toContain('Global');
    expect(text).toContain('Translate page:');
    expect(text).toContain('Page');
    expect(text).toContain('Gestures');
    expect(text).toMatch(/not set/i);

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
