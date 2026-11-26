import type { ReactNode } from 'react';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { Well } from '@/components/ui/Well';
import { OreIcon, OreLink } from './OreIcon';

export interface OrePricedLine {
  typeId: number;
  name: string;
  quantity: ReactNode;
  unit?: string;
  source?: string;
}

export function OrePricedCard({
  title,
  lines,
  note,
}: {
  title: string;
  lines: readonly OrePricedLine[];
  note?: ReactNode;
}) {
  return (
    <Well className="space-y-1">
      <p className={eyebrowClassName}>{title}</p>
      <ul className="divide-y divide-line text-xs">
        {lines.map((l) => (
          <li key={l.typeId} className="flex flex-wrap items-center gap-x-2 gap-y-0 py-1">
            <OreIcon typeId={l.typeId} size={32} className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              <OreLink typeId={l.typeId}>{l.name}</OreLink>
            </span>
            <span className="tabular-nums text-text-dim">
              <span>{l.quantity}</span>
              {l.unit !== undefined && <span> × {l.unit}</span>}
            </span>
            {l.source && <span className="text-text-dim">{l.source}</span>}
          </li>
        ))}
      </ul>
      {note && <div className="space-y-1 text-xs text-text-dim">{note}</div>}
    </Well>
  );
}
