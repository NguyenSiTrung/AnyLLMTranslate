/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { computeBubblePosition } from '@/content/selectionBubble/position';

describe('computeBubblePosition', () => {
  const viewport = { width: 1000, height: 800 };
  const size = { width: 320, height: 160 };

  it('places above when there is room (adding scroll offsets), below when near the top edge, and clamps horizontally near the right edge', () => {
    const r = computeBubblePosition({
      anchor: { left: 400, top: 300, width: 100, height: 20 },
      size,
      viewport,
      scrollX: 0,
      scrollY: 0,
      gap: 8,
      margin: 8,
    });
    expect(r.placement).toBe('above');
    expect(r.top).toBeLessThan(300);
    expect(r.left).toBeGreaterThanOrEqual(8);
    expect(r.left + size.width).toBeLessThanOrEqual(viewport.width - 8);

    // Scroll offsets are added to document coordinates
    const scrolled = computeBubblePosition({
      anchor: { left: 100, top: 200, width: 50, height: 20 },
      size,
      viewport,
      scrollX: 50,
      scrollY: 100,
    });
    expect(scrolled.left).toBeGreaterThanOrEqual(50);
    expect(scrolled.top).toBeGreaterThanOrEqual(0);

    // Near the top edge → below
    const below = computeBubblePosition({
      anchor: { left: 400, top: 20, width: 100, height: 20 },
      size,
      viewport,
      scrollX: 0,
      scrollY: 0,
    });
    expect(below.placement).toBe('below');
    expect(below.top).toBeGreaterThan(20);

    // Near the right edge → horizontal clamp
    const clamped = computeBubblePosition({
      anchor: { left: 950, top: 400, width: 40, height: 20 },
      size,
      viewport,
      scrollX: 0,
      scrollY: 0,
      margin: 8,
    });
    expect(clamped.left + size.width).toBeLessThanOrEqual(viewport.width - 8);
  });

});
