/**
 * ThemePreview component - Shows live preview of translation themes.
 * Displays bilingual sample text with the selected theme applied.
 */

import { Eye } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { Card } from '@/ui/Card';

const SAMPLE_TEXT = {
  original: 'The quick brown fox jumps over the lazy dog.',
  translation: 'El rápido zorro marrón salta sobre el perro perezoso.',
};

export function ThemePreview() {
  const settings = useSettingsStore();

  return (
    <Card title="Theme Preview" icon={<Eye className="w-4 h-4" />} variant="bordered" className="mt-4">
      <div
        className="theme-preview-container"
        data-lingua-theme={settings.theme}
        data-lingua-state="dual"
      >
        <div className="space-y-2">
          {/* Original text */}
          <div data-lingua-role="original" className="text-sm text-zinc-700">
            {SAMPLE_TEXT.original}
          </div>
          {/* Translated text with theme applied */}
          <div data-lingua-role="translation" className="lingua-lens-translation text-sm">
            {SAMPLE_TEXT.translation}
          </div>
        </div>
      </div>
    </Card>
  );
}
