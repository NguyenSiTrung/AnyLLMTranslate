import { ArrowRightLeft } from 'lucide-react';
import { CustomSelect } from './CustomSelect';

export function LanguageBar({
  sourceLanguage,
  targetLanguage,
  sourceOptions,
  targetOptions,
  onSourceChange,
  onTargetChange,
  onSwap,
}: {
  sourceLanguage: string;
  targetLanguage: string;
  sourceOptions: { value: string; label: string }[];
  targetOptions: { value: string; label: string }[];
  onSourceChange: (value: string) => void;
  onTargetChange: (value: string) => void;
  onSwap: () => void;
}) {
  const swapDisabled = sourceLanguage === 'auto';

  return (
    <div className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-800/80 rounded-2xl p-1.5 shadow-lg shadow-black/20">
      <div className="flex items-center relative">
        <div className="flex-1 min-w-0">
          <CustomSelect
            id="source-language"
            variant="ghost"
            value={sourceLanguage}
            onChange={onSourceChange}
            options={sourceOptions}
          />
        </div>

        <div className="flex justify-center z-10 px-0.5 shrink-0">
          <button
            type="button"
            onClick={onSwap}
            disabled={swapDisabled}
            aria-label="Swap languages"
            title={swapDisabled ? 'Pick a source language to swap' : 'Swap languages'}
            className={`p-2 rounded-full transition-all duration-300 ${
              swapDisabled
                ? 'text-zinc-700 cursor-not-allowed opacity-50'
                : 'bg-zinc-800 text-zinc-400 shadow-md border border-zinc-700/50 hover:bg-zinc-700 hover:text-zinc-100 cursor-pointer hover:rotate-180 hover:scale-110 hover:shadow-lg hover:shadow-blue-500/20'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <CustomSelect
            id="target-language"
            variant="ghost"
            value={targetLanguage}
            onChange={onTargetChange}
            options={targetOptions}
          />
        </div>
      </div>
    </div>
  );
}
