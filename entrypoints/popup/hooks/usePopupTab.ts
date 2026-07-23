import { useState, useEffect, useCallback, useRef } from 'react';
import type { StatusResponse, ExtensionMessage, CategoryInfo } from '@/types/messages';
import type { ExtensionSettings } from '@/types/config';
import type { ProfileKnobs } from '@/lib/subtitleProfiles';
import { getUnsupportedPageInfo, type UnsupportedPageInfo } from '../lib/unsupportedPage';
import { openOptionsWindow } from '../lib/openOptions';
import { shouldAcceptTabScopedMessage } from '../lib/shouldAcceptTabScopedMessage';

const IDLE_STATUS: StatusResponse = {
  status: 'idle',
  translatedCount: 0,
  totalCount: 0,
  visiblePending: 0,
  viewportComplete: true,
};

export function usePopupTab(
  settings: ExtensionSettings,
  updateSetting: (partial: Partial<ExtensionSettings>) => Promise<void>,
) {
  const [status, setStatus] = useState<StatusResponse>(IDLE_STATUS);
  const [isTranslating, setIsTranslating] = useState(false);
  const [activeHostname, setActiveHostname] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [categoryInfo, setCategoryInfo] = useState<CategoryInfo | null>(null);
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [tabOverrides, setTabOverrides] = useState<Partial<ProfileKnobs>>({});
  const [unsupportedPage, setUnsupportedPage] = useState<UnsupportedPageInfo | null>(null);
  const [activeTabUrl, setActiveTabUrl] = useState<string | null>(null);
  const [activeTabIsPdf, setActiveTabIsPdf] = useState(false);
  /** Ref so onMessage can filter by the tab the popup is bound to without stale closures. */
  const activeTabIdRef = useRef<number | null>(null);

  const queryTabStatus = useCallback(async (activeTab?: chrome.tabs.Tab) => {
    try {
      const tab =
        activeTab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      const unsupported = getUnsupportedPageInfo(tab);
      setUnsupportedPage(unsupported);
      if (unsupported) {
        setStatus(IDLE_STATUS);
        setIsTranslating(false);
        return;
      }

      if (tab?.id) {
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'getStatus' });
          if (response) {
            setStatus(response as StatusResponse);
            setIsTranslating(response.status === 'translating');
          }
        } catch {
          setStatus(IDLE_STATUS);
          setIsTranslating(false);
        }
      }
    } catch {
      /* tab query failed */
    }
  }, []);

  const loadTabOverrides = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      const resp = (await chrome.tabs.sendMessage(tab.id, {
        action: 'getSubtitleKnobOverride',
      })) as { knobOverrides?: Partial<ProfileKnobs> };
      setTabOverrides(resp?.knobOverrides ?? {});
    } catch {
      // content script not present
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Content scripts on *every* open tab broadcast status/category over
    // chrome.runtime. Only apply updates that originate from the tab this
    // popup instance is bound to (sender.tab.id), otherwise a translating
    // background tab overwrites the active tab's progress strip.
    const messageListener = (
      message: ExtensionMessage,
      sender: chrome.runtime.MessageSender,
    ) => {
      if (message.action === 'statusUpdate') {
        const fromTabId = sender.tab?.id ?? message.tabId;
        if (!shouldAcceptTabScopedMessage(activeTabIdRef.current, fromTabId)) {
          return;
        }
        setStatus(message.status);
        setIsTranslating(message.status.status === 'translating');
      } else if (message.action === 'pageCategoryUpdate') {
        const fromTabId = sender.tab?.id;
        if (!shouldAcceptTabScopedMessage(activeTabIdRef.current, fromTabId)) {
          return;
        }
        setCategoryInfo(message.categoryInfo);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    void (async () => {
      let tab: chrome.tabs.Tab | undefined;
      try {
        [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      } catch {
        /* tab query failed */
      }
      if (cancelled) return;

      // Bind tab id before getStatus so concurrent statusUpdate messages
      // from other tabs are rejected while this popup is open.
      const tabId = tab?.id ?? null;
      activeTabIdRef.current = tabId;
      setActiveTabId(tabId);

      void queryTabStatus(tab);

      if (tab?.url) {
        setActiveTabUrl(tab.url);
        try {
          const url = new URL(tab.url);
          if (url.protocol === 'http:' || url.protocol === 'https:') {
            setActiveHostname(url.hostname);
          } else if (url.protocol === 'chrome-extension:' && url.pathname === '/pdf-viewer.html') {
            const fileUrl = url.searchParams.get('file');
            if (fileUrl) {
              try {
                const parsed = new URL(fileUrl);
                if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                  setActiveHostname(parsed.hostname);
                }
              } catch {
                /* invalid file URL */
              }
            }
          }
        } catch {
          /* invalid URL */
        }
      }

      if (tab?.id) {
        try {
          const ct = await chrome.tabs.sendMessage(tab.id, { action: 'getPageContentType' });
          if (cancelled) return;
          if (ct?.isPdf === true) {
            setActiveTabIsPdf(true);
          } else {
            setActiveTabIsPdf(/\.pdf(?:\?|#|$)/i.test(tab.url ?? ''));
          }
        } catch {
          if (!cancelled) setActiveTabIsPdf(/\.pdf(?:\?|#|$)/i.test(tab.url ?? ''));
        }
      }

      if (tab?.id) {
        try {
          const catInfo = await chrome.tabs.sendMessage(tab.id, { action: 'getPageCategory' });
          if (cancelled) return;
          if (catInfo) setCategoryInfo(catInfo as CategoryInfo);
        } catch {
          try {
            const bgResult = await chrome.runtime.sendMessage({
              action: 'getCategoryOverride',
              tabId: tab.id,
            });
            if (cancelled) return;
            if (bgResult?.override) {
              setCategoryInfo({
                override: bgResult.override,
                effective: bgResult.override,
              });
            } else {
              const tabUrl = tab.url ?? '';
              if (tabUrl.includes('/pdf-viewer.html')) {
                setCategoryInfo({
                  autoDetected: 'document',
                  effective: 'document',
                });
              }
            }
          } catch {
            /* background unreachable */
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [queryTabStatus]);

  const handleTabKnob = useCallback(
    async (knob: keyof ProfileKnobs, value: string) => {
      let next = { ...tabOverrides };
      if (value === 'auto') {
        const { [knob]: _removed, ...rest } = next;
        next = rest;
      } else {
        (next as Record<string, string>)[knob] = value;
      }
      setTabOverrides(next);
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return;
        await chrome.tabs.sendMessage(tab.id, {
          action: 'setSubtitleKnobOverride',
          knobOverrides: Object.keys(next).length ? next : null,
        });
      } catch {
        /* content script may not be present */
      }
    },
    [tabOverrides],
  );

  const isAlwaysTranslate = activeHostname
    ? settings.siteRules.some((r) => r.hostname === activeHostname && r.alwaysTranslate)
    : false;

  const handleToggleAlwaysTranslate = useCallback(async () => {
    if (!activeHostname) return;
    const existingRuleIndex = settings.siteRules.findIndex((r) => r.hostname === activeHostname);
    const newRules = [...settings.siteRules];
    if (existingRuleIndex >= 0) {
      newRules[existingRuleIndex] = {
        ...newRules[existingRuleIndex],
        alwaysTranslate: !newRules[existingRuleIndex].alwaysTranslate,
      };
    } else {
      newRules.push({
        id: crypto.randomUUID(),
        hostname: activeHostname,
        includeSelectors: [],
        excludeSelectors: [],
        alwaysTranslate: true,
        neverTranslate: false,
        builtIn: false,
      });
    }
    await updateSetting({ siteRules: newRules });
  }, [activeHostname, settings.siteRules, updateSetting]);

  const handleCategoryChange = useCallback(async (value: string) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      if (value === '__custom__') {
        setCustomCategoryInput('');
        return;
      }

      const category = value === '__auto__' ? null : value;
      await chrome.runtime.sendMessage({
        action: 'setCategoryOverride',
        tabId: tab.id,
        category,
      });

      setCategoryInfo((prev) => ({
        ...prev,
        override: category ?? undefined,
        effective: category ?? prev?.siteRule ?? prev?.autoDetected,
      }));
    } catch {
      /* failed */
    }
  }, []);

  const handleCustomCategorySubmit = useCallback(async () => {
    const trimmed = customCategoryInput.trim().slice(0, 50);
    if (!trimmed) return;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      await chrome.runtime.sendMessage({
        action: 'setCategoryOverride',
        tabId: tab.id,
        category: trimmed,
      });
      setCategoryInfo((prev) => ({
        ...prev,
        override: trimmed,
        effective: trimmed,
      }));
      setCustomCategoryInput('');
    } catch {
      /* failed */
    }
  }, [customCategoryInput]);

  const handleSaveAsRule = useCallback(async () => {
    if (!activeHostname || !categoryInfo?.override) return;
    const existingRuleIndex = settings.siteRules.findIndex((r) => r.hostname === activeHostname);
    const newRules = [...settings.siteRules];
    if (existingRuleIndex >= 0) {
      newRules[existingRuleIndex] = {
        ...newRules[existingRuleIndex],
        category: categoryInfo.override,
      };
    } else {
      newRules.push({
        id: crypto.randomUUID(),
        hostname: activeHostname,
        includeSelectors: [],
        excludeSelectors: [],
        alwaysTranslate: false,
        neverTranslate: false,
        builtIn: false,
        category: categoryInfo.override,
      });
    }
    await updateSetting({ siteRules: newRules });

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.runtime.sendMessage({
          action: 'setCategoryOverride',
          tabId: tab.id,
          category: null,
        });
      }
    } catch {
      /* failed */
    }

    setCategoryInfo((prev) => ({
      ...prev,
      siteRule: categoryInfo.override,
      override: undefined,
      effective: categoryInfo.override,
    }));
  }, [activeHostname, categoryInfo, settings.siteRules, updateSetting]);

  const openSetupGuide = useCallback((step?: 'provider' | 'test' | 'language') => {
    const params = new URLSearchParams({ setup: '1' });
    if (step) params.set('step', step);
    openOptionsWindow(`?${params.toString()}`);
  }, []);

  const openPdfTranslator = useCallback((url: string) => {
    if (!url) return;
    chrome.runtime.sendMessage({ action: 'OPEN_PDF_VIEWER', url }).catch((err: unknown) => {
      console.error('[AnyLLMTranslate] Failed to open PDF viewer:', err);
      const viewerUrl = chrome.runtime.getURL(`pdf-viewer.html?file=${encodeURIComponent(url)}`);
      chrome.tabs.create({ url: viewerUrl });
    });
  }, []);

  return {
    status,
    setStatus,
    isTranslating,
    setIsTranslating,
    activeHostname,
    activeTabId,
    activeTabUrl,
    activeTabIsPdf,
    unsupportedPage,
    setUnsupportedPage,
    categoryInfo,
    setCategoryInfo,
    customCategoryInput,
    setCustomCategoryInput,
    tabOverrides,
    setTabOverrides,
    loadTabOverrides,
    handleCategoryChange,
    handleCustomCategorySubmit,
    handleSaveAsRule,
    handleTabKnob,
    handleToggleAlwaysTranslate,
    isAlwaysTranslate,
    openPdfTranslator,
    openSetupGuide,
  };
}
