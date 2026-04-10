/**
 * Custom Dictionary Section — glossary CRUD with import/export and inline editing.
 * Refactored with shared components and Toast.
 */

import { useState, useCallback, useRef } from 'react';
import { Plus, Trash2, FileJson, FileText, Upload, BookOpen } from 'lucide-react';
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
import { EmptyState } from '@/ui/EmptyState';
import { useToast } from '@/ui/ToastProvider';

export function DictionarySection() {
  const glossary = useSettingsStore((s) => s.glossary);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [newSource, setNewSource] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSource, setEditSource] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { success: showSuccess, error: showError } = useToast();

  const handleAdd = useCallback(() => {
    if (!newSource.trim() || !newTarget.trim()) return;
    const entry: GlossaryEntry = {
      id: `entry-${Date.now()}`,
      source: newSource.trim(),
      target: newTarget.trim(),
    };
    updateSettings({ glossary: [...glossary, entry] });
    setNewSource('');
    setNewTarget('');
  }, [newSource, newTarget, glossary, updateSettings]);

  const handleDelete = useCallback((id: string) => {
    updateSettings({ glossary: glossary.filter((e) => e.id !== id) });
  }, [glossary, updateSettings]);

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
  }, [editSource, editTarget, glossary, updateSettings]);

  const handleExport = useCallback((format: 'csv' | 'json') => {
    const content = format === 'csv' ? exportGlossaryCSV(glossary) : exportGlossaryJSON(glossary);
    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lingua-lens-dictionary.${format}`;
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
      {/* Section header */}
      <Card accent="blue" className="mb-8">
        <div className="flex items-center gap-3">
          <BookOpen className="w-5 h-5 text-blue-400" />
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Custom Dictionary</h2>
            <p className="text-xs text-zinc-500">Define term-specific translations injected into the system prompt.</p>
          </div>
        </div>
      </Card>

      {/* Add Entry */}
      <div className="flex gap-2 mb-4">
        <Input
          id="dict-source"
          type="text"
          placeholder="Source term"
          value={newSource}
          onChange={(e) => setNewSource(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <Input
          id="dict-target"
          type="text"
          placeholder="Translation"
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

      {/* Import/Export */}
      <div className="flex gap-2 mb-4">
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

      {/* Entries Table */}
      {glossary.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="w-8 h-8" />}
          message="No dictionary entries. Add terms above or import from a file."
        />
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-900">
                <th className="text-left px-4 py-2 text-zinc-400 font-medium">Source</th>
                <th className="text-left px-4 py-2 text-zinc-400 font-medium">Translation</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {glossary.map((entry, idx) => (
                <tr
                  key={entry.id}
                  className="border-t border-zinc-800 hover:bg-zinc-800/50 animate-stagger"
                  style={{ '--stagger-delay': idx } as React.CSSProperties}
                >
                  {editingId === entry.id ? (
                    <>
                      <td className="px-4 py-1.5">
                        <input
                          value={editSource}
                          onChange={(e) => setEditSource(e.target.value)}
                          onBlur={() => handleEditSave(entry.id)}
                          onKeyDown={(e) => e.key === 'Enter' && handleEditSave(entry.id)}
                          autoFocus
                          className="w-full bg-zinc-800 border border-blue-500/50 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none"
                        />
                      </td>
                      <td className="px-4 py-1.5">
                        <input
                          value={editTarget}
                          onChange={(e) => setEditTarget(e.target.value)}
                          onBlur={() => handleEditSave(entry.id)}
                          onKeyDown={(e) => e.key === 'Enter' && handleEditSave(entry.id)}
                          className="w-full bg-zinc-800 border border-blue-500/50 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none"
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td
                        className="px-4 py-2 text-zinc-200 cursor-pointer hover:text-blue-400 transition-colors"
                        onClick={() => handleEditStart(entry)}
                      >
                        {entry.source}
                      </td>
                      <td
                        className="px-4 py-2 text-zinc-300 cursor-pointer hover:text-blue-400 transition-colors"
                        onClick={() => handleEditStart(entry)}
                      >
                        {entry.target}
                      </td>
                    </>
                  )}
                  <td className="px-2 py-2">
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="p-1 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                      aria-label={`Delete ${entry.source}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 bg-zinc-900 text-xs text-zinc-500 border-t border-zinc-800">
            {glossary.length} {glossary.length === 1 ? 'entry' : 'entries'}
          </div>
        </div>
      )}
    </div>
  );
}
