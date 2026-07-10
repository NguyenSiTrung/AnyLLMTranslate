/**
 * GlossaryTranslatePreview — verify custom terms with a live sample translation.
 * Highlights glossary entries not honoured by the model output.
 */

import { useState, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronUp, Languages, AlertTriangle, CheckCircle } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { checkGlossaryMismatches } from '@/lib/glossary';
import type { GlossaryEntry } from '@/types/config';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Textarea } from '@/ui/Textarea';

interface GlossaryTranslatePreviewProps {
  /** Callback to notify parent which entry IDs are mismatched */
  onMismatchUpdate: (mismatchedIds: Set<string>) => void;
}

export function GlossaryTranslatePreview({ onMismatchUpdate }: GlossaryTranslatePreviewProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const glossary = useSettingsStore((s) => s.glossary);
  const sourceLanguage = useSettingsStore((s) => s.sourceLanguage ?? 'auto');
  const targetLanguage = useSettingsStore((s) => s.targetLanguage ?? 'en');

  const handleTranslate = useCallback(async () => {
    if (!inputText.trim()) return;

    setIsTranslating(true);
    setError(null);
    setOutputText('');
    onMismatchUpdate(new Set());

    try {
      const result = (await chrome.runtime.sendMessage({
        action: 'translate',
        pieces: [{ id: 'preview', text: inputText.trim() }],
        sourceLanguage,
        targetLanguage,
      })) as {
        success: boolean;
        results?: Array<{ id: string; translatedText: string }>;
        error?: string;
      };

      if (!result.success || !result.results) {
        setError(result.error ?? 'Translation failed');
        return;
      }

      const translated =
        result.results.find((r) => r.id === 'preview')?.translatedText ?? '';
      setOutputText(translated);
      setHasRun(true);

      const mismatched: GlossaryEntry[] = checkGlossaryMismatches(
        glossary,
        inputText,
        translated,
      );
      onMismatchUpdate(new Set(mismatched.map((e) => e.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Translation failed');
    } finally {
      setIsTranslating(false);
    }
  }, [inputText, sourceLanguage, targetLanguage, glossary, onMismatchUpdate]);

  const mismatches = useMemo(
    () => (hasRun && outputText ? checkGlossaryMismatches(glossary, inputText, outputText) : []),
    [glossary, inputText, outputText, hasRun],
  );

  return (
    <Card variant="bordered" className="p-0 overflow-hidden">
      <button
        id="glossary-preview-toggle"
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left cursor-pointer"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Languages className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <span className="text-sm font-medium text-zinc-200">Verify terms</span>
            <span className="text-xs text-zinc-500 ml-2 hidden sm:inline">
              Check that preferred translations show up in the output.
            </span>
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="p-4 border-t border-white/5 space-y-3 animate-fade-in-up">
          <div
            className={
              outputText || error
                ? 'grid gap-3 sm:grid-cols-2 sm:gap-4'
                : 'space-y-3'
            }
          >
            <div className="space-y-2">
              <p className="text-xs text-zinc-500 font-medium">Sample sentence</p>
              <Textarea
                id="glossary-preview-input"
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  if (hasRun) {
                    setOutputText('');
                    setHasRun(false);
                    onMismatchUpdate(new Set());
                  }
                }}
                placeholder="Type a sentence that includes your terms…"
                aria-label="Preview input text"
                rows={3}
              />
              <Button
                id="glossary-preview-btn"
                onClick={handleTranslate}
                disabled={!inputText.trim() || isTranslating}
                loading={isTranslating}
                icon={!isTranslating ? <Languages className="w-4 h-4" /> : undefined}
              >
                {isTranslating ? 'Verifying…' : 'Verify'}
              </Button>
            </div>

            {(outputText || error) && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">
                  Result
                </p>
                {error && (
                  <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                {outputText && (
                  <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 min-h-[4.5rem]">
                    {outputText}
                  </div>
                )}
                {hasRun && outputText && (
                  <div className="flex items-center gap-1.5 text-xs">
                    {mismatches.length === 0 ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">All terms honoured</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-amber-400">
                          {mismatches.length} term
                          {mismatches.length === 1 ? '' : 's'} missing from output — marked in
                          the list
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
