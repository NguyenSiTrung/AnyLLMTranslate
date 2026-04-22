/**
 * Custom Theme Editor — color pickers and controls for the user-defined theme.
 * Appears when the 'custom' theme is selected.
 */

import { useSettingsStore } from '@/stores/settingsStore';
import { DEFAULT_CUSTOM_THEME } from '@/types/config';
import type { CustomThemeConfig } from '@/types/config';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { FieldGroup } from '@/ui/FieldGroup';
import { Palette, RotateCcw } from 'lucide-react';

interface ColorPickerFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function ColorPickerField({ id, label, value, onChange }: ColorPickerFieldProps) {
  return (
    <FieldGroup label={label} htmlFor={id}>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="w-10 h-10 rounded-lg border border-zinc-700 bg-zinc-900 cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
      </div>
    </FieldGroup>
  );
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

function SelectField({ id, label, value, options, onChange }: SelectFieldProps) {
  return (
    <FieldGroup label={label} htmlFor={id}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </FieldGroup>
  );
}

export function CustomThemeEditor() {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const customTheme = settings.customTheme ?? { ...DEFAULT_CUSTOM_THEME };

  const updateCustomTheme = (partial: Partial<CustomThemeConfig>) => {
    const next: CustomThemeConfig = { ...customTheme, ...partial };
    updateSettings({ customTheme: next });
  };

  const handleReset = () => {
    updateSettings({ customTheme: { ...DEFAULT_CUSTOM_THEME } });
  };

  return (
    <Card title="Custom Theme Editor" icon={<Palette className="w-3.5 h-3.5" />} variant="bordered">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <ColorPickerField
          id="custom-text-color"
          label="Translation Text Color"
          value={customTheme.textColor}
          onChange={(v) => updateCustomTheme({ textColor: v })}
        />
        <ColorPickerField
          id="custom-bg-color"
          label="Translation Background Color"
          value={customTheme.backgroundColor}
          onChange={(v) => updateCustomTheme({ backgroundColor: v })}
        />
        <SelectField
          id="custom-border-style"
          label="Border Style"
          value={customTheme.borderStyle}
          options={[
            { value: 'none', label: 'None' },
            { value: 'solid', label: 'Solid' },
            { value: 'dashed', label: 'Dashed' },
            { value: 'dotted', label: 'Dotted' },
          ]}
          onChange={(v) => updateCustomTheme({ borderStyle: v as CustomThemeConfig['borderStyle'] })}
        />
        <ColorPickerField
          id="custom-border-color"
          label="Border Color"
          value={customTheme.borderColor}
          onChange={(v) => updateCustomTheme({ borderColor: v })}
        />
        <SelectField
          id="custom-font-style"
          label="Font Style"
          value={customTheme.fontStyle}
          options={[
            { value: 'normal', label: 'Normal' },
            { value: 'italic', label: 'Italic' },
          ]}
          onChange={(v) => updateCustomTheme({ fontStyle: v as CustomThemeConfig['fontStyle'] })}
        />
        <SelectField
          id="custom-font-size"
          label="Font Size"
          value={customTheme.fontSize}
          options={[
            { value: 'smaller', label: 'Smaller (0.9em)' },
            { value: 'same', label: 'Same as original' },
            { value: 'larger', label: 'Larger (1.1em)' },
          ]}
          onChange={(v) => updateCustomTheme({ fontSize: v as CustomThemeConfig['fontSize'] })}
        />
      </div>
      <div className="mt-5 pt-4 border-t border-zinc-800">
        <Button
          variant="secondary"
          onClick={handleReset}
          icon={<RotateCcw className="w-4 h-4" />}
        >
          Reset to Defaults
        </Button>
      </div>
    </Card>
  );
}
