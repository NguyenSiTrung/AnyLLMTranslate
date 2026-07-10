/**
 * Site Rules Section — per-site translation rules + global exclusion policy.
 *
 * Two-zone IA:
 * 1. Global protection (collapsible) — Smart Excludes + custom global selectors
 * 2. Per-site rules — stats, filter chips, card list, inline edit
 */

import { useState, useCallback, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Edit2,
  Shield,
  ShieldOff,
  Globe,
  Tag,
  ChevronDown,
  Sparkles,
  Filter,
  X,
  RotateCcw,
  Search,
  Layers,
} from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import { useSettingsStore } from '@/stores/settingsStore';
import type { SiteRule } from '@/types/config';
import { CRITICAL_GLOBAL_EXCLUDES } from '@/types/config';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { Select } from '@/ui/Select';
import { Badge } from '@/ui/Badge';
import { Toggle } from '@/ui/Toggle';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { FieldGroup } from '@/ui/FieldGroup';
import { EmptyState } from '@/ui/EmptyState';
import { Modal } from '@/ui/Modal';
import { PREDEFINED_CATEGORIES } from '@/lib/categories';
import { DOMAIN_CATEGORY_MAP } from '@/content/utils/pageContext';

/* ── Types ──────────────────────────────────────────────────── */

type TranslateMode = 'default' | 'always' | 'never';

type RuleFilter = 'all' | 'always' | 'never' | 'default' | 'built-in' | 'custom';

const FILTER_CHIPS: { id: RuleFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'always', label: 'Always' },
  { id: 'never', label: 'Never' },
  { id: 'default', label: 'Default' },
  { id: 'built-in', label: 'Built-in' },
  { id: 'custom', label: 'Custom' },
];

function getTranslateMode(rule: Pick<SiteRule, 'alwaysTranslate' | 'neverTranslate'>): TranslateMode {
  if (rule.alwaysTranslate) return 'always';
  if (rule.neverTranslate) return 'never';
  return 'default';
}

function matchesFilter(rule: SiteRule, filter: RuleFilter): boolean {
  const mode = getTranslateMode(rule);
  switch (filter) {
    case 'all':
      return true;
    case 'always':
      return mode === 'always';
    case 'never':
      return mode === 'never';
    case 'default':
      return mode === 'default';
    case 'built-in':
      return Boolean(rule.builtIn);
    case 'custom':
      return !rule.builtIn;
    default:
      return true;
  }
}

/* ── Main section ───────────────────────────────────────────── */

export function SiteRulesSection() {
  const siteRules = useSettingsStore((s) => s.siteRules);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [searchFilter, setSearchFilter] = useState('');
  const [modeFilter, setModeFilter] = useState<RuleFilter>('all');
  const [editingRule, setEditingRule] = useState<SiteRule | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const stats = useMemo(() => {
    let always = 0;
    let never = 0;
    let builtIn = 0;
    for (const r of siteRules) {
      if (r.alwaysTranslate) always += 1;
      if (r.neverTranslate) never += 1;
      if (r.builtIn) builtIn += 1;
    }
    return { total: siteRules.length, always, never, builtIn, custom: siteRules.length - builtIn };
  }, [siteRules]);

  const filteredRules = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    return siteRules.filter((r) => {
      if (!matchesFilter(r, modeFilter)) return false;
      if (!q) return true;
      return r.hostname.toLowerCase().includes(q);
    });
  }, [siteRules, searchFilter, modeFilter]);

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

  const handleSaveRule = useCallback(
    (rule: SiteRule) => {
      if (isAdding) {
        updateSettings({ siteRules: [...siteRules, rule] });
      } else {
        updateSettings({
          siteRules: siteRules.map((r) => (r.id === rule.id ? rule : r)),
        });
      }
      setEditingRule(null);
      setIsAdding(false);
    },
    [isAdding, siteRules, updateSettings],
  );

  const handleDeleteRule = useCallback(
    (id: string) => {
      updateSettings({ siteRules: siteRules.filter((r) => r.id !== id) });
    },
    [siteRules, updateSettings],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingRule(null);
    setIsAdding(false);
  }, []);

  const pendingDeleteHostname = pendingDeleteId
    ? (siteRules.find((r) => r.id === pendingDeleteId)?.hostname ?? '')
    : '';

  const hasActiveFilters = searchFilter.trim().length > 0 || modeFilter !== 'all';

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Site Rules"
        description="Per-site translation behavior and global page protection."
        icon={<Globe className="w-4 h-4" />}
        accentColor="teal"
      />

      <div className="space-y-5">
        {/* Zone 1 — Global protection */}
        <div className="animate-stagger" style={stagger(0)}>
          <GlobalProtectionZone />
        </div>

        {/* Zone 2 — Per-site rules */}
        <div className="animate-stagger space-y-3" style={stagger(1)}>
          {/* Zone header + stats */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-teal-500/20 bg-gradient-to-br from-teal-500/15 to-cyan-500/10">
                  <Layers className="h-3.5 w-3.5 text-teal-400" />
                </div>
                <h2 className="text-sm font-semibold tracking-tight text-zinc-100">Per-site rules</h2>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                Override translation for specific hostnames. Built-in rules cover common sites.
              </p>
            </div>
            {stats.total > 0 && (
              <div
                className="flex flex-wrap items-center gap-1.5"
                aria-label={`${stats.total} rules, ${stats.always} always, ${stats.never} never, ${stats.builtIn} built-in`}
              >
                <StatPill label="rules" value={stats.total} />
                {stats.always > 0 && <StatPill label="always" value={stats.always} tone="emerald" />}
                {stats.never > 0 && <StatPill label="never" value={stats.never} tone="rose" />}
                {stats.builtIn > 0 && <StatPill label="built-in" value={stats.builtIn} tone="amber" />}
                {stats.custom > 0 && <StatPill label="custom" value={stats.custom} tone="teal" />}
              </div>
            )}
          </div>

          {/* Toolbar: search + filters + add */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <Input
                id="site-rules-search"
                type="search"
                placeholder="Search by hostname…"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                icon={<Search className="h-4 w-4" />}
                aria-label="Search site rules by hostname"
              />
            </div>
            <Button
              id="add-site-rule-btn"
              onClick={handleAddRule}
              icon={<Plus className="h-4 w-4" />}
              className="shrink-0"
            >
              Add Rule
            </Button>
          </div>

          {/* Filter chips */}
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Filter rules"
          >
            {FILTER_CHIPS.map((chip) => {
              const active = modeFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setModeFilter(chip.id)}
                  aria-pressed={active}
                  className={[
                    'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-150',
                    active
                      ? 'border-teal-500/40 bg-teal-500/15 text-teal-300 shadow-[0_0_0_1px_rgba(20,184,166,0.12)]'
                      : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/15 hover:bg-white/[0.04] hover:text-zinc-200',
                  ].join(' ')}
                >
                  {chip.label}
                </button>
              );
            })}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchFilter('');
                  setModeFilter('all');
                }}
                className="inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>

          {/* Add form */}
          {editingRule && isAdding && (
            <div className="animate-fade-in-up">
              <RuleEditForm
                rule={editingRule}
                isNew
                onSave={handleSaveRule}
                onCancel={handleCancelEdit}
              />
            </div>
          )}

          {/* Rules list */}
          {filteredRules.length === 0 ? (
            <EmptyState
              icon={<Globe className="h-8 w-8" />}
              message={
                siteRules.length === 0
                  ? 'No site rules yet. Add a rule to customize translation for a hostname.'
                  : 'No rules match your search or filters.'
              }
              actionLabel={siteRules.length === 0 ? 'Add First Rule' : hasActiveFilters ? 'Clear filters' : undefined}
              onAction={
                siteRules.length === 0
                  ? handleAddRule
                  : hasActiveFilters
                    ? () => {
                        setSearchFilter('');
                        setModeFilter('all');
                      }
                    : undefined
              }
            />
          ) : (
            <div className="space-y-2" role="list" aria-label="Site rules">
              {filteredRules.map((rule, idx) => {
                const isEditing = editingRule?.id === rule.id && !isAdding;
                return (
                  <div key={rule.id} role="listitem" className="animate-stagger" style={stagger(Math.min(idx, 6))}>
                    <RuleCard
                      rule={rule}
                      isEditing={isEditing}
                      onEdit={() => {
                        setIsAdding(false);
                        setEditingRule(rule);
                      }}
                      onDelete={() => setPendingDeleteId(rule.id)}
                    />
                    {isEditing && editingRule && (
                      <div className="mt-2 animate-fade-in-up">
                        <RuleEditForm
                          rule={editingRule}
                          onSave={handleSaveRule}
                          onCancel={handleCancelEdit}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {pendingDeleteId && (
        <Modal
          title="Delete Site Rule?"
          message={`Are you sure you want to delete the rule for "${pendingDeleteHostname}"? This cannot be undone.`}
          variant="danger"
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => {
            handleDeleteRule(pendingDeleteId);
            setPendingDeleteId(null);
          }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}

/* ── Stat pill ──────────────────────────────────────────────── */

function StatPill({
  label,
  value,
  tone = 'zinc',
}: {
  label: string;
  value: number;
  tone?: 'zinc' | 'emerald' | 'rose' | 'amber' | 'teal';
}) {
  const tones: Record<string, string> = {
    zinc: 'border-white/10 bg-white/[0.03] text-zinc-300',
    emerald: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
    rose: 'border-rose-500/25 bg-rose-500/10 text-rose-300',
    amber: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
    teal: 'border-teal-500/25 bg-teal-500/10 text-teal-300',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium tabular-nums ${tones[tone]}`}
    >
      <span className="font-semibold">{value}</span>
      <span className="opacity-70">{label}</span>
    </span>
  );
}

/* ── Rule card ──────────────────────────────────────────────── */

function RuleCard({
  rule,
  isEditing,
  onEdit,
  onDelete,
}: {
  rule: SiteRule;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const mode = getTranslateMode(rule);
  const includeCount = rule.includeSelectors?.length ?? 0;
  const excludeCount = rule.excludeSelectors?.length ?? 0;

  const accent =
    mode === 'always'
      ? 'border-l-emerald-500'
      : mode === 'never'
        ? 'border-l-rose-500'
        : 'border-l-zinc-600';

  const modeBadge =
    mode === 'always' ? (
      <Badge variant="success">Always</Badge>
    ) : mode === 'never' ? (
      <Badge variant="danger">Never</Badge>
    ) : (
      <Badge variant="info">Default</Badge>
    );

  const ModeIcon =
    mode === 'always' ? Shield : mode === 'never' ? ShieldOff : Globe;
  const iconColor =
    mode === 'always'
      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
      : mode === 'never'
        ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
        : 'text-zinc-400 bg-zinc-800/80 border-zinc-700/60';

  let selectorMeta = 'No selector overrides';
  if (includeCount > 0 || excludeCount > 0) {
    const parts: string[] = [];
    if (includeCount > 0) parts.push(`${includeCount} include`);
    if (excludeCount > 0) parts.push(`${excludeCount} exclude`);
    selectorMeta = parts.join(' · ');
  }

  return (
    <div
      className={[
        'group rounded-xl border border-white/10 bg-white/[0.015] border-l-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-200',
        accent,
        isEditing
          ? 'ring-1 ring-teal-500/30 border-teal-500/20 bg-teal-500/[0.03]'
          : 'hover:border-white/15 hover:bg-white/[0.03]',
      ].join(' ')}
    >
      <div className="flex items-center gap-3 px-3.5 py-3 sm:px-4">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${iconColor}`}
          aria-hidden
        >
          <ModeIcon className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-mono text-sm text-zinc-100">{rule.hostname}</span>
            {modeBadge}
            {rule.builtIn && <Badge variant="warning">Built-in</Badge>}
            {rule.category && (
              <Badge variant="success">
                <Tag className="mr-0.5 inline h-3 w-3" />
                {rule.category}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-500">{selectorMeta}</p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 opacity-80 transition-opacity group-hover:opacity-100 sm:opacity-60">
          <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit rule for ${rule.hostname}`}>
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          {!rule.builtIn && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              aria-label={`Delete rule for ${rule.hostname}`}
              className="hover:text-rose-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Global protection zone ─────────────────────────────────── */

function GlobalProtectionZone() {
  const enableSmartExcludes = useSettingsStore((s) => s.enableSmartExcludes);
  const globalExcludeSelectors = useSettingsStore((s) => s.globalExcludeSelectors);
  const isSmartOn = enableSmartExcludes !== false;
  const isDefaultExcludes =
    globalExcludeSelectors.length === CRITICAL_GLOBAL_EXCLUDES.length &&
    CRITICAL_GLOBAL_EXCLUDES.every((s) => globalExcludeSelectors.includes(s));

  // Collapsed by default when defaults look healthy (less noise on first visit)
  const [expanded, setExpanded] = useState(!(isSmartOn && isDefaultExcludes));

  const totalSmart = SMART_SELECTOR_GROUPS.reduce((sum, g) => sum + g.selectors.length, 0);
  const summaryParts: string[] = [];
  if (isSmartOn) summaryParts.push(`Smart · ${totalSmart} selectors`);
  else summaryParts.push('Smart off');
  summaryParts.push(
    globalExcludeSelectors.length === 0
      ? 'No custom excludes'
      : `${globalExcludeSelectors.length} global exclude${globalExcludeSelectors.length === 1 ? '' : 's'}`,
  );

  return (
    <Card variant="bordered" className="!p-0 overflow-hidden">
      <button
        type="button"
        id="global-protection-toggle"
        aria-expanded={expanded}
        aria-controls="global-protection-region"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-gradient-to-br from-amber-500/15 to-orange-500/10">
          <Sparkles className="h-4 w-4 text-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold tracking-tight text-zinc-100">Global protection</h3>
            <span
              className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                isSmartOn
                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                  : 'border-zinc-600/40 bg-zinc-800/80 text-zinc-500'
              }`}
            >
              {isSmartOn ? 'Active' : 'Partial'}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-zinc-500">{summaryParts.join(' · ')}</p>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div
          id="global-protection-region"
          role="region"
          aria-labelledby="global-protection-toggle"
          className="space-y-4 border-t border-white/5 px-4 py-4 animate-fade-in-up"
        >
          <SmartExcludesBlock />
          <div className="border-t border-white/5 pt-4">
            <CustomExcludesBlock />
          </div>
        </div>
      )}
    </Card>
  );
}

/* ── Smart Excludes ─────────────────────────────────────────── */

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

function SmartExcludesBlock() {
  const enableSmartExcludes = useSettingsStore((s) => s.enableSmartExcludes);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const isEnabled = enableSmartExcludes !== false;
  const totalSelectors = SMART_SELECTOR_GROUPS.reduce((sum, g) => sum + g.selectors.length, 0);

  return (
    <div>
      <Toggle
        id="smart-excludes-toggle"
        checked={isEnabled}
        onChange={(checked) => updateSettings({ enableSmartExcludes: checked })}
        label="Smart Excludes"
        description="Automatically skip navigation, sidebars, table of contents, and other structural elements."
      />

      {isEnabled && (
        <div className="mt-3 ml-0 sm:ml-0">
          <button
            type="button"
            onClick={() => setDetailsOpen(!detailsOpen)}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-300 group"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 ${detailsOpen ? 'rotate-180' : ''}`}
            />
            <span>{totalSelectors} selectors active</span>
            <span className="text-zinc-600 group-hover:text-zinc-500">
              — {detailsOpen ? 'hide' : 'show details'}
            </span>
          </button>

          {detailsOpen && (
            <div className="mt-3 space-y-3 animate-fade-in-up">
              {SMART_SELECTOR_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.selectors.map((sel) => (
                      <span
                        key={sel}
                        className={`rounded-md border px-2 py-0.5 font-mono text-[11px] ${group.color}`}
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
  );
}

/* ── Custom Exclude Selectors ───────────────────────────────── */

function CustomExcludesBlock() {
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
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-teal-400" />
          <h4 className="text-sm font-semibold text-zinc-200">Global exclude selectors</h4>
        </div>
        {!isDefault && (
          <button
            type="button"
            onClick={() => updateSettings({ globalExcludeSelectors: [...CRITICAL_GLOBAL_EXCLUDES] })}
            className="inline-flex shrink-0 items-center gap-1 text-[11px] text-blue-400 transition-colors hover:text-blue-300"
          >
            <RotateCcw className="h-3 w-3" />
            Reset to defaults
          </button>
        )}
      </div>
      <p className="mb-3 text-xs leading-relaxed text-zinc-500">
        CSS selectors excluded from translation on all sites. Per-site rules add to these defaults.
      </p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {globalExcludeSelectors.map((selector) => (
          <span
            key={selector}
            className="group inline-flex items-center gap-1 rounded-md border border-zinc-700/60 bg-zinc-800/80 px-2 py-1 font-mono text-[11px] text-zinc-300 transition-colors hover:border-zinc-600"
          >
            {selector}
            <button
              type="button"
              onClick={() => handleRemoveSelector(selector)}
              className="ml-0.5 text-zinc-600 opacity-60 transition-colors hover:text-rose-400 group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Remove ${selector}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {globalExcludeSelectors.length === 0 && (
          <span className="py-1 text-xs italic text-zinc-600">
            No custom excludes — only Smart Excludes (if enabled) are applied.
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          id="global-exclude-input"
          type="text"
          placeholder="Add CSS selector (e.g. .code-block, #footer)"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 font-mono"
        />
        <Button
          id="add-global-exclude-btn"
          variant="secondary"
          size="sm"
          onClick={handleAddSelector}
          disabled={!inputValue.trim()}
          icon={<Plus className="h-3.5 w-3.5" />}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

/* ── Selector chips input ───────────────────────────────────── */

function SelectorChipsInput({
  selectors,
  onChange,
  placeholder,
  id,
}: {
  selectors: string[];
  onChange: (selectors: string[]) => void;
  placeholder: string;
  id?: string;
}) {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || selectors.includes(trimmed)) {
      setInputValue('');
      return;
    }
    onChange([...selectors, trimmed]);
    setInputValue('');
  };

  const handleRemove = (selector: string) => {
    onChange(selectors.filter((s) => s !== selector));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAdd();
    }
    if (e.key === 'Backspace' && !inputValue && selectors.length > 0) {
      onChange(selectors.slice(0, -1));
    }
  };

  return (
    <div>
      {selectors.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectors.map((selector) => (
            <span
              key={selector}
              className="group inline-flex items-center gap-1 rounded-md border border-zinc-700/60 bg-zinc-800/80 px-2 py-0.5 font-mono text-[11px] text-zinc-300 transition-colors hover:border-zinc-600"
            >
              {selector}
              <button
                type="button"
                onClick={() => handleRemove(selector)}
                className="ml-0.5 text-zinc-600 opacity-60 transition-colors hover:text-rose-400 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Remove ${selector}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        id={id}
        type="text"
        placeholder={selectors.length === 0 ? placeholder : 'Add another…'}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className="font-mono"
      />
      <p className="mt-1 text-[10px] text-zinc-600">Press Enter or comma to add</p>
    </div>
  );
}

/* ── Rule edit form ─────────────────────────────────────────── */

function RuleEditForm({
  rule,
  onSave,
  onCancel,
  isNew = false,
}: {
  rule: SiteRule;
  onSave: (rule: SiteRule) => void;
  onCancel: () => void;
  isNew?: boolean;
}) {
  const [form, setForm] = useState({
    ...rule,
    includeSelectors: [...(rule.includeSelectors ?? [])],
    excludeSelectors: [...(rule.excludeSelectors ?? [])],
    categoryValue: rule.category ?? '__none__',
    customCategory: '',
  });

  const translateMode: TranslateMode = form.alwaysTranslate
    ? 'always'
    : form.neverTranslate
      ? 'never'
      : 'default';

  const suggestedCategory = useMemo(() => {
    if (!form.hostname) return undefined;
    const domainKey = Object.keys(DOMAIN_CATEGORY_MAP).find((key) => form.hostname.includes(key));
    return domainKey ? DOMAIN_CATEGORY_MAP[domainKey] : undefined;
  }, [form.hostname]);

  const categoryOptions = [
    { value: '__none__', label: 'None (use auto-detect)' },
    ...PREDEFINED_CATEGORIES.map((c) => ({ value: c, label: c })),
    { value: '__custom__', label: 'Custom…' },
  ];

  const handleTranslateModeChange = (mode: TranslateMode) => {
    setForm({
      ...form,
      alwaysTranslate: mode === 'always',
      neverTranslate: mode === 'never',
    });
  };

  const handleSave = () => {
    const resolvedCategory =
      form.categoryValue === '__none__'
        ? undefined
        : form.categoryValue === '__custom__'
          ? form.customCategory.trim().slice(0, 50) || undefined
          : form.categoryValue;

    const cleanRule: SiteRule = {
      id: form.id,
      hostname: form.hostname.trim(),
      includeSelectors: form.includeSelectors,
      excludeSelectors: form.excludeSelectors,
      alwaysTranslate: form.alwaysTranslate,
      neverTranslate: form.neverTranslate,
      builtIn: form.builtIn,
      category: resolvedCategory,
    };
    onSave(cleanRule);
  };

  return (
    <Card
      variant="bordered"
      className="!p-0 space-y-0 overflow-hidden border-teal-500/20 bg-teal-500/[0.02]"
      accent="cyan"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">
            {isNew ? 'New site rule' : 'Edit site rule'}
          </h3>
          <p className="text-[11px] text-zinc-500">
            {isNew ? 'Match a hostname and set how translation behaves.' : `Editing ${rule.hostname || 'rule'}`}
          </p>
        </div>
      </div>

      <div className="space-y-5 p-4">
        {/* Match */}
        <section className="space-y-3">
          <SectionLabel step={1} title="Match" />
          <FieldGroup
            label="Hostname"
            description="Wildcard patterns supported (e.g. *.example.com)"
            htmlFor="rule-edit-hostname"
          >
            <Input
              id="rule-edit-hostname"
              type="text"
              placeholder="*.example.com"
              value={form.hostname}
              onChange={(e) => setForm({ ...form, hostname: e.target.value })}
              className="font-mono"
              autoFocus={isNew}
            />
          </FieldGroup>
        </section>

        {/* Selectors */}
        <section className="space-y-3 border-t border-white/5 pt-4">
          <SectionLabel step={2} title="Selectors" />
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup
              label="Include"
              description="CSS selectors to translate on this site."
            >
              <SelectorChipsInput
                id="rule-edit-include-selectors"
                selectors={form.includeSelectors}
                onChange={(includeSelectors) => setForm({ ...form, includeSelectors })}
                placeholder=".content, article, main"
              />
            </FieldGroup>
            <FieldGroup
              label="Exclude"
              description="CSS selectors to skip on this site."
            >
              <SelectorChipsInput
                id="rule-edit-exclude-selectors"
                selectors={form.excludeSelectors}
                onChange={(excludeSelectors) => setForm({ ...form, excludeSelectors })}
                placeholder=".nav, .sidebar, footer"
              />
            </FieldGroup>
          </div>
        </section>

        {/* Mode + category */}
        <section className="space-y-3 border-t border-white/5 pt-4">
          <SectionLabel step={3} title="Behavior" />
          <FieldGroup
            label="Translation mode"
            description="Control how this site is handled during translation."
          >
            <SegmentedControl
              options={[
                { value: 'default' as TranslateMode, label: 'Default' },
                {
                  value: 'always' as TranslateMode,
                  label: 'Always',
                  icon: <Shield className="h-3 w-3" />,
                },
                {
                  value: 'never' as TranslateMode,
                  label: 'Never',
                  icon: <ShieldOff className="h-3 w-3" />,
                },
              ]}
              value={translateMode}
              onChange={handleTranslateModeChange}
              label="Translation mode"
              size="sm"
            />
          </FieldGroup>

          <FieldGroup
            label="Page category"
            description="Override auto-detected category for this hostname."
            htmlFor="rule-edit-category-select"
          >
            <Select
              id="rule-edit-category-select"
              value={form.categoryValue}
              onChange={(e) => setForm({ ...form, categoryValue: e.target.value })}
              options={categoryOptions}
            />
            {form.categoryValue === '__custom__' && (
              <Input
                type="text"
                placeholder="Enter custom category…"
                value={form.customCategory}
                onChange={(e) => setForm({ ...form, customCategory: e.target.value })}
                className="mt-2"
              />
            )}
            {suggestedCategory && form.categoryValue === '__none__' && (
              <button
                type="button"
                onClick={() => setForm({ ...form, categoryValue: suggestedCategory })}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-400 transition-colors hover:bg-blue-500/15 hover:text-blue-300"
              >
                <Sparkles className="h-3 w-3" />
                Suggested: {suggestedCategory}
              </button>
            )}
          </FieldGroup>
        </section>

        <div className="flex justify-end gap-2 border-t border-white/5 pt-3">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" disabled={!form.hostname.trim()} onClick={handleSave}>
            {isNew ? 'Add rule' : 'Save changes'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function SectionLabel({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-teal-500/30 bg-teal-500/10 text-[10px] font-semibold text-teal-300">
        {step}
      </span>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{title}</h4>
    </div>
  );
}
