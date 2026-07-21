import { useEffect, useState } from 'react';
import { Download, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import type { NamedGlossaryList, SubtitleListBySite } from '@/types/config';
import { createNamedList, getNamedListById, MAX_NAMED_GLOSSARY_LISTS, MAX_NAMED_LIST_NAME_LENGTH, pruneSubtitleListBySite } from '@/lib/namedGlossaryLists';
import { exportGlossaryJSON } from '@/lib/glossary';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Input } from '@/ui/Input';
import { Modal } from '@/ui/Modal';
import { NamedGlossaryListDetail } from './NamedGlossaryListDetail';

interface Props {
  lists: NamedGlossaryList[];
  bySite: SubtitleListBySite;
  onUpdate: (patch: { namedGlossaryLists: NamedGlossaryList[]; subtitleListBySite?: SubtitleListBySite }) => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export function NamedGlossaryListPanel({ lists, bySite, onUpdate, onSuccess, onError }: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string>();
  const [openId, setOpenId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [rename, setRename] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const openList = getNamedListById(lists, openId);

  useEffect(() => {
    if (!menuId) return;
    const closeMenu = () => setMenuId(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuId]);

  const saveList = (next: NamedGlossaryList) => onUpdate({ namedGlossaryLists: lists.map((list) => list.id === next.id ? next : list) });
  const submitCreate = () => {
    const result = createNamedList(lists, name);
    if (!result.ok) return setNameError(result.error === 'cap' ? `You can create up to ${MAX_NAMED_GLOSSARY_LISTS} lists` : `Enter 1–${MAX_NAMED_LIST_NAME_LENGTH} characters`);
    onUpdate({ namedGlossaryLists: result.lists });
    setName('');
    setCreating(false);
  };
  const exportList = (list: NamedGlossaryList) => {
    const url = URL.createObjectURL(new Blob([exportGlossaryJSON(list.entries)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${list.name.replace(/[^a-z0-9_-]+/gi, '-') || 'glossary'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    onSuccess('List exported as JSON');
  };

  return (
    <section className="mt-10 pt-8 border-t border-zinc-800" aria-labelledby="named-lists-heading">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div><h2 id="named-lists-heading" className="text-base font-semibold text-zinc-100">Named lists</h2><p className="text-xs text-zinc-500 mt-1">Subtitle-specific locks you can select per video site.</p></div>
        {!openList && <Button size="sm" disabled={lists.length >= MAX_NAMED_GLOSSARY_LISTS} onClick={() => setCreating(true)} icon={<Plus className="w-4 h-4" />}>New list</Button>}
      </div>
      {openList ? <NamedGlossaryListDetail list={openList} onBack={() => setOpenId(null)} onChange={saveList} onSuccess={onSuccess} onError={onError} /> : <>
        {creating && <Card variant="bordered" className="mb-3"><div className="flex flex-wrap gap-2"><div className="flex-1 min-w-52"><Input autoFocus aria-label="List name" placeholder="List name" maxLength={MAX_NAMED_LIST_NAME_LENGTH} value={name} error={nameError} onChange={(e) => { setName(e.target.value); setNameError(undefined); }} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) submitCreate(); }} /></div><Button size="sm" aria-label="Create list" disabled={!name.trim()} onClick={submitCreate}>Create</Button><Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button></div></Card>}
        {lists.length === 0 ? <Card variant="bordered" className="border-emerald-500/20"><div className="py-8 px-4 text-center"><h3 className="text-base font-semibold text-zinc-100">Lock names for subtitles</h3><p className="text-sm text-zinc-400 mt-2 max-w-lg mx-auto">Names you lock here win over auto subtitle glossary when this list is selected on a video site.</p></div></Card> : <div className="space-y-2">{lists.map((list) => <Card key={list.id} variant="bordered" className="py-3 px-4"><div className="flex flex-wrap items-center gap-3">{renameId === list.id ? <><div className="flex-1 min-w-48"><Input autoFocus aria-label="Rename list" maxLength={MAX_NAMED_LIST_NAME_LENGTH} value={rename} onChange={(e) => setRename(e.target.value)} /></div><Button size="sm" aria-label="Save name" disabled={!rename.trim()} onClick={() => { saveList({ ...list, name: rename.trim(), updatedAt: Date.now() }); setRenameId(null); }}>Save</Button><Button size="sm" variant="ghost" onClick={() => setRenameId(null)}>Cancel</Button></> : <><div className="min-w-0 flex-1"><p className="font-medium text-sm text-zinc-200 truncate">{list.name}</p><p className="text-xs text-zinc-500">{list.entries.length} {list.entries.length === 1 ? 'term' : 'terms'}</p></div><Button size="sm" variant="secondary" aria-label={`Open ${list.name}`} onClick={() => setOpenId(list.id)}>Open</Button><div className="relative" onMouseDown={(event) => event.stopPropagation()}><Button size="sm" variant="ghost" aria-label={`More actions for ${list.name}`} aria-haspopup="menu" aria-expanded={menuId === list.id} onClick={() => setMenuId(menuId === list.id ? null : list.id)} icon={<MoreHorizontal className="w-4 h-4" />} />{menuId === list.id && <div role="menu" className="absolute right-0 top-full mt-1 z-10 min-w-[10rem] rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl"><button type="button" role="menuitem" aria-label={`Rename ${list.name}`} className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center gap-2" onClick={() => { setMenuId(null); setRenameId(list.id); setRename(list.name); }}><Pencil className="w-3 h-3" /> Rename</button><button type="button" role="menuitem" className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center gap-2" onClick={() => { setMenuId(null); exportList(list); }}><Download className="w-3 h-3" /> Export JSON</button><button type="button" role="menuitem" aria-label={`Delete ${list.name}`} className="w-full text-left px-3 py-1.5 text-xs text-rose-400 hover:bg-zinc-800 flex items-center gap-2" onClick={() => { setMenuId(null); if (list.entries.length) setDeleteId(list.id); else { const next = lists.filter((item) => item.id !== list.id); onUpdate({ namedGlossaryLists: next, subtitleListBySite: pruneSubtitleListBySite(bySite, next) }); } }}><Trash2 className="w-3 h-3" /> Delete</button></div>}</div></>}</div></Card>)}</div>}
      </>}
      {deleteId && <Modal title="Delete named list?" message={`Delete “${getNamedListById(lists, deleteId)?.name}” and all of its terms? This cannot be undone.`} variant="danger" confirmLabel="Delete" onConfirm={() => { const next = lists.filter((list) => list.id !== deleteId); onUpdate({ namedGlossaryLists: next, subtitleListBySite: pruneSubtitleListBySite(bySite, next) }); setDeleteId(null); if (openId === deleteId) setOpenId(null); }} onCancel={() => setDeleteId(null)} />}
    </section>
  );
}
