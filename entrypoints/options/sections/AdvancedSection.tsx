/**
 * Advanced Settings Section — composition layer. Feature workflows live in
 * sections/advanced/*; this file owns section navigation anchors, the reset
 * confirmation flow, and the Danger Zone (full reset only).
 */

import { useState, type ReactNode } from 'react';
import { RotateCcw, ShieldAlert, Wrench } from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { DangerZone, DangerAction } from '@/ui/DangerZone';
import { useToast } from '@/ui/ToastProvider';
import {
  ADVANCED_SECTION_IDS,
  scrollToAdvancedSection,
  type AdvancedSectionId,
} from '@/entrypoints/options/lib/scrollToAdvancedSection';
import { AdvancedSectionNav } from './advanced/AdvancedSectionNav';
import { TranslationEngineCard } from './advanced/TranslationEngineCard';
import { PerformanceCard } from './advanced/PerformanceCard';
import { WebsiteCompatibilityCard } from './advanced/WebsiteCompatibilityCard';
import { DataRecoveryCard } from './advanced/DataRecoveryCard';
import { DiagnosticsCard } from './advanced/DiagnosticsCard';

const SECTION_ANCHOR_CLASS =
  'animate-stagger scroll-mt-4 rounded-xl outline-none data-[advanced-section-highlight=true]:ring-2 data-[advanced-section-highlight=true]:ring-cyan-500/40 data-[advanced-section-highlight=true]:ring-offset-2 data-[advanced-section-highlight=true]:ring-offset-zinc-950';

function AdvancedAnchor({
  id,
  index,
  children,
}: {
  id: AdvancedSectionId;
  index: number;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      tabIndex={-1}
      className={SECTION_ANCHOR_CLASS}
      style={stagger(index)}
    >
      {children}
    </div>
  );
}

export function AdvancedSection() {
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);
  const [showResetModal, setShowResetModal] = useState(false);
  const { success: showSuccess } = useToast();

  const handleReset = () => {
    resetToDefaults();
    setShowResetModal(false);
    showSuccess('All settings reset to defaults');
  };

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Advanced"
        description="Expert translation behavior, performance, compatibility, and recovery."
        icon={<Wrench className="w-4 h-4" />}
        accentColor="zinc"
      />

      <AdvancedSectionNav />

      <div className="space-y-4">
        <AdvancedAnchor id={ADVANCED_SECTION_IDS.translation} index={0}>
          <TranslationEngineCard />
        </AdvancedAnchor>
        <AdvancedAnchor id={ADVANCED_SECTION_IDS.performance} index={1}>
          <PerformanceCard />
        </AdvancedAnchor>
        <AdvancedAnchor id={ADVANCED_SECTION_IDS.compatibility} index={2}>
          <WebsiteCompatibilityCard />
        </AdvancedAnchor>
        <AdvancedAnchor id={ADVANCED_SECTION_IDS.data} index={3}>
          <DataRecoveryCard />
        </AdvancedAnchor>
        <AdvancedAnchor id={ADVANCED_SECTION_IDS.diagnostics} index={4}>
          <DiagnosticsCard />
        </AdvancedAnchor>

        {/* Danger Zone — only the irreversible full reset lives here.
            Clear cache moved to Performance; it is recoverable maintenance. */}
        <div className="animate-stagger" style={stagger(5)}>
          <DangerZone description="Irreversible actions. Export a backup first if you plan to reset.">
            <DangerAction
              severity="critical"
              icon={<ShieldAlert />}
              title="Reset all settings"
              description="Restores factory defaults. Provider keys, dictionary, site rules, themes, and prompts are wiped. Cannot be undone."
              meta={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => scrollToAdvancedSection(ADVANCED_SECTION_IDS.data)}
                >
                  Export backup first
                </Button>
              }
              action={
                <Button
                  id="reset-all-settings-btn"
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowResetModal(true)}
                  icon={<RotateCcw className="w-3.5 h-3.5" />}
                >
                  Reset everything
                </Button>
              }
            />
          </DangerZone>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <Modal
          title="Reset all settings?"
          message={
            <div className="space-y-3">
              <p>Everything returns to factory defaults. This cannot be undone.</p>
              <ul className="space-y-1.5 rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2.5 text-xs text-zinc-400">
                <li className="flex gap-2">
                  <span className="text-rose-400">•</span>
                  Provider API keys and endpoints
                </li>
                <li className="flex gap-2">
                  <span className="text-rose-400">•</span>
                  Custom dictionary and site rules
                </li>
                <li className="flex gap-2">
                  <span className="text-rose-400">•</span>
                  Themes, prompts, and performance tuning
                </li>
              </ul>
              <p className="text-xs text-amber-300/80">
                Export a backup from Data and recovery first if you might need these later.
              </p>
            </div>
          }
          variant="danger"
          confirmLabel="Reset everything"
          cancelLabel="Keep settings"
          onConfirm={handleReset}
          onCancel={() => setShowResetModal(false)}
        />
      )}
    </div>
  );
}
