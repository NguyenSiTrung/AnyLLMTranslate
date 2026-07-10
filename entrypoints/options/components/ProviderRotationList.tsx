/**
 * Ordered provider list with HTML5 drag-and-drop.
 */

import { useState } from 'react';
import {
  aggregateChipKind,
  ProviderRow,
} from './ProviderRow';
import {
  getKeyChipView,
  type PoolKeyLiveStatus,
} from '@/lib/poolDashboardStatus';
import type { PoolProvider } from '@/types/config';

interface ProviderRotationListProps {
  providers: PoolProvider[];
  liveByKeyId: Record<string, PoolKeyLiveStatus> | null;
  now?: number;
  onReorder: (from: number, to: number) => void;
  onMove: (providerId: string, direction: 'up' | 'down') => void;
  onToggleEnabled: (providerId: string, enabled: boolean) => void;
  onTestProvider: (providerId: string) => void;
  onEdit: (providerId: string, opts?: { keyId?: string }) => void;
  onRemove: (providerId: string) => void;
}

export function ProviderRotationList({
  providers,
  liveByKeyId,
  now = Date.now(),
  onReorder,
  onMove,
  onToggleEnabled,
  onTestProvider,
  onEdit,
  onRemove,
}: ProviderRotationListProps) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  return (
    <div className="space-y-2" role="list" aria-label="Provider rotation order">
      {providers.map((provider, index) => {
        const chips = (provider.keys ?? []).map((k) =>
          getKeyChipView(provider, k, liveByKeyId?.[k.id], now),
        );
        return (
          <div
            key={provider.id}
            role="listitem"
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom == null || dragFrom === index) return;
              onReorder(dragFrom, index);
              setDragFrom(null);
            }}
          >
            <ProviderRow
              provider={provider}
              chips={chips}
              aggregateKind={aggregateChipKind(chips)}
              onToggleEnabled={(enabled) => onToggleEnabled(provider.id, enabled)}
              onTest={() => onTestProvider(provider.id)}
              onEdit={() => onEdit(provider.id)}
              onRemove={() => onRemove(provider.id)}
              onMove={(dir) => onMove(provider.id, dir)}
              onKeyChipClick={(keyId) => onEdit(provider.id, { keyId })}
              dragHandleProps={{
                draggable: true,
                onDragStart: (e) => {
                  setDragFrom(index);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', String(index));
                },
                onDragEnd: () => setDragFrom(null),
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
