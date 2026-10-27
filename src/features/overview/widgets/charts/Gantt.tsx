import { ganttBar, ganttNowPercent } from './geometry';
import { CHART_COLOR } from './palette';
import type { GanttChartModel } from './types';

/**
 * Jobs laid on one shared time axis: a bar from each start to its end, a
 * dashed now marker through every row and the axis labelled at its start, now
 * and end. A bar that runs past either edge of the axis ends in an arrow; a
 * finished job is a full bar with its "Ready" at the row's end, so colour is
 * never the only cue.
 */
export function Gantt({ model, maxRows }: { model: GanttChartModel; maxRows: number }) {
  const now = ganttNowPercent(model.axis);
  return (
    <div aria-hidden="true" className="grid gap-1.5 text-xs">
      {model.rows.slice(0, maxRows).map((row) => {
        const bar = ganttBar(row.startMs, row.endMs, model.axis);
        return (
          <div
            key={row.key}
            className="grid grid-cols-[minmax(0,5rem)_1fr_4.5rem] items-center gap-2"
          >
            <span className="truncate text-text-dim">{row.label}</span>
            <span className="relative block h-2.5 rounded-[1px] bg-panel-2">
              <i
                className="absolute inset-y-0 block rounded-[1px]"
                style={{
                  left: `${bar.left}%`,
                  width: `${bar.width}%`,
                  backgroundColor: CHART_COLOR[row.color],
                }}
              />
              {bar.clippedStart && (
                <i
                  className="absolute top-1/2 left-0.5 block -translate-y-1/2 border-y-[3px] border-r-[4px] border-y-transparent border-r-text"
                  data-overflow="start"
                />
              )}
              {bar.clippedEnd && (
                <i
                  className="absolute top-1/2 right-0.5 block -translate-y-1/2 border-y-[3px] border-l-[4px] border-y-transparent border-l-text"
                  data-overflow="end"
                />
              )}
              <i
                className="absolute -inset-y-0.5 block border-l border-dashed border-text"
                style={{ left: `${now}%` }}
              />
            </span>
            <span className="text-right tabular-nums">{row.text}</span>
          </div>
        );
      })}
      <div className="grid grid-cols-[minmax(0,5rem)_1fr_4.5rem] gap-2 text-[0.6875rem] text-text-dim">
        <span />
        <span className="relative block h-4">
          <span className="absolute left-0">{model.labels.from}</span>
          <span
            className="absolute text-text"
            style={{ left: `${Math.min(Math.max(now, 12), 88)}%`, transform: 'translateX(-50%)' }}
          >
            {model.labels.now}
          </span>
          <span className="absolute right-0">{model.labels.to}</span>
        </span>
        <span />
      </div>
    </div>
  );
}
