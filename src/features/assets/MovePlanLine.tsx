import type { ReactNode } from 'react';

export function PlanLine({
  name,
  qty,
  trailing,
  dim = false,
}: {
  name: string;
  qty: ReactNode;
  trailing: ReactNode;
  dim?: boolean;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3 border-t border-line py-1.5 first:border-t-0">
      <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
      <span className="text-text-dim tabular-nums">{qty}</span>
      <span className={`min-w-[5.5em] text-right tabular-nums ${dim ? 'text-text-dim' : ''}`}>
        {trailing}
      </span>
    </li>
  );
}
