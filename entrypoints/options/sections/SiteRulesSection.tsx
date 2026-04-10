/**
 * Site Rules Section — per-site translation rules management.
 * Refactored with shared components.
 */

import { useState, useCallback } from 'react';
import { Plus, Trash2, Edit2, Shield, ShieldOff, Globe } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import type { SiteRule } from '@/types/config';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { Badge } from '@/ui/Badge';
import { EmptyState } from '@/ui/EmptyState';

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
      {/* Section header */}
      <Card accent="blue" className="mb-8">
        <div className="flex items-center gap-3">
          <Globe className="w-5 h-5 text-blue-400" />
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Site Rules</h2>
            <p className="text-xs text-zinc-500">Configure per-site translation behavior.</p>
          </div>
        </div>
      </Card>

      {/* Search & Add */}
      <div className="flex gap-3 mb-4">
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
        <div className="space-y-2">
          {filteredRules.map((rule, idx) => (
            <div
              key={rule.id}
              className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-lg animate-stagger"
              style={{ '--stagger-delay': idx } as React.CSSProperties}
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
                  {rule.builtIn && <Badge variant="info" className="ml-2">Built-in</Badge>}
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
    <Card variant="bordered" className="mb-4 space-y-3 border-zinc-700">
      <Input
        type="text"
        placeholder="*.example.com"
        value={form.hostname}
        onChange={(e) => setForm({ ...form, hostname: e.target.value })}
        className="font-mono"
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
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" disabled={!form.hostname} onClick={() => onSave(form)}>Save</Button>
      </div>
    </Card>
  );
}
