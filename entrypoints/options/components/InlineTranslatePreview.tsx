/**
 * InlineTranslatePreview — reactive mock input for Settings → Inline.
 * Mirrors dual mode, language prefix, target language, and gesture labels.
 * No real translation.
 */

import { buildPreviewProjection } from '@/lib/inlineTranslatePreview';

export interface InlineTranslatePreviewProps {
  disabled: boolean;
  targetLanguage: string;
  dualMode: boolean;
  enableLanguagePrefix: boolean;
  languagePrefix: string;
  tapCount: number;
  timeWindowMs: number;
  triggerKeyLabel: string;
}

export function InlineTranslatePreview({
  disabled,
  targetLanguage,
  dualMode,
  enableLanguagePrefix,
  languagePrefix,
  timeWindowMs,
  triggerKeyLabel,
}: InlineTranslatePreviewProps) {
  const projection = buildPreviewProjection({
    targetLanguage,
    dualMode,
    enableLanguagePrefix,
    languagePrefix,
  });

  return (
    <div
      className={`rounded-xl border border-zinc-700/60 bg-zinc-950/60 overflow-hidden ${
        disabled ? 'opacity-50' : ''
      }`}
      data-testid="inline-translate-preview"
    >
      {/* Decorative field-type chips */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-800/80 bg-zinc-900/50">
        {(['input', 'textarea', 'contentEditable'] as const).map((t) => (
          <span
            key={t}
            className="text-[10px] font-mono text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/40"
            aria-hidden="true"
          >
            {t}
          </span>
        ))}
        <span className="ml-auto text-[10px] text-zinc-600" aria-hidden="true">
          mock field
        </span>
      </div>

      <div className="p-4 space-y-3">
        {disabled ? (
          <p className="text-xs text-zinc-500">Enable inline translation to preview</p>
        ) : (
          <>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1">Before</p>
              <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/80 px-3 py-2 font-mono text-xs text-zinc-400">
                {projection.before}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1">
                After gesture / Alt+I
              </p>
              <div
                className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 font-mono text-xs text-zinc-200"
                aria-live="polite"
              >
                {projection.after}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t border-zinc-800/80 bg-zinc-900/40">
        <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-300 font-mono">
          {triggerKeyLabel}
        </kbd>
        <span className="text-[10px] text-zinc-500">within {timeWindowMs}ms</span>
        <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-300 font-mono">
          Alt+I
        </kbd>
        <span className="ml-auto text-[10px] text-zinc-500 truncate max-w-[50%]">
          {projection.meta}
        </span>
      </div>
    </div>
  );
}
