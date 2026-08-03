/**
 * Toast notification component with auto-dismiss.
 */

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastData {
  id: string;
  variant: ToastVariant;
  message: string;
  duration?: number;
  action?: ToastAction;
}

interface ToastProps extends ToastData {
  onDismiss: (id: string) => void;
}

const icons: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const styles: Record<ToastVariant, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10',
  error: 'border-red-500/30 bg-red-500/10',
  info: 'border-blue-500/30 bg-blue-500/10',
};

const iconColors: Record<ToastVariant, string> = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  info: 'text-blue-400',
};

export function Toast({ id, variant, message, duration, action, onDismiss }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);
  const Icon = icons[variant];
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Action toasts linger so the Undo is discoverable; plain toasts keep 4s.
  const timeoutMs = action ? (duration ?? 8000) : (duration ?? 4000);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      dismissTimerRef.current = setTimeout(() => onDismiss(id), 200);
    }, timeoutMs);
    return () => {
      clearTimeout(timer);
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = undefined;
      }
    };
  }, [id, timeoutMs, onDismiss]);

  const handleManualDismiss = () => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
    }
    setIsExiting(true);
    dismissTimerRef.current = setTimeout(() => onDismiss(id), 200);
  };

  return (
    <div
      role="alert"
      className={`flex items-center gap-3 px-4 py-3 border rounded-lg backdrop-blur-sm shadow-xl max-w-sm ${styles[variant]} ${
        isExiting ? 'animate-[fadeOut_200ms_ease-out_forwards]' : 'animate-[slideInRight_300ms_ease-out]'
      }`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${iconColors[variant]}`} />
      <p className="text-sm text-zinc-200 flex-1">{message}</p>
      {action && (
        <button
          onClick={() => {
            action.onClick();
            handleManualDismiss();
          }}
          className="shrink-0 rounded-md border border-zinc-700 bg-zinc-800/80 px-2 py-1 text-xs font-semibold text-zinc-100 transition-colors hover:bg-zinc-700"
        >
          {action.label}
        </button>
      )}
      <button
        onClick={handleManualDismiss}
        className="p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
        aria-label="Dismiss notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
