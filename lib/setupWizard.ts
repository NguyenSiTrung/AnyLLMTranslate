/**
 * Pure helpers for the first-run setup wizard (entry step, popular languages).
 */

import type { OnboardingState } from '@/types/config';
import { LANGUAGES, type Language } from '@/lib/languages';

export type WizardStep = NonNullable<OnboardingState['lastStep']>;

/** Legacy ids that may still exist in chrome.storage or deep links. */
export type LegacyWizardStep = 'provider' | 'test' | 'language' | 'done';

export type WizardStepInput = WizardStep | LegacyWizardStep | string | null | undefined;

export type CatalogFilterId = 'all' | 'cloud' | 'local' | 'custom';

export const WIZARD_STEPS: readonly WizardStep[] = [
  'welcome',
  'connect',
  'verify',
  'ready',
] as const;

export const WIZARD_STEP_LABELS: Record<WizardStep, string> = {
  welcome: 'Welcome',
  connect: 'Connect',
  verify: 'Verify',
  ready: 'Ready',
};

const LEGACY_STEP_MAP: Record<LegacyWizardStep, WizardStep> = {
  provider: 'connect',
  test: 'verify',
  language: 'verify',
  done: 'ready',
};

/** Normalize new or legacy step ids; invalid input → null. */
export function normalizeWizardStep(input: WizardStepInput): WizardStep | null {
  if (input == null || input === '') return null;
  if ((WIZARD_STEPS as readonly string[]).includes(input)) {
    return input as WizardStep;
  }
  if (input in LEGACY_STEP_MAP) {
    return LEGACY_STEP_MAP[input as LegacyWizardStep];
  }
  return null;
}

/**
 * Resolve which wizard step to show when the dialog opens.
 * - Completed setup reopens at connect (re-configure), not the success screen.
 * - Skipped / in-progress resumes lastStep (never stuck on "ready" without complete).
 */
export function resolveWizardEntryStep(onboarding: OnboardingState): WizardStep {
  if (onboarding.completed) {
    return 'connect';
  }

  // lastStep may still be a legacy id from chrome.storage
  const last = normalizeWizardStep(onboarding.lastStep as WizardStepInput) ?? 'welcome';
  if (last === 'ready') {
    return onboarding.skipped ? 'welcome' : 'verify';
  }
  return last;
}

export function wizardStepIndex(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step) + 1;
}

/** Popular target languages shown as quick-pick chips on the verify step. */
export const POPULAR_TARGET_LANGUAGE_CODES = [
  'en',
  'vi',
  'zh',
  'ja',
  'ko',
  'es',
  'fr',
  'de',
  'pt',
  'ru',
  'th',
  'id',
] as const;

export function getPopularTargetLanguages(): Language[] {
  return POPULAR_TARGET_LANGUAGE_CODES.map(
    (code) => LANGUAGES.find((l) => l.code === code),
  ).filter((l): l is Language => Boolean(l));
}

/** Fields that invalidate a prior connection test when changed. */
export function providerPatchInvalidatesTest(
  patch: Partial<{
    baseUrl: string;
    apiKey: string;
    model: string;
    requiresApiKey: boolean;
    connectionStatus: string;
  }>,
): boolean {
  return (
    patch.baseUrl !== undefined ||
    patch.apiKey !== undefined ||
    patch.model !== undefined ||
    patch.requiresApiKey !== undefined ||
    patch.connectionStatus === 'unknown'
  );
}

export type TranslatePageResult =
  | { ok: true }
  | { ok: false; reason: 'no-tab' | 'no-content-script' | 'query-failed' };

/**
 * Pick a tab that can receive startTranslation (http/https page, not extension UI).
 * Prefer the active tab in the last focused window when it is a normal page;
 * otherwise fall back to any active http(s) tab.
 */
export function isTranslatablePageUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
