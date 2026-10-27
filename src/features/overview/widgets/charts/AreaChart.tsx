import { ChartHover } from './ChartHover';
import { areaCoords, areaPoints } from './geometry';
import type { AreaChartModel } from './types';

/** A line with a soft fill under it and its low and high labelled; hover (or a tap) reads a point's `tips`. Drawn aria-hidden; the summary carries the meaning. */
export function AreaChart({ model, height }: { model: AreaChartModel; height: number }) {
  const { line, polygon } = areaPoints(model.values, height);
  const dotY = areaCoords(model.values, height).map(({ y }) => y / height);
  return (
    <div aria-hidden="true" className="grid gap-1">
      {line.length > 0 && (
        <ChartHover
          tips={model.tips}
          layout="points"
          dotY={dotY}
          className="w-full"
          style={{ height }}
        >
          <svg
            aria-hidden="true"
            viewBox={`0 0 100 ${height}`}
            preserveAspectRatio="none"
            className="block w-full text-accent"
            style={{ height }}
          >
            <polygon points={polygon} fill="currentColor" opacity="0.16" />
            <polyline
              points={line.join(' ')}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              vectorEffect="non-scaling-stroke"
            />
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
    </div>
  );
}
