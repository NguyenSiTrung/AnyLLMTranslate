/**
 * Site Rules Section — per-site translation rules management.
 */

import { useState, useCallback } from 'react';
import { Plus, Trash2, Edit2, Search, Shield, ShieldOff } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import type { SiteRule } from '@/types/config';

export function SiteRulesSection() {
  const siteRules = useSettingsStore((s) => s.siteRules);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [searchFilter, setSearchFilter] = useState('');
  const [editingRule, setEditingRule] = useState<SiteRule | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const filteredRules = siteRules.filter((r) =>
    r.hostname.toLowerCase().includes(searchFilter.toLowerCase()),
  );

  const handleAddRule = useCallback(() => {
    const newRule: SiteRule = {
      id: `rule-${Date.now()}`,
      hostname: '',
      includeSelectors: [],
      excludeSelectors: [],
      alwaysTranslate: false,
      neverTranslate: false,
      builtIn: false,
    };
    setEditingRule(newRule);
    setIsAdding(true);
  }, []);

  const handleSaveRule = useCallback((rule: SiteRule) => {
    if (isAdding) {
      updateSettings({ siteRules: [...siteRules, rule] });
    } else {
      updateSettings({
        siteRules: siteRules.map((r) => (r.id === rule.id ? rule : r)),
      });
    }
    setEditingRule(null);
    setIsAdding(false);
  }, [isAdding, siteRules, updateSettings]);

  const handleDeleteRule = useCallback((id: string) => {
    updateSettings({ siteRules: siteRules.filter((r) => r.id !== id) });
  }, [siteRules, updateSettings]);

  return (
    <div>
      <h2 className="text-xl font-semibold text-zinc-100 mb-1">Site Rules</h2>
      <p className="text-sm text-zinc-500 mb-6">Configure per-site translation behavior.</p>

      {/* Search & Add */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            id="site-rules-search"
            type="text"
            placeholder="Search by hostname..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
          />
        </div>
        <button
          id="add-site-rule-btn"
          onClick={handleAddRule}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Rule
        </button>
      </div>

      {/* Edit Form */}
      {editingRule && (
        <RuleEditForm
          rule={editingRule}
          onSave={handleSaveRule}
          onCancel={() => { setEditingRule(null); setIsAdding(false); }}
        />
      )}

      {/* Rules List */}
      {filteredRules.length === 0 ? (
        <div className="text-center py-12 text-zinc-500 text-sm">
          {siteRules.length === 0 ? 'No site rules configured. Add a rule to customize translation behavior per site.' : 'No rules match your search.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-lg"
            >
              <div className="flex items-center gap-3">
                {rule.alwaysTranslate ? (
                  <Shield className="w-4 h-4 text-emerald-400" />
                ) : rule.neverTranslate ? (
                  <ShieldOff className="w-4 h-4 text-red-400" />
                ) : (
                  <div className="w-4 h-4" />
                )}
                <div>
                  <span className="text-sm text-zinc-200 font-mono">{rule.hostname}</span>
                  {rule.builtIn && <span className="ml-2 text-[10px] bg-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded">Built-in</span>}
                </div>
              </div>
              {!rule.builtIn && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingRule(rule)}
                    className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                    aria-label="Edit rule"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
                    aria-label="Delete rule"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RuleEditForm({ rule, onSave, onCancel }: {
  rule: SiteRule;
  onSave: (rule: SiteRule) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ ...rule });

  return (
    <div className="mb-4 p-4 bg-zinc-900 border border-zinc-700 rounded-lg space-y-3">
      <input
        type="text"
        placeholder="*.example.com"
        value={form.hostname}
        onChange={(e) => setForm({ ...form, hostname: e.target.value })}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50"
      />
      <div className="flex gap-3">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={form.alwaysTranslate}
            onChange={(e) => setForm({ ...form, alwaysTranslate: e.target.checked, neverTranslate: false })}
            className="accent-blue-500"
          />
          Always translate
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={form.neverTranslate}
            onChange={(e) => setForm({ ...form, neverTranslate: e.target.checked, alwaysTranslate: false })}
            className="accent-blue-500"
          />
          Never translate
        </label>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200">Cancel</button>
        <button
          onClick={() => onSave(form)}
          disabled={!form.hostname}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm rounded-lg transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}
