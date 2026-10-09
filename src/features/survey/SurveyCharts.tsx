/**
 * The Survey tab's two charts, drawn with Recharts on one shared time axis:
 * the volume left in the field, stacked by ore with a dot and a "pasted
 * amount" label on every scan and a dashed run to zero at the current pace,
 * and under it the mining rate between each pair of scans. Statically imports
 * `recharts`, so — same rule as `miningTax/MiningYieldCharts.tsx` — this must
 * only be reached through a dynamic `import()` from `SurveyBoard.tsx`.
 *
 * Ore layers borrow the clock-kind tokens (DESIGN.md "Clock kinds"): the same
 * rule every other categorical series follows, so no new palette.
 */
import { useTranslation } from 'react-i18next';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { ChartTooltipShell } from '@/components/ui/ChartTooltipShell';
import { formatEveClock } from '@/engine/survey/chatMessage';
import { timeTicks } from '@/engine/survey/timeTicks';
import type { SurveySummary } from '@/engine/survey/series';
import { formatCompactNumber } from '@/lib/compactNumber';
import { oreTone } from './surveyTones';

/** Left edge shared by both charts so their time axes line up. */
const Y_AXIS_WIDTH = 52;
const MARGIN = { top: 16, right: 12, bottom: 0, left: 0 };

interface VolumeRow {
  at: number;
  total?: number;
  delta?: number;
  projected?: number;
  [ore: string]: number | undefined;
}

function volumeRows(summary: SurveySummary): VolumeRow[] {
  const rows: VolumeRow[] = summary.points.map((p, i) => {
    const row: VolumeRow = { at: p.at, total: p.total };
    for (const ore of summary.oreNames) row[ore] = p.byOre[ore] ?? 0;
    if (i > 0) row.delta = summary.intervals[i - 1].mined;
    return row;
  });
  if (summary.etaAt !== null) {
    rows[rows.length - 1].projected = summary.leftVolume;
    rows.push({ at: summary.etaAt, projected: 0 });
  }
  return rows;
}

export function SurveyCharts({ summary }: { summary: SurveySummary }) {
  const { t } = useTranslation();
  // A little past the finish, so its marker and label sit inside the plot.
  const end = summary.etaAt ?? summary.lastAt;
  const domain: [number, number] = [summary.firstAt, end + (end - summary.firstAt) * 0.07];
  const ticks = timeTicks(domain[0], domain[1]);
  const rows = volumeRows(summary);
  // The rate is one flat block per pair of scans, from the earlier scan to the
  // later: a step area drawn from each interval's start, closed at the last
  // scan. The values are labelled at the middle of each block.
  const last = summary.intervals[summary.intervals.length - 1];
  const rateSteps =
    last === undefined
      ? []
      : [
          ...summary.intervals.map((i) => ({ at: i.from, rate: i.rate })),
          { at: last.to, rate: last.rate },
        ];
  const rateLabels = summary.intervals.map((i) => ({ at: (i.from + i.to) / 2, rate: i.rate }));
  // Both charts share this axis so their times line up; only the lower one shows it.
  const xAxis = (hide: boolean) => (
    <XAxis
      dataKey="at"
      type="number"
      scale="time"
      domain={domain}
      ticks={ticks}
      tickFormatter={formatEveClock}
      stroke="var(--color-line-bright)"
      tick={{ fill: 'var(--color-text-dim)', fontSize: 11 }}
      hide={hide}
    />
  );

  function VolumeTooltip({ active, payload }: TooltipContentProps) {
    const row = payload?.[0]?.payload as VolumeRow | undefined;
    if (!active || !row || row.total === undefined) return null;
    return (
      <ChartTooltipShell>
        <div className="font-semibold text-text">
          {t('survey.eveTime', { time: formatEveClock(row.at) })}
        </div>
        {summary.oreNames.map((ore) => (
          <div key={ore}>
            {ore}: {formatCompactNumber(row[ore] ?? 0)} m³
          </div>
        ))}
        <div className="text-text">
          {t('survey.chartTotal')}: {formatCompactNumber(row.total)} m³
        </div>
      </ChartTooltipShell>
    );
  }

  return (
    <div className="space-y-1">
      <figure aria-label={t('survey.chartVolume')} className="m-0">
        <div className="h-56 w-full">
          <ResponsiveContainer>
            <ComposedChart data={rows} margin={MARGIN}>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              {xAxis(true)}
              <YAxis
                width={Y_AXIS_WIDTH}
                tickFormatter={formatCompactNumber}
                stroke="var(--color-line-bright)"
                tick={{ fill: 'var(--color-text-dim)', fontSize: 11 }}
              />
              {summary.oreNames.map((ore, i) => (
                <Area
                  key={ore}
                  type="linear"
                  dataKey={ore}
                  name={ore}
                  stackId="ore"
                  stroke={oreTone(i)}
                  fill={oreTone(i)}
                  fillOpacity={0.45}
                  isAnimationActive={false}
                />
              ))}
              <Line
                type="linear"
                dataKey="total"
                stroke="var(--color-text-dim)"
                strokeWidth={1}
                dot={{
                  r: 3,
                  fill: 'var(--color-panel)',
                  stroke: 'var(--color-text)',
                  strokeWidth: 1.5,
                }}
                isAnimationActive={false}
                legendType="none"
              >
                <LabelList
                  dataKey="delta"
                  position="top"
                  offset={8}
                  fill="var(--color-text)"
                  fontSize={10}
                  formatter={(value: unknown) =>
                    typeof value === 'number' && value > 0 ? `−${formatCompactNumber(value)}` : ''
                  }
                />
              </Line>
              <Line
                type="linear"
                dataKey="projected"
                stroke="var(--color-text)"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
                legendType="none"
              />
              {summary.etaAt !== null && (
                <ReferenceLine
                  x={summary.etaAt}
                  stroke="var(--color-line-bright)"
                  strokeDasharray="2 3"
                  label={{
                    value: t('survey.chartDone', { time: formatEveClock(summary.etaAt) }),
                    position: 'insideTopLeft',
                    textAnchor: 'end',
                    fill: 'var(--color-text)',
                    fontSize: 11,
                  }}
                />
              )}
              <Tooltip content={VolumeTooltip} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <figcaption className="sr-only">{t('survey.chartVolume')}</figcaption>
      </figure>

      {rateSteps.length > 0 && (
        <figure aria-label={t('survey.chartRate')} className="m-0">
          <div className="h-32 w-full">
            <ResponsiveContainer>
              <ComposedChart data={rateSteps} margin={{ ...MARGIN, top: 20 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                {xAxis(false)}
                <YAxis
                  width={Y_AXIS_WIDTH}
                  tickFormatter={formatCompactNumber}
                  stroke="var(--color-line-bright)"
                  tick={{ fill: 'var(--color-text-dim)', fontSize: 11 }}
                  label={{
                    value: t('survey.chartRateAxis'),
                    position: 'insideTopLeft',
                    offset: 8,
                    fill: 'var(--color-text-dim)',
                    fontSize: 10,
                  }}
                />
                <Area
                  data={rateSteps}
                  dataKey="rate"
                  type="stepAfter"
                  stroke="var(--color-accent)"
                  fill="var(--color-accent-dim)"
                  fillOpacity={0.75}
                  isAnimationActive={false}
                />
                <Line
                  data={rateLabels}
                  dataKey="rate"
                  stroke="none"
                  dot={false}
                  isAnimationActive={false}
                  legendType="none"
                >
                  <LabelList
                    dataKey="rate"
                    position="top"
                    offset={4}
                    fill="var(--color-text)"
                    fontSize={10}
                    formatter={(value: unknown) =>
                      typeof value === 'number' ? Math.round(value).toLocaleString() : ''
                    }
                  />
                </Line>
                {summary.pace !== null && (
                  <ReferenceLine
                    y={summary.pace}
                    stroke="var(--color-text)"
                    strokeDasharray="5 4"
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <figcaption className="sr-only">{t('survey.chartRate')}</figcaption>
        </figure>
      )}
    </div>
  );
}
