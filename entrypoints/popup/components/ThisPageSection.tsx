import { FileText } from 'lucide-react';
import { Toggle as SharedToggle } from '@/ui/Toggle';
import { CategoryPicker, type CategoryPickerProps } from './CategoryPicker';
import { TYPOGRAPHY } from '../lib/typography';
import { truncateHost } from '../lib/truncateHost';

export function ThisPageSection({
  activeHostname,
  isAlwaysTranslate,
  onToggleAlwaysTranslate,
  showCategory,
  categoryProps,
  activeTabIsPdf,
  activeTabUrl,
  pdfUrlInput,
  pdfInputOpen,
  onPdfUrlInputChange,
  onTogglePdfInput,
  onOpenPdf,
  hideForUnsupported,
}: {
  activeHostname: string | null;
  isAlwaysTranslate: boolean;
  onToggleAlwaysTranslate: () => void;
  showCategory: boolean;
  categoryProps: CategoryPickerProps | null;
  activeTabIsPdf: boolean;
  activeTabUrl: string | null;
  pdfUrlInput: string;
  pdfInputOpen: boolean;
  onPdfUrlInputChange: (value: string) => void;
  onTogglePdfInput: () => void;
  onOpenPdf: (url: string) => void;
  hideForUnsupported: boolean;
}) {
  if (hideForUnsupported) return null;

  const showHost = Boolean(activeHostname);
  const showCat = showCategory && Boolean(categoryProps);
  const hostLabel = activeHostname ? truncateHost(activeHostname) : '';

  return (
    <section className="space-y-2.5 pt-1">
      <h2 className={TYPOGRAPHY.label}>This page</h2>

      {showHost && activeHostname && (
        <div title={activeHostname}>
          <SharedToggle
            checked={isAlwaysTranslate}
            onChange={onToggleAlwaysTranslate}
            label={`Always translate ${hostLabel}`}
          />
        </div>
      )}

      {showCat && categoryProps && <CategoryPicker {...categoryProps} />}

      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="flex items-center gap-2 text-xs text-zinc-300 min-w-0">
          <FileText className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <span>PDF</span>
        </span>
        {activeTabIsPdf ? (
          <button
            type="button"
            onClick={() => {
              if (activeTabUrl) onOpenPdf(activeTabUrl);
            }}
            className="text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded-lg hover:bg-zinc-800/80"
          >
            Open current PDF
          </button>
        ) : (
          <button
            type="button"
            onClick={onTogglePdfInput}
            className="text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded-lg hover:bg-zinc-800/80"
          >
            {pdfInputOpen ? 'Cancel' : 'Open PDF URL…'}
          </button>
        )}
      </div>

      {pdfInputOpen && !activeTabIsPdf && (
        <div className="flex gap-2">
          <input
            type="url"
            value={pdfUrlInput}
            onChange={(e) => onPdfUrlInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && pdfUrlInput.trim()) {
                onOpenPdf(pdfUrlInput.trim());
              }
            }}
            placeholder="https://example.com/file.pdf"
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-zinc-600"
          />
          <button
            type="button"
            onClick={() => {
              if (pdfUrlInput.trim()) onOpenPdf(pdfUrlInput.trim());
            }}
            disabled={!pdfUrlInput.trim()}
            className="text-[11px] font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            Open
          </button>
        </div>
      )}
    </section>
  );
}
