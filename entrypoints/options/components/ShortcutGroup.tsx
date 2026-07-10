/**
 * Card group of shortcut rows.
 */

import type { CSSProperties, ReactNode } from 'react';
import type { ShortcutDisplayRow } from '@/lib/shortcutDisplay';
import { Card } from '@/ui/Card';
import { ShortcutRow } from './ShortcutRow';

export interface ShortcutGroupProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  rows: ShortcutDisplayRow[];
  /** When rows empty after filter, return null (hide group) unless forceEmpty. */
  forceEmpty?: boolean;
  emptyMessage?: string;
  rowAction?: (row: ShortcutDisplayRow) => ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function ShortcutGroup({
  title,
  description,
  icon,
  rows,
  forceEmpty = false,
  emptyMessage = 'No shortcuts match.',
  rowAction,
  className = '',
  style,
}: ShortcutGroupProps) {
  if (rows.length === 0 && !forceEmpty) return null;

  return (
    <Card
      title={title}
      description={description}
      icon={icon}
      variant="bordered"
      className={className}
      style={style}
    >
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-zinc-500 text-center">{emptyMessage}</p>
      ) : (
        <div className="-mx-5 -mb-5 mt-0 border-t border-zinc-800/80">
          <div className="divide-y divide-zinc-800" role="list" aria-label={title}>
            {rows.map((row) => (
              <ShortcutRow key={row.id} row={row} action={rowAction?.(row)} />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
