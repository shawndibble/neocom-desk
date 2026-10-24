import { ChartHover } from './ChartHover';
import { linesRuns } from './geometry';
import { CHART_COLOR } from './palette';
import type { LinesChartModel } from './types';

/** Colour alone never separates two lines: a slot's dash pattern (and the legend's label and figure) does too. */
const DASH = ['', '4 2', '1.5 2.5', '', '4 2', '1.5 2.5'];

/** Several lines on one scale, a legend naming each with where it ends, and a hover that reads every line for the day. Drawn aria-hidden; the summary carries the meaning. */
export function Lines({ model, height }: { model: LinesChartModel; height: number }) {
  const runs = linesRuns(
    model.series.map((s) => s.values),
    height
  );
  const drawn = runs.some((r) => r.length > 0);
  return (
    <div aria-hidden="true" className="grid gap-1">
      {drawn && (
        <ChartHover tips={model.tips} layout="points" className="w-full" style={{ height }}>
          <svg
            aria-hidden="true"
            viewBox={`0 0 100 ${height}`}
            preserveAspectRatio="none"
            className="block w-full"
            style={{ height }}
          >
            {model.series.map((s, i) =>
              runs[i]!.map((points, n) => (
                <polyline
                  key={`${s.key}:${n}`}
                  points={points}
                  fill="none"
                  stroke={CHART_COLOR[s.color]}
                  strokeWidth="1.6"
                  strokeDasharray={DASH[i % DASH.length] || undefined}
                  vectorEffect="non-scaling-stroke"
                />
              ))
            )}
          </svg>
        </ChartHover>
      )}
      <div className="flex justify-between gap-2 text-[0.6875rem] text-text-dim tabular-nums">
        <span>{model.low}</span>
        <span>
          {model.rangeLabel ? `${model.rangeLabel} · ` : ''}
          {model.high}
        </span>
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-[0.6875rem] text-text-dim">
        {model.series.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1 tabular-nums">
            <svg aria-hidden="true" viewBox="0 0 12 4" className="h-1 w-3 shrink-0">
              <line
                x1="0"
                x2="12"
                y1="2"
                y2="2"
                stroke={CHART_COLOR[s.color]}
                strokeWidth="2"
                strokeDasharray={DASH[i % DASH.length] || undefined}
              />
            </svg>
            <span className="text-text">{s.label}</span>
            <span>{s.end}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
