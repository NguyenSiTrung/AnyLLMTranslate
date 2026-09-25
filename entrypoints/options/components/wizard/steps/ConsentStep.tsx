/**
 * First-run data disclosure and consent step.
 *
 * Chrome Web Store User Data FAQ §10 requires the product to describe the user
 * data it handles and how it is used, and to obtain consent through a specific
 * action inside the product UI — a privacy policy or store listing is not
 * sufficient. This step renders the disclosure from a single source of truth
 * (`lib/privacyConsent.ts`) and gates the wizard footer on an explicit
 * acceptance.
 */
import { ShieldCheck } from 'lucide-react';
import {
  DATA_DISCLOSURE_ITEMS,
  DISCLOSURE_NON_PRACTICES,
} from '@/lib/privacyConsent';

interface ConsentStepProps {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
}

export function ConsentStep({ accepted, onAcceptedChange }: ConsentStepProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-500/25 bg-cyan-500/15">
          <ShieldCheck className="h-7 w-7 text-cyan-400" />
        </div>
        <div>
          <h3 className="text-xl font-semibold tracking-tight text-zinc-50">
            What leaves your browser
          </h3>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            AnyLLMTranslate translates by sending the text you ask it to translate to an LLM
            endpoint <strong className="font-medium text-zinc-300">you</strong> configure. There is
            no AnyLLMTranslate server. This is the complete list of data the extension handles.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-zinc-900/80 text-[11px] uppercase tracking-wider text-zinc-500">
              <th scope="col" className="px-3 py-2 font-semibold">Data</th>
              <th scope="col" className="px-3 py-2 font-semibold">Why</th>
              <th scope="col" className="px-3 py-2 font-semibold">Where it goes</th>
            </tr>
          </thead>
          <tbody>
            {DATA_DISCLOSURE_ITEMS.map((item) => (
              <tr key={item.data} className="border-t border-zinc-800/80 align-top">
                <td className="px-3 py-2.5 font-medium text-zinc-200">{item.data}</td>
                <td className="px-3 py-2.5 text-zinc-400">{item.purpose}</td>
                <td className="px-3 py-2.5 text-zinc-400">{item.destination}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {DISCLOSURE_NON_PRACTICES.map((item) => (
          <li key={item} className="flex items-start gap-2 text-xs leading-5 text-zinc-500">
            <span aria-hidden="true" className="mt-0.5 text-zinc-600">✕</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <label
        htmlFor="consent-accept"
        className="flex cursor-pointer items-start gap-3 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.06] p-4"
      >
        <input
          id="consent-accept"
          type="checkbox"
          checked={accepted}
          onChange={(event) => onAcceptedChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-cyan-500"
        />
        <span className="text-sm leading-6 text-zinc-200">
          I understand and agree that AnyLLMTranslate will handle the data listed above as
          described.
          <span className="mt-1 block text-xs leading-5 text-zinc-500">
            You can review or withdraw this at any time in Options → Statistics → Data &amp;
            privacy. Withdrawing stops translation until you accept again.
          </span>
        </span>
      </label>
    </div>
  );
}
