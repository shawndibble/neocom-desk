/**
 * The Omega coverage widget's chart: one bar per period (the widget range) of net income,
 * and a labelled horizontal line at each whole account's cost (1x, 2x...), so
 * a bar above a line reads as covering that many accounts. One series, so one
 * colour; the lines are neutral and carry text labels, never colour alone.
 * Statically imports `recharts`, so this must only be reached through the
 * dynamic `import()` in `OmegaCoverage.tsx` (Overview's shell never carries it).
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { ChartTooltipShell } from '@/components/ui/ChartTooltipShell';
import { ChartTipBody } from './ChartTipBody';
import { formatCompactNumber } from '@/lib/compactNumber';
import { scalePx } from '@/lib/fontScale';
import type { OmegaChartModel } from './types';

const Y_AXIS_WIDTH = 40;
/** Width of a line label such as "5 accounts". */
const LABEL_ROOM = 56;
const MARGIN = { top: 6, right: 8, bottom: 0, left: 0 };
/** A partial period's bar, lighter: the "partial" word in its tick and tooltip carries the meaning. */
const PARTIAL_OPACITY = 0.45;

type Bar = OmegaChartModel['bars'][number];

function BarTooltip({ active, payload }: TooltipContentProps) {
  const bar = payload?.[0]?.payload as Bar | undefined;
  if (!active || !bar || bar.tip.title === '') return null;
  return (
    <ChartTooltipShell>
      <div className="min-w-40 text-xs">
        <ChartTipBody tip={bar.tip} />
      </div>
    </ChartTooltipShell>
  );
}

export function OmegaCoverageChart({ model, height }: { model: OmegaChartModel; height: number }) {
  const top = Math.max(0, ...model.lines.map((l) => l.value), ...model.bars.map((b) => b.net));
  const bottom = Math.min(0, ...model.bars.map((b) => b.net));
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={model.bars} margin={MARGIN} barCategoryGap="22%">
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          <XAxis
            dataKey="label"
            // Room at the left for the lines' labels, so the first bar never sits under one.
            padding={{ left: scalePx(LABEL_ROOM), right: 0 }}
            interval="preserveStartEnd"
            tickLine={false}
            stroke="var(--color-line-bright)"
            tick={{ fill: 'var(--color-text-dim)', fontSize: '0.6875rem' }}
          />
          <YAxis
            width={scalePx(Y_AXIS_WIDTH)}
            domain={[bottom, top]}
            ticks={[bottom, 0, top].filter((v, i, all) => all.indexOf(v) === i)}
            tickFormatter={formatCompactNumber}
            tickLine={false}
            stroke="var(--color-line-bright)"
            tick={{ fill: 'var(--color-text-dim)', fontSize: '0.6875rem' }}
          />
          <Bar dataKey="net" maxBarSize={28} radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {model.bars.map((bar) => (
              <Cell
                key={bar.key}
                fill="var(--color-accent)"
                fillOpacity={bar.partial ? PARTIAL_OPACITY : 1}
              />
            ))}
          </Bar>
          {model.lines.map((line) => (
            <ReferenceLine
              key={line.label}
              y={line.value}
              stroke="var(--color-text-dim)"
              strokeDasharray="4 3"
              ifOverflow="visible"
              label={{
                value: line.label,
                position: 'insideTopLeft',
                fill: 'var(--color-text-dim)',
                fontSize: '0.6875rem',
              }}
            />
          ))}
          <Tooltip
            content={BarTooltip}
            cursor={{ fill: 'var(--color-line)', fillOpacity: 0.4 }}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
