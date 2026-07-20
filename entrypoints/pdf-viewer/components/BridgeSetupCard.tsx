/**
 * Offline / not-configured setup card for bridge-only PDF translation.
 * Shown as an overlay or inline block — never as a permanent half-pane.
 */

import type { ReactElement } from 'react';
import { ServerCrash, Settings2, RefreshCw } from 'lucide-react';
import type { ScientificPdfStatus } from '@/lib/scientificPdf';

export interface BridgeSetupCardProps {
  status: ScientificPdfStatus;
  /** When true, render as floating overlay card; when false, plain centered block */
  variant?: 'overlay' | 'inline';
  onRefresh: () => void;
  onOpenSetup: () => void;
  onDismiss?: () => void;
}

function setupCopy(status: ScientificPdfStatus): { title: string; body: string } {
  if (status === 'not_configured') {
    return {
      title: 'PDF Translate not available',
      body: 'PDF translation needs the local Docker bridge. Set it up once in Options, then return here.',
    };
  }
  return {
    title: 'PDF Translate not available',
    body: 'The Docker bridge is offline or unreachable. Start the bridge, then check the connection.',
  };
}

export function BridgeSetupCard({
  status,
  variant = 'inline',
  onRefresh,
  onOpenSetup,
  onDismiss,
}: BridgeSetupCardProps): ReactElement {
  const copy = setupCopy(status);
  const rootClass =
    variant === 'overlay'
      ? 'pdf-bridge-setup-card pdf-bridge-setup-card--overlay'
      : 'pdf-bridge-setup-card';

  return (
    <div className={rootClass} role="region" aria-label="Bridge setup">
      <div className="pdf-bridge-panel-icon pdf-bridge-panel-icon--warn">
        <ServerCrash size={28} />
      </div>
      <h2 className="pdf-bridge-panel-title">{copy.title}</h2>
      <p className="pdf-bridge-panel-body">{copy.body}</p>

      <ol className="pdf-bridge-panel-steps">
        <li>Install Docker Desktop (or Docker Engine).</li>
        <li>
          From the repo root run <code>./scripts/scientific-pdf-docker.sh up</code>
        </li>
        <li>Open Options → Advanced → Scientific PDF → Set up… and check health.</li>
        <li>Return here and click Check connection.</li>
      </ol>

      <div className="pdf-bridge-panel-actions">
        <button
          type="button"
          className="pdf-download-btn pdf-download-btn--primary"
          onClick={onOpenSetup}
        >
          <Settings2 size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Set up / connect bridge
        </button>
        <button
          type="button"
          className="pdf-download-btn pdf-download-btn--secondary"
          onClick={onRefresh}
        >
          <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Check connection
        </button>
        {onDismiss && (
          <button
            type="button"
            className="pdf-download-btn pdf-download-btn--secondary"
            onClick={onDismiss}
          >
            Not now
          </button>
        )}
      </div>

      <p className="pdf-bridge-panel-hint">
        Default bridge URL: <code>http://127.0.0.1:17890</code>. Uses your active provider pool —
        no second API key.
      </p>
    </div>
  );
}
