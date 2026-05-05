/**
 * Modal confirmation dialog component.
 * Traps focus and supports Escape key dismissal.
 * L1: For danger variant, focuses Cancel button (safer default).
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Button } from './Button';

type ModalVariant = 'danger' | 'info';

interface ModalProps {
  title: string;
  message: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: ModalVariant;
}

export function Modal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'info',
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus trap & Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [tabindex]:not([tabindex="-1"])'
        );
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
    // L1: For danger variant, focus Cancel (safer default); for info, focus Confirm
    if (variant === 'danger') {
      cancelRef.current?.focus();
    } else {
      confirmRef.current?.focus();
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, variant]);

  const IconComp = variant === 'danger' ? AlertTriangle : Info;
  const iconColor = variant === 'danger' ? 'text-red-400' : 'text-blue-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative w-full max-w-md mx-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl animate-[scaleIn_200ms_ease-out]"
      >
        <div className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <IconComp className={`w-5 h-5 mt-0.5 shrink-0 ${iconColor}`} />
            <div>
              <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
              <div className="text-sm text-zinc-400 mt-1">{message}</div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button ref={cancelRef} variant="ghost" size="sm" onClick={onCancel}>{cancelLabel}</Button>
            <Button
              ref={confirmRef}
              variant={variant === 'danger' ? 'danger' : 'primary'}
              size="sm"
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
