/**
 * Theme Studio live canvas — article mock with real inject.css themes.
 */

import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Eye } from 'lucide-react';
import type {
  CustomThemeConfig,
  DarkMode,
  DisplayMode,
  ThemeName,
  TranslationPosition,
} from '@/types/config';
import { DEFAULT_CUSTOM_THEME } from '@/types/config';
import { Card } from '@/ui/Card';
import { SegmentedControl } from '@/ui/SegmentedControl';

export type CanvasPageMode = 'light' | 'dark' | 'match';

export interface ThemeStudioCanvasProps {
  theme: ThemeName;
  isPreviewing?: boolean;
  committedThemeLabel?: string;
  previewThemeLabel?: string;
  tip?: string;
  displayMode: DisplayMode;
  translationPosition: TranslationPosition;
  darkModeSetting: DarkMode;
  customTheme?: CustomThemeConfig;
  showSampleStates: boolean;
  onShowSampleStatesChange: (value: boolean) => void;
  canvasMode: CanvasPageMode;
  onCanvasModeChange: (mode: CanvasPageMode) => void;
}

const SAMPLE = {
  title: 'How AI reshapes language',
  byline: 'Demo article · not a real page',
  original:
    'Artificial intelligence is reshaping how we communicate across languages and cultures.',
  translation:
    'Trí tuệ nhân tạo đang định hình lại cách chúng ta giao tiếp giữa các ngôn ngữ và nền văn hóa.',
  listOriginal: 'Privacy stays on your device by default.',
  listTranslation: 'Quyền riêng tư mặc định ở trên thiết bị của bạn.',
  inlineOriginal: 'Settings',
  inlineTranslation: 'Cài đặt',
};

export function resolveCanvasDark(
  canvasMode: CanvasPageMode,
  darkModeSetting: DarkMode,
): boolean {
  if (canvasMode === 'light') return false;
  if (canvasMode === 'dark') return true;
  if (darkModeSetting === 'light') return false;
  if (darkModeSetting === 'dark') return true;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return false;
}

function BilingualBlock({
  original,
  translation,
  position,
  isDark,
  asListItem = false,
}: {
  original: string;
  translation: string;
  position: TranslationPosition;
  isDark: boolean;
  asListItem?: boolean;
}) {
  const originalEl = (
    <div
      data-anyllm-role="original"
      className={`text-sm leading-relaxed ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}
    >
      {original}
    </div>
  );
  const translationEl = (
    <div
      data-anyllm-role="translation"
      lang="vi"
      dir="auto"
      className="anyllm-translate-translation text-sm leading-relaxed"
    >
      {translation}
    </div>
  );

  const content =
    position === 'above' ? (
      <>
        {translationEl}
        {originalEl}
      </>
    ) : (
      <>
        {originalEl}
        {translationEl}
      </>
    );

  if (asListItem) {
    return <li className="space-y-1">{content}</li>;
  }

  return <div className="space-y-2">{content}</div>;
}

export function ThemeStudioCanvas({
  theme,
  isPreviewing = false,
  committedThemeLabel,
  previewThemeLabel,
  tip,
  displayMode,
  translationPosition,
  darkModeSetting,
  customTheme,
  showSampleStates,
  onShowSampleStatesChange,
  canvasMode,
  onCanvasModeChange,
}: ThemeStudioCanvasProps) {
  const isDark = resolveCanvasDark(canvasMode, darkModeSetting);
  const pageState = displayMode === 'translation-only' ? 'translation-only' : 'dual';
  const position = translationPosition ?? 'below';

  const customPreviewStyle = useMemo(() => {
    if (theme !== 'custom') return undefined;
    const config = customTheme ?? DEFAULT_CUSTOM_THEME;
    const fontSizeMap = { smaller: '0.9em', same: 'inherit', larger: '1.1em' } as const;
    return {
      '--anyllm-custom-text-color': config.textColor,
      '--anyllm-custom-bg-color': config.backgroundColor,
      '--anyllm-custom-border-style': config.borderStyle,
      '--anyllm-custom-border-color': config.borderColor,
      '--anyllm-custom-font-style': config.fontStyle,
      '--anyllm-custom-font-size': fontSizeMap[config.fontSize],
    } as CSSProperties;
  }, [theme, customTheme]);

  const displayLabel = isPreviewing
    ? (previewThemeLabel ?? theme)
    : (committedThemeLabel ?? theme);

  return (
    <Card title="Live preview" icon={<Eye className="w-3.5 h-3.5" />} variant="bordered">
      <SegmentedControl
        id="theme-studio-canvas-mode"
        label="Canvas page mode"
        size="sm"
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
          { value: 'match', label: 'Match' },
        ]}
        value={canvasMode}
        onChange={onCanvasModeChange}
      />

      <div className="mt-3 mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-zinc-200">{displayLabel}</span>
        {isPreviewing ? (
          <span className="text-[10px] uppercase tracking-wider text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5">
            Previewing
          </span>
        ) : null}
      </div>
      {tip ? <p className="text-xs text-zinc-500 mb-3">{tip}</p> : null}

      <div
        className={`rounded-xl border overflow-hidden ${
          isDark ? 'border-zinc-700' : 'border-zinc-200'
        }`}
      >
        <div
          className={`px-3 py-1.5 text-[10px] flex items-center gap-2 ${
            isDark ? 'bg-zinc-900 text-zinc-500' : 'bg-zinc-100 text-zinc-500'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-zinc-600" aria-hidden />
          <span>example.com</span>
          <span className="opacity-50">·</span>
          <span>Article</span>
        </div>

        <div
          className={`theme-preview-container p-5 transition-colors duration-200 ${
            isDark ? 'anyllm-dark bg-zinc-950' : 'bg-[#fafafa]'
          }`}
          data-anyllm-theme={theme}
          data-anyllm-state={pageState}
          data-anyllm-position={position}
          style={customPreviewStyle}
        >
          <h1
            className={`text-lg font-semibold mb-1 ${
              isDark ? 'text-zinc-100' : 'text-zinc-900'
            }`}
          >
            {SAMPLE.title}
          </h1>
          <p className={`text-[11px] mb-4 ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
            {SAMPLE.byline}
          </p>

          <BilingualBlock
            original={SAMPLE.original}
            translation={SAMPLE.translation}
            position={position}
            isDark={isDark}
          />

          <ul className="mt-4 list-disc pl-5">
            <BilingualBlock
              original={SAMPLE.listOriginal}
              translation={SAMPLE.listTranslation}
              position={position}
              isDark={isDark}
              asListItem
            />
          </ul>

          <div
            className={`mt-4 text-sm leading-relaxed ${
              isDark ? 'text-zinc-300' : 'text-zinc-700'
            }`}
            data-anyllm-preview-section="inline"
          >
            <span data-anyllm-role="original">{SAMPLE.inlineOriginal}</span>
            <span
              className="anyllm-inline-bilingual"
              lang="vi"
              dir="auto"
              data-anyllm-role="translation"
            >
              {pageState === 'translation-only'
                ? SAMPLE.inlineTranslation
                : ` (${SAMPLE.inlineTranslation})`}
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="mt-3 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        onClick={() => onShowSampleStatesChange(!showSampleStates)}
        aria-expanded={showSampleStates}
      >
        {showSampleStates ? 'Hide sample states' : 'Show sample states'}
      </button>

      {showSampleStates ? (
        <div
          className={`mt-2 theme-preview-container rounded-lg p-3 border border-zinc-700/40 ${
            isDark ? 'anyllm-dark bg-zinc-950' : 'bg-white'
          }`}
          data-anyllm-theme={theme}
          data-anyllm-state={pageState}
          data-anyllm-preview-section="states"
          style={customPreviewStyle}
        >
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">
            Sample states
          </p>
          <div className="flex flex-col gap-1">
            <span
              className="anyllm-translate-translation anyllm-translate-loading text-sm"
              role="status"
              aria-label="Translating"
            />
            <span
              className="anyllm-translate-translation text-sm"
              data-anyllm-error=""
              role="alert"
            >
              ⚠ Translation failed: example error
            </span>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
