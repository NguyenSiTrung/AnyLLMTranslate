/**
 * Glossary import format hint — collapsed line + expandable guide + templates.
 * Used on Custom terms and Named lists (same JSON/CSV shapes).
 */

import { useId, useState } from 'react';
import { ChevronDown, ChevronRight, FileJson, FileText, Upload } from 'lucide-react';
import {
  GLOSSARY_CSV_TEMPLATE,
  GLOSSARY_JSON_TEMPLATE,
  downloadGlossaryTemplate,
} from '@/lib/glossaryImportTemplates';
import { Button } from '@/ui/Button';

export interface GlossaryImportHintProps {
  className?: string;
  /** When set, show a "Choose file…" control that opens the existing file input. */
  onChooseFile?: () => void;
  /** Default collapsed. */
  defaultExpanded?: boolean;
}

export function GlossaryImportHint({
  className = '',
  onChooseFile,
  defaultExpanded = false,
}: GlossaryImportHintProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const panelId = useId();

  return (
    <div className={`text-xs text-zinc-500 ${className}`.trim()}>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span>
          Supports <span className="font-medium text-zinc-400">JSON</span> or{' '}
          <span className="font-medium text-zinc-400">CSV</span>
        </span>
        <span className="text-zinc-600" aria-hidden="true">
          ·
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-0.5 text-zinc-400 hover:text-zinc-200 cursor-pointer underline-offset-2 hover:underline"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3" aria-hidden="true" />
          ) : (
            <ChevronRight className="w-3 h-3" aria-hidden="true" />
          )}
          See format
        </button>
      </div>

      {expanded && (
        <div
          id={panelId}
          role="region"
          aria-label="Glossary import format"
          className="mt-2 rounded-lg border border-dashed border-zinc-700/80 bg-zinc-900/40 px-3 py-2.5 space-y-3"
        >
          <div>
            <p className="font-medium text-zinc-400 mb-1">Supported files</p>
            <ul className="list-disc list-inside space-y-0.5 text-zinc-500">
              <li>
                <code className="text-zinc-400">.json</code> — array of{' '}
                <code className="text-zinc-400">{'{ source, target }'}</code> objects
              </li>
              <li>
                <code className="text-zinc-400">.csv</code> — two columns; header optional but
                recommended
              </li>
            </ul>
          </div>

          <div>
            <p className="font-medium text-zinc-400 mb-1">JSON example</p>
            <pre className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950/60 p-2 font-mono text-[11px] leading-relaxed text-zinc-300 whitespace-pre">
              {GLOSSARY_JSON_TEMPLATE.trimEnd()}
            </pre>
          </div>

          <div>
            <p className="font-medium text-zinc-400 mb-1">CSV example</p>
            <pre className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950/60 p-2 font-mono text-[11px] leading-relaxed text-zinc-300 whitespace-pre">
              {GLOSSARY_CSV_TEMPLATE.trimEnd()}
            </pre>
          </div>

          <div>
            <p className="font-medium text-zinc-400 mb-1">Rules</p>
            <ul className="list-disc list-inside space-y-0.5 text-zinc-500">
              <li>
                Required fields: <code className="text-zinc-400">source</code> and{' '}
                <code className="text-zinc-400">target</code> (strings)
              </li>
              <li>
                CSV header <code className="text-zinc-400">source,target</code> is optional; skipped
                when present
              </li>
              <li>Import appends terms — it does not replace the whole list</li>
              <li>Invalid files show an error toast; fix the file and try again</li>
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<FileJson className="w-3.5 h-3.5" />}
              onClick={() => downloadGlossaryTemplate('json')}
            >
              Download JSON template
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<FileText className="w-3.5 h-3.5" />}
              onClick={() => downloadGlossaryTemplate('csv')}
            >
              Download CSV template
            </Button>
            {onChooseFile && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={<Upload className="w-3.5 h-3.5" />}
                onClick={onChooseFile}
              >
                Choose file…
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
