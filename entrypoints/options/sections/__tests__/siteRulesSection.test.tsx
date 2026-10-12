import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS, type SiteRule } from '@/types/config';
import { ToastProvider } from '@/ui/ToastProvider';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  SiteRulesSection,
  buildInlineSiteOverride,
  inlineOverrideDraftFrom,
} from '../SiteRulesSection';

vi.stubGlobal('chrome', {
  runtime: { sendMessage: vi.fn() },
  storage: {
    local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

const updateSettings = vi.fn();

const baseRule: SiteRule = {
  id: 'r1',
  hostname: 'chat.example.com',
  includeSelectors: [],
  excludeSelectors: [],
  alwaysTranslate: false,
  neverTranslate: false,
  builtIn: false,
};

function setRules(rules: SiteRule[]) {
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, isLoaded: true, siteRules: rules, updateSettings });
}

function savedRule(): SiteRule {
  return updateSettings.mock.calls.at(-1)?.[0]?.siteRules?.[0];
}

function openEditor() {
  render(
    <ToastProvider>
      <SiteRulesSection />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /Edit rule for chat.example.com/i }));
  fireEvent.click(screen.getByRole('button', { name: /Inline translate/i }));
}

beforeEach(() => {
  updateSettings.mockReset();
});

describe('inline override draft helpers', () => {
  it('empty draft → undefined; filled fields → typed override', () => {
    expect(buildInlineSiteOverride(inlineOverrideDraftFrom(undefined))).toBeUndefined();
    expect(
      buildInlineSiteOverride({
        ...inlineOverrideDraftFrom(undefined),
        autoLanguageSelectors: ' .msg \n\n parentElementTo .thread .text ',
        idleMs: '300',
        triggerToleranceCount: '0',
        autoLanguageEnable: 'off',
        cancelWindowMs: 'abc',
      }),
    ).toEqual({
      autoLanguageSelectors: ['.msg', 'parentElementTo .thread .text'],
      idleMs: 300,
      triggerToleranceCount: 0,
      autoLanguageEnable: false,
    });
  });

  it('round-trips an existing override', () => {
    const override = { minDurationMs: 0, autoLanguageEnable: true, autoLanguageSelectors: ['.a'] };
    expect(buildInlineSiteOverride(inlineOverrideDraftFrom(override))).toEqual(override);
  });
});

describe('SiteRulesSection — Inline translate disclosure', () => {
  it('persists selectors and numeric overrides on the rule', () => {
    setRules([baseRule]);
    openEditor();
    fireEvent.change(screen.getByLabelText('Auto-language selectors'), {
      target: { value: '.message-in .text\nparentElementTo .thread .body' },
    });
    fireEvent.change(screen.getByLabelText('Idle wait (ms)'), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText('Cancel window (ms)'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Auto language'), { target: { value: 'off' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));

    expect(savedRule()).toMatchObject({
      id: 'r1',
      inlineTranslate: {
        autoLanguageSelectors: ['.message-in .text', 'parentElementTo .thread .body'],
        idleMs: 400,
        cancelWindowMs: 1000,
        autoLanguageEnable: false,
      },
    });
  });

  it('emptied fields remove their keys; an empty override removes inlineTranslate', () => {
    setRules([{ ...baseRule, inlineTranslate: { idleMs: 400, minDurationMs: 0 } }]);
    openEditor();
    fireEvent.change(screen.getByLabelText('Idle wait (ms)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));
    expect(savedRule().inlineTranslate).toEqual({ minDurationMs: 0 });

    setRules([{ ...baseRule, inlineTranslate: { minDurationMs: 0 } }]);
    document.body.innerHTML = '';
    openEditor();
    fireEvent.change(screen.getByLabelText('Minimum duration (ms)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));
    expect(savedRule()).not.toHaveProperty('inlineTranslate');
  });

  it('saving without touching the disclosure keeps an existing override', () => {
    setRules([{ ...baseRule, inlineTranslate: { triggerGapMs: 300 } }]);
    render(
      <ToastProvider>
        <SiteRulesSection />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Edit rule for chat.example.com/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));
    expect(savedRule().inlineTranslate).toEqual({ triggerGapMs: 300 });
  });
});
