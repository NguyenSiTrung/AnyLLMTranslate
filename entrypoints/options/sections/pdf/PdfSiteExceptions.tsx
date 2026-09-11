/**
 * PdfSiteExceptions — chip editor for `pdfSettings.neverAutoOpenSites`.
 * Replaces the comma-separated text field: draft input never mutates
 * persisted settings; only valid, non-duplicate hostnames are committed.
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { addPdfSiteException, normalizePdfSiteException } from '@/lib/pdfSiteExceptions';
import { Button } from '@/ui/Button';
import { FieldGroup } from '@/ui/FieldGroup';
import { Input } from '@/ui/Input';

interface PdfSiteExceptionsProps {
  value: string[];
  disabled?: boolean;
  onChange: (value: string[]) => void;
}

export function PdfSiteExceptions({
  value,
  disabled = false,
  onChange,
}: PdfSiteExceptionsProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const add = () => {
    const normalized = normalizePdfSiteException(draft);
    if (!normalized) {
      setError('Enter a valid HTTP(S) hostname or URL');
      return;
    }
    const next = addPdfSiteException(value, normalized);
    if (next !== value) onChange(next);
    setDraft('');
    setError('');
  };

  return (
    <FieldGroup
      label="Never open automatically on"
      description="These sites keep the built-in PDF viewer; auto-open stays suppressed even when enabled above."
      htmlFor="pdf-site-exception"
    >
      <div className="flex gap-2">
        <Input
          id="pdf-site-exception"
          type="text"
          aria-label="Site to exclude"
          value={draft}
          disabled={disabled}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
          error={error}
          placeholder="example.com"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={add}
          disabled={disabled || !draft.trim()}
        >
          Add site
        </Button>
      </div>
      {value.length > 0 && (
        <div aria-label="Excluded PDF sites" className="mt-3 flex flex-wrap gap-2">
          {value.map((host) => (
            <button
              key={host}
              type="button"
              disabled={disabled}
              aria-label={`Remove ${host}`}
              onClick={() => onChange(value.filter((item) => item !== host))}
              className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-200/90 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {host}
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </FieldGroup>
  );
}
