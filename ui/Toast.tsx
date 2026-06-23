/**
 * Toast notification component with auto-dismiss.
 */

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastData {
  id: string;
  variant: ToastVariant;
  message: string;
  duration?: number;
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

export function Toast({ id, variant, message, duration = 4000, onDismiss }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);
  const Icon = icons[variant];
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      dismissTimerRef.current = setTimeout(() => onDismiss(id), 200);
    }, duration);
    return () => {
      clearTimeout(timer);
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = undefined;
      }
    };
  }, [id, duration, onDismiss]);

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
