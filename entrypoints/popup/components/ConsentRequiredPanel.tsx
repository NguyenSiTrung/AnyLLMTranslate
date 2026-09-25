/**
 * Popup-side consent gate.
 *
 * The popup is the primary product surface, so it renders the disclosure itself
 * rather than deferring to the options page: the Chrome Web Store User Data FAQ
 * §10 requires the disclosure and the consent action to happen in the product's
 * own UI before any user data is handled.
 */
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  DATA_DISCLOSURE_ITEMS,
  PRIVACY_POLICY_URL,
} from '@/lib/privacyConsent';

interface ConsentRequiredPanelProps {
  onAccept: () => void;
}

export function ConsentRequiredPanel({ onAccept }: ConsentRequiredPanelProps) {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="w-[340px] bg-zinc-950 text-zinc-100 font-sans selection:bg-blue-500/30 shadow-2xl">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-500/25 bg-cyan-500/15">
          <ShieldCheck className="h-4 w-4 text-cyan-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-100">Before you translate</p>
          <p className="text-[11px] text-zinc-500">Review what leaves your browser</p>
        </div>
      </div>

      <div className="max-h-[320px] space-y-3 overflow-y-auto px-4 py-3">
        <p className="text-xs leading-5 text-zinc-400">
          AnyLLMTranslate sends the text you ask it to translate to the LLM endpoint you
          configure. There is no AnyLLMTranslate server.
        </p>

        <ul className="space-y-2">
          {DATA_DISCLOSURE_ITEMS.map((item) => (
            <li key={item.data} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
              <p className="text-xs font-medium text-zinc-200">{item.data}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-zinc-500">
                {item.purpose} → {item.destination}
              </p>
            </li>
          ))}
        </ul>

        <a
          href={PRIVACY_POLICY_URL}
          target="_blank"
          rel="noreferrer"
          className="block text-[11px] text-blue-400 underline underline-offset-2"
        >
          Read the full privacy policy
        </a>

        <label htmlFor="popup-consent" className="flex cursor-pointer items-start gap-2.5">
          <input
            id="popup-consent"
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-cyan-500"
          />
          <span className="text-[11px] leading-4 text-zinc-300">
            I understand and agree that AnyLLMTranslate will handle the data above as described.
          </span>
        </label>
      </div>

      <div className="border-t border-zinc-800 px-4 py-3">
        <button
          type="button"
          disabled={!accepted}
          onClick={onAccept}
          className="w-full rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500 disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          Accept and continue
        </button>
      </div>
    </div>
  );
}
