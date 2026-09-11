/**
 * PdfOpenBehavior — PDF auto-open mode, tab target, and per-site exceptions.
 * Patches whole `pdfSettings` objects; unrelated fields are always preserved.
 */

import type { PdfSettings } from '@/types/config';
import { FieldGroup } from '@/ui/FieldGroup';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { PdfSiteExceptions } from './PdfSiteExceptions';

interface PdfOpenBehaviorProps {
  value: PdfSettings;
  onChange: (value: PdfSettings) => void;
}

const AUTO_OPEN_OPTIONS = [
  { value: 'off', label: 'Manual' },
  { value: 'prompt', label: 'Prompt' },
  { value: 'auto', label: 'Automatic' },
] as const;

const OPEN_MODE_OPTIONS = [
  { value: 'new-tab', label: 'New tab' },
  { value: 'same-tab', label: 'Same tab' },
] as const;

export function PdfOpenBehavior({ value, onChange }: PdfOpenBehaviorProps) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">Open behavior</h3>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">
        Choose what happens when you open a PDF in the browser.
      </p>

      <div className="mt-4 space-y-4">
        <FieldGroup
          label="When a PDF opens"
          description="Manual keeps the built-in viewer; Prompt asks each time; Automatic routes every PDF to the translator."
        >
          <SegmentedControl<PdfSettings['autoOpen']>
            options={[...AUTO_OPEN_OPTIONS]}
            value={value.autoOpen}
            onChange={(autoOpen) => onChange({ ...value, autoOpen })}
            label="PDF auto-open mode"
          />
        </FieldGroup>

        <FieldGroup label="Open translator in">
          <SegmentedControl<PdfSettings['openMode']>
            options={[...OPEN_MODE_OPTIONS]}
            value={value.openMode}
            onChange={(openMode) => onChange({ ...value, openMode })}
            label="PDF translator tab mode"
          />
        </FieldGroup>

        {value.autoOpen !== 'off' && (
          <PdfSiteExceptions
            value={value.neverAutoOpenSites}
            onChange={(neverAutoOpenSites) =>
              onChange({ ...value, neverAutoOpenSites })
            }
          />
        )}
      </div>
    </div>
  );
}
