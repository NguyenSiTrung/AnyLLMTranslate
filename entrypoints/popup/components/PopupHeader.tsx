import { Settings } from 'lucide-react';
import type { PopupStatusKind } from '../lib/derivePopupStatus';
import { TYPOGRAPHY } from '../lib/typography';

const CHIP_DOT: Record<PopupStatusKind, string> = {
  ready: 'bg-zinc-600',
  translating: 'bg-blue-500',
  active: 'bg-emerald-500',
  error: 'bg-red-500',
  blocked: 'bg-zinc-500',
  setup: 'bg-amber-500',
};

const BRAND_ICON_URL = chrome.runtime.getURL('icon/128.png');

export function PopupHeader({
  chipLabel,
  kind,
  isTranslating,
  onOpenSettings,
}: {
  chipLabel: string;
  kind: PopupStatusKind;
  isTranslating: boolean;
  onOpenSettings: () => void;
}) {
  return (
    <div className="relative px-4 py-4 flex items-center justify-between border-b border-zinc-900/80">
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative flex items-center justify-center shrink-0">
          <img
            src={BRAND_ICON_URL}
            alt=""
            width={32}
            height={32}
            className={`w-8 h-8 rounded-[10px] shadow-lg shadow-blue-500/20 z-10 transition-all duration-500 ${isTranslating ? 'scale-95' : ''}`}
            draggable={false}
          />
          {isTranslating && (
            <div className="absolute inset-0 rounded-[10px] border border-blue-400 animate-ping opacity-50" />
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-bold tracking-tight text-zinc-100 truncate">
            AnyLLMTranslate
          </h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="relative flex">
              <span className={`w-1.5 h-1.5 rounded-full ${CHIP_DOT[kind]}`} />
              {isTranslating && (
                <span className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-50" />
              )}
            </span>
            <span className={TYPOGRAPHY.tiny}>{chipLabel}</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenSettings}
        className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 border border-zinc-800/80 transition-all duration-200 hover:text-zinc-200 hover:shadow-lg hover:shadow-black/20 shrink-0"
        aria-label="Open full settings"
        title="Full Settings"
      >
        <Settings className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
