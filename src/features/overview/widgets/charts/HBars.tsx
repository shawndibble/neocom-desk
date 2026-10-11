import { hbarPercent } from './geometry';
import { CHART_COLOR } from './palette';
import type { HBarsChartModel } from './types';

/** Labelled horizontal bars, one row per item, each with its figure at the end. */
export function HBars({ model, maxRows }: { model: HBarsChartModel; maxRows: number }) {
  return (
    <div aria-hidden="true" className="grid gap-1.5">
      {model.rows.slice(0, maxRows).map((row) => (
        <div
          key={row.key}
          className="grid grid-cols-[minmax(0,6rem)_1fr_auto] items-center gap-2 text-xs"
        >
          <span className="truncate text-text-dim">{row.label}</span>
          <span className="block h-2 overflow-hidden rounded-[1px] bg-panel-2">
            <i
              className="block h-full"
              style={{
                width: `${hbarPercent(row.share)}%`,
                backgroundColor: CHART_COLOR[row.color ?? 'accent'],
              }}
            />
          </span>
          <span className="tabular-nums">{row.text}</span>
        </div>
      ))}
    </div>
  );
}
