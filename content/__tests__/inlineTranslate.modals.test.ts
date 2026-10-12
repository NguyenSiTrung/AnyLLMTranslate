import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeInlineModal,
  confirmLongText,
  getInlineModal,
  needsLongTextConfirm,
  shouldShowFirstUseGuide,
  showFirstUseGuide,
} from '@/content/inlineTranslate/modals';

function q(sel: string): HTMLElement | null {
  return getInlineModal()?.shadowRoot?.querySelector<HTMLElement>(sel) ?? null;
}

afterEach(() => {
  closeInlineModal();
  document.body.innerHTML = '';
});

describe('long-text confirm', () => {
  it('prompts only above the threshold; 0 or confirmLongText=false turns it off', () => {
    const cfg = { confirmLongText: true, confirmLongTextLength: 200 };
    expect(needsLongTextConfirm(200, cfg)).toBe(false);
    expect(needsLongTextConfirm(201, cfg)).toBe(true);
    expect(needsLongTextConfirm(5000, { ...cfg, confirmLongTextLength: 0 })).toBe(false);
    expect(needsLongTextConfirm(5000, { ...cfg, confirmLongText: false })).toBe(false);
  });

  it('Translate resolves true, Cancel and Escape resolve false', async () => {
    const persist = vi.fn();
    const a = confirmLongText({ textLength: 350, persist });
    const host = getInlineModal()!;
    expect(host.hasAttribute('data-anyllm-owned')).toBe(true);
    expect(q('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
    expect(q('[role="dialog"]')?.textContent).toContain('350');
    q('[data-action="translate"]')!.click();
    await expect(a).resolves.toBe(true);
    expect(getInlineModal()).toBeNull();

    const b = confirmLongText({ textLength: 350, persist });
    q('[data-action="cancel"]')!.click();
    await expect(b).resolves.toBe(false);

    const c = confirmLongText({ textLength: 350, persist });
    q('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect(c).resolves.toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });

  it("Don't ask again translates and persists confirmLongText: false", async () => {
    const persist = vi.fn();
    const p = confirmLongText({ textLength: 350, persist });
    q('[data-action="dont-ask"]')!.click();
    await expect(p).resolves.toBe(true);
    expect(persist).toHaveBeenCalledWith({ confirmLongText: false });
  });

  it('a new modal settles the previous one as cancelled', async () => {
    const first = confirmLongText({ textLength: 300, persist: vi.fn() });
    const second = confirmLongText({ textLength: 400, persist: vi.fn() });
    await expect(first).resolves.toBe(false);
    expect(document.querySelectorAll('[data-anyllm-role="inline-modal"]')).toHaveLength(1);
    q('[data-action="translate"]')!.click();
    await expect(second).resolves.toBe(true);
  });
});

describe('first-use guide', () => {
  it('shows once per install', () => {
    expect(shouldShowFirstUseGuide({ inlineGuideShown: false })).toBe(true);
    expect(shouldShowFirstUseGuide({ inlineGuideShown: true })).toBe(false);
  });

  it('explains the gesture, shortcut and undo; Enable persists inlineGuideShown', async () => {
    const persist = vi.fn();
    const p = showFirstUseGuide({ gestureLabel: 'Space ×3', shortcutLabel: 'Alt+I', persist });
    const text = q('[role="dialog"]')?.textContent ?? '';
    expect(text).toContain('Space ×3');
    expect(text).toContain('Alt+I');
    expect(text).toContain('Undo');
    q('[data-action="enable"]')!.click();
    await expect(p).resolves.toBe('enable');
    expect(persist).toHaveBeenCalledWith({ inlineGuideShown: true });
  });

  it('Turn off persists enabled: false', async () => {
    const persist = vi.fn();
    const p = showFirstUseGuide({ gestureLabel: 'Space ×3', shortcutLabel: 'Alt+I', persist });
    q('[data-action="turn-off"]')!.click();
    await expect(p).resolves.toBe('off');
    expect(persist).toHaveBeenCalledWith({ inlineGuideShown: true, enabled: false });
  });

  it('Escape dismisses as Enable (guide still marked shown)', async () => {
    const persist = vi.fn();
    const p = showFirstUseGuide({ gestureLabel: 'Space ×3', shortcutLabel: 'Alt+I', persist });
    q('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect(p).resolves.toBe('enable');
    expect(persist).toHaveBeenCalledWith({ inlineGuideShown: true });
  });
});
