/**
 * PdfStatusPanel — status-first readiness panel for the PDF tab. Exactly one
 * primary action per state; secondary actions live in Troubleshooting.
 */

import { Loader2 } from 'lucide-react';
import type { ScientificPdfStatus } from '@/lib/scientificPdf';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';

interface PdfStatusPanelProps {
  status: ScientificPdfStatus;
  checking: boolean;
  error: string | null;
  onSetup: () => void;
  onRefresh: () => void;
  onShowUsage: () => void;
}

const STATE_META: Record<
  ScientificPdfStatus,
  { badge: string; variant: 'warning' | 'danger' | 'success'; description: string }
> = {
  not_configured: {
    badge: 'Not configured',
    variant: 'warning',
    description:
      'PDF translation needs the local translation bridge. Run the guided setup once, then open any PDF to translate it with the layout preserved.',
  },
  offline: {
    badge: 'Bridge offline',
    variant: 'danger',
    description:
      'The bridge is configured but not responding. Start the local service, then check the connection again.',
  },
  ready: {
    badge: 'Ready',
    variant: 'success',
    description:
      'The local bridge is running. Open a PDF in the browser to translate it, or use auto-open below to route PDFs automatically.',
  },
};

export function PdfStatusPanel({
  status,
  checking,
  error,
  onSetup,
  onRefresh,
  onShowUsage,
}: PdfStatusPanelProps) {
  const meta = STATE_META[status];

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-100">PDF translation</h3>
            <Badge variant={meta.variant}>{meta.badge}</Badge>
            {checking && (
              <Loader2
                className="h-3.5 w-3.5 animate-spin text-zinc-500"
                aria-label="Checking bridge status"
              />
            )}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
            {meta.description}
          </p>
          {error && (
            <p className="mt-2 text-xs text-red-400" role="status">
              {error}
            </p>
          )}
        </div>
        <div className="shrink-0">
          {status === 'not_configured' && (
            <Button type="button" variant="primary" size="sm" onClick={onSetup}>
              Set up PDF translation
            </Button>
          )}
          {status === 'offline' && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onRefresh}
              disabled={checking}
            >
              Check connection
            </Button>
          )}
          {status === 'ready' && (
            <Button type="button" variant="secondary" size="sm" onClick={onShowUsage}>
              How to translate a PDF
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
