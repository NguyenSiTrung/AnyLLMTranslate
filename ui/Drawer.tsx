/**
 * Right-side drawer / narrow bottom sheet with focus trap and Escape close.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface DrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  headerExtra?: ReactNode;
  footer?: ReactNode;
  widthClassName?: string;
}

export function Drawer({
  open,
  title,
  onClose,
  children,
  headerExtra,
  footer,
  widthClassName = 'w-full max-w-md',
}: DrawerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Initial focus only when the drawer opens. Do not re-run when the parent
  // re-creates `onClose` (pool status polls ~3s, cooldown ticks, store writes)
  // or typing in fields will lose focus after a few seconds.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end max-sm:items-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        className={`relative ${widthClassName} h-full max-sm:h-[min(92vh,100%)] max-sm:rounded-t-xl sm:border-l border-zinc-700 bg-zinc-950 shadow-2xl flex flex-col ${
          reduceMotion ? '' : 'animate-[fadeIn_200ms_ease-out]'
        }`}
      >
        <div className="flex items-start gap-3 px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">{title}</h2>
            {headerExtra ? <div className="mt-2">{headerExtra}</div> : null}
          </div>
          <Button
            ref={closeRef}
            type="button"
            variant="ghost"
            size="sm"
            icon={<X className="w-4 h-4" />}
            onClick={onClose}
            aria-label="Close"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-zinc-800 px-5 py-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
