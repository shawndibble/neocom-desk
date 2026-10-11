import { barHeights } from './geometry';
import type { BarsChartModel } from './types';

/** Vertical bars with the tallest labelled and picked out, and the time range at both ends. */
export function Bars({ model, height }: { model: BarsChartModel; height: number }) {
  const { heights, peak } = barHeights(model.values);
  return (
    <div aria-hidden="true" className="grid gap-1">
      <div className="text-[0.6875rem] text-text-dim tabular-nums">{model.max}</div>
      <div className="flex w-full items-end gap-0.5 border-b border-line-bright" style={{ height }}>
        {heights.map((h, i) => (
          <i
            // Bars are positional: a fixed-length series, oldest first.
            key={i}
            className={`block min-w-0.5 flex-1 rounded-t-[1px] ${i === peak ? 'bg-accent' : 'bg-accent/55'}`}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      {(model.xStart || model.xEnd) && (
        <div className="flex justify-between gap-2 text-[0.6875rem] text-text-dim tabular-nums">
          <span>{model.xStart}</span>
          <span>{model.xEnd}</span>
        </div>
      )}
    </div>
  );
}
