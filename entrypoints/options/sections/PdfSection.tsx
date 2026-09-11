/**
 * PDF settings tab — open behavior + Scientific-PDF bridge promoted from
 * Advanced to a first-class Media tab. Status-first: the readiness panel is
 * the primary surface; setup, troubleshooting, and usage details are
 * progressively disclosed.
 */

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { AdvancedDisclosure } from '@/ui/AdvancedDisclosure';
import { Button } from '@/ui/Button';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  DEFAULT_PDF_SETTINGS,
  DEFAULT_SCIENTIFIC_PDF_SETTINGS,
} from '@/types/config';
import {
  SCIENTIFIC_PDF_SETUP_GUIDE_URL,
  mergeScientificPdfSettings,
} from '@/lib/scientificPdf';
import { ScientificPdfWizard } from '@/entrypoints/options/components/ScientificPdfWizard';
import { usePdfBridgeStatus } from './pdf/usePdfBridgeStatus';
import { PdfStatusPanel } from './pdf/PdfStatusPanel';
import { PdfOpenBehavior } from './pdf/PdfOpenBehavior';
import { PdfBridgeSettings } from './pdf/PdfBridgeSettings';

export function PdfSection() {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const pdfSettings = settings.pdfSettings ?? DEFAULT_PDF_SETTINGS;
  const scientificPdf = mergeScientificPdfSettings(
    settings.scientificPdf ?? DEFAULT_SCIENTIFIC_PDF_SETTINGS,
  );

  const { status, checking, error, refresh } = usePdfBridgeStatus(scientificPdf);
  const [showWizard, setShowWizard] = useState(false);
  const [usageExpanded, setUsageExpanded] = useState(false);

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="PDF"
        description="Translate PDFs with the layout preserved, through a local translation bridge on your machine."
        icon={<FileText className="h-4 w-4" />}
        accentColor="cyan"
      />

      <div className="space-y-4">
        <PdfStatusPanel
          status={status}
          checking={checking}
          error={error}
          onSetup={() => setShowWizard(true)}
          onRefresh={() => void refresh()}
          onShowUsage={() => setUsageExpanded(true)}
        />

        <AdvancedDisclosure
          label="How to translate a PDF"
          idPrefix="pdf-usage"
          expanded={usageExpanded}
          onExpandedChange={setUsageExpanded}
        >
          <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-zinc-400">
            <li>Open a PDF in the browser.</li>
            <li>
              AnyLLMTranslate sends it to the local translation bridge (pdf2zh).
            </li>
            <li>The translated document opens in the built-in viewer with the layout preserved.</li>
          </ol>
        </AdvancedDisclosure>

        <PdfOpenBehavior
          value={pdfSettings}
          onChange={(next) => updateSettings({ pdfSettings: next })}
        />

        <PdfBridgeSettings
          value={scientificPdf}
          checking={checking}
          onChange={(next) => updateSettings({ scientificPdf: next })}
          onSetup={() => setShowWizard(true)}
          onRefresh={() => void refresh()}
        />

        <AdvancedDisclosure label="Troubleshooting" idPrefix="pdf-troubleshooting">
          <div className="space-y-3">
            {error && (
              <p className="text-xs text-red-400" role="status">
                {error}
              </p>
            )}
            <p className="text-xs leading-relaxed text-zinc-500">
              Current status: {status === 'ready' ? 'Ready' : status === 'offline' ? 'Bridge offline' : 'Not configured'}
              {checking ? ' (checking…)' : ''}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void refresh()}
                disabled={checking}
              >
                Refresh status
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  try {
                    chrome.tabs.create({ url: SCIENTIFIC_PDF_SETUP_GUIDE_URL });
                  } catch {
                    window.open(SCIENTIFIC_PDF_SETUP_GUIDE_URL, '_blank', 'noreferrer');
                  }
                }}
              >
                Setup guide
              </Button>
            </div>
          </div>
        </AdvancedDisclosure>
      </div>

      <ScientificPdfWizard
        open={showWizard}
        onClose={() => {
          setShowWizard(false);
          void refresh();
        }}
      />
    </div>
  );
}
