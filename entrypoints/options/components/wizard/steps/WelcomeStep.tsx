/**
 * Brand welcome body for the first-run setup wizard.
 */
import { Languages, Lock, Server, Sparkles } from 'lucide-react';
import { ProviderIdentityBadge } from '../../ProviderIdentityBadge';

const HERO_MONOGRAMS: Array<{
  monogram: string;
  accent: 'blue' | 'pink' | 'emerald' | 'amber' | 'teal' | 'cyan';
}> = [
  { monogram: 'OR', accent: 'pink' },
  { monogram: 'GQ', accent: 'amber' },
  { monogram: 'OL', accent: 'emerald' },
  { monogram: 'OA', accent: 'teal' },
  { monogram: 'LM', accent: 'cyan' },
  { monogram: 'CU', accent: 'blue' },
];

const PROOFS = [
  {
    icon: <Server className="h-4 w-4 text-cyan-400" />,
    title: 'Any LLM',
    body: 'OpenRouter, Groq, Ollama, LM Studio, and custom OpenAI-compatible APIs.',
  },
  {
    icon: <Lock className="h-4 w-4 text-sky-400" />,
    title: 'Privacy-first',
    body: 'No telemetry. Credentials never leave your browser except to your provider.',
  },
  {
    icon: <Sparkles className="h-4 w-4 text-amber-400" />,
    title: 'Quick setup',
    body: 'Pick a template, test the connection, choose a language — done.',
  },
] as const;

export function WelcomeStep() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center gap-2 opacity-60">
        {HERO_MONOGRAMS.map((m) => (
          <ProviderIdentityBadge key={m.monogram} accent={m.accent} monogram={m.monogram} />
        ))}
      </div>

      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-500/25 bg-cyan-500/15">
          <Languages className="h-7 w-7 text-cyan-400" />
        </div>
        <div>
          <h3 className="text-xl font-semibold tracking-tight text-zinc-50">
            See the web in your language
          </h3>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Connect any OpenAI-compatible provider or a local Ollama endpoint. Keys stay on your
            device — we only talk to the endpoint you choose.
          </p>
        </div>
      </div>

      <p className="text-center text-[11px] uppercase tracking-widest text-zinc-600">
        1 Connect · 2 Verify · 3 Translate
      </p>

      <ul className="grid gap-3 sm:grid-cols-3">
        {PROOFS.map((item) => (
          <li
            key={item.title}
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5"
          >
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-900">
              {item.icon}
            </div>
            <p className="text-sm font-medium text-zinc-100">{item.title}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{item.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
