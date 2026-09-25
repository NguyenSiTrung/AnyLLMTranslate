/**
 * Options → Statistics → Data & privacy: review, accept, or withdraw the
 * in-product data disclosure.
 *
 * This is the reviewable/revocable half of the consent flow whose capture half
 * lives in the first-run wizard and the popup. Withdrawing stops translation
 * until the disclosure is accepted again (enforced in the background service
 * worker), which is what the Chrome Web Store user data policy expects.
 */
import { useState } from 'react';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  DATA_DISCLOSURE_ITEMS,
  DISCLOSURE_NON_PRACTICES,
  PRIVACY_POLICY_URL,
  PRIVACY_POLICY_VERSION,
  hasValidConsent,
} from '@/lib/privacyConsent';
import { Button } from '@/ui/Button';

function formatAcceptedAt(at: number | null): string {
  if (!at) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(at));
  } catch {
    return new Date(at).toISOString();
  }
}

export function PrivacyConsentCard() {
  const consent = useSettingsStore((s) => s.privacyConsent);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [isSaving, setIsSaving] = useState(false);

  const accepted = hasValidConsent(consent);

  const setConsent = async (next: { accepted: boolean; acceptedAt: number | null }) => {
    setIsSaving(true);
    try {
      await updateSettings({
        privacyConsent: { ...next, version: PRIVACY_POLICY_VERSION },
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
      data-testid="privacy-consent-card"
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
            accepted
              ? 'border-cyan-500/25 bg-cyan-500/15'
              : 'border-amber-500/30 bg-amber-500/10'
          }`}
        >
          {accepted ? (
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
          ) : (
            <ShieldOff className="h-4 w-4 text-amber-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-200">
            {accepted ? 'Data disclosure accepted' : 'Data disclosure not accepted'}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-zinc-500">
            {accepted
              ? `Accepted ${formatAcceptedAt(consent?.acceptedAt ?? null)}. Withdrawing stops translation until you accept again.`
              : 'Translation is blocked until you accept. The extension handles the data below.'}
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {DATA_DISCLOSURE_ITEMS.map((item) => (
          <li key={item.data} className="text-[11px] leading-5 text-zinc-500">
            <span className="font-medium text-zinc-400">{item.data}</span>
            {' — '}
            {item.purpose}
            {' → '}
            <span className="text-zinc-400">{item.destination}</span>
          </li>
        ))}
      </ul>

      <ul className="mt-2 space-y-1">
        {DISCLOSURE_NON_PRACTICES.map((item) => (
          <li key={item} className="text-[11px] leading-5 text-zinc-600">
            ✕ {item}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {accepted ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={isSaving}
            onClick={() => void setConsent({ accepted: false, acceptedAt: null })}
          >
            Withdraw consent
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={isSaving}
            onClick={() => void setConsent({ accepted: true, acceptedAt: Date.now() })}
            className="bg-cyan-600 hover:bg-cyan-500 text-white"
          >
            Accept disclosure
          </Button>
        )}
        <a
          href={PRIVACY_POLICY_URL}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-blue-400 underline underline-offset-2"
        >
          Read the full privacy policy
        </a>
      </div>
    </div>
  );
}
