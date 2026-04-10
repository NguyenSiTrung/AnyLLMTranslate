/**
 * GlossaryTranslatePreview — collapsible live-preview panel for the Glossary tab.
 * Lets users verify their glossary is working by translating a sample sentence
 * and highlighting any entries that were not honoured by the LLM.
 */

import { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, Languages, AlertTriangle, CheckCircle } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { checkGlossaryMismatches } from '@/lib/glossary';
import type { GlossaryEntry } from '@/types/config';
import { Button } from '@/ui/Button';

interface GlossaryTranslatePreviewProps {
  /** Callback to notify parent which entry IDs are mismatched */
  onMismatchUpdate: (mismatchedIds: Set<string>) => void;
}

export function GlossaryTranslatePreview({ onMismatchUpdate }: GlossaryTranslatePreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
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
    // Clear badges while running
    onMismatchUpdate(new Set());

    try {
      const result = await chrome.runtime.sendMessage({
        action: 'translate',
        pieces: [{ id: 'preview', text: inputText.trim() }],
        sourceLanguage,
        targetLanguage,
      }) as { success: boolean; results?: Array<{ id: string; translatedText: string }>; error?: string };

      if (!result.success || !result.results) {
        setError(result.error ?? 'Translation failed');
        return;
      }

      const translated = result.results.find((r) => r.id === 'preview')?.translatedText ?? '';
      setOutputText(translated);
      setHasRun(true);

      // Run mismatch detection
      const mismatched: GlossaryEntry[] = checkGlossaryMismatches(glossary, inputText, translated);
      onMismatchUpdate(new Set(mismatched.map((e) => e.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Translation failed');
    } finally {
      setIsTranslating(false);
    }
  }, [inputText, sourceLanguage, targetLanguage, glossary, onMismatchUpdate]);

  return (
    <div className="mt-6 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Collapsible header */}
      <button
        id="glossary-preview-toggle"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900 hover:bg-zinc-800 transition-colors text-left cursor-pointer"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          <Languages className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-zinc-200">Translate Preview</span>
          <span className="text-xs text-zinc-500">— verify your glossary is working</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-zinc-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-zinc-400" />
        )}
      </button>

      {/* Panel body */}
      {isOpen && (
        <div className="p-4 bg-zinc-950 space-y-3 animate-fade-in-up">
          <textarea
            id="glossary-preview-input"
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              // Clear results on edit
              if (hasRun) {
                setOutputText('');
                setHasRun(false);
                onMismatchUpdate(new Set());
              }
            }}
            placeholder="Type a sentence containing your glossary terms…"
            rows={3}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 resize-none transition-colors"
          />

          <Button
            id="glossary-preview-btn"
            onClick={handleTranslate}
            disabled={!inputText.trim() || isTranslating}
            icon={<Languages className="w-4 h-4" />}
          >
            {isTranslating ? 'Translating…' : 'Translate Preview'}
          </Button>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Output */}
          {outputText && (
            <div className="space-y-1">
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Translation Result</p>
              <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
                {outputText}
              </div>

              {/* Mismatch summary */}
              {hasRun && (
                <div className="flex items-center gap-1.5 text-xs mt-1">
                  {checkGlossaryMismatches(glossary, inputText, outputText).length === 0 ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">All glossary terms honoured</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-amber-400">
                        {checkGlossaryMismatches(glossary, inputText, outputText).length} term(s) not found in output — rows marked ⚠️ above
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
