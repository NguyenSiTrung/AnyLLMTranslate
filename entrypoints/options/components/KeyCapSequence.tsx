/**
 * Key cap chips for Shortcut Studio rows.
 */

import { parseShortcutKeys } from '@/lib/shortcutDisplay';

export interface KeyCapSequenceProps {
  shortcut: string;
  className?: string;
}

export function KeyCapSequence({ shortcut, className = '' }: KeyCapSequenceProps) {
  const keys = parseShortcutKeys(shortcut);
  if (keys.length === 0) return null;

  const aria = `Shortcut ${shortcut.trim()}`;

  return (
    <span
      className={`inline-flex items-center gap-1 shrink-0 ${className}`}
      aria-label={aria}
    >
      {keys.map((key, i) => (
        <kbd
          key={`${key}-${i}`}
          className="min-w-[1.5rem] px-2 py-1 text-center bg-zinc-800 border border-zinc-600/80 rounded-md text-[11px] text-zinc-200 font-mono shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-transform duration-150 hover:-translate-y-px hover:shadow-md active:translate-y-px motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
