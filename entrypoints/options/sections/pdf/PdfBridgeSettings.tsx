/**
 * PdfBridgeSettings — local pdf2zh bridge controls: enable toggle, server
 * URL, loopback warning, and setup/refresh/guide actions. Patches complete
 * `scientificPdf` objects; unrelated fields are preserved.
 */

import { ExternalLink } from 'lucide-react';
import {
  SCIENTIFIC_PDF_SETUP_GUIDE_URL,
  shouldWarnNonLoopbackServerUrl,
} from '@/lib/scientificPdf';
import { DEFAULT_SCIENTIFIC_PDF_SETTINGS, type ScientificPdfSettings } from '@/types/config';
import { Button } from '@/ui/Button';
import { FieldGroup } from '@/ui/FieldGroup';
import { Input } from '@/ui/Input';
import { Toggle } from '@/ui/Toggle';

interface PdfBridgeSettingsProps {
  value: ScientificPdfSettings;
  checking: boolean;
  onChange: (value: ScientificPdfSettings) => void;
  onSetup: () => void;
  onRefresh: () => void;
}

export function PdfBridgeSettings({
  value,
  checking,
  onChange,
  onSetup,
  onRefresh,
}: PdfBridgeSettingsProps) {
  const nonLoopback = shouldWarnNonLoopbackServerUrl(value.serverUrl);

  const openGuide = () => {
    try {
      chrome.tabs.create({ url: SCIENTIFIC_PDF_SETUP_GUIDE_URL });
    } catch {
      window.open(SCIENTIFIC_PDF_SETUP_GUIDE_URL, '_blank', 'noreferrer');
    }
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">Local bridge</h3>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">
        PDF translation runs only via a local Docker bridge (pdf2zh). When the
        bridge is offline, PDF Translate shows as unavailable in the viewer.
      </p>

      <div className="mt-4 grid gap-4">
        <Toggle
          checked={value.enabled}
          onChange={(checked) => onChange({ ...value, enabled: checked })}
          label="Enable PDF bridge"
          description="Required for PDF Translate. Uses the same provider pool as normal page translation. There is no in-browser Fast PDF path."
        />

        <FieldGroup
          label="Bridge server URL"
          description="Default is loopback. Credentials and the full PDF are sent here only for PDF translate jobs."
          htmlFor="scientific-pdf-server-url"
        >
          <Input
            id="scientific-pdf-server-url"
            type="text"
            value={value.serverUrl}
            onChange={(e) => onChange({ ...value, serverUrl: e.target.value })}
            placeholder={DEFAULT_SCIENTIFIC_PDF_SETTINGS.serverUrl}
          />
        </FieldGroup>

        {nonLoopback && (
          <p className="text-xs text-rose-300" role="status">
            Warning: server URL is not loopback. You may send PDFs and API keys to
            a remote host — only continue if you trust it.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onSetup}>
            Set up…
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={checking}
          >
            Refresh status
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={openGuide}
            icon={<ExternalLink className="w-3.5 h-3.5" />}
          >
            Setup guide
          </Button>
        </div>

        <p className="text-[11px] leading-relaxed text-zinc-500">
          Privacy: Scientific mode sends the full PDF plus short-lived provider
          credentials to the configured server URL. Prefer{' '}
          <code className="rounded bg-zinc-800 px-1">http://127.0.0.1</code> only.
          No second API key store — the active pool is used per job.
        </p>
      </div>
    </div>
  );
}
