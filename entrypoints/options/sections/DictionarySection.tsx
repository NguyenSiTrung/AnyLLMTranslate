/**
 * Custom terms (Dictionary) section — glossary CRUD with import/export,
 * command bar, card rows, and verify panel.
 */

import { useState, useCallback, useRef } from 'react';
import { BookOpen } from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import { useSettingsStore } from '@/stores/settingsStore';
import type { GlossaryEntry } from '@/types/config';
import {
  parseGlossaryCSV,
  parseGlossaryJSON,
  exportGlossaryCSV,
  exportGlossaryJSON,
  findDuplicateSource,
} from '@/lib/glossary';
import { Modal } from '@/ui/Modal';
import { useToast } from '@/ui/ToastProvider';
import { DictionaryCommandBar } from '../components/DictionaryCommandBar';
import { DictionaryAddForm } from '../components/DictionaryAddForm';
import { DictionaryEmptyHero } from '../components/DictionaryEmptyHero';
import { GlossaryEntryList } from '../components/GlossaryEntryList';
import { NamedGlossaryListPanel } from '../components/NamedGlossaryListPanel';
import { GlossaryImportHint } from '../components/GlossaryImportHint';
import { GlossaryTranslatePreview } from './GlossaryTranslatePreview';

const EXAMPLE_TERMS: Omit<GlossaryEntry, 'id'>[] = [
  { source: 'React', target: 'React' },
  { source: 'API', target: 'API' },
  { source: 'machine learning', target: 'machine learning' },
];

const DUPLICATE_MSG = 'This source term already exists';

export function DictionarySection() {
  const glossary = useSettingsStore((s) => s.glossary);
  const namedGlossaryLists = useSettingsStore((s) => s.namedGlossaryLists);
  const subtitleListBySite = useSettingsStore((s) => s.subtitleListBySite);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [searchQuery, setSearchQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newSource, setNewSource] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [addError, setAddError] = useState<string | undefined>();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSource, setEditSource] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [editError, setEditError] = useState<string | undefined>();

  const [mismatchedIds, setMismatchedIds] = useState<Set<string>>(new Set());
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { success: showSuccess, error: showError } = useToast();

  const clearMismatches = useCallback(() => setMismatchedIds(new Set()), []);

  const openAdd = useCallback(() => {
    setAddOpen(true);
    setAddError(undefined);
  }, []);

  const closeAdd = useCallback(() => {
    setAddOpen(false);
    setNewSource('');
    setNewTarget('');
    setAddError(undefined);
  }, []);

  const handleAdd = useCallback(() => {
    if (!newSource.trim() || !newTarget.trim()) return;
    if (findDuplicateSource(glossary, newSource)) {
      setAddError(DUPLICATE_MSG);
      return;
    }
    const entry: GlossaryEntry = {
      id: crypto.randomUUID(),
      source: newSource.trim(),
      target: newTarget.trim(),
    };
    updateSettings({ glossary: [entry, ...glossary] });
    setNewSource('');
    setNewTarget('');
    setAddError(undefined);
    clearMismatches();
  }, [newSource, newTarget, glossary, updateSettings, clearMismatches]);

  const handleDelete = useCallback(
    (id: string) => {
      updateSettings({ glossary: glossary.filter((e) => e.id !== id) });
      clearMismatches();
      if (editingId === id) {
        setEditingId(null);
        setEditError(undefined);
      }
    },
    [glossary, updateSettings, clearMismatches, editingId],
  );

  const handleEditStart = useCallback((entry: GlossaryEntry) => {
    setEditingId(entry.id);
    setEditSource(entry.source);
    setEditTarget(entry.target);
    setEditError(undefined);
  }, []);

  const handleEditSave = useCallback(
    (id: string) => {
      if (!editSource.trim() || !editTarget.trim()) return;
      if (findDuplicateSource(glossary, editSource, id)) {
        setEditError(DUPLICATE_MSG);
        return;
      }
      updateSettings({
        glossary: glossary.map((e) =>
          e.id === id
            ? { ...e, source: editSource.trim(), target: editTarget.trim() }
            : e,
        ),
      });
      setEditingId(null);
      setEditError(undefined);
      clearMismatches();
    },
    [editSource, editTarget, glossary, updateSettings, clearMismatches],
  );

  const handleEditCancel = useCallback(() => {
    setEditingId(null);
    setEditError(undefined);
  }, []);

  const handleExport = useCallback(
    (format: 'csv' | 'json') => {
      const content =
        format === 'csv' ? exportGlossaryCSV(glossary) : exportGlossaryJSON(glossary);
      const blob = new Blob([content], {
        type: format === 'csv' ? 'text/csv' : 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `anyllm-translate-dictionary.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      showSuccess(`Terms exported as ${format.toUpperCase()}`);
    },
    [glossary, showSuccess],
  );

  const handleImportFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      try {
        const entries = file.name.endsWith('.json')
          ? parseGlossaryJSON(text)
          : parseGlossaryCSV(text);
        updateSettings({ glossary: [...glossary, ...entries] });
        showSuccess(`Imported ${entries.length} terms`);
        clearMismatches();
      } catch (error) {
        showError(
          `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
    [glossary, updateSettings, showSuccess, showError, clearMismatches],
  );

  const handleUseExamples = useCallback(() => {
    const batch: GlossaryEntry[] = EXAMPLE_TERMS.map((t) => ({
      ...t,
      id: crypto.randomUUID(),
    }));
    updateSettings({ glossary: [...batch, ...glossary] });
    showSuccess(
      `Added ${batch.length} example terms — edit or delete anytime.`,
    );
    clearMismatches();
  }, [glossary, updateSettings, showSuccess, clearMismatches]);

  const pendingEntry = pendingDeleteId
    ? glossary.find((e) => e.id === pendingDeleteId)
    : undefined;

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Custom terms"
        description="Pin exact translations for names, brands, and jargon so the model doesn’t improvise."
        icon={<BookOpen className="w-4 h-4" />}
        accentColor="emerald"
      />

      {glossary.length > 0 && (
        <p className="text-xs text-zinc-500 mb-3">
          {glossary.length} {glossary.length === 1 ? 'term' : 'terms'}
          {mismatchedIds.size > 0 && (
            <span className="text-amber-400">
              {' '}
              · {mismatchedIds.size} not honoured in last check
            </span>
          )}
          <span className="text-zinc-600">
            {' '}
            · Terms are applied on the next translation.
          </span>
        </p>
      )}

      <div
        className={`space-y-4 rounded-xl transition-colors ${
          dragOver ? 'ring-2 ring-emerald-500/40 ring-offset-2 ring-offset-zinc-950' : ''
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleImportFile(file);
        }}
      >
        <div className="animate-stagger" style={stagger(0)}>
          <DictionaryCommandBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            showSearch={glossary.length > 0}
            onAddClick={() => (addOpen ? closeAdd() : openAdd())}
            addOpen={addOpen}
            onImportClick={() => fileInputRef.current?.click()}
            onExportJson={() => handleExport('json')}
            onExportCsv={() => handleExport('csv')}
            exportDisabled={glossary.length === 0}
            termCount={glossary.length}
          />
          <div className="mt-2 px-0.5">
            <GlossaryImportHint onChooseFile={() => fileInputRef.current?.click()} />
          </div>
        </div>

        {addOpen && (
          <div className="animate-stagger" style={stagger(1)}>
            <DictionaryAddForm
              source={newSource}
              target={newTarget}
              error={addError}
              onSourceChange={(v) => {
                setNewSource(v);
                setAddError(undefined);
              }}
              onTargetChange={setNewTarget}
              onSubmit={handleAdd}
              onCancel={closeAdd}
            />
          </div>
        )}

        <div className="animate-stagger" style={stagger(2)}>
          {glossary.length === 0 ? (
            <DictionaryEmptyHero
              onAddFirst={openAdd}
              onImport={() => fileInputRef.current?.click()}
              onUseExamples={handleUseExamples}
            />
          ) : (
            <GlossaryEntryList
              entries={glossary}
              searchQuery={searchQuery}
              mismatchedIds={mismatchedIds}
              editingId={editingId}
              editSource={editSource}
              editTarget={editTarget}
              editError={editError}
              onEditSourceChange={(v) => {
                setEditSource(v);
                setEditError(undefined);
              }}
              onEditTargetChange={setEditTarget}
              onStartEdit={handleEditStart}
              onSaveEdit={handleEditSave}
              onCancelEdit={handleEditCancel}
              onRequestDelete={setPendingDeleteId}
              onClearSearch={() => setSearchQuery('')}
            />
          )}
        </div>

        {glossary.length > 0 && (
          <div className="animate-stagger" style={stagger(3)}>
            <GlossaryTranslatePreview onMismatchUpdate={setMismatchedIds} />
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.csv"
        className="hidden"
        aria-label="Import glossary terms from JSON or CSV"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImportFile(file);
          e.target.value = '';
        }}
      />

      <NamedGlossaryListPanel
        lists={namedGlossaryLists}
        bySite={subtitleListBySite}
        onUpdate={updateSettings}
        onSuccess={showSuccess}
        onError={showError}
      />

      {pendingDeleteId && pendingEntry && (
        <Modal
          title="Delete term?"
          message={`Remove “${pendingEntry.source}” → “${pendingEntry.target}”? This cannot be undone.`}
          variant="danger"
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => {
            handleDelete(pendingDeleteId);
            setPendingDeleteId(null);
          }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}
