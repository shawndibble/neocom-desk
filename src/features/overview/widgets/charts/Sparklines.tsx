import { areaPoints } from './geometry';
import { CHART_COLOR } from './palette';
import type { SparkChartModel } from './types';

const SPARK_HEIGHT = 22;

/** A small line per row, labelled at the start and with its latest figure at the end. */
export function Sparklines({ model, maxRows }: { model: SparkChartModel; maxRows: number }) {
  return (
    <div aria-hidden="true" className="grid gap-1.5">
      {model.rows.slice(0, maxRows).map((row) => (
        <div
          key={row.key}
          className="grid grid-cols-[minmax(0,4.875rem)_1fr_auto] items-center gap-2 text-xs"
        >
          <span className="truncate text-text-dim">{row.label}</span>
          <svg
            viewBox={`0 0 100 ${SPARK_HEIGHT}`}
            preserveAspectRatio="none"
            className="block w-full"
            style={{ height: SPARK_HEIGHT, color: CHART_COLOR[row.color ?? 'accent'] }}
          >
            <polyline
              points={areaPoints(row.values, SPARK_HEIGHT).line.join(' ')}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <b className="font-semibold tabular-nums">{row.text}</b>
        </div>
      ))}
    </div>
  );
}
