/**
 * Shared Textarea component — multiline input with error/hint support.
 * Mirrors the `Input` API; use for any multi-line text field (e.g. the System
 * Prompt editor). Extracted from the hand-rolled classes previously inlined in
 * AdvancedSection.tsx so multiline inputs use a shared primitive like every
 * other form control.
 */

import type { TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  hint?: string;
  /** Render in a monospace face (e.g. prompt templates, code). */
  mono?: boolean;
  /**
   * Embed inside a parent chrome (toolbar + border). Drops own surface border/bg
   * so the surrounding panel owns the visual frame.
   */
  flush?: boolean;
}

export function Textarea({
  error,
  hint,
  mono = false,
  flush = false,
  rows = 4,
  className = '',
  ...props
}: TextareaProps) {
  const surface = flush
    ? 'bg-transparent border-0 rounded-none focus:ring-0 focus:border-transparent shadow-none'
    : `bg-zinc-800 border rounded-lg focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 ${
        error ? 'border-red-500/50' : 'border-zinc-700'
      }`;

  return (
    <div className={flush ? 'contents' : undefined}>
      <textarea
        rows={rows}
        className={`w-full px-3 py-2 text-sm text-zinc-200 focus:outline-none transition-colors resize-y ${surface} ${
          mono ? 'font-mono' : ''
        } ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-400 mt-1 px-1">{error}</p>}
      {hint && !error && <p className="text-xs text-zinc-500 mt-1 px-1">{hint}</p>}
    </div>
  );
}
