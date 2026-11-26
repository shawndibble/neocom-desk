import type { ReactNode } from 'react';

export function ChartTooltipShell({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none rounded-xs border border-line bg-panel p-2 text-[0.6875rem] font-normal text-text-dim tabular-nums shadow-lg shadow-black/50">
      {children}
    </div>
  );
}
