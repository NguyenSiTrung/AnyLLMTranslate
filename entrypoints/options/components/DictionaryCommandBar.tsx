/**
 * Dictionary command bar — search, add, import, export.
 */

import { useState } from 'react';
import { Plus, Search, Upload, Download, FileJson, FileText } from 'lucide-react';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';

export interface DictionaryCommandBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  showSearch: boolean;
  onAddClick: () => void;
  addOpen: boolean;
  onImportClick: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  exportDisabled: boolean;
  termCount: number;
}

export function DictionaryCommandBar({
  searchQuery,
  onSearchChange,
  showSearch,
  onAddClick,
  addOpen,
  onImportClick,
  onExportJson,
  onExportCsv,
  exportDisabled,
  termCount,
}: DictionaryCommandBarProps) {
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <Card variant="bordered" className="py-3 px-4">
      <div className="flex flex-wrap items-center gap-2">
        {showSearch && (
          <div className="flex-1 min-w-[12rem]">
            <Input
              id="dict-search"
              type="search"
              placeholder="Search terms…"
              aria-label="Search terms"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              icon={<Search className="w-4 h-4" />}
            />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {showSearch && (
            <span className="text-xs text-zinc-500 tabular-nums hidden sm:inline">
              {termCount} {termCount === 1 ? 'term' : 'terms'}
            </span>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={onAddClick}
            icon={<Plus className="w-3.5 h-3.5" />}
            aria-expanded={addOpen}
          >
            Add term
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onImportClick}
            icon={<Upload className="w-3.5 h-3.5" />}
          >
            Import
          </Button>
          <div className="relative">
            <Button
              variant="secondary"
              size="sm"
              disabled={exportDisabled}
              onClick={() => setExportOpen((v) => !v)}
              icon={<Download className="w-3.5 h-3.5" />}
              aria-expanded={exportOpen}
              aria-haspopup="menu"
            >
              Export
            </Button>
            {exportOpen && !exportDisabled && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 z-20 min-w-[9rem] rounded-lg border border-zinc-700 bg-zinc-900 shadow-lg py-1"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                  onClick={() => {
                    onExportJson();
                    setExportOpen(false);
                  }}
                >
                  <FileJson className="w-3.5 h-3.5" />
                  Export JSON
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                  onClick={() => {
                    onExportCsv();
                    setExportOpen(false);
                  }}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
