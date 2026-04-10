/**
 * Custom Dictionary Section — glossary CRUD with import/export.
 */

import { useState, useCallback, useRef } from 'react';
import { Plus, Trash2, Download, Upload, FileJson, FileText } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import type { GlossaryEntry } from '@/types/config';
import {
  parseGlossaryCSV,
  parseGlossaryJSON,
  exportGlossaryCSV,
  exportGlossaryJSON,
} from '@/lib/glossary';

export function DictionarySection() {
  const glossary = useSettingsStore((s) => s.glossary);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [newSource, setNewSource] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleExport = useCallback((format: 'csv' | 'json') => {
    const content = format === 'csv' ? exportGlossaryCSV(glossary) : exportGlossaryJSON(glossary);
    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lingua-lens-dictionary.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [glossary]);

  const handleImport = useCallback(async (file: File) => {
    const text = await file.text();
    try {
      const entries = file.name.endsWith('.json')
        ? parseGlossaryJSON(text)
        : parseGlossaryCSV(text);
      updateSettings({ glossary: [...glossary, ...entries] });
    } catch (error) {
      alert(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [glossary, updateSettings]);

  return (
    <div>
      <h2 className="text-xl font-semibold text-zinc-100 mb-1">Custom Dictionary</h2>
      <p className="text-sm text-zinc-500 mb-6">Define term-specific translations. These are injected into the system prompt to ensure consistent translation.</p>

      {/* Add Entry */}
      <div className="flex gap-2 mb-4">
        <input
          id="dict-source"
          type="text"
          placeholder="Source term"
          value={newSource}
          onChange={(e) => setNewSource(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
        <input
          id="dict-target"
          type="text"
          placeholder="Translation"
          value={newTarget}
          onChange={(e) => setNewTarget(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
        <button
          id="dict-add-btn"
          onClick={handleAdd}
          disabled={!newSource.trim() || !newTarget.trim()}
          className="flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {/* Import/Export */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => handleExport('json')}
          disabled={glossary.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 rounded-lg transition-colors"
        >
          <FileJson className="w-3.5 h-3.5" /> Export JSON
        </button>
        <button
          onClick={() => handleExport('csv')}
          disabled={glossary.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 rounded-lg transition-colors"
        >
          <FileText className="w-3.5 h-3.5" /> Export CSV
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
        >
          <Upload className="w-3.5 h-3.5" /> Import
        </button>
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
        <div className="text-center py-12 text-zinc-500 text-sm">
          No dictionary entries. Add terms above or import from a file.
        </div>
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
              {glossary.map((entry) => (
                <tr key={entry.id} className="border-t border-zinc-800 hover:bg-zinc-800/50">
                  <td className="px-4 py-2 text-zinc-200">{entry.source}</td>
                  <td className="px-4 py-2 text-zinc-300">{entry.target}</td>
                  <td className="px-2 py-2">
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
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
