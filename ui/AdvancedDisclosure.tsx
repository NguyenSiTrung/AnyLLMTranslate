/**
 * AdvancedDisclosure — a chevron button + collapsible region (FR-5).
 *
 * Used to tuck infrequently-changed controls (e.g. Temperature / Max Tokens)
 * behind a progressive disclosure so the primary configuration path stays
 * short. Purely presentational — values persist regardless of expanded state.
 *
 * Accessibility: the trigger carries `aria-expanded` + `aria-controls`, and
 * the region has `role="region"` + `aria-labelledby`, mirroring the existing
 * provider-card accordion pattern (NFR-3).
 */

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface AdvancedDisclosureProps {
  /** Label on the trigger button, e.g. "Advanced settings". */
  label: string;
  /** Initial expanded state. Defaults to collapsed. */
  defaultExpanded?: boolean;
  /** Controls inside the region. */
  children: ReactNode;
  /** Optional id prefix to keep aria ids stable across renders; one is
   *  generated from the label when omitted. */
  idPrefix?: string;
}

export function AdvancedDisclosure({
  label,
  defaultExpanded = false,
  children,
  idPrefix,
}: AdvancedDisclosureProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const baseId = idPrefix ?? `disc-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const buttonId = `${baseId}-btn`;
  const regionId = `${baseId}-region`;

  return (
    <div className="space-y-3">
      <button
        type="button"
        id={buttonId}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={regionId}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
        {label}
      </button>
      {expanded && (
        <div
          id={regionId}
          role="region"
          aria-labelledby={buttonId}
        >
          {children}
        </div>
      )}
    </div>
  );
}
