import { useRef, useState } from 'react';
import { ArrowLeft, Upload } from 'lucide-react';
import type { GlossaryEntry, NamedGlossaryList } from '@/types/config';
import { findDuplicateSource, parseGlossaryCSV, parseGlossaryJSON } from '@/lib/glossary';
import { MAX_NAMED_LIST_ENTRIES, pushEntriesIntoList } from '@/lib/namedGlossaryLists';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { DictionaryAddForm } from './DictionaryAddForm';
import { GlossaryEntryList } from './GlossaryEntryList';
import { GlossaryImportHint } from './GlossaryImportHint';

interface Props {
  list: NamedGlossaryList;
  onBack: () => void;
  onChange: (list: NamedGlossaryList) => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

const DUPLICATE_MSG = 'This source term already exists';

export function NamedGlossaryListDetail({ list, onBack, onChange, onSuccess, onError }: Props) {
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string>();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSource, setEditSource] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [editError, setEditError] = useState<string>();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const replaceEntries = (entries: GlossaryEntry[]) => onChange({ ...list, entries, updatedAt: Date.now() });
  const addEntry = () => {
    if (findDuplicateSource(list.entries, source)) return setError(DUPLICATE_MSG);
    const result = pushEntriesIntoList(list, [{ source, target }]);
    if (!result.ok) return setError(result.error === 'cap' ? `Lists support up to ${MAX_NAMED_LIST_ENTRIES} terms` : 'Invalid term');
    onChange(result.list);
    setSource('');
    setTarget('');
    setError(undefined);
  };

  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = file.name.toLowerCase().endsWith('.json') ? parseGlossaryJSON(text) : parseGlossaryCSV(text);
      const result = pushEntriesIntoList(list, parsed);
      if (!result.ok) throw new Error(`Lists support up to ${MAX_NAMED_LIST_ENTRIES} terms`);
      const added = result.list.entries.length - list.entries.length;
      onChange(result.list);
      onSuccess(`Imported ${added} terms`);
    } catch (cause) {
      onError(`Import failed: ${cause instanceof Error ? cause.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} icon={<ArrowLeft className="w-4 h-4" />}>All lists</Button>
        <div>
          <h3 className="text-base font-semibold text-zinc-100">{list.name}</h3>
          <p className="text-xs text-zinc-500">{list.entries.length} of {MAX_NAMED_LIST_ENTRIES} terms</p>
        </div>
        <Button className="ml-auto" variant="secondary" size="sm" onClick={() => fileRef.current?.click()} icon={<Upload className="w-4 h-4" />}>Import</Button>
      </div>
      <GlossaryImportHint onChooseFile={() => fileRef.current?.click()} />
      <div className="flex flex-wrap gap-2">
        {list.entries.length > 0 && <input className="flex-1 min-w-48 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" type="search" aria-label={`Search ${list.name}`} placeholder="Search terms…" value={search} onChange={(e) => setSearch(e.target.value)} />}
        <Button size="sm" aria-label={`Add term to ${list.name}`} onClick={() => setAddOpen((value) => !value)}>Add term</Button>
      </div>
      {addOpen && <DictionaryAddForm source={source} target={target} error={error} onSourceChange={(value) => { setSource(value); setError(undefined); }} onTargetChange={setTarget} onSubmit={addEntry} onCancel={() => setAddOpen(false)} />}
      {list.entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">Add names and exact translations to lock them for subtitles.</div>
      ) : (
        <GlossaryEntryList entries={list.entries} searchQuery={search} mismatchedIds={new Set()} editingId={editingId} editSource={editSource} editTarget={editTarget} editError={editError} onEditSourceChange={(value) => { setEditSource(value); setEditError(undefined); }} onEditTargetChange={setEditTarget} onStartEdit={(entry) => { setEditingId(entry.id); setEditSource(entry.source); setEditTarget(entry.target); }} onSaveEdit={(id) => {
          if (findDuplicateSource(list.entries, editSource, id)) return setEditError(DUPLICATE_MSG);
          if (!editSource.trim() || !editTarget.trim()) return;
          replaceEntries(list.entries.map((entry) => entry.id === id ? { ...entry, source: editSource.trim(), target: editTarget.trim() } : entry));
          setEditingId(null);
        }} onCancelEdit={() => setEditingId(null)} onRequestDelete={setDeleteId} onClearSearch={() => setSearch('')} />
      )}
      <input ref={fileRef} className="hidden" type="file" accept=".csv,.json" aria-label={`Import entries into ${list.name}`} onChange={(e) => { const file = e.target.files?.[0]; if (file) void importFile(file); e.target.value = ''; }} />
      {deleteId && <Modal title="Delete term?" message="Remove this locked term? This cannot be undone." variant="danger" confirmLabel="Delete" onConfirm={() => { replaceEntries(list.entries.filter((entry) => entry.id !== deleteId)); setDeleteId(null); }} onCancel={() => setDeleteId(null)} />}
    </div>
  );
}
