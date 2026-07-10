/**
 * Per-site enable list + generic fallback (no YouTube ASR).
 */

import { useState } from 'react';
import { Globe, ChevronDown } from 'lucide-react';
import { Card } from '@/ui/Card';
import { DisabledDimmer } from '@/ui/DisabledDimmer';
import { Button } from '@/ui/Button';
import {
  SUPPORTED_SUBTITLE_SITES,
  SUBTITLE_SITES_INITIAL_VISIBLE,
  getSubtitleSitesLoadMoreState,
} from '@/lib/subtitleSites';
import { SiteRow } from './SiteRow';
import type { SubtitleCardBaseProps } from './types';

export function PlatformsCard({ settings, disabled, onUpdate }: SubtitleCardBaseProps) {
  const [visibleSiteCount, setVisibleSiteCount] = useState(SUBTITLE_SITES_INITIAL_VISIBLE);
  const {
    visibleSites,
    showLoadMore,
    remainingCount,
    nextVisibleCount,
  } = getSubtitleSitesLoadMoreState(SUPPORTED_SUBTITLE_SITES, visibleSiteCount);
  const genericSite = SUPPORTED_SUBTITLE_SITES.find((s) => s.platform === 'generic');

  return (
    <Card
      title="Platforms"
      description="Enable or disable subtitle capture per site."
      icon={<Globe className="w-3.5 h-3.5" />}
      variant="bordered"
    >
      <DisabledDimmer disabled={disabled}>
        <div className="divide-y divide-zinc-800/50">
          {visibleSites.map((site) => {
            const siteDisabled = (settings.disabledSubtitleSites ?? []).includes(site.platform);
            return (
              <SiteRow
                key={site.platform}
                site={site}
                checked={!siteDisabled}
                disabled={disabled}
                onToggle={(checked) => {
                  const current = settings.disabledSubtitleSites ?? [];
                  const updated = checked
                    ? current.filter((p) => p !== site.platform)
                    : [...current, site.platform];
                  onUpdate({ disabledSubtitleSites: updated });
                }}
              />
            );
          })}
        </div>

        {showLoadMore && (
          <div className="pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={<ChevronDown className="w-3.5 h-3.5" />}
              onClick={() => setVisibleSiteCount(nextVisibleCount)}
              className="w-full justify-center text-zinc-400"
            >
              Load more ({remainingCount} remaining)
            </Button>
          </div>
        )}

        {genericSite && (
          <div className="mt-2 pt-3 border-t border-zinc-800/50">
            <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1">Fallback</p>
            <SiteRow
              site={genericSite}
              checked={settings.enableGenericSubtitleHandler}
              disabled={disabled}
              onToggle={(checked) => onUpdate({ enableGenericSubtitleHandler: checked })}
            />
          </div>
        )}
      </DisabledDimmer>
    </Card>
  );
}
