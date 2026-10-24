import { cx } from '@/lib/cx';
import { useId, useState } from 'react';
import { ChartHover } from './ChartHover';
import { linesRuns, runFills } from './geometry';
import { CHART_COLOR } from './palette';
import type { LinesChartModel } from './types';

const DIMMED = 0.25;

/**
 * One line gets a soft fill under it and no legend (the title and Number view
 * name it); several lines get thin distinct-colour strokes and a compact
 * legend whose entries, hovered or focused, bring their line to full weight
 * and dim the rest (weight, not colour alone, marks the pick). The drawing is
 * aria-hidden; the summary carries the meaning and the hover reads every line.
 */
export function Lines({ model, height }: { model: LinesChartModel; height: number }) {
  const gradient = `fill-${useId().replace(/:/g, '')}`;
  const [active, setActive] = useState<string | null>(null);
  const runs = linesRuns(
    model.series.map((s) => s.values),
    height
  );
  const drawn = runs.some((r) => r.length > 0);
  const single = model.series.length === 1;
  const picked = !single && active !== null && model.series.some((s) => s.key === active);
  return (
    <div className="grid gap-1">
      {drawn && (
        <ChartHover tips={model.tips} layout="points" className="w-full" style={{ height }}>
          <svg
            aria-hidden="true"
            viewBox={`0 0 100 ${height}`}
            preserveAspectRatio="none"
            className="block w-full"
            style={{ height }}
          >
            {single && (
              <>
                <defs>
                  <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
                    <stop
                      offset="0"
                      stopColor={CHART_COLOR[model.series[0]!.color]}
                      stopOpacity="0.35"
                    />
                    <stop
                      offset="1"
                      stopColor={CHART_COLOR[model.series[0]!.color]}
                      stopOpacity="0"
                    />
                  </linearGradient>
                </defs>
                {runFills(runs[0]!, height).map((points, n) => (
                  <polygon key={`fill:${n}`} points={points} fill={`url(#${gradient})`} />
                ))}
              </>
            )}
            {model.series.map((s, i) =>
              runs[i]!.map((points, n) => {
                const on = picked && s.key === active;
                return (
                  <polyline
                    key={`${s.key}:${n}`}
                    points={points}
                    fill="none"
                    stroke={CHART_COLOR[s.color]}
                    strokeWidth={single ? 1.6 : on ? 2.4 : 1.1}
                    strokeLinejoin="round"
                    opacity={picked && !on ? DIMMED : 1}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })
            )}
          </svg>
        </ChartHover>
      )}
      {(model.low !== undefined || model.high !== undefined) && (
        <div className="flex justify-between gap-2 text-[0.6875rem] text-text-dim tabular-nums">
          <span>{model.low}</span>
          <span>
            {model.rangeLabel ? `${model.rangeLabel} · ` : ''}
            {model.high}
          </span>
        </div>
      )}
      {!single && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-3 gap-y-0.5 text-[0.6875rem] text-text-dim">
          {model.series.map((s) => {
            const on = picked && s.key === active;
            return (
              <li
                key={s.key}
                data-active={on || undefined}
                className="flex min-w-0 items-center gap-1 rounded-xs tabular-nums"
                onPointerEnter={() => setActive(s.key)}
                onPointerLeave={() => setActive(null)}
              >
                <svg aria-hidden="true" viewBox="0 0 12 4" className="h-1 w-3 shrink-0">
                  <line
                    x1="0"
                    x2="12"
                    y1="2"
                    y2="2"
                    stroke={CHART_COLOR[s.color]}
                    strokeWidth={on ? 3 : 2}
                  />
                </svg>
                <span
                  className={cx(
                    'min-w-0 truncate',
                    on ? 'font-semibold text-text underline' : 'text-text'
                  )}
                >
                  {s.label}
                </span>
                <span className="ml-auto shrink-0">{s.end}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
