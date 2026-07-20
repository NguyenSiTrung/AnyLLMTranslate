import { Activity, ChevronRight } from 'lucide-react';
import { TYPOGRAPHY } from '../lib/typography';

const CONNECTION_DOT: Record<'unknown' | 'success' | 'error', string> = {
  unknown: 'bg-zinc-500/50',
  success: 'bg-emerald-500/50',
  error: 'bg-red-500/50',
};

export function PopupFooter({
  displayName,
  model,
  connectionStatus,
  onOpenSettings,
}: {
  displayName: string;
  model: string;
  connectionStatus: 'unknown' | 'success' | 'error';
  onOpenSettings: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpenSettings}
      className="w-full bg-zinc-950/80 border-t border-zinc-900/80 px-4 py-3 flex items-center justify-between hover:bg-zinc-900/80 transition-colors text-left group"
      aria-label={`Open settings — ${displayName}, ${model}`}
      title="Open settings"
    >
      <div className="flex items-center gap-1.5 text-zinc-500 min-w-0">
        <Activity className="w-3.5 h-3.5 opacity-60 group-hover:text-blue-400 group-hover:opacity-100 transition-colors shrink-0" />
        <span className={`${TYPOGRAPHY.small} truncate`}>{displayName}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="flex items-center gap-1.5 bg-zinc-900/80 backdrop-blur px-2.5 py-1 rounded-full border border-zinc-800/80 shadow-sm">
          <span className="relative flex">
            <span className={`w-1.5 h-1.5 rounded-full ${CONNECTION_DOT[connectionStatus]}`} />
            {connectionStatus === 'success' && (
              <span className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-50" />
            )}
          </span>
          <span className={`${TYPOGRAPHY.small} max-w-[110px] truncate`}>{model}</span>
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
      </div>
    </button>
  );
}
