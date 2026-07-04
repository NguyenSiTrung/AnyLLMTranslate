/**
 * One collapsible provider card (FR-1 extraction).
 *
 * Header (collapsible) + body shell. Orchestrates the catalog picker,
 * display name / base URL fields, the API-key row list, the model picker,
 * the temperature / maxTokens sliders, and the provider-level connection
 * test. Extracted verbatim from `ProvidersSection.tsx`.
 */

import { useState } from 'react';
import { CheckCircle2, ChevronDown, KeyRound, Plus, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { FieldGroup } from '@/ui/FieldGroup';
import { Input } from '@/ui/Input';
import { Slider } from '@/ui/Slider';
import { Toggle } from '@/ui/Toggle';
import { AdvancedDisclosure } from '@/ui/AdvancedDisclosure';
import { ModelPicker } from './ModelPicker';
import { ProviderCatalogPicker, inferCatalogId } from './ProviderCatalogPicker';
import { ProviderConnectionTest } from './ProviderConnectionTest';
import { ProviderIdentityBadge } from './ProviderIdentityBadge';
import { ProviderKeyRow } from './ProviderKeyRow';
import { useDeferredCommit } from '../hooks/useDeferredCommit';
import { formatTestResultAge } from '@/lib/poolTestStatus';
import { resolveProviderIdentity } from '@/lib/openAiCompatibleCatalog';
import {
  buildProviderConfig,
  getCredentialKey,
  getProviderTestStatus,
} from '@/lib/providerPoolHelpers';
import type { PoolKey, PoolProvider, ProviderConfig, KeyTestResult } from '@/types/config';

interface ProviderCardProps {
  provider: PoolProvider;
  isExpanded: boolean;
  targetLanguage: string;
  onToggle: () => void;
  onUpdateProvider: (patch: Partial<PoolProvider>) => void;
  onUpdateKey: (keyId: string, patch: Partial<PoolKey>) => void;
  onAddKey: () => void;
  onRemoveKey: (keyId: string) => void;
  onRequestRemove: () => void;
  onCatalogSelect: (selection: { patch: Partial<ProviderConfig> }) => void;
  onTestComplete: (result: KeyTestResult) => void;
}

export function ProviderCard({
  provider,
  isExpanded,
  targetLanguage,
  onToggle,
  onUpdateProvider,
  onUpdateKey,
  onAddKey,
  onRemoveKey,
  onRequestRemove,
  onCatalogSelect,
  onTestComplete,
}: ProviderCardProps) {
  const panelId = `provider-panel-${provider.id}`;
  const headerId = `provider-header-${provider.id}`;
  const catalogId = provider.catalogId ?? inferCatalogId(provider.baseUrl);
  const identity = resolveProviderIdentity(provider.displayName, provider.catalogId, provider.baseUrl);
  const testStatus = getProviderTestStatus(provider);
  const testName = provider.displayName || 'Unnamed provider';

  // FR-6: when a provider has a non-custom catalogId set, the catalog picker
  // collapses behind a "Change template" button (reveals on click, re-collapses
  // on select). A custom/unset catalogId shows the picker inline as before.
  const hasConfiguredTemplate = catalogId !== 'custom';
  const [showCatalogPicker, setShowCatalogPicker] = useState(!hasConfiguredTemplate);

  // FR-10: defer display name + base URL store writes until blur (avoid
  // per-keystroke AES-GCM encryption overhead). Toggles, sliders, the catalog
  // picker, and test buttons remain immediate-commit (infrequent writes).
  const displayNameField = useDeferredCommit(provider.displayName, (v) => onUpdateProvider({ displayName: v }));
  const baseUrlField = useDeferredCommit(provider.baseUrl, (v) => onUpdateProvider({ baseUrl: v }));

  return (
    <Card variant="bordered" className="p-0 overflow-hidden">
      {/* Provider header (collapsible) — two-zone layout (FR-4) */}
      <button
        type="button"
        id={headerId}
        onClick={onToggle}
        className={`w-full flex items-center justify-between gap-3 px-5 py-4 text-sm font-medium transition-colors cursor-pointer ${
          provider.enabled
            ? 'text-zinc-300 hover:bg-zinc-800/50'
            : 'text-zinc-500 hover:bg-zinc-800/30 opacity-60'
        }`}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        aria-label={`${testName} provider`}
      >
        {/* Left zone: identity badge + name + test-health badge (FR-2/3/4) */}
        <span className="flex items-center gap-2.5 min-w-0">
          <ProviderIdentityBadge
            accent={identity.accent}
            monogram={identity.monogram}
            enabled={provider.enabled}
          />
          <span className="truncate">{testName}</span>
          {testStatus.state !== 'untested' && (
            <ProviderTestHealthBadge state={testStatus.state} age={testStatus.result ? formatTestResultAge(testStatus.result) : ''} />
          )}
        </span>
        {/* Right zone: key count + chevron (FR-4) */}
        <span className="flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-0.5 text-xs text-zinc-500" title={`${provider.keys.length} key${provider.keys.length !== 1 ? 's' : ''}`}>
            <KeyRound className="w-3 h-3" />
            {provider.keys.length}
          </span>
          <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {isExpanded && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={headerId}
          className="px-5 pb-5 space-y-5 border-t border-zinc-700/60 pt-4"
        >
          {/* Enabled toggle + delete */}
          <div className="flex items-center justify-between gap-4 pt-3">
            <label className="flex items-center gap-3 cursor-pointer select-none group">
              <Toggle
                checked={provider.enabled}
                onChange={(enabled) => onUpdateProvider({ enabled })}
              />
              <div>
                <span className={`text-sm font-medium transition-colors ${
                  provider.enabled ? 'text-zinc-100' : 'text-zinc-500'
                }`}>
                  {provider.enabled ? 'Provider enabled' : 'Provider disabled'}
                </span>
                <p className="text-xs text-zinc-600 mt-0.5">
                  {provider.enabled ? 'Included in the rotation pool' : 'Excluded from all requests'}
                </p>
              </div>
            </label>
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={onRequestRemove}
            >
              Remove provider
            </Button>
          </div>

          {/* Catalog picker for switching provider template (FR-6: collapse
              behind "Change template" once a non-custom template is set). */}
          {showCatalogPicker ? (
            <ProviderCatalogPicker
              compact
              selectedCatalogId={catalogId}
              provider={{
                baseUrl: provider.baseUrl,
                apiKey: provider.keys[0]?.apiKey ?? '',
                model: provider.model,
              }}
              onSelect={(selection) => {
                onCatalogSelect(selection);
                // Re-collapse after a successful selection.
                if (hasConfiguredTemplate) setShowCatalogPicker(false);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowCatalogPicker(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
              aria-expanded={false}
              aria-controls={`${panelId}-catalog`}
            >
              <ChevronDown className="w-3.5 h-3.5" />
              Change template
            </button>
          )}

          <FieldGroup label="Display name" htmlFor={`pn-${provider.id}`}>
            <Input
              id={`pn-${provider.id}`}
              value={displayNameField.value}
              onChange={(e) => displayNameField.setValue(e.target.value)}
              onBlur={displayNameField.commit}
              placeholder="OpenAI"
            />
          </FieldGroup>

          <FieldGroup label="Base URL" htmlFor={`pu-${provider.id}`}>
            <Input
              id={`pu-${provider.id}`}
              type="url"
              value={baseUrlField.value}
              onChange={(e) => baseUrlField.setValue(e.target.value)}
              onBlur={baseUrlField.commit}
              placeholder="https://api.openai.com/v1"
              className="font-mono"
            />
          </FieldGroup>

          {/* Keys — placed before model picker so Browse models can use credentials */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-zinc-600">API Keys</span>
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={onAddKey}
              >
                Add key
              </Button>
            </div>
            {provider.keys.map((key) => (
              <ProviderKeyRow
                key={key.id}
                provider={provider}
                poolKey={key}
                targetLanguage={targetLanguage}
                onUpdate={(patch) => onUpdateKey(key.id, patch)}
                onRemove={() => onRemoveKey(key.id)}
              />
            ))}
          </div>

          <ModelPicker
            inputId={`pm-${provider.id}`}
            provider={buildProviderConfig(
              provider,
              getCredentialKey(provider) ?? provider.keys[0] ?? {
                id: '',
                apiKey: '',
                maxRpm: 0,
                enabled: true,
              },
            )}
            onModelChange={(model) => onUpdateProvider({ model })}
          />

          {/* Temperature & Max Tokens — behind an Advanced disclosure (FR-5)
              so the primary path (template → name → URL → keys → model → test)
              stays short. Values persist regardless of disclosure state. */}
          <AdvancedDisclosure label="Advanced settings" idPrefix={`adv-${provider.id}`}>
            <div className="grid grid-cols-2 gap-4">
              <Slider
                id={`pt-${provider.id}`}
                label="Temperature"
                value={provider.temperature}
                min={0}
                max={2}
                step={0.1}
                onChange={(v) => onUpdateProvider({ temperature: v })}
                formatValue={(v) => v.toFixed(1)}
                minLabel="Precise"
                maxLabel="Creative"
              />
              <Slider
                id={`pmt-${provider.id}`}
                label="Max Tokens"
                value={provider.maxTokens}
                min={256}
                max={16384}
                step={256}
                onChange={(v) => onUpdateProvider({ maxTokens: v })}
                minLabel="256"
                maxLabel="16384"
              />
            </div>
          </AdvancedDisclosure>

          <ProviderConnectionTest
            provider={provider}
            targetLanguage={targetLanguage}
            onTestComplete={onTestComplete}
          />
        </div>
      )}
    </Card>
  );
}

/**
 * Promoted test-health badge for the collapsed provider header (FR-3).
 *
 * Replaces the old `w-2 h-2` status dot with a real badge carrying an icon,
 * a label, and the age. Uses the same `bg-X-600/15 text-X-400` token pattern
 * as the readiness banner and `ProviderIdentityBadge` (NFR-4). The label is
 * visible text (better than the old dot's `title` tooltip) and the
 * `aria-label` carries the same string for assistive tech.
 */
function ProviderTestHealthBadge({
  state,
  age,
}: {
  state: 'healthy' | 'failed';
  age: string;
}) {
  const isHealthy = state === 'healthy';
  const Icon = isHealthy ? CheckCircle2 : XCircle;
  const label = isHealthy ? 'Verified' : 'Failed';
  const text = age ? `${label} · ${age}` : label;
  const tone = isHealthy
    ? 'bg-emerald-600/15 border-emerald-500/20 text-emerald-400'
    : 'bg-red-600/15 border-red-500/20 text-red-400';
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${tone}`}
      aria-label={text}
      title={text}
    >
      <Icon className="w-3 h-3" />
      {text}
    </span>
  );
}
