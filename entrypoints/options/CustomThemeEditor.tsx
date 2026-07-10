/**
 * Custom Theme Editor — knobs for the user-defined theme.
 * Shown when the custom theme is selected or soft-previewed.
 */

import { useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { DEFAULT_CUSTOM_THEME } from '@/types/config';
import type { CustomThemeConfig, ThemeName } from '@/types/config';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { FieldGroup } from '@/ui/FieldGroup';
import { Select } from '@/ui/Select';
import { Toggle } from '@/ui/Toggle';
import { Palette, RotateCcw } from 'lucide-react';
import { GENERAL_THEME_OPTIONS } from '@/lib/themes';
import { customThemeFromPreset } from '@/lib/customThemePresets';

interface ColorPickerFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function ColorPickerField({
  id,
  label,
  value,
  onChange,
  disabled = false,
}: ColorPickerFieldProps) {
  const hexValue = value === 'transparent' ? '#ffffff' : value;

  return (
    <FieldGroup label={label} htmlFor={id}>
      <div className={`flex items-center gap-3 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <input
          id={id}
          type="color"
          value={hexValue.startsWith('#') ? hexValue : '#ffffff'}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          disabled={disabled}
          className="w-10 h-10 rounded-lg border border-zinc-700 bg-zinc-900 cursor-pointer disabled:cursor-not-allowed"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:cursor-not-allowed"
        />
      </div>
    </FieldGroup>
  );
}

export function CustomThemeEditor() {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const customTheme = settings.customTheme ?? { ...DEFAULT_CUSTOM_THEME };
  const [startFrom, setStartFrom] = useState('');

  const updateCustomTheme = (partial: Partial<CustomThemeConfig>) => {
    const next: CustomThemeConfig = { ...customTheme, ...partial };
    updateSettings({ customTheme: next });
  };

  const handleReset = () => {
    updateSettings({ customTheme: { ...DEFAULT_CUSTOM_THEME } });
  };

  const noFill = customTheme.backgroundColor === 'transparent';
  const borderNone = customTheme.borderStyle === 'none';

  return (
    <Card
      title="Custom Theme Editor"
      icon={<Palette className="w-3.5 h-3.5" />}
      variant="bordered"
    >
      <div className="mb-5">
        <FieldGroup label="Start from preset" htmlFor="custom-start-from">
          <Select
            id="custom-start-from"
            value={startFrom}
            onChange={(e) => {
              const v = e.target.value as ThemeName | '';
              setStartFrom(v);
              if (!v) return;
              updateSettings({ customTheme: customThemeFromPreset(v) });
              setStartFrom('');
            }}
            options={[
              { value: '', label: 'Choose a preset…' },
              ...GENERAL_THEME_OPTIONS.map((t) => ({ value: t.id, label: t.label })),
            ]}
          />
        </FieldGroup>
        <p className="text-[11px] text-zinc-500 mt-1.5">
          Custom themes support colors, border, and type — not full preset effects
          (e.g. bubble tails).
        </p>
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-3">
        Colors
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <ColorPickerField
          id="custom-text-color"
          label="Translation Text Color"
          value={customTheme.textColor}
          onChange={(v) => updateCustomTheme({ textColor: v })}
        />
        <div className="space-y-3">
          <Toggle
            id="custom-bg-fill"
            checked={!noFill}
            onChange={(filled) =>
              updateCustomTheme({
                backgroundColor: filled ? '#ffffff' : 'transparent',
              })
            }
            label="Background fill"
            description="Turn off for transparent translation background"
          />
          {!noFill ? (
            <ColorPickerField
              id="custom-bg-color"
              label="Translation Background Color"
              value={customTheme.backgroundColor}
              onChange={(v) => updateCustomTheme({ backgroundColor: v })}
            />
          ) : null}
        </div>
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-3">
        Border
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <FieldGroup label="Border Style" htmlFor="custom-border-style">
          <Select
            id="custom-border-style"
            value={customTheme.borderStyle}
            onChange={(e) =>
              updateCustomTheme({
                borderStyle: e.target.value as CustomThemeConfig['borderStyle'],
              })
            }
            options={[
              { value: 'none', label: 'None' },
              { value: 'solid', label: 'Solid' },
              { value: 'dashed', label: 'Dashed' },
              { value: 'dotted', label: 'Dotted' },
            ]}
          />
        </FieldGroup>
        <ColorPickerField
          id="custom-border-color"
          label="Border Color"
          value={customTheme.borderColor}
          onChange={(v) => updateCustomTheme({ borderColor: v })}
          disabled={borderNone}
        />
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-3">
        Type
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FieldGroup label="Font Style" htmlFor="custom-font-style">
          <Select
            id="custom-font-style"
            value={customTheme.fontStyle}
            onChange={(e) =>
              updateCustomTheme({
                fontStyle: e.target.value as CustomThemeConfig['fontStyle'],
              })
            }
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'italic', label: 'Italic' },
            ]}
          />
        </FieldGroup>
        <FieldGroup label="Font Size" htmlFor="custom-font-size">
          <Select
            id="custom-font-size"
            value={customTheme.fontSize}
            onChange={(e) =>
              updateCustomTheme({
                fontSize: e.target.value as CustomThemeConfig['fontSize'],
              })
            }
            options={[
              { value: 'smaller', label: 'Smaller (0.9em)' },
              { value: 'same', label: 'Same as original' },
              { value: 'larger', label: 'Larger (1.1em)' },
            ]}
          />
        </FieldGroup>
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
