/**
 * One collapsible provider card (FR-1 extraction).
 *
 * Header (collapsible) + body shell. Orchestrates the catalog picker,
 * display name / base URL fields, the API-key row list, the model picker,
 * the temperature / maxTokens sliders, and the provider-level connection
 * test. Extracted verbatim from `ProvidersSection.tsx`.
 */

import { ChevronDown, KeyRound, Plus, Server, Trash2 } from 'lucide-react';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { FieldGroup } from '@/ui/FieldGroup';
import { Input } from '@/ui/Input';
import { Slider } from '@/ui/Slider';
import { Toggle } from '@/ui/Toggle';
import { ModelPicker } from './ModelPicker';
import { ProviderCatalogPicker, inferCatalogId } from './ProviderCatalogPicker';
import { ProviderConnectionTest } from './ProviderConnectionTest';
import { ProviderKeyRow } from './ProviderKeyRow';
import { formatTestResultAge } from '@/lib/poolTestStatus';
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

  return (
    <Card variant="bordered" className="p-0 overflow-hidden">
      {/* Provider header (collapsible) */}
      <button
        type="button"
        id={headerId}
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-5 py-4 text-sm font-medium transition-colors cursor-pointer ${
          provider.enabled
            ? 'text-zinc-300 hover:bg-zinc-800/50'
            : 'text-zinc-500 hover:bg-zinc-800/30 opacity-60'
        }`}
        aria-expanded={isExpanded}
        aria-controls={panelId}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Server className={`w-3.5 h-3.5 shrink-0 ${provider.enabled ? 'text-zinc-500' : 'text-zinc-600'}`} />
          <span className="truncate">{provider.displayName || 'Unnamed provider'}</span>
          <Badge variant={provider.enabled ? 'success' : 'info'}>
            {provider.enabled ? 'on' : 'off'}
          </Badge>
          <span className="flex items-center gap-0.5 text-xs text-zinc-500">
            <KeyRound className="w-3 h-3" />
            {provider.keys.length}
          </span>
          {(() => {
            const status = getProviderTestStatus(provider);
            if (status.state === 'untested') return null;
            const color = status.state === 'healthy' ? 'bg-emerald-500' : 'bg-red-500';
            const label = status.state === 'healthy' ? 'Verified' : 'Failed';
            const age = status.result ? formatTestResultAge(status.result) : '';
            return (
              <span
                className={`inline-block w-2 h-2 rounded-full ${color}`}
                title={`${label}${age ? ` (${age})` : ''}`}
                aria-label={`${label}${age ? ` ${age}` : ''}`}
              />
            );
          })()}
        </span>
        <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
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

          {/* Catalog picker for switching provider template */}
          <ProviderCatalogPicker
            compact
            selectedCatalogId={catalogId}
            provider={{
              baseUrl: provider.baseUrl,
              apiKey: provider.keys[0]?.apiKey ?? '',
              model: provider.model,
            }}
            onSelect={(selection) => onCatalogSelect(selection)}
          />

          <FieldGroup label="Display name" htmlFor={`pn-${provider.id}`}>
            <Input
              id={`pn-${provider.id}`}
              value={provider.displayName}
              onChange={(e) => onUpdateProvider({ displayName: e.target.value })}
              placeholder="OpenAI"
            />
          </FieldGroup>

          <FieldGroup label="Base URL" htmlFor={`pu-${provider.id}`}>
            <Input
              id={`pu-${provider.id}`}
              type="url"
              value={provider.baseUrl}
              onChange={(e) => onUpdateProvider({ baseUrl: e.target.value })}
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

          {/* Temperature & Max Tokens */}
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
