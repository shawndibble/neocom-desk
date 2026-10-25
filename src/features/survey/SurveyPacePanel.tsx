/**
 * The pace figures under the Survey's charts, on the same time axis as the chart
 * above them: `TotalPaceFigure` (Ore left) is the mining rate between each pair
 * of scans, stacked by the ores mined in it; `ByOrePaceFigure` (Depletion by ore) is, per interval, each ore's
 * share of the progress made (a 100% bar). Each carries its hidden data table.
 * Statically imports `recharts`, so — same rule as `SurveyCharts.tsx` — this must only
 * be reached through a dynamic `import()` from `SurveyBoard.tsx`.
 */
import { scalePx } from '@/lib/fontScale';
import { useMemo, useState, type ReactNode } from 'react';
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
  type TooltipContentProps,
} from 'recharts';
import { ChartTooltipShell } from '@/components/ui/ChartTooltipShell';
import { DataTable, type DataTableColumn } from '@/components/ui';
import { formatDuration, formatEveClock } from '@/engine/survey/chatMessage';
import type { SurveySummary } from '@/engine/survey/series';
import {
  paceShareSeries,
  rateByOreSeries,
  type PaceInterval,
  type RateInterval,
  type RateRow,
} from '@/engine/survey/chartViews';
import { formatCount } from '@/lib/formatCount';
import { createNumberFormat } from '@/lib/numberLocale';
import { MARGIN, formatPace, thinLabels, timeAxis, yAxis } from './surveyChartParts';
import { PaceByOreChart, Swatch } from './SurveyViewCharts';
import { oreTone } from './surveyTones';

/** A rate in the tooltip and table: one decimal, so a slow ore doesn't read as 0. */
const formatRate = createNumberFormat({ maximumFractionDigits: 1 });

/** Room a rate label needs, in px: "1,116" at 10px. */
const RATE_LABEL_GAP = 34;

function PaceFigure({
  label,
  chart,
  table,
}: {
  label: string;
  chart: ReactNode;
  table: ReactNode;
}) {
  return (
    <figure aria-label={label} className="m-0">
      <div className="h-32 w-full">{chart}</div>
      <figcaption className="sr-only">{label}</figcaption>
      <div className="sr-only">{table}</div>
    </figure>
  );
}

export function TotalPaceFigure({ summary }: { summary: SurveySummary }) {
  const { t } = useTranslation();
  const [plotWidth, setPlotWidth] = useState(0);
  const { domain, xAxis } = timeAxis(summary);
  const label = t('survey.chartRate');
  const series = useMemo(() => rateByOreSeries(summary), [summary]);
  const { intervals, rows, activeOres, toneIndex } = series;
  const columns = useMemo<DataTableColumn<RateInterval>[]>(
    () => [
      { id: 'from', header: t('survey.tableFrom'), render: (i) => formatEveClock(i.from) },
      { id: 'to', header: t('survey.tableTo'), render: (i) => formatEveClock(i.to) },
      {
        id: 'rate',
        header: t('survey.tableRate'),
        render: (i) => `${formatRate(i.rate)} m³/s`,
      },
      ...activeOres.map((ore) => ({
        id: `ore:${ore}`,
        header: ore,
        render: (i: RateInterval) =>
          i.rates[ore] === undefined ? '–' : `${formatRate(i.rates[ore])} m³/s`,
      })),
    ],
    [activeOres, t]
  );

  function Tip({ active, payload }: TooltipContentProps) {
    const row = payload?.[0]?.payload as RateRow | undefined;
    const interval = row === undefined ? undefined : intervals[row.interval];
    if (!active || interval === undefined) return null;
    const ranked = activeOres
      .filter((ore) => interval.rates[ore] !== undefined)
      .sort((a, b) => interval.rates[b] - interval.rates[a]);
    return (
      <ChartTooltipShell>
        <div className="min-w-48 space-y-1 text-xs">
          <div className="font-semibold text-text">
            {t('survey.paceRange', {
              from: formatEveClock(interval.from),
              to: formatEveClock(interval.to),
            })}
          </div>
          <div className="text-text-dim">
            {t('survey.paceLength', { length: formatDuration(interval.to - interval.from) })}
          </div>
          {ranked.length > 0 && (
            <div className="space-y-0.5 border-t border-line pt-1">
              {ranked.map((ore) => (
                <div key={ore} className="flex items-center gap-2">
                  <Swatch tone={oreTone(toneIndex[ore])} />
                  <span className="min-w-0 flex-1 truncate">{ore}</span>
                  <span className="text-text">{formatRate(interval.rates[ore])} m³/s</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between gap-4 border-t border-line pt-1 font-semibold text-text">
            <span>{t('survey.chartTotal')}</span>
            <span>{formatRate(interval.rate)} m³/s</span>
          </div>
        </div>
      </ChartTooltipShell>
    );
  }

  // Each interval is one flat block from the earlier scan to the later, stacked
  // by the ores mined in it: step areas over the series' rows, closed at the
  // last scan. The totals are labelled at the middle of each block.
  if (intervals.length === 0) return null;
  const rateLabels = intervals.map((i) => ({ at: (i.from + i.to) / 2, rate: i.rate }));
  // Labels are thinned to the ones that fit; the tooltip carries the rest.
  const shown = thinLabels(
    rateLabels.map((r) => ({ at: r.at, weight: r.rate })),
    domain,
    plotWidth,
    scalePx(RATE_LABEL_GAP)
  );
  const shownRateLabels = rateLabels.filter((_, i) => shown.has(i));

  return (
    <PaceFigure
      label={label}
      chart={
        <ResponsiveContainer onResize={(w) => setPlotWidth(w)}>
          {/* Recharts stacks in the order the areas first registered, so a new set of ores remounts the chart. */}
          <ComposedChart key={activeOres.join('|')} data={rows} margin={{ ...MARGIN, top: 20 }}>
            <CartesianGrid stroke="var(--color-line)" vertical={false} />
            {xAxis(false)}
            {yAxis({
              label: {
                value: t('survey.chartRateAxis'),
                position: 'insideTopLeft',
                offset: 8,
                fill: 'var(--color-text-dim)',
                fontSize: '0.625rem',
              },
            })}
            {/* Stacked bottom-up, so the most valuable ore (first) is drawn last, on top, as on Ore left. */}
            {activeOres
              .slice()
              .reverse()
              .map((ore) => (
                <Area
                  key={ore}
                  dataKey={ore}
                  name={ore}
                  type="stepAfter"
                  stackId="rate"
                  stroke={oreTone(toneIndex[ore])}
                  fill={oreTone(toneIndex[ore])}
                  fillOpacity={0.45}
                  activeDot={false}
                  isAnimationActive={false}
                />
              ))}
            <Line
              data={shownRateLabels}
              dataKey="rate"
              stroke="none"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              legendType="none"
            >
              <LabelList
                dataKey="rate"
                position="top"
                offset={4}
                fill="var(--color-text)"
                fontSize="0.625rem"
                formatter={(value: unknown) =>
                  typeof value === 'number' ? formatCount(value) : ''
                }
              />
            </Line>
            {summary.pace !== null && (
              <ReferenceLine y={summary.pace} stroke="var(--color-text)" strokeDasharray="5 4" />
            )}
            <Tooltip content={Tip} cursor={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      }
      table={
        <DataTable
          columns={columns}
          responsive="table"
          rows={intervals}
          rowKey={(i) => i.from}
          label={label}
        />
      }
    />
  );
}

export function ByOrePaceFigure({ summary }: { summary: SurveySummary }) {
  const { t } = useTranslation();
  const label = t('survey.chartRateByOre');
  const pace = useMemo(() => paceShareSeries(summary), [summary]);
  const columns = useMemo<DataTableColumn<PaceInterval>[]>(
    () => [
      { id: 'from', header: t('survey.tableFrom'), render: (i) => formatEveClock(i.from) },
      { id: 'to', header: t('survey.tableTo'), render: (i) => formatEveClock(i.to) },
      {
        id: 'progress',
        header: t('survey.tableProgress'),
        render: (i: PaceInterval) => `${formatPace(i.progress)}%`,
      },
      // One column per ore: its share of the interval's progress, then its raw percent in brackets.
      ...pace.activeOres.map((ore) => ({
        id: `ore:${ore}`,
        header: ore,
        render: (i: PaceInterval) =>
          i.shares[ore] === undefined
            ? '–'
            : t('survey.paceTableCell', {
                share: formatPace(i.shares[ore]),
                percent: formatPace(i.percents[ore]),
              }),
      })),
    ],
    [pace.activeOres, t]
  );

  if (summary.intervals.length === 0) return null;
  return (
    <PaceFigure
      label={label}
      chart={<PaceByOreChart summary={summary} pace={pace} />}
      table={
        <DataTable
          columns={columns}
          responsive="table"
          rows={pace.intervals}
          rowKey={(i) => i.from}
          label={label}
        />
      }
    />
  );
}
