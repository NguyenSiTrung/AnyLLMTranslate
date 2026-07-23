/**
 * Pure placement math for the selection dialog bubble.
 */

import type { AnchorRect, PositionResult, Size, Viewport } from './types';

export function computeBubblePosition(args: {
  anchor: AnchorRect;
  size: Size;
  viewport: Viewport;
  scrollX: number;
  scrollY: number;
  gap?: number;
  margin?: number;
}): PositionResult {
  const gap = args.gap ?? 8;
  const margin = args.margin ?? 8;
  const { anchor, size, viewport, scrollX, scrollY } = args;

  const spaceAbove = anchor.top - margin;
  const spaceBelow = viewport.height - (anchor.top + anchor.height) - margin;
  const need = size.height + gap;

  let placement: 'above' | 'below';
  if (spaceAbove >= need) {
    placement = 'above';
  } else if (spaceBelow >= need) {
    placement = 'below';
  } else {
    placement = spaceAbove >= spaceBelow ? 'above' : 'below';
  }

  let topViewport: number;
  if (placement === 'above') {
    topViewport = anchor.top - gap - size.height;
  } else {
    topViewport = anchor.top + anchor.height + gap;
  }
  topViewport = Math.max(
    margin,
    Math.min(topViewport, viewport.height - size.height - margin),
  );

  const anchorMidX = anchor.left + anchor.width / 2;
  let leftViewport = anchorMidX - size.width / 2;
  leftViewport = Math.max(
    margin,
    Math.min(leftViewport, viewport.width - size.width - margin),
  );

  return {
    left: leftViewport + scrollX,
    top: topViewport + scrollY,
    placement,
  };
}
