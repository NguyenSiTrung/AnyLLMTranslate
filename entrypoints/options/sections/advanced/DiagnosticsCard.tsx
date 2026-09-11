/**
 * DiagnosticsCard — debug logging toggle, extracted from the monolithic
 * AdvancedSection Developer card.
 */

import { Bug } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { Card } from '@/ui/Card';
import { Badge } from '@/ui/Badge';
import { Toggle } from '@/ui/Toggle';

export function DiagnosticsCard() {
  const debugMode = useSettingsStore((state) => state.debugMode);
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  return (
    <Card
      variant="bordered"
      title="Diagnostics"
      description="Logging for troubleshooting page and translation problems."
      icon={<Bug className="w-3.5 h-3.5" />}
      headerExtra={debugMode ? <Badge variant="warning">Logging on</Badge> : undefined}
    >
      <Toggle
        id="debug-mode-toggle"
        checked={debugMode}
        onChange={(next) => updateSettings({ debugMode: next })}
        label="Debug logging"
        description="Writes verbose background and page logs to browser Developer Tools. It can be noisy; turn it off after troubleshooting."
      />
    </Card>
  );
}
