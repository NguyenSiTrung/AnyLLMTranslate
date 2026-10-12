import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getLoadingOverlay,
  hideLoadingOverlay,
  showLoadingOverlay,
} from '@/content/inlineTranslate/overlay';

function fieldAt(rect: { left: number; top: number; width: number; height: number }) {
  const ta = document.createElement('textarea');
  document.body.appendChild(ta);
  let current = rect;
  ta.getBoundingClientRect = () =>
    ({
      ...current,
      right: current.left + current.width,
      bottom: current.top + current.height,
      x: current.left,
      y: current.top,
      toJSON: () => ({}),
    }) as DOMRect;
  return { ta, move: (next: typeof rect) => (current = next) };
}

afterEach(() => {
  hideLoadingOverlay();
  document.body.innerHTML = '';
});

describe('loading overlay', () => {
  it('mounts a shadow-root host with rolling dots, owned and above the page', () => {
    const { ta } = fieldAt({ left: 100, top: 200, width: 300, height: 40 });
    showLoadingOverlay(ta);
    const host = getLoadingOverlay()!;
    expect(host).toBeTruthy();
    expect(host.isConnected).toBe(true);
    expect(host.hasAttribute('data-anyllm-owned')).toBe(true);
    expect(host.style.position).toBe('fixed');
    expect(host.style.zIndex).toBe('2147483647');
    expect(host.shadowRoot?.querySelectorAll('.dot')).toHaveLength(3);
    expect(host.getAttribute('aria-hidden')).toBe('true');
  });

  it('anchors inside the right edge of the field and follows it on scroll/resize', () => {
    const { ta, move } = fieldAt({ left: 100, top: 200, width: 300, height: 40 });
    showLoadingOverlay(ta);
    const host = getLoadingOverlay()!;
    const left0 = parseFloat(host.style.left);
    const top0 = parseFloat(host.style.top);
    expect(left0).toBeGreaterThan(100);
    expect(left0).toBeLessThan(400);
    expect(top0).toBeGreaterThanOrEqual(200);
    expect(top0).toBeLessThan(240);

    move({ left: 100, top: 50, width: 300, height: 40 });
    window.dispatchEvent(new Event('scroll'));
    expect(parseFloat(host.style.top)).toBe(top0 - 150);

    move({ left: 300, top: 50, width: 300, height: 40 });
    window.dispatchEvent(new Event('resize'));
    expect(parseFloat(host.style.left)).toBe(left0 + 200);
  });

  it('a second show replaces the first; hide removes the host and its listeners', () => {
    const a = fieldAt({ left: 0, top: 0, width: 100, height: 20 });
    const b = fieldAt({ left: 0, top: 100, width: 100, height: 20 });
    showLoadingOverlay(a.ta);
    const first = getLoadingOverlay()!;
    showLoadingOverlay(b.ta);
    expect(first.isConnected).toBe(false);
    expect(document.querySelectorAll('[data-anyllm-role="inline-overlay"]')).toHaveLength(1);

    const spy = vi.spyOn(b.ta, 'getBoundingClientRect');
    hideLoadingOverlay();
    expect(getLoadingOverlay()).toBeNull();
    expect(document.querySelector('[data-anyllm-role="inline-overlay"]')).toBeNull();
    window.dispatchEvent(new Event('scroll'));
    expect(spy).not.toHaveBeenCalled();
  });

  it('hides itself when the field leaves the document', () => {
    const { ta } = fieldAt({ left: 0, top: 0, width: 100, height: 20 });
    showLoadingOverlay(ta);
    ta.remove();
    window.dispatchEvent(new Event('scroll'));
    expect(getLoadingOverlay()).toBeNull();
  });
});
