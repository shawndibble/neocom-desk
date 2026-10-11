import { barHeights } from './geometry';
import { CHART_COLOR } from './palette';
import { signedBarGeometry } from './signedBars';
import type { BarsChartModel } from './types';

/**
 * Vertical bars with the tallest labelled and picked out, and the time range
 * at both ends. A model with a loss or a reference line draws on a zero axis
 * instead: losses hang below it, the reference is a dashed line labelled at
 * the top beside the max.
 */
export function Bars({ model, height }: { model: BarsChartModel; height: number }) {
  const signed = model.ref !== undefined || model.values.some((v) => v < 0);
  return (
    <div aria-hidden="true" className="grid gap-1">
      <div className="flex justify-between gap-2 text-[0.6875rem] text-text-dim tabular-nums">
        <span>{model.max}</span>
        {model.ref && <span>{model.ref.label}</span>}
      </div>
      {signed ? (
        <SignedPlot model={model} height={height} />
      ) : (
        <PlainPlot model={model} height={height} />
      )}
      {(model.xStart || model.xEnd) && (
        <div className="flex justify-between gap-2 text-[0.6875rem] text-text-dim tabular-nums">
          <span>{model.xStart}</span>
          <span>{model.xEnd}</span>
        </div>
      )}
    </div>
  );
}

/** A 90-day series must fit a Small tile: hairline gaps once there are many bars. */
const gapOf = (bars: number) => (bars > 40 ? 'gap-px' : 'gap-0.5');

function PlainPlot({ model, height }: { model: BarsChartModel; height: number }) {
  const { heights, peak } = barHeights(model.values);
  return (
    <div
      className={`flex w-full items-end border-b border-line-bright ${gapOf(model.values.length)}`}
      style={{ height }}
    >
      {heights.map((h, i) => (
        <i
          // Bars are positional: a fixed-length series, oldest first.
          key={i}
          className={`block min-w-px flex-1 rounded-t-[1px] ${i === peak ? 'bg-accent' : 'bg-accent/55'}`}
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

function SignedPlot({ model, height }: { model: BarsChartModel; height: number }) {
  const { bars, baseline, ref, peak } = signedBarGeometry(model.values, model.ref?.value);
  return (
    <div className={`relative flex w-full ${gapOf(model.values.length)}`} style={{ height }}>
      {bars.map((bar, i) => (
        // Bars are positional: a fixed-length series, oldest first.
        <span key={i} className="relative block min-w-px flex-1">
          <i
            className={`absolute inset-x-0 block ${bar.negative ? 'rounded-b-[1px]' : 'rounded-t-[1px]'} ${
              !bar.negative && i !== peak ? 'opacity-55' : ''
            }`}
            style={{
              bottom: `${bar.from}%`,
              height: `${bar.size}%`,
              backgroundColor: bar.negative ? CHART_COLOR.iskNeg : CHART_COLOR.accent,
            }}
          />
        </span>
      ))}
      <i
        className="pointer-events-none absolute inset-x-0 block border-t border-line-bright"
        style={{ bottom: `${baseline}%` }}
      />
      {ref !== null && (
        <i
          className="pointer-events-none absolute inset-x-0 block border-t border-dashed border-text-dim"
          style={{ bottom: `${ref}%` }}
        />
      )}
    </div>
  );
}
