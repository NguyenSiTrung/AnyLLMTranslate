/**
 * Right-pane panel for bridge-only PDF translation.
 * Explains status and guides the user to set up / connect the Docker bridge
 * when PDF translate is unavailable.
 */

import type { ReactElement } from 'react';
import { FlaskConical, ServerCrash, Settings2, RefreshCw } from 'lucide-react';
import type { ScientificPdfStatus } from '@/lib/scientificPdf';

export interface BridgeStatusPanelProps {
  status: ScientificPdfStatus;
  healthOk: boolean | null;
  isRunning: boolean;
  onRefresh: () => void;
  onOpenSetup: () => void;
  onTranslate: () => void;
}

function statusCopy(
  status: ScientificPdfStatus,
  healthOk: boolean | null,
): { title: string; body: string; available: boolean; checking: boolean } {
  if (healthOk === true || status === 'ready') {
    return {
      title: 'Bridge ready',
      body: 'Layout-preserving PDF translation runs through your local Docker bridge (pdf2zh). Click Translate to start a job. Results are downloaded as mono / dual PDFs.',
      available: true,
      checking: false,
    };
  }
  if (healthOk === null) {
    return {
      title: 'Checking bridge…',
      body: 'Verifying the local Docker bridge connection. PDF Translate stays disabled until the bridge is Ready.',
      available: false,
      checking: true,
    };
  }
  if (status === 'not_configured') {
    return {
      title: 'PDF Translate not available',
      body: 'PDF translation requires the local Docker bridge. Set up the bridge once, then connect it here. In-browser Fast translation has been removed.',
      available: false,
      checking: false,
    };
  }
  return {
    title: 'PDF Translate not available',
    body: 'The Docker bridge is offline or unreachable. Start the bridge container, then check the connection. Translation stays disabled until the bridge is Ready.',
    available: false,
    checking: false,
  };
}

export function BridgeStatusPanel({
  status,
  healthOk,
  isRunning,
  onRefresh,
  onOpenSetup,
  onTranslate,
}: BridgeStatusPanelProps): ReactElement {
  const copy = statusCopy(status, healthOk);

  return (
    <div className="pdf-bridge-panel" role="region" aria-label="PDF bridge status">
      <div className={`pdf-bridge-panel-icon ${copy.available ? 'pdf-bridge-panel-icon--ok' : 'pdf-bridge-panel-icon--warn'}`}>
        {copy.available ? <FlaskConical size={28} /> : <ServerCrash size={28} />}
      </div>
      <h2 className="pdf-bridge-panel-title">{copy.title}</h2>
      <p className="pdf-bridge-panel-body">{copy.body}</p>

      {!copy.available && !copy.checking && (
        <ol className="pdf-bridge-panel-steps">
          <li>Install Docker Desktop (or Docker Engine).</li>
          <li>
            From the repo root run{' '}
            <code>./scripts/scientific-pdf-docker.sh up</code>
          </li>
          <li>Open Options → Advanced → Scientific PDF → Set up… and check health.</li>
          <li>Return here and click Check connection.</li>
        </ol>
      )}

      <div className="pdf-bridge-panel-actions">
        {copy.available ? (
          <button
            type="button"
            className="pdf-download-btn pdf-download-btn--primary"
            onClick={onTranslate}
            disabled={isRunning}
          >
            <FlaskConical size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            {isRunning ? 'Translating…' : 'Translate'}
          </button>
        ) : (
          <button
            type="button"
            className="pdf-download-btn pdf-download-btn--primary"
            onClick={onOpenSetup}
          >
            <Settings2 size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Set up / connect bridge
          </button>
        )}
        <button
          type="button"
          className="pdf-download-btn pdf-download-btn--secondary"
          onClick={onRefresh}
          disabled={isRunning}
        >
          <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          {copy.checking ? 'Checking…' : 'Check connection'}
        </button>
      </div>

      <p className="pdf-bridge-panel-hint">
        Default bridge URL: <code>http://127.0.0.1:17890</code>. Uses your active provider pool —
        no second API key.
      </p>
    </div>
  );
}
