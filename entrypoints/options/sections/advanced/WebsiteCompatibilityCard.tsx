/**
 * WebsiteCompatibilityCard — page-walk scope controls extracted from the
 * monolithic AdvancedSection. A named preset is the primary control; the
 * low-level toggles live behind a disclosure with outcome-oriented labels.
 */

import { Globe } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  applyPageScopePreset,
  detectPageScopePreset,
  PAGE_SCOPE_PRESET_OPTIONS,
  type PageScopePreset,
} from '@/lib/pageScopePreset';
import { Card } from '@/ui/Card';
import { Badge } from '@/ui/Badge';
import { Toggle } from '@/ui/Toggle';
import { Select } from '@/ui/Select';
import { FieldGroup } from '@/ui/FieldGroup';
import { AdvancedDisclosure } from '@/ui/AdvancedDisclosure';

export function WebsiteCompatibilityCard() {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const detected = detectPageScopePreset({
    enableStreamingTranslation: settings.enableStreamingTranslation,
    enableAsideCaps: settings.enableAsideCaps,
    enableBodyTagWhitelist: settings.enableBodyTagWhitelist,
    enableSmartExcludes: settings.enableSmartExcludes,
  });
  const presetDescription =
    detected === 'custom'
      ? 'Individual toggles below don’t match a named preset.'
      : (PAGE_SCOPE_PRESET_OPTIONS.find((o) => o.value === detected)?.description ?? '');

  return (
    <Card
      variant="bordered"
      title="Website compatibility"
      description="What parts of a page are eligible for translation."
      icon={<Globe className="w-3.5 h-3.5" />}
      headerExtra={
        detected === 'balanced' ? <Badge variant="success">Recommended</Badge> : undefined
      }
    >
      <div className="space-y-4">
        <FieldGroup
          label="Page coverage preset"
          description="Quick profiles for page walking and streaming. Classic restores pre-v3 defaults."
          htmlFor="page-scope-preset"
        >
          <Select
            id="page-scope-preset"
            value={detected === 'custom' ? 'custom' : detected}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'custom') return;
              updateSettings(applyPageScopePreset(val as PageScopePreset));
            }}
            options={[
              ...PAGE_SCOPE_PRESET_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              })),
              { value: 'custom', label: 'Custom (mixed)' },
            ]}
          />
        </FieldGroup>
        <p className="text-[11px] text-zinc-500 -mt-2 mb-1 leading-relaxed">
          {presetDescription}
        </p>

        <AdvancedDisclosure
          label="Individual compatibility controls"
          idPrefix="advanced-compatibility-controls"
        >
          <div className="space-y-4">
            <Toggle
              id="body-tag-whitelist-toggle"
              checked={settings.enableBodyTagWhitelist}
              onChange={(checked) => updateSettings({ enableBodyTagWhitelist: checked })}
              label="Focus on main page content"
              description="Only translate direct body children that are MAIN, ARTICLE, SECTION, or DIV — skips nav, aside, header, footer."
            />
            <Toggle
              id="aside-caps-toggle"
              checked={settings.enableAsideCaps}
              onChange={(checked) => updateSettings({ enableAsideCaps: checked })}
              label="Limit sidebar translation"
              description="Skip long sidebar/aside paragraphs and cap each region at 1000 characters. On by default (Balanced); Classic turns this off."
            />
            <Toggle
              id="cache-key-model-toggle"
              checked={settings.cacheKeyIncludesModel}
              onChange={(checked) => updateSettings({ cacheKeyIncludesModel: checked })}
              label="Keep cache separate by model"
              description="Include the active model in the cache key so switching models does not reuse prior translations. Off by default."
            />
            <Toggle
              id="quality-check-toggle"
              checked={settings.enableTranslationQualityCheck}
              onChange={(checked) =>
                updateSettings({ enableTranslationQualityCheck: checked })
              }
              label="Retry obvious translation mistakes"
              description="After a batch, re-prompt once if the model echoes the source or drops rich-translate tags. Off by default."
            />
            <Toggle
              id="layout-containment-toggle"
              checked={settings.enableLayoutContainment}
              onChange={(checked) => updateSettings({ enableLayoutContainment: checked })}
              label="Protect card and grid layouts"
              description="Safer insertion for flex/grid cards (may slightly alter host layout). Off by default."
            />
            <Toggle
              id="shadow-dom-walk-toggle"
              checked={settings.enableShadowDomWalk}
              onChange={(checked) => updateSettings({ enableShadowDomWalk: checked })}
              label="Translate text inside web components"
              description="Extract text from open shadow roots. Off by default."
            />
          </div>
        </AdvancedDisclosure>
      </div>
    </Card>
  );
}
