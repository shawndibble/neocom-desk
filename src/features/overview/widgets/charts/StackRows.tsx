import { CHART_COLOR } from './palette';
import type { StackRowsChartModel } from './types';

/**
 * One full-width bar per row, each split into its parts by that row's own
 * total, with the figure at the end and one legend of the parts' totals. Drawn
 * aria-hidden; the model's summary carries the figures.
 */
export function StackRows({ model, maxRows }: { model: StackRowsChartModel; maxRows: number }) {
  return (
    <div aria-hidden="true" className="grid gap-2">
      <div className="grid gap-1.5">
        {model.rows.slice(0, maxRows).map((row) => {
          const total = row.parts.reduce((sum, part) => sum + Math.max(0, part.value), 0);
          return (
            <div
              key={row.key}
              className="grid grid-cols-[minmax(0,6rem)_1fr_auto] items-center gap-2 text-xs"
            >
              <span className="truncate text-text-dim">{row.label}</span>
              <span className="flex h-2 gap-px overflow-hidden rounded-[1px] bg-panel-2">
                {row.parts.map((part) =>
                  part.value > 0 && total > 0 ? (
                    <i
                      key={part.key}
                      className="block h-full"
                      style={{
                        width: `${((part.value / total) * 100).toFixed(1)}%`, // fixed format: CSS width
                        backgroundColor: CHART_COLOR[part.color],
                      }}
                    />
                  ) : null
                )}
              </span>
              <span className="tabular-nums">{row.text}</span>
            </div>
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-dim">
        {model.legend.map((part) => (
          <li key={part.key} className="flex items-center gap-1.5">
            <i
              className="inline-block size-2 flex-none rounded-[1px]"
              style={{ backgroundColor: CHART_COLOR[part.color] }}
            />
            <span>
              {part.label} <span className="tabular-nums">{part.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
