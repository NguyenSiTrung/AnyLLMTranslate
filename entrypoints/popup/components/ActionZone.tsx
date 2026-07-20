import { AlertCircle, Sparkles, Square } from 'lucide-react';
import type { PopupStatusKind } from '../lib/derivePopupStatus';

export interface ActionZoneRecovery {
  title: string;
  description: string;
  action: string;
  canTest: boolean;
  onSetup: () => void;
  onTest: () => void;
  setupLabel: string;
}

export interface ActionZoneProps {
  kind: PopupStatusKind;
  onTranslateToggle: () => void;
  progressLabel: string;
  progressDetail: string;
  progressPercent: number;
  error?: string;
  showProgress: boolean;
  recovery?: ActionZoneRecovery;
  unsupported?: { title: string; description: string } | null;
  isActive: boolean;
}

export function ActionZone({
  kind,
  onTranslateToggle,
  progressLabel,
  progressDetail,
  progressPercent,
  error,
  showProgress,
  recovery,
  unsupported,
  isActive,
}: ActionZoneProps) {
  if (kind === 'setup' && recovery) {
    return (
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 shadow-lg shadow-amber-500/5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/20">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-zinc-100">{recovery.title}</h3>
            <p className="text-[11px] text-zinc-400 leading-relaxed mt-1">{recovery.description}</p>
            <p className="text-[11px] text-amber-300/90 mt-2">Next: {recovery.action}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={recovery.onSetup}
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.01] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          >
            {recovery.setupLabel}
          </button>
          {recovery.canTest && (
            <button
              type="button"
              onClick={recovery.onTest}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-2.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            >
              Test connection in setup guide
            </button>
          )}
        </div>
      </div>
    );
  }

  if (kind === 'blocked' && unsupported) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-zinc-700/70 bg-zinc-900/80 p-4 shadow-lg shadow-black/10"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 border border-zinc-700/70">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-zinc-100">{unsupported.title}</h3>
            <p className="text-[11px] text-zinc-400 leading-relaxed mt-1">{unsupported.description}</p>
          </div>
        </div>
      </div>
    );
  }

  const showStrip = showProgress || Boolean(error);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onTranslateToggle}
        className="w-full relative group rounded-2xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 focus:ring-offset-zinc-950 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
      >
        <div
          className={`absolute inset-0 transition-all duration-500 ${
            isActive
              ? 'bg-gradient-to-r from-zinc-700 via-zinc-600 to-zinc-700'
              : 'bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 bg-[length:200%_200%] animate-gradient-x'
          }`}
        />

        {!isActive && (
          <div className="absolute inset-0 translate-x-[-100%] group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent z-10" />
        )}

        <div className="relative flex items-center justify-center gap-2.5 py-3.5 px-4 z-20">
          {isActive ? (
            <>
              <Square className="w-4 h-4 text-zinc-300 fill-zinc-300" />
              <span className="font-semibold text-sm text-zinc-100 tracking-wide">
                Restore Original
              </span>
              <kbd className="ml-1 text-[10px] font-mono bg-zinc-800/60 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700/50">
                Alt+X
              </kbd>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-white" />
              <span className="font-semibold text-sm text-white tracking-wide">Translate Page</span>
              <kbd className="ml-1 text-[10px] font-mono bg-white/15 text-white/70 px-1.5 py-0.5 rounded border border-white/20">
                Alt+A
              </kbd>
            </>
          )}
        </div>
      </button>

      {showStrip && (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 px-3 py-2 max-h-14 overflow-hidden">
          {error ? (
            <p className="text-[11px] text-red-400/90 leading-snug line-clamp-2">{error}</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                <span className="min-w-0 leading-snug truncate">
                  <span className="font-medium text-zinc-300">{progressLabel}</span>
                  {progressDetail ? (
                    <>
                      {' · '}
                      {progressDetail}
                    </>
                  ) : null}
                </span>
                <span className="font-mono font-semibold shrink-0">{progressPercent}%</span>
              </div>
              <div className="mt-1.5 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    kind === 'translating'
                      ? 'bg-gradient-to-r from-blue-500 to-cyan-500'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-500'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
