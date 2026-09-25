/**
 * Privacy disclosure and consent — the single source of truth for what the
 * extension tells the user about the data it handles, and for whether the user
 * has accepted it.
 *
 * Why this exists: the Chrome Web Store User Data FAQ §10 requires the product
 * to describe the types of user data it handles and how they are used, and to
 * obtain the user's consent through a specific action **inside the product's
 * own UI** before any user data is collected or handled. A privacy policy alone
 * does not satisfy it, and neither does the store listing.
 *
 * Bumping {@link PRIVACY_POLICY_VERSION} invalidates every existing consent and
 * forces the disclosure to be re-accepted, which is what the policy expects when
 * the data practices change.
 */

/** Version of the disclosure the user is consenting to. Bump on any change. */
export const PRIVACY_POLICY_VERSION = '2026-09-25';

/**
 * Public URL of the hosted privacy policy. This is the link registered in the
 * Chrome Web Store dashboard, and the "read the full policy" target shown
 * alongside the in-product disclosure.
 */
export const PRIVACY_POLICY_URL =
  'https://nguyensitrung.github.io/AnyLLMTranslate/guide/privacy.html';

/**
 * Error code returned by the background service worker when a message would
 * handle user data but no valid consent is recorded. UI layers match on this to
 * show the consent prompt instead of a generic failure.
 */
export const CONSENT_REQUIRED_ERROR = 'consent-required';

/** One row of the in-product disclosure table. */
export interface DataDisclosureItem {
  /** The data type, in plain language. */
  data: string;
  /** Why the extension needs it. */
  purpose: string;
  /** Everywhere it can go. */
  destination: string;
}

/**
 * The complete list of user data the extension handles, rendered verbatim in
 * the first-run wizard and in Options → Statistics → Data & privacy. Keep it in
 * sync with PRIVACY.md and docs/guide/privacy.html.
 */
export const DATA_DISCLOSURE_ITEMS: readonly DataDisclosureItem[] = [
  {
    data: 'Page text',
    purpose: 'To produce the translation you asked for',
    destination: 'The LLM API endpoint you configured',
  },
  {
    data: 'Selected text and focused input text',
    purpose: 'To produce a definition, translation, or replacement text',
    destination: 'The LLM API endpoint you configured',
  },
  {
    data: 'Video subtitle and caption text',
    purpose: 'To produce bilingual subtitles',
    destination: 'The LLM API endpoint you configured',
  },
  {
    data: 'The PDF you open (Scientific PDF mode)',
    purpose: 'To produce a translated PDF',
    destination: 'The local PDF bridge you configured — opt-in, off by default',
  },
  {
    data: 'Text you ask to be spoken aloud',
    purpose: 'To synthesize audio',
    destination: 'Your text-to-speech provider, if you enable provider speech',
  },
  {
    data: 'Your API key',
    purpose: 'To authenticate you to your own provider',
    destination: 'Your provider, and your PDF bridge if you enable it',
  },
  {
    data: 'Page hostname (for example example.com)',
    purpose: 'Local per-site usage statistics',
    destination: 'Your device only — never transmitted',
  },
  {
    data: 'Settings, glossaries, and the translation cache',
    purpose: 'To make the extension work',
    destination: 'Your device only — never transmitted',
  },
] as const;

/** What the extension explicitly does not do. Rendered with the disclosure. */
export const DISCLOSURE_NON_PRACTICES: readonly string[] = [
  'No analytics, telemetry, crash reporting, or usage tracking',
  'No advertising, ad targeting, or affiliate links',
  'No selling or sharing of your data with third parties',
  'No accounts, logins, or cookies',
  'No developer-operated server — nothing is sent to the extension authors',
] as const;

/** Persisted consent record. */
export interface PrivacyConsentState {
  /** True only after the user took the explicit accept action. */
  accepted: boolean;
  /** Epoch ms of the acceptance, or null when never accepted. */
  acceptedAt: number | null;
  /** {@link PRIVACY_POLICY_VERSION} that was accepted. */
  version: string;
}

export const DEFAULT_PRIVACY_CONSENT: PrivacyConsentState = {
  accepted: false,
  acceptedAt: null,
  version: PRIVACY_POLICY_VERSION,
};

/**
 * True when the user has accepted the *current* disclosure version. A stale
 * version counts as no consent so a changed data practice is re-disclosed.
 */
export function hasValidConsent(
  consent: PrivacyConsentState | null | undefined,
): boolean {
  return Boolean(consent?.accepted) && consent?.version === PRIVACY_POLICY_VERSION;
}
