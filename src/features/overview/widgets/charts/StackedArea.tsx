import { ChartHover } from './ChartHover';
import { stackedAreaBands } from './geometry';
import { CHART_COLOR } from './palette';
import { StackBar } from './StackBar';
import type { StackedAreaChartModel } from './types';

/**
 * Layers piled up over time, so how a total moved and which layer moved it are
 * one picture, with the legend in layer order. At Small there is no room for a
 * history, so it is the latest day as one bar. Drawn aria-hidden; the model's
 * summary carries the figures.
 */
export function StackedArea({
  model,
  height,
  compact,
}: {
  model: StackedAreaChartModel;
  height: number;
  /** Draw only the latest day as a bar. */
  compact: boolean;
}) {
  if (compact) return <StackBar model={{ kind: 'stack', parts: model.parts, summary: '' }} />;
  const bands = stackedAreaBands(
    model.layers.map((layer) => layer.values),
    height
  );
  return (
    <div aria-hidden="true" className="grid gap-1.5">
      <div className="grid gap-1">
        <div className="text-[0.6875rem] text-text-dim tabular-nums">{model.max}</div>
        <ChartHover
          tips={model.tips}
          layout="points"
          className="w-full border-b border-line-bright"
          style={{ height }}
        >
          <svg
            aria-hidden="true"
            viewBox={`0 0 100 ${height}`}
            preserveAspectRatio="none"
            className="block w-full"
            style={{ height }}
          >
            {bands.map((points, i) => (
              <polygon
                key={model.layers[i]!.key}
                points={points}
                fill={CHART_COLOR[model.layers[i]!.color]}
                opacity="0.85"
              />
            ))}
          </svg>
        </ChartHover>
        {(model.xStart || model.xEnd) && (
          <div className="flex justify-between gap-2 text-[0.6875rem] text-text-dim tabular-nums">
            <span>{model.xStart}</span>
            <span>{model.xEnd}</span>
          </div>
        )}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-dim">
        {model.parts.map((part) => (
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
