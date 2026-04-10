/**
 * Subtitles Settings Section — position, font size, opacity controls.
 */

import { useSettingsStore } from '@/stores/settingsStore';

export function SubtitlesSection() {
  const subtitleSettings = useSettingsStore((s) => s.subtitleSettings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const handleUpdate = (partial: Partial<typeof subtitleSettings>) => {
    updateSettings({
      subtitleSettings: { ...subtitleSettings, ...partial },
    });
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-zinc-100 mb-1">Subtitle Settings</h2>
      <p className="text-sm text-zinc-500 mb-8">Configure how translated subtitles appear on video players.</p>

      <div className="space-y-6">
        {/* Enabled */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-200">Enable Subtitles</p>
            <p className="text-xs text-zinc-500">Show translated subtitles on video players.</p>
          </div>
          <button
            id="subtitle-enabled-toggle"
            onClick={() => handleUpdate({ enabled: !subtitleSettings.enabled })}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              subtitleSettings.enabled ? 'bg-blue-600' : 'bg-zinc-700'
            }`}
            aria-label="Toggle subtitles"
          >
            <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
              subtitleSettings.enabled ? 'translate-x-5' : ''
            }`} />
          </button>
        </div>

        {/* Position */}
        <FieldGroup label="Subtitle Position">
          <div className="flex gap-3">
            {(['bottom', 'top'] as const).map((pos) => (
              <button
                key={pos}
                onClick={() => handleUpdate({ position: pos })}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all capitalize ${
                  subtitleSettings.position === pos
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
        </FieldGroup>

        {/* Font Size */}
        <FieldGroup label={`Font Size: ${subtitleSettings.fontSize}px`}>
          <input
            id="subtitle-font-size"
            type="range"
            min="10"
            max="32"
            step="1"
            value={subtitleSettings.fontSize}
            onChange={(e) => handleUpdate({ fontSize: parseInt(e.target.value) })}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
            <span>10px</span>
            <span>32px</span>
          </div>
        </FieldGroup>

        {/* Background Opacity */}
        <FieldGroup label={`Background Opacity: ${Math.round(subtitleSettings.backgroundOpacity * 100)}%`}>
          <input
            id="subtitle-opacity"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={subtitleSettings.backgroundOpacity}
            onChange={(e) => handleUpdate({ backgroundOpacity: parseFloat(e.target.value) })}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
            <span>0%</span>
            <span>100%</span>
          </div>
        </FieldGroup>

        {/* Preview */}
        <div className="border border-zinc-800 rounded-lg p-4">
          <p className="text-xs text-zinc-500 mb-3">Preview</p>
          <div
            className="relative bg-zinc-950 rounded-lg h-24 flex items-end justify-center overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-zinc-800 to-zinc-900" />
            <div
              className={`relative z-10 px-4 py-2 rounded text-center mb-2 ${
                subtitleSettings.position === 'top' ? 'self-start mt-2 mb-auto' : ''
              }`}
              style={{
                backgroundColor: `rgba(0, 0, 0, ${subtitleSettings.backgroundOpacity})`,
                fontSize: `${Math.min(subtitleSettings.fontSize, 18)}px`,
              }}
            >
              <span className="text-white">Xin chào thế giới</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-200 mb-2">{label}</label>
      {children}
    </div>
  );
}
