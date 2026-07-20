import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { StatusResponse } from '@/types/messages';
import { getUnsupportedPageInfo, type UnsupportedPageInfo } from '../lib/unsupportedPage';

const IDLE_STATUS: StatusResponse = {
  status: 'idle',
  translatedCount: 0,
  totalCount: 0,
  visiblePending: 0,
  viewportComplete: true,
};

export function useTranslationToggle(deps: {
  isTranslating: boolean;
  status: StatusResponse;
  setIsTranslating: Dispatch<SetStateAction<boolean>>;
  setStatus: Dispatch<SetStateAction<StatusResponse>>;
  setUnsupportedPage: Dispatch<SetStateAction<UnsupportedPageInfo | null>>;
}) {
  const { isTranslating, status, setIsTranslating, setStatus, setUnsupportedPage } = deps;

  const handleToggleTranslation = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const unsupported = getUnsupportedPageInfo(tab);
      setUnsupportedPage(unsupported);
      if (unsupported) return;
      if (!tab?.id) return;

      if (isTranslating || status.status === 'done') {
        await chrome.tabs.sendMessage(tab.id, { action: 'stopTranslation' });
        setIsTranslating(false);
        setStatus(IDLE_STATUS);
      } else {
        await chrome.tabs.sendMessage(tab.id, { action: 'startTranslation' });
        setIsTranslating(true);
        setStatus((prev) => ({ ...prev, status: 'translating' }));
      }
    } catch (error) {
      console.error('[AnyLLMTranslate] Toggle error:', error);
      setIsTranslating(false);
      setStatus(IDLE_STATUS);
      setUnsupportedPage({
        title: "This page can't be translated",
        description:
          "The extension couldn't connect to this page. Refresh the tab or open a regular website.",
      });
    }
  }, [isTranslating, status.status, setIsTranslating, setStatus, setUnsupportedPage]);

  return { handleToggleTranslation };
}
