/**
 * Site Rules Section — per-site translation rules management.
 * Header uses inline SectionHeader pattern (consistent with GeneralSection).
 */

import { useState, useCallback, useMemo } from 'react';
import { Plus, Trash2, Edit2, Shield, ShieldOff, Globe, Tag } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import type { SiteRule } from '@/types/config';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { Badge } from '@/ui/Badge';
import { FieldGroup } from '@/ui/FieldGroup';
import { EmptyState } from '@/ui/EmptyState';
import { PREDEFINED_CATEGORIES } from '@/lib/categories';
import { DOMAIN_CATEGORY_MAP } from '@/content/utils/pageContext';

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
    <div className="animate-fade-in-up">
      {/* Inline section header — consistent with GeneralSection */}
      <div className="sticky top-0 z-10 backdrop-blur-md bg-[#09090b]/80 pt-4 pb-4 mb-3 -mt-4 flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-teal-600/15 border border-teal-500/20">
          <Globe className="w-4 h-4 text-teal-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-zinc-100 leading-tight">Site Rules</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Configure per-site translation behavior.</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Search & Add */}
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              id="site-rules-search"
              type="search"
              placeholder="Search by hostname..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              icon={<Globe className="w-4 h-4" />}
            />
          </div>
          <Button
            id="add-site-rule-btn"
            onClick={handleAddRule}
            icon={<Plus className="w-4 h-4" />}
          >
            Add Rule
          </Button>
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
          <EmptyState
            icon={<Globe className="w-8 h-8" />}
            message={siteRules.length === 0
              ? 'No site rules configured. Add a rule to customize translation behavior per site.'
              : 'No rules match your search.'}
            actionLabel={siteRules.length === 0 ? 'Add First Rule' : undefined}
            onAction={siteRules.length === 0 ? handleAddRule : undefined}
          />
        ) : (
          <Card variant="bordered" className="p-0 overflow-hidden">
            <div className="divide-y divide-zinc-800">
              {filteredRules.map((rule, idx) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-zinc-800/30 transition-colors animate-stagger"
                  style={{ '--stagger-delay': Math.min(idx, 5) } as React.CSSProperties}
                >
                  <div className="flex items-center gap-3">
                    {rule.alwaysTranslate ? (
                      <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : rule.neverTranslate ? (
                      <ShieldOff className="w-4 h-4 text-red-400 shrink-0" />
                    ) : (
                      <div className="w-4 h-4 shrink-0" />
                    )}
                    <div>
                      <span className="text-sm text-zinc-200 font-mono">{rule.hostname}</span>
                      {rule.builtIn && <Badge variant="info" className="ml-2">Built-in</Badge>}
                      {rule.category && <Badge variant="info" className="ml-2"><Tag className="w-3 h-3 inline mr-1" />{rule.category}</Badge>}
                      {(rule.includeSelectors?.length ?? 0) > 0 && <Badge variant="info" className="ml-2">{rule.includeSelectors.length} include</Badge>}
                      {(rule.excludeSelectors?.length ?? 0) > 0 && <Badge variant="info" className="ml-2">{rule.excludeSelectors.length} exclude</Badge>}
                    </div>
                  </div>
                  {!rule.builtIn && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingRule(rule)}
                        aria-label="Edit rule"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteRule(rule.id)}
                        aria-label="Delete rule"
                        className="hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function RuleEditForm({ rule, onSave, onCancel }: {
  rule: SiteRule;
  onSave: (rule: SiteRule) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    ...rule,
    includeSelectorText: rule.includeSelectors?.join(', ') ?? '',
    excludeSelectorText: rule.excludeSelectors?.join(', ') ?? '',
    categoryValue: rule.category ?? '__none__',
    customCategory: '',
  });

  const suggestedCategory = useMemo(() => {
    if (!form.hostname) return undefined;
    const domainKey = Object.keys(DOMAIN_CATEGORY_MAP).find(key => form.hostname.includes(key));
    return domainKey ? DOMAIN_CATEGORY_MAP[domainKey] : undefined;
  }, [form.hostname]);

  const categoryOptions = [
    { value: '__none__', label: 'None (use auto-detect)' },
    ...PREDEFINED_CATEGORIES.map(c => ({ value: c, label: c })),
    { value: '__custom__', label: 'Custom...' },
  ];

  const handleSave = () => {
    const resolvedCategory = form.categoryValue === '__none__'
      ? undefined
      : form.categoryValue === '__custom__'
        ? form.customCategory.trim().slice(0, 50) || undefined
        : form.categoryValue;

    const parsedRule = {
      ...form,
      category: resolvedCategory,
      includeSelectors: form.includeSelectorText.split(',').map(s => s.trim()).filter(Boolean),
      excludeSelectors: form.excludeSelectorText.split(',').map(s => s.trim()).filter(Boolean),
    };
    const { includeSelectorText: _inc, excludeSelectorText: _exc, categoryValue: _cv, customCategory: _cc, ...cleanRule } = parsedRule;
    onSave(cleanRule as SiteRule);
  };

  return (
    <Card variant="bordered" className="space-y-3 border-zinc-700">
      <Input
        type="text"
        placeholder="*.example.com"
        value={form.hostname}
        onChange={(e) => setForm({ ...form, hostname: e.target.value })}
        className="font-mono"
      />
      <FieldGroup
        label="Include Selectors"
        description="Comma-separated CSS selectors to translate."
      >
        <Input
          type="text"
          placeholder=".content, article, main"
          value={form.includeSelectorText}
          onChange={(e) => setForm({ ...form, includeSelectorText: e.target.value })}
          className="font-mono"
        />
      </FieldGroup>
      <FieldGroup
        label="Exclude Selectors"
        description="Comma-separated CSS selectors to skip."
      >
        <Input
          type="text"
          placeholder=".nav, .sidebar, footer"
          value={form.excludeSelectorText}
          onChange={(e) => setForm({ ...form, excludeSelectorText: e.target.value })}
          className="font-mono"
        />
      </FieldGroup>
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
      <FieldGroup
        label="Page Category"
        description="Override auto-detected category for this hostname."
      >
        <select
          value={form.categoryValue}
          onChange={(e) => setForm({ ...form, categoryValue: e.target.value })}
          className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          {categoryOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {form.categoryValue === '__custom__' && (
          <input
            type="text"
            placeholder="Enter custom category..."
            value={form.customCategory}
            onChange={(e) => setForm({ ...form, customCategory: e.target.value })}
            maxLength={50}
            className="mt-2 w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        )}
        {suggestedCategory && form.categoryValue === '__none__' && (
          <button
            onClick={() => setForm({ ...form, categoryValue: suggestedCategory })}
            className="mt-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Suggested: {suggestedCategory}
          </button>
        )}
      </FieldGroup>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" disabled={!form.hostname} onClick={handleSave}>Save</Button>
      </div>
    </Card>
  );
}
