/**
 * Platform row: monogram + summary + toggle. Method hint via monogram title only.
 */

import { Toggle } from '@/ui/Toggle';
import {
  monogramAccentClasses,
  type SubtitleSiteInfo,
} from '@/lib/subtitleSites';

function MonogramDot({ site }: { site: SubtitleSiteInfo }) {
  const monogram = site.monogram ?? site.name.slice(0, 1);
  return (
    <span
      className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md border text-[11px] font-semibold ${monogramAccentClasses(site.accent)}`}
      aria-hidden="true"
      title={site.methodHint}
    >
      {monogram}
    </span>
  );
}

export function SiteRow({
  site,
  checked,
  disabled,
  onToggle,
}: {
  site: SubtitleSiteInfo;
  checked: boolean;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <MonogramDot site={site} />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-zinc-200">{site.name}</div>
          {site.summary ? (
            <div className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{site.summary}</div>
          ) : null}
        </div>
      </div>
      <div className="shrink-0 pt-0.5">
        <Toggle
          id={
            site.platform === 'generic'
              ? 'subtitle-generic-handler-toggle'
              : `subtitle-site-${site.platform}`
          }
          ariaLabel={`${site.name} subtitles`}
          checked={checked}
          onChange={onToggle}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
