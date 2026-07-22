/**
 * Tabbed provider editor drawer (Connection / Keys / Advanced / Danger).
 */

import { useEffect, useState } from 'react';
import { Plus, Trash2, Zap } from 'lucide-react';
import {
  getKeyChipView,
  type PoolKeyLiveStatus,
} from '@/lib/poolDashboardStatus';
import { useDeferredCommit } from '../hooks/useDeferredCommit';
import { Drawer } from '@/ui/Drawer';
import { Button } from '@/ui/Button';
import { FieldGroup } from '@/ui/FieldGroup';
import { Input } from '@/ui/Input';
import { Slider } from '@/ui/Slider';
import { Toggle } from '@/ui/Toggle';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { ModelPicker } from './ModelPicker';
import { ProviderCatalogPicker, inferCatalogId } from './ProviderCatalogPicker';
import { ProviderKeyRow } from './ProviderKeyRow';
import {
  buildProviderConfig,
  getCredentialKey,
} from '@/lib/providerPoolHelpers';
import type { PoolKey, PoolProvider, ProviderConfig, ThinkingMode } from '@/types/config';
import { DEFAULT_THINKING_MODE } from '@/types/config';

type DrawerSection = 'connection' | 'keys' | 'advanced' | 'danger';

interface ProviderEditDrawerProps {
  provider: PoolProvider | null;
  open: boolean;
  initialSection?: DrawerSection;
  focusKeyId?: string | null;
  targetLanguage: string;
  liveByKeyId: Record<string, PoolKeyLiveStatus> | null;
  onClose: () => void;
  onUpdateProvider: (patch: Partial<PoolProvider>) => void;
  onUpdateKey: (keyId: string, patch: Partial<PoolKey>) => void;
  onAddKey: () => void;
  onRemoveKey: (keyId: string) => void;
  onReorderKey: (from: number, to: number) => void;
  onMoveKey: (keyId: string, direction: 'up' | 'down') => void;
  onTestProvider: () => void;
  onRequestRemoveProvider: () => void;
  onCatalogSelect: (selection: { patch: Partial<ProviderConfig> }) => void;
  isTestingProvider?: boolean;
}

const TABS: Array<{ id: DrawerSection; label: string }> = [
  { id: 'connection', label: 'Connection' },
  { id: 'keys', label: 'Keys' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'danger', label: 'Danger' },
];

export function ProviderEditDrawer({
  provider,
  open,
  initialSection = 'connection',
  focusKeyId,
  targetLanguage,
  liveByKeyId,
  onClose,
  onUpdateProvider,
  onUpdateKey,
  onAddKey,
  onRemoveKey,
  onReorderKey,
  onMoveKey,
  onTestProvider,
  onRequestRemoveProvider,
  onCatalogSelect,
  isTestingProvider = false,
}: ProviderEditDrawerProps) {
  const [section, setSection] = useState<DrawerSection>(initialSection);
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);
  const [keyDragFrom, setKeyDragFrom] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setSection(initialSection);
      setShowCatalogPicker(false);
    }
  }, [open, initialSection, provider?.id]);

  useEffect(() => {
    if (!open || !focusKeyId) return;
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-key-id="${focusKeyId}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, [open, focusKeyId, section]);

  const displayNameField = useDeferredCommit(
    provider?.displayName ?? '',
    (v) => onUpdateProvider({ displayName: v }),
  );
  const baseUrlField = useDeferredCommit(
    provider?.baseUrl ?? '',
    (v) => onUpdateProvider({ baseUrl: v }),
  );

  if (!provider) {
    return (
      <Drawer open={false} title="Edit provider" onClose={onClose}>
        {null}
      </Drawer>
    );
  }

  const catalogId = provider.catalogId ?? inferCatalogId(provider.baseUrl);
  const hasConfiguredTemplate = catalogId !== 'custom';
  const now = Date.now();

  return (
    <Drawer
      open={open}
      title={provider.displayName || 'Edit provider'}
      onClose={onClose}
      headerExtra={
        <div className="flex flex-wrap items-center gap-2">
          <Toggle
            checked={provider.enabled}
            onChange={(enabled) => onUpdateProvider({ enabled })}
            ariaLabel="Provider enabled"
          />
          <Button
            size="sm"
            variant="secondary"
            loading={isTestingProvider}
            icon={!isTestingProvider ? <Zap className="w-3.5 h-3.5" /> : undefined}
            onClick={onTestProvider}
          >
            Test provider
          </Button>
        </div>
      }
    >
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1" role="tablist" aria-label="Provider sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={section === tab.id}
            onClick={() => setSection(tab.id)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              section === tab.id
                ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {section === 'connection' && (
        <div className="space-y-4">
          {showCatalogPicker || !hasConfiguredTemplate ? (
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
                if (hasConfiguredTemplate) setShowCatalogPicker(false);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowCatalogPicker(true)}
              className="text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
            >
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

          <ModelPicker
            inputId={`pm-${provider.id}`}
            provider={buildProviderConfig(
              provider,
              getCredentialKey(provider) ??
                provider.keys[0] ?? {
                  id: '',
                  apiKey: '',
                  maxRpm: 0,
                  concurrencyLimit: 0,
                  interval: 0,
                  enabled: true,
                },
            )}
            onModelChange={(model) => onUpdateProvider({ model })}
          />
        </div>
      )}

      {section === 'keys' && (
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
          {provider.keys.map((poolKey, index) => (
            <div
              key={poolKey.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (keyDragFrom == null || keyDragFrom === index) return;
                onReorderKey(keyDragFrom, index);
                setKeyDragFrom(null);
              }}
            >
              <ProviderKeyRow
                provider={provider}
                poolKey={poolKey}
                targetLanguage={targetLanguage}
                chip={getKeyChipView(
                  provider,
                  poolKey,
                  liveByKeyId?.[poolKey.id],
                  now,
                )}
                displayIndex={index + 1}
                onUpdate={(patch) => onUpdateKey(poolKey.id, patch)}
                onRemove={() => onRemoveKey(poolKey.id)}
                onMove={(dir) => onMoveKey(poolKey.id, dir)}
                dragHandleProps={{
                  draggable: true,
                  onDragStart: (e) => {
                    setKeyDragFrom(index);
                    e.dataTransfer.effectAllowed = 'move';
                  },
                  onDragEnd: () => setKeyDragFrom(null),
                }}
              />
            </div>
          ))}
        </div>
      )}

      {section === 'advanced' && (
        <div className="grid grid-cols-1 gap-4">
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
          <FieldGroup
            label="Thinking mode"
            description="Force reasoning tokens on or off for models that support it (e.g. NVIDIA NIM Nemotron). Auto keeps the provider default. Off is recommended for bulk translation."
            htmlFor={`ptm-${provider.id}`}
          >
            <SegmentedControl
              id={`ptm-${provider.id}`}
              label="Thinking mode"
              size="sm"
              value={provider.thinkingMode ?? DEFAULT_THINKING_MODE}
              onChange={(v: ThinkingMode) => onUpdateProvider({ thinkingMode: v })}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'off', label: 'Off' },
                { value: 'on', label: 'On' },
              ]}
            />
          </FieldGroup>
          <FieldGroup
            label="Max batch characters"
            description="Override global batch size for this provider (0 = use Advanced default). Tightest enabled provider wins in a multi-provider pool."
            htmlFor={`pbc-${provider.id}`}
          >
            <Input
              id={`pbc-${provider.id}`}
              type="number"
              min={0}
              max={10000}
              value={provider.maxBatchChars ?? 0}
              onChange={(e) =>
                onUpdateProvider({ maxBatchChars: Math.max(0, Number(e.target.value) || 0) })
              }
              hint="0 = global default"
            />
          </FieldGroup>
          <FieldGroup
            label="Max pieces per request"
            description="Override global max pieces per LLM request for this provider (0 = use Advanced default)."
            htmlFor={`ptg-${provider.id}`}
          >
            <Input
              id={`ptg-${provider.id}`}
              type="number"
              min={0}
              max={50}
              value={provider.maxTextGroupCount ?? 0}
              onChange={(e) =>
                onUpdateProvider({ maxTextGroupCount: Math.max(0, Number(e.target.value) || 0) })
              }
              hint="0 = global default"
            />
          </FieldGroup>
        </div>
      )}

      {section === 'danger' && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">
            Remove this provider and all of its API keys. This cannot be undone.
          </p>
          <Button
            variant="destructive"
            size="sm"
            icon={<Trash2 className="w-3.5 h-3.5" />}
            onClick={onRequestRemoveProvider}
          >
            Remove provider
          </Button>
        </div>
      )}
    </Drawer>
  );
}
