/**
 * Model field with optional Browse models (GET /models) without full connection test.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, List } from 'lucide-react';
import { getCatalogEntryById } from '@/lib/openAiCompatibleCatalog';
import { inferCatalogId } from './ProviderCatalogPicker';
import type { ProviderConfig } from '@/types/config';
import { listProviderModels } from '@/services/providerTester';
import { FieldGroup } from '@/ui/FieldGroup';
import { Input } from '@/ui/Input';
import { Button } from '@/ui/Button';

interface ModelPickerProps {
  provider: ProviderConfig;
  onModelChange: (model: string) => void;
  inputId?: string;
  /** Extra model chips from connection test */
  testModels?: string[];
}

function canBrowseModels(provider: ProviderConfig): boolean {
  if (!provider.baseUrl.trim()) return false;
  if (provider.requiresApiKey && !provider.apiKey.trim()) return false;
  const catalogId = inferCatalogId(provider.baseUrl);
  const entry = getCatalogEntryById(catalogId);
  return entry?.supportsModelListing !== false;
}

export function ModelPicker({
  provider,
  onModelChange,
  inputId = 'provider-model',
  testModels = [],
}: ModelPickerProps) {
  const [browseModels, setBrowseModels] = useState<string[]>([]);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleBrowse = useCallback(async () => {
    setIsBrowsing(true);
    setBrowseError(null);
    const result = await listProviderModels({
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
    });
    if (!mountedRef.current) return;
    setIsBrowsing(false);
    if (!result.success) {
      setBrowseModels([]);
      setBrowseError(result.error ?? 'Failed to list models');
      return;
    }
    setBrowseModels(result.models);
  }, [provider.baseUrl, provider.apiKey]);

  const chipModels = [...new Set([...browseModels, ...testModels])].slice(0, 24);
  const browseEnabled = canBrowseModels(provider);

  return (
    <FieldGroup
      label="Model"
      description="The model ID to use for translations."
      htmlFor={inputId}
    >
      <div className="flex gap-2">
        <Input
          id={inputId}
          type="text"
          value={provider.model}
          onChange={(e) => onModelChange(e.target.value)}
          placeholder="model-name"
          className="font-mono flex-1"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!browseEnabled || isBrowsing}
          onClick={handleBrowse}
          icon={isBrowsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <List className="w-4 h-4" />}
        >
          {isBrowsing ? 'Loading...' : 'Browse models'}
        </Button>
      </div>
      {browseError && (
        <p className="text-xs text-red-400 mt-2" role="alert">
          {browseError}
        </p>
      )}
      {chipModels.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-zinc-500 mb-1">Available models:</p>
          <div className="flex flex-wrap gap-1">
            {chipModels.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onModelChange(m)}
                className={`text-xs px-2 py-0.5 rounded font-mono transition-colors cursor-pointer ${
                  provider.model === m
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}
    </FieldGroup>
  );
}