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
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // Focus trap & Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancelRef.current();
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
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Initial focus once on mount / when variant changes. Do not depend on
  // onCancel identity — parent re-renders must not steal focus from inputs
  // inside custom modal bodies (e.g. GuidedAddProvider search field).
  useEffect(() => {
    // L1: For danger variant, focus Cancel (safer default); for info, focus Confirm
    if (variant === 'danger') {
      cancelRef.current?.focus();
    } else {
      confirmRef.current?.focus();
    }
  }, [variant]);

  const IconComp = variant === 'danger' ? AlertTriangle : Info;
  const iconColor = variant === 'danger' ? 'text-rose-400' : 'text-blue-400';
  const iconWrap =
    variant === 'danger'
      ? 'border-rose-500/30 bg-rose-500/15'
      : 'border-blue-500/30 bg-blue-500/15';
  const panelBorder = variant === 'danger' ? 'border-rose-500/25' : 'border-zinc-700';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      {/* Dialog */}
      <div
        ref={dialogRef}
        className={`relative w-full max-w-md mx-4 bg-zinc-900 border ${panelBorder} rounded-xl shadow-2xl animate-[scaleIn_200ms_ease-out] overflow-hidden`}
      >
        {variant === 'danger' && (
          <div className="h-0.5 w-full bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500" aria-hidden="true" />
        )}
        <div className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${iconWrap}`}>
              <IconComp className={`w-4 h-4 ${iconColor}`} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
              <div className="text-sm text-zinc-400 mt-1.5 leading-relaxed">{message}</div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button ref={cancelRef} variant="ghost" size="sm" onClick={onCancel}>{cancelLabel}</Button>
            <Button
              ref={confirmRef}
              variant={variant === 'danger' ? 'destructive' : 'primary'}
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
