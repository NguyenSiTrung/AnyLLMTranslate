/**
 * Site Rules Section — per-site translation rules management.
 * Header uses inline SectionHeader pattern (consistent with GeneralSection).
 */

import { useState, useCallback, useMemo } from 'react';
import { Plus, Trash2, Edit2, Shield, ShieldOff, Globe, Tag, ChevronDown, Sparkles, Filter, X } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import type { SiteRule } from '@/types/config';
import { CRITICAL_GLOBAL_EXCLUDES } from '@/types/config';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { Select } from '@/ui/Select';
import { Badge } from '@/ui/Badge';
import { Toggle } from '@/ui/Toggle';
import { FieldGroup } from '@/ui/FieldGroup';
import { EmptyState } from '@/ui/EmptyState';
import { Modal } from '@/ui/Modal';
import { PREDEFINED_CATEGORIES } from '@/lib/categories';
import { DOMAIN_CATEGORY_MAP } from '@/content/utils/pageContext';

export function SiteRulesSection() {
  const siteRules = useSettingsStore((s) => s.siteRules);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [searchFilter, setSearchFilter] = useState('');
  const [editingRule, setEditingRule] = useState<SiteRule | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

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

  const pendingDeleteHostname = pendingDeleteId
    ? siteRules.find((r) => r.id === pendingDeleteId)?.hostname ?? ''
    : '';

  return (
    <div className="animate-fade-in-up">
      {/* Inline section header — consistent with GeneralSection */}
      <div className="sticky top-0 z-10 backdrop-blur-md bg-[#09090b]/95 pt-4 pb-4 mb-3 -mt-4 flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-teal-600/15 border border-teal-500/20">
          <Globe className="w-4 h-4 text-teal-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-zinc-100 leading-tight">Site Rules</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Configure per-site translation behavior.</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Smart Excludes Card */}
        <div className="animate-stagger" style={{ '--stagger-delay': '0' } as React.CSSProperties}>
          <SmartExcludesCard />
        </div>

        {/* Custom Exclude Selectors Card */}
        <div className="animate-stagger" style={{ '--stagger-delay': '1' } as React.CSSProperties}>
          <CustomExcludesCard />
        </div>

        {/* Search & Add */}
        <div className="animate-stagger" style={{ '--stagger-delay': '2' } as React.CSSProperties}>
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
        </div>

        {/* Edit Form — top position only for new rules */}
        {editingRule && isAdding && (
          <RuleEditForm
            rule={editingRule}
            onSave={handleSaveRule}
            onCancel={() => { setEditingRule(null); setIsAdding(false); }}
          />
        )}

        {/* Rules List */}
        <div className="animate-stagger" style={{ '--stagger-delay': '3' } as React.CSSProperties}>
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
                  <div key={rule.id}>
                    <div
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
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingRule(rule)}
                          aria-label="Edit rule"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        {!rule.builtIn && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingDeleteId(rule.id)}
                            aria-label="Delete rule"
                            className="hover:text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {/* Inline edit form — renders below the rule being edited */}
                    {editingRule?.id === rule.id && !isAdding && (
                      <div className="px-4 py-3 bg-zinc-900/40 border-t border-zinc-800/50 animate-fade-in-up">
                        <RuleEditForm
                          rule={editingRule}
                          onSave={handleSaveRule}
                          onCancel={() => { setEditingRule(null); setIsAdding(false); }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal (C3) */}
      {pendingDeleteId && (
        <Modal
          title="Delete Site Rule?"
          message={`Are you sure you want to delete the rule for "${pendingDeleteHostname}"? This cannot be undone.`}
          variant="danger"
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => { handleDeleteRule(pendingDeleteId); setPendingDeleteId(null); }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}

/* ── Smart Excludes ─────────────────────────────────────────── */

/** Categorized smart selectors for visual grouping */
const SMART_SELECTOR_GROUPS = [
  {
    label: 'Navigation',
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    selectors: ['nav', '[role="navigation"]', '.breadcrumb', '.breadcrumbs', '[aria-label="breadcrumb"]', '.pagination'],
  },
  {
    label: 'Sidebars & Panels',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    selectors: ['.sidebar', '[role="complementary"]', '.infobox', '.infobox_v2'],
  },
  {
    label: 'Table of Contents',
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    selectors: ['.toc', '#toc', '[role="directory"]', '.table-of-contents'],
  },
  {
    label: 'Wiki & References',
    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    selectors: ['.navbox', '.catlinks', '.reflist'],
  },
];

function SmartExcludesCard() {
  const enableSmartExcludes = useSettingsStore((s) => s.enableSmartExcludes);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [expanded, setExpanded] = useState(false);

  const isEnabled = enableSmartExcludes !== false;
  const totalSelectors = SMART_SELECTOR_GROUPS.reduce((sum, g) => sum + g.selectors.length, 0);

  return (
    <Card variant="bordered">
      {/* Header row with icon + title + toggle */}
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500/15 to-orange-500/10 border border-amber-500/20 shrink-0 mt-0.5">
          <Sparkles className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-200">Smart Excludes</h3>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                Automatically skip navigation, sidebars, table of contents, and other structural elements.
              </p>
            </div>
            <button
              id="smart-excludes-toggle"
              type="button"
              role="switch"
              aria-checked={isEnabled}
              aria-label="Smart Excludes"
              onClick={() => updateSettings({ enableSmartExcludes: !isEnabled })}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
                isEnabled ? 'bg-blue-600' : 'bg-zinc-700'
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${
                  isEnabled ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          {/* Expandable selector list */}
          {isEnabled && (
            <div className="mt-3">
              <button
                onClick={() => setExpanded(!expanded)}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-300 transition-colors group"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
                <span>{totalSelectors} selectors active</span>
                <span className="text-zinc-600 group-hover:text-zinc-500">
                  — {expanded ? 'hide' : 'show details'}
                </span>
              </button>

              {expanded && (
                <div className="mt-3 space-y-3 animate-fade-in-up">
                  {SMART_SELECTOR_GROUPS.map((group) => (
                    <div key={group.label}>
                      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                        {group.label}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {group.selectors.map((sel) => (
                          <span
                            key={sel}
                            className={`px-2 py-0.5 rounded-md border text-[11px] font-mono ${group.color}`}
                          >
                            {sel}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ── Custom Exclude Selectors ───────────────────────────────── */

function CustomExcludesCard() {
  const globalExcludeSelectors = useSettingsStore((s) => s.globalExcludeSelectors);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [inputValue, setInputValue] = useState('');

  const handleAddSelector = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || globalExcludeSelectors.includes(trimmed)) {
      setInputValue('');
      return;
    }
    updateSettings({ globalExcludeSelectors: [...globalExcludeSelectors, trimmed] });
    setInputValue('');
  };

  const handleRemoveSelector = (selector: string) => {
    updateSettings({
      globalExcludeSelectors: globalExcludeSelectors.filter((s) => s !== selector),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSelector();
    }
  };

  const isDefault =
    globalExcludeSelectors.length === CRITICAL_GLOBAL_EXCLUDES.length &&
    CRITICAL_GLOBAL_EXCLUDES.every((s) => globalExcludeSelectors.includes(s));

  return (
    <Card variant="bordered">
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-teal-500/15 to-cyan-500/10 border border-teal-500/20 shrink-0 mt-0.5">
          <Filter className="w-4 h-4 text-teal-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h3 className="text-sm font-semibold text-zinc-200">Global Exclude Selectors</h3>
            {!isDefault && (
              <button
                onClick={() => updateSettings({ globalExcludeSelectors: [...CRITICAL_GLOBAL_EXCLUDES] })}
                className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors shrink-0"
              >
                Reset to defaults
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed mb-3">
            CSS selectors excluded from translation on all sites. Per-site rules add to these defaults.
          </p>

          {/* Selector chips */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {globalExcludeSelectors.map((selector) => (
              <span
                key={selector}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800/80 border border-zinc-700/60 text-[11px] font-mono text-zinc-300 hover:border-zinc-600 transition-colors group"
              >
                {selector}
                <button
                  onClick={() => handleRemoveSelector(selector)}
                  className="ml-0.5 text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  aria-label={`Remove ${selector}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {globalExcludeSelectors.length === 0 && (
              <span className="text-xs text-zinc-600 italic py-1">No global excludes — all elements will be translated.</span>
            )}
          </div>

          {/* Add selector input */}
          <div className="flex gap-2">
            <Input
              id="global-exclude-input"
              type="text"
              placeholder="Add CSS selector (e.g. .code-block, #footer)"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="font-mono flex-1"
            />
            <Button
              id="add-global-exclude-btn"
              variant="secondary"
              size="sm"
              onClick={handleAddSelector}
              disabled={!inputValue.trim()}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              Add
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ── Rule Edit Form ─────────────────────────────────────────── */

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
      {/* C4: Replace raw <select> with shared Select component */}
      <FieldGroup
        label="Page Category"
        description="Override auto-detected category for this hostname."
        htmlFor="rule-edit-category-select"
      >
        <Select
          id="rule-edit-category-select"
          value={form.categoryValue}
          onChange={(e) => setForm({ ...form, categoryValue: e.target.value })}
          options={categoryOptions}
        />
        {/* C4: Replace raw <input> with shared Input component for custom category */}
        {form.categoryValue === '__custom__' && (
          <Input
            type="text"
            placeholder="Enter custom category..."
            value={form.customCategory}
            onChange={(e) => setForm({ ...form, customCategory: e.target.value })}
            className="mt-2"
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
