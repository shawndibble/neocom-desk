import { divergingHeights } from './geometry';
import { CHART_COLOR } from './palette';
import type { DivergingChartModel } from './types';

/**
 * Paired bars either side of an axis: what came in above it, what went out
 * below it, one pair per period. The largest bar is labelled and the span is
 * named at both ends. Drawn aria-hidden; the model's summary carries the figures.
 */
export function DivergingBars({ model, height }: { model: DivergingChartModel; height: number }) {
  const { up, down, split } = divergingHeights(model.up, model.down);
  return (
    <div aria-hidden="true" className="grid gap-1">
      <div className="text-[0.6875rem] text-text-dim tabular-nums">{model.max}</div>
      <div className="flex w-full gap-0.5" style={{ height }}>
        {up.map((upHeight, i) => (
          <div
            // Bars are positional: a fixed-length series, oldest first.
            key={i}
            className="grid min-w-0.5 flex-1 grid-rows-2"
            style={{ gridTemplateRows: `${split}fr ${1 - split}fr` }}
          >
            <div className="flex items-end border-b border-line-bright">
              <i
                className="block w-full rounded-t-[1px]"
                style={{ height: `${upHeight}%`, backgroundColor: CHART_COLOR.iskPos }}
              />
            </div>
            <div className="flex items-start">
              <i
                className="block w-full rounded-b-[1px]"
                style={{ height: `${down[i]}%`, backgroundColor: CHART_COLOR.iskNeg }}
              />
            </div>
          </div>
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
