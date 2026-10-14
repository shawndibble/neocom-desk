import { useEffect, useRef, useState } from 'react';
import { ChartHover } from './ChartHover';
import { barHeights } from './geometry';
import { CHART_COLOR } from './palette';
import { signedBarGeometry } from './signedBars';
import type { BarsChartModel } from './types';

/** What one printed bar label needs, per character, plus a little air either side. */
const LABEL_CHAR_PX = 6;
const LABEL_GAP_PX = 8;
/** Room above and below a plot whose bars carry labels, so the tallest bar's label is not clipped. */
const LABEL_ROOM = 'my-3.5';

/** How many bars to skip between printed labels so none overlap, from the width the chart really got. */
function useLabelStride(labels: readonly string[] | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!labels || !el || typeof ResizeObserver === 'undefined') return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, [labels]);
  if (!labels || width <= 0) return { ref, stride: 1 };
  const widest = labels.reduce((m, label) => Math.max(m, label.length), 0);
  const slot = widest * LABEL_CHAR_PX + LABEL_GAP_PX;
  return { ref, stride: Math.max(1, Math.ceil((labels.length * slot) / width)) };
}

/**
 * Vertical bars with the tallest labelled and picked out, and the time range
 * at both ends. A model with a loss or a reference line draws on a zero axis
 * instead: losses hang below it, the reference is a dashed line labelled at
 * the top beside the max. A model of `gains` is green above that axis and red
 * below it, and may print a figure beside every bar instead of the max. Hover
 * (or a tap) on a bar reads its `tips`.
 */
export function Bars({ model, height }: { model: BarsChartModel; height: number }) {
  const signed = model.ref !== undefined || model.gains || model.values.some((v) => v < 0);
  const { ref, stride } = useLabelStride(model.barLabels);
  const labelled = model.barLabels !== undefined;
  return (
    <div aria-hidden="true" ref={ref} className="grid gap-1">
      {(!labelled || model.ref) && (
        <div className="flex justify-between gap-2 text-[0.6875rem] text-text-dim tabular-nums">
          {!labelled && <span>{model.max}</span>}
          {model.ref && <span className="ml-auto">{model.ref.label}</span>}
        </div>
      )}
      {signed ? (
        <SignedPlot model={model} height={height} stride={stride} />
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

/** A year-long series must fit a Small tile: hairline gaps once there are many bars. */
const gapOf = (bars: number) => (bars > 40 ? 'gap-px' : 'gap-0.5');

function PlainPlot({ model, height }: { model: BarsChartModel; height: number }) {
  const { heights, peak } = barHeights(model.values);
  return (
    <ChartHover
      tips={model.tips}
      layout="columns"
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
    </ChartHover>
  );
}

function SignedPlot({
  model,
  height,
  stride,
}: {
  model: BarsChartModel;
  height: number;
  stride: number;
}) {
  const { bars, baseline, ref, peak } = signedBarGeometry(model.values, model.ref?.value);
  const count = bars.length;
  const labels = model.barLabels;
  const positive = model.gains ? CHART_COLOR.iskPos : CHART_COLOR.accent;
  return (
    <ChartHover
      tips={model.tips}
      layout="columns"
      className={`flex w-full ${gapOf(count)} ${labels ? LABEL_ROOM : ''}`}
      style={{ height }}
    >
      {bars.map((bar, i) => (
        // Bars are positional: a fixed-length series, oldest first.
        <span key={i} className="relative block min-w-px flex-1">
          <i
            className={`absolute inset-x-0 block ${bar.negative ? 'rounded-b-[1px]' : 'rounded-t-[1px]'} ${
              !model.gains && !bar.negative && i !== peak ? 'opacity-55' : ''
            }`}
            style={{
              bottom: `${bar.from}%`,
              height: `${bar.size}%`,
              backgroundColor: bar.negative ? CHART_COLOR.iskNeg : positive,
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
      {labels?.map((label, i) =>
        (count - 1 - i) % stride === 0 && bars[i] && bars[i].size > 0 ? (
          <b
            key={i}
            className="pointer-events-none absolute -translate-x-1/2 text-[0.625rem] leading-none font-normal whitespace-nowrap text-text-dim tabular-nums"
            style={{
              left: `${((i + 0.5) / count) * 100}%`,
              ...(bars[i].negative
                ? { top: `calc(${100 - bars[i].from}% + 2px)` }
                : { bottom: `calc(${bars[i].from + bars[i].size}% + 2px)` }),
            }}
          >
            {label}
          </b>
        ) : null
      )}
    </ChartHover>
  );
}
