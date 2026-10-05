import type { ReactNode } from 'react';

/**
 * The bubble around a chart's hover readout: the same surface, text and
 * padding as `Tooltip`'s bubble (DESIGN.md §6c), so a chart's tooltip and any
 * other tooltip read as one thing. `tabular-nums` is the chart's own, so the
 * figures line up. Recharts positions it; this only dresses it.
 *
 * Body text is the dim tone, like `Tooltip`; a title or a figure that should
 * stand out says `text-text` itself.
 *
 * Keep the surface classes in step with the bubble in `Tooltip.tsx`.
 */
export function ChartTooltipShell({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none rounded-xs border border-line bg-panel p-2 text-[0.6875rem] font-normal text-text-dim tabular-nums shadow-lg shadow-black/50">
      {children}
    </div>
  );
}
