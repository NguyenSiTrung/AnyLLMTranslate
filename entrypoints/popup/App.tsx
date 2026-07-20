import { useState, useEffect } from 'react';
import { PROVIDER_PRESETS } from '@/types/config';
import type { ThemeName, DisplayMode } from '@/types/config';
import { LANGUAGES } from '@/lib/languages';
import { PREDEFINED_CATEGORIES } from '@/lib/categories';
import { getPoolReadinessStatus, getPoolRecoveryMessage } from '@/lib/providerReadiness';
import {
  formatProgressDetail,
  formatProgressLabel,
  isReadingAreaReady,
} from '@/lib/webTranslateStatus';
import { derivePopupStatus } from './lib/derivePopupStatus';
import { openOptionsWindow } from './lib/openOptions';
import { usePopupSettings } from './hooks/usePopupSettings';
import { usePopupTab } from './hooks/usePopupTab';
import { useTranslationToggle } from './hooks/useTranslationToggle';
import { PopupHeader } from './components/PopupHeader';
import { LanguageBar } from './components/LanguageBar';
import { ActionZone } from './components/ActionZone';
import { ThisPageSection } from './components/ThisPageSection';
import { QuickSettings } from './components/QuickSettings';
import { PopupFooter } from './components/PopupFooter';

export default function App() {
  const { settings, updateSetting, updateSubtitleSetting } = usePopupSettings();
  const tab = usePopupTab(settings, updateSetting);
  const { handleToggleTranslation } = useTranslationToggle({
    isTranslating: tab.isTranslating,
    status: tab.status,
    setIsTranslating: tab.setIsTranslating,
    setStatus: tab.setStatus,
    setUnsupportedPage: tab.setUnsupportedPage,
  });

  const [quickSettingsExpanded, setQuickSettingsExpanded] = useState(false);
  const [styleExpanded, setStyleExpanded] = useState(false);
  const [pdfUrlInput, setPdfUrlInput] = useState('');
  const [pdfInputOpen, setPdfInputOpen] = useState(false);

  useEffect(() => {
    if (!styleExpanded) return;
    void tab.loadTabOverrides();
  }, [styleExpanded, tab.loadTabOverrides]);

  const readingAreaReady = isReadingAreaReady({
    status: tab.status.status,
    translatedCount: tab.status.translatedCount,
    totalCount: tab.status.totalCount,
    visiblePending: tab.status.visiblePending ?? 0,
    viewportComplete: tab.status.viewportComplete ?? tab.status.status === 'done',
  });

  const progressLabel = formatProgressLabel(
    {
      status: tab.status.status,
      translatedCount: tab.status.translatedCount,
      totalCount: tab.status.totalCount,
      viewportComplete: tab.status.viewportComplete ?? tab.status.status === 'done',
    },
    tab.status.error,
  );
  const progressDetail = formatProgressDetail({
    status: tab.status.status,
    translatedCount: tab.status.translatedCount,
    totalCount: tab.status.totalCount,
    visiblePending: tab.status.visiblePending ?? 0,
    viewportComplete: tab.status.viewportComplete ?? tab.status.status === 'done',
  });

  const providerPreset = PROVIDER_PRESETS.find((p) => p.preset === settings.provider.preset);
  const activePoolProvider = settings.providers?.find((p) => p.enabled) ?? settings.providers?.[0];
  const activeModel = activePoolProvider?.model || settings.provider.model;
  const activeDisplayName =
    activePoolProvider?.displayName || providerPreset?.displayName || settings.provider.displayName;
  const connectionStatus = settings.provider.connectionStatus ?? 'unknown';

  const providerReadiness = getPoolReadinessStatus(settings);
  const providerRecoveryMessage = getPoolRecoveryMessage(providerReadiness);
  const shouldShowProviderRecovery = !providerReadiness.canTranslate && !tab.unsupportedPage;

  const sourceLanguages = LANGUAGES;
  const targetLanguages = LANGUAGES.filter((l) => l.code !== 'auto');
  const isActive = tab.isTranslating || tab.status.status === 'done';
  const progressPercent =
    tab.status.totalCount > 0
      ? Math.round((tab.status.translatedCount / tab.status.totalCount) * 100)
      : 0;

  const showCategoryDropdown = settings.enableContextAwareTranslation && Boolean(tab.activeHostname);
  const currentCategoryValue =
    tab.categoryInfo?.override ?? tab.categoryInfo?.siteRule ?? '__auto__';
  const isCustomEntry =
    currentCategoryValue !== '__auto__' &&
    !PREDEFINED_CATEGORIES.includes(
      currentCategoryValue as (typeof PREDEFINED_CATEGORIES)[number],
    );
  const detectedCategoryDisplay = tab.categoryInfo?.autoDetected;
  const showSaveAsRule = Boolean(tab.categoryInfo?.override && tab.activeHostname);

  const popupStatus = derivePopupStatus({
    status: tab.status.status,
    isTranslating: tab.isTranslating,
    hasError: Boolean(tab.status.error),
    unsupported: Boolean(tab.unsupportedPage),
    needsSetup: shouldShowProviderRecovery,
    readingAreaReady,
  });

  const handleOpenPdf = (url: string) => {
    tab.openPdfTranslator(url);
    setPdfUrlInput('');
    setPdfInputOpen(false);
  };

  return (
    <div className="w-[340px] bg-zinc-950 text-zinc-100 font-sans selection:bg-blue-500/30 relative shadow-2xl flex flex-col min-h-0">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-20 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <PopupHeader
        chipLabel={popupStatus.chipLabel}
        kind={popupStatus.kind}
        isTranslating={tab.isTranslating}
        onOpenSettings={() => openOptionsWindow()}
      />

      <div className="px-4 py-3 space-y-3 relative flex-1 overflow-y-auto">
        <LanguageBar
          sourceLanguage={settings.sourceLanguage}
          targetLanguage={settings.targetLanguage}
          sourceOptions={sourceLanguages.map((l) => ({ value: l.code, label: l.nativeName }))}
          targetOptions={targetLanguages.map((l) => ({ value: l.code, label: l.nativeName }))}
          onSourceChange={(val) => void updateSetting({ sourceLanguage: val })}
          onTargetChange={(val) => void updateSetting({ targetLanguage: val })}
          onSwap={() => {
            if (settings.sourceLanguage !== 'auto' && settings.targetLanguage !== 'auto') {
              void updateSetting({
                sourceLanguage: settings.targetLanguage,
                targetLanguage: settings.sourceLanguage,
              });
            }
          }}
        />

        <ActionZone
          kind={popupStatus.kind}
          onTranslateToggle={() => void handleToggleTranslation()}
          progressLabel={progressLabel}
          progressDetail={progressDetail}
          progressPercent={progressPercent}
          error={tab.status.error}
          showProgress={popupStatus.showProgress || Boolean(tab.status.error)}
          isActive={isActive}
          unsupported={tab.unsupportedPage}
          recovery={
            shouldShowProviderRecovery
              ? {
                  title: providerRecoveryMessage.title,
                  description: providerRecoveryMessage.description,
                  action: providerRecoveryMessage.action,
                  canTest: providerReadiness.canTest,
                  onSetup: () =>
                    tab.openSetupGuide(settings.onboarding.skipped ? undefined : 'provider'),
                  onTest: () => tab.openSetupGuide('test'),
                  setupLabel: settings.onboarding.skipped ? 'Resume setup' : 'Set up provider',
                }
              : undefined
          }
        />

        <ThisPageSection
          activeHostname={tab.activeHostname}
          isAlwaysTranslate={tab.isAlwaysTranslate}
          onToggleAlwaysTranslate={() => void tab.handleToggleAlwaysTranslate()}
          showCategory={Boolean(showCategoryDropdown)}
          categoryProps={
            showCategoryDropdown
              ? {
                  currentValue: currentCategoryValue,
                  isCustomEntry,
                  detectedCategory: detectedCategoryDisplay,
                  customCategoryInput: tab.customCategoryInput,
                  onCategoryChange: (v) => void tab.handleCategoryChange(v),
                  onCustomInputChange: tab.setCustomCategoryInput,
                  onCustomSubmit: () => void tab.handleCustomCategorySubmit(),
                  showSaveAsRule,
                  onSaveAsRule: () => void tab.handleSaveAsRule(),
                  activeHostname: tab.activeHostname,
                }
              : null
          }
          activeTabIsPdf={tab.activeTabIsPdf}
          activeTabUrl={tab.activeTabUrl}
          pdfUrlInput={pdfUrlInput}
          pdfInputOpen={pdfInputOpen}
          onPdfUrlInputChange={setPdfUrlInput}
          onTogglePdfInput={() => setPdfInputOpen((o) => !o)}
          onOpenPdf={handleOpenPdf}
          hideForUnsupported={Boolean(tab.unsupportedPage)}
        />

        <QuickSettings
          expanded={quickSettingsExpanded}
          onToggle={() => setQuickSettingsExpanded((v) => !v)}
          theme={settings.theme}
          onThemeChange={(t: ThemeName) => void updateSetting({ theme: t })}
          displayMode={settings.displayMode}
          onDisplayModeChange={(m: DisplayMode) => void updateSetting({ displayMode: m })}
          subtitlesEnabled={settings.subtitleSettings.enabled}
          onSubtitlesToggle={() =>
            void updateSubtitleSetting({ enabled: !settings.subtitleSettings.enabled })
          }
          styleExpanded={styleExpanded}
          onStyleToggle={() => setStyleExpanded((v) => !v)}
          tabOverrides={tab.tabOverrides}
          onTabKnob={(knob, value) => void tab.handleTabKnob(knob, value)}
          onOpenMoreSettings={() => openOptionsWindow()}
        />
      </div>

      <PopupFooter
        displayName={activeDisplayName}
        model={activeModel}
        connectionStatus={connectionStatus}
        onOpenSettings={() => openOptionsWindow()}
      />
    </div>
  );
}
