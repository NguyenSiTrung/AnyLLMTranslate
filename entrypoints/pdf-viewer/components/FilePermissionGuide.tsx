/**
 * FilePermissionGuide — Onboarding banner shown when the user opens a local
 * `file://` PDF without first enabling "Allow access to file URLs" in the
 * Chrome extension settings.
 *
 * Detection:
 * - `chrome.extension.isAllowedFileSchemeAccess()` is the only reliable API
 *   for checking whether the extension has access to local files.
 * - We do a one-shot check on mount; if the user updates the toggle and the
 *   viewer re-renders, the banner disappears automatically.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface FilePermissionGuideProps {
  /** When false, nothing is rendered. */
  visible: boolean;
}

export function FilePermissionGuide({ visible }: FilePermissionGuideProps): React.ReactElement | null {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  useEffect(() => {
    if (!visible) return;
    // The API is only available in MV3 Chrome — Firefox returns undefined.
    const ext = chrome.extension as { isAllowedFileSchemeAccess?: () => Promise<boolean> } | undefined;
    if (typeof ext?.isAllowedFileSchemeAccess === 'function') {
      ext.isAllowedFileSchemeAccess().then(setHasAccess).catch(() => setHasAccess(null));
    } else {
      // Firefox or no API — assume the worst, but don't show a false positive
      setHasAccess(null);
    }
  }, [visible]);

  if (!visible) return null;
  if (hasAccess !== false) return null;

  return (
    <div className="pdf-viewer-banner" role="status">
      <AlertTriangle className="pdf-viewer-banner-icon" size={16} />
      <div className="pdf-viewer-banner-content">
        <p className="pdf-viewer-banner-title">Local file access is disabled</p>
        <p className="pdf-viewer-banner-desc">
          To open local PDFs, enable &quot;Allow access to file URLs&quot; for this extension at{' '}
          <code>chrome://extensions</code> &rarr; AnyLLMTranslate &rarr; toggle &quot;Allow access to file URLs&quot;.
          Then refresh this page.
        </p>
      </div>
    </div>
  );
}
