/**
 * Custom Dictionary Section — glossary CRUD with import/export and inline editing.
 * Header uses inline SectionHeader pattern (consistent with GeneralSection).
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { Plus, Trash2, FileJson, FileText, Upload, BookOpen, AlertTriangle, PenLine, ArrowLeftRight, Search, Check, X } from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import { useSettingsStore } from '@/stores/settingsStore';
import type { GlossaryEntry } from '@/types/config';
import {
  parseGlossaryCSV,
  parseGlossaryJSON,
  exportGlossaryCSV,
  exportGlossaryJSON,
} from '@/lib/glossary';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { Modal } from '@/ui/Modal';
import { EmptyState } from '@/ui/EmptyState';
import { useToast } from '@/ui/ToastProvider';
import { GlossaryTranslatePreview } from './GlossaryTranslatePreview';

export function DictionarySection() {
  const glossary = useSettingsStore((s) => s.glossary);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [newSource, setNewSource] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSource, setEditSource] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [mismatchedIds, setMismatchedIds] = useState<Set<string>>(new Set());
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { success: showSuccess, error: showError } = useToast();

  const filteredGlossary = useMemo(() => {
    if (!searchQuery.trim()) return glossary;
    const q = searchQuery.toLowerCase();
    return glossary.filter(
      (e) => e.source.toLowerCase().includes(q) || e.target.toLowerCase().includes(q),
    );
  }, [glossary, searchQuery]);

  const clearMismatches = useCallback(() => setMismatchedIds(new Set()), []);

  const handleAdd = useCallback(() => {
    if (!newSource.trim() || !newTarget.trim()) return;
    const entry: GlossaryEntry = {
      id: crypto.randomUUID(),
      source: newSource.trim(),
      target: newTarget.trim(),
    };
    updateSettings({ glossary: [...glossary, entry] });
    setNewSource('');
    setNewTarget('');
    clearMismatches();
  }, [newSource, newTarget, glossary, updateSettings, clearMismatches]);

  const handleDelete = useCallback((id: string) => {
    updateSettings({ glossary: glossary.filter((e) => e.id !== id) });
    clearMismatches();
  }, [glossary, updateSettings, clearMismatches]);

  const handleEditStart = useCallback((entry: GlossaryEntry) => {
    setEditingId(entry.id);
    setEditSource(entry.source);
    setEditTarget(entry.target);
  }, []);

  const handleEditSave = useCallback((id: string) => {
    if (!editSource.trim() || !editTarget.trim()) return;
    updateSettings({
      glossary: glossary.map((e) =>
        e.id === id ? { ...e, source: editSource.trim(), target: editTarget.trim() } : e,
      ),
    });
    setEditingId(null);
    clearMismatches();
  }, [editSource, editTarget, glossary, updateSettings, clearMismatches]);

  const handleExport = useCallback((format: 'csv' | 'json') => {
    const content = format === 'csv' ? exportGlossaryCSV(glossary) : exportGlossaryJSON(glossary);
    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anyllm-translate-dictionary.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess(`Dictionary exported as ${format.toUpperCase()}`);
  }, [glossary, showSuccess]);

  const handleImport = useCallback(async (file: File) => {
    const text = await file.text();
    try {
      const entries = file.name.endsWith('.json')
        ? parseGlossaryJSON(text)
        : parseGlossaryCSV(text);
      updateSettings({ glossary: [...glossary, ...entries] });
      showSuccess(`Imported ${entries.length} dictionary entries`);
    } catch (error) {
      showError(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [glossary, updateSettings, showSuccess, showError]);

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Custom Dictionary"
        description="Define term-specific translations injected into the system prompt."
        icon={<BookOpen className="w-4 h-4" />}
        accentColor="emerald"
      />

      <div className="space-y-4">
        {/* Add Entry */}
        <div className="animate-stagger" style={stagger(0)}>
          <Card title="Add Entry" icon={<PenLine className="w-3.5 h-3.5" />} variant="bordered">
            <div className="flex gap-2">
              <Input
                id="dict-source"
                type="text"
                placeholder="Source term"
                aria-label="Source term"
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <Input
                id="dict-target"
                type="text"
                placeholder="Translation"
                aria-label="Translation"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <Button
                id="dict-add-btn"
                onClick={handleAdd}
                disabled={!newSource.trim() || !newTarget.trim()}
                icon={<Plus className="w-4 h-4" />}
              >
                Add
              </Button>
            </div>
          </Card>
        </div>

        {/* Import/Export */}
        <div className="animate-stagger" style={stagger(1)}>
          <Card title="Import / Export" icon={<ArrowLeftRight className="w-3.5 h-3.5" />} variant="bordered">
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleExport('json')}
                disabled={glossary.length === 0}
                icon={<FileJson className="w-3.5 h-3.5" />}
              >
                Export JSON
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleExport('csv')}
                disabled={glossary.length === 0}
                icon={<FileText className="w-3.5 h-3.5" />}
              >
                Export CSV
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                icon={<Upload className="w-3.5 h-3.5" />}
              >
                Import
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImport(file);
                  e.target.value = '';
                }}
              />
            </div>
          </Card>
        </div>

        {/* Entries Table */}
        <div className="animate-stagger" style={stagger(2)}>
          {glossary.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="w-8 h-8" />}
              message="No dictionary entries. Add terms above or import from a file."
            />
          ) : (
            <Card variant="bordered" className="p-0 overflow-hidden">
              {/* Search filter — inside card header */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900/40 border-b border-zinc-800">
                <div className="flex-1">
                  <Input
                    id="dict-search"
                    type="search"
                    placeholder="Search entries..."
                    aria-label="Search dictionary entries"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    icon={<Search className="w-4 h-4" />}
                  />
                </div>
              </div>
              <table className="w-full text-sm" aria-label="Custom dictionary entries">
                <thead>
                  <tr className="bg-zinc-900/80">
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">Source</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">Translation</th>
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {filteredGlossary.map((entry) => (
                    <tr
                      key={entry.id}
                      className="group hover:bg-zinc-800/50 transition-colors"
                    >
                      {editingId === entry.id ? (
                        <>
                          <td className="px-4 py-1.5">
                            <Input
                              type="text"
                              value={editSource}
                              onChange={(e) => setEditSource(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleEditSave(entry.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              autoFocus
                              aria-label="Edit source term"
                            />
                          </td>
                          <td className="px-4 py-1.5">
                            <Input
                              type="text"
                              value={editTarget}
                              onChange={(e) => setEditTarget(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleEditSave(entry.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              aria-label="Edit translation"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1">
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleEditSave(entry.id)}
                                icon={<Check className="w-3.5 h-3.5" />}
                                aria-label="Save edit"
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingId(null)}
                                icon={<X className="w-3.5 h-3.5" />}
                                aria-label="Cancel edit"
                              />
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td
                            className="px-4 py-2.5 text-zinc-200 cursor-pointer hover:text-blue-400 transition-colors"
                            onClick={() => handleEditStart(entry)}
                          >
                            <span className="flex items-center gap-1.5">
                              {mismatchedIds.has(entry.id) && (
                                <AlertTriangle
                                  className="w-3.5 h-3.5 text-amber-400 flex-shrink-0"
                                  aria-label="Glossary mismatch detected"
                                />
                              )}
                              {entry.source}
                            </span>
                          </td>
                          <td
                            className="px-4 py-2.5 text-zinc-300 cursor-pointer hover:text-blue-400 transition-colors"
                            onClick={() => handleEditStart(entry)}
                          >
                            <span className="flex items-center gap-1.5">
                              {entry.target}
                              <PenLine className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </span>
                          </td>
                          <td className="px-2 py-2.5">
                            <button
                              onClick={() => setPendingDeleteId(entry.id)}
                              className="p-1 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                              aria-label={`Delete ${entry.source}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2.5 bg-zinc-900/60 text-xs text-zinc-500 border-t border-zinc-800">
                {searchQuery.trim()
                  ? `Showing ${filteredGlossary.length} of ${glossary.length} ${glossary.length === 1 ? 'entry' : 'entries'}`
                  : `${glossary.length} ${glossary.length === 1 ? 'entry' : 'entries'}`}
              </div>
            </Card>
          )}
        </div>

        {/* Live translate preview panel */}
        <GlossaryTranslatePreview onMismatchUpdate={setMismatchedIds} />
      </div>

      {pendingDeleteId && (
        <Modal
          title="Delete Dictionary Entry?"
          message={`Are you sure you want to delete "${glossary.find(e => e.id === pendingDeleteId)?.source ?? ''}"? This cannot be undone.`}
          variant="danger"
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => { handleDelete(pendingDeleteId); setPendingDeleteId(null); }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}
