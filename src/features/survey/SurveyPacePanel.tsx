/**
 * The pace figures under the Survey's charts, on the same time axis as the chart
 * above them: `TotalPaceFigure` (Ore left) is the mining rate between each pair
 * of scans as one area; `ByOrePaceFigure` (Depletion by ore) is, per ore, the percent
 * of its starting total mined in each interval. Each carries its hidden data table.
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
} from 'recharts';
import { DataTable, type DataTableColumn } from '@/components/ui';
import { formatEveClock } from '@/engine/survey/chatMessage';
import type { SurveySummary } from '@/engine/survey/series';
import { paceByOreSeries, type PaceInterval } from '@/engine/survey/chartViews';
import { formatCount } from '@/lib/formatCount';
import { MARGIN, formatPace, thinLabels, timeAxis, yAxis } from './surveyChartParts';
import { PaceByOreChart } from './SurveyViewCharts';

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
  const columns = useMemo<DataTableColumn<SurveySummary['intervals'][number]>[]>(
    () => [
      { id: 'from', header: t('survey.tableFrom'), render: (i) => formatEveClock(i.from) },
      { id: 'to', header: t('survey.tableTo'), render: (i) => formatEveClock(i.to) },
      {
        id: 'rate',
        header: t('survey.tableRate'),
        render: (i) => `${formatCount(i.rate)} m³/s`,
      },
    ],
    [t]
  );

  // The rate is one flat block per pair of scans, from the earlier scan to the
  // later: a step area drawn from each interval's start, closed at the last
  // scan. The values are labelled at the middle of each block.
  const last = summary.intervals[summary.intervals.length - 1];
  if (last === undefined) return null;
  const rateSteps = [
    ...summary.intervals.map((i) => ({ at: i.from, rate: i.rate })),
    { at: last.to, rate: last.rate },
  ];
  const rateLabels = summary.intervals.map((i) => ({ at: (i.from + i.to) / 2, rate: i.rate }));
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
          <ComposedChart data={rateSteps} margin={{ ...MARGIN, top: 20 }}>
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
              data={shownRateLabels}
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
                fontSize="0.625rem"
                formatter={(value: unknown) =>
                  typeof value === 'number' ? formatCount(value) : ''
                }
              />
            </Line>
            {summary.pace !== null && (
              <ReferenceLine y={summary.pace} stroke="var(--color-text)" strokeDasharray="5 4" />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      }
      table={
        <DataTable
          columns={columns}
          responsive="table"
          rows={summary.intervals}
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
  const pace = useMemo(() => paceByOreSeries(summary), [summary]);
  const columns = useMemo<DataTableColumn<PaceInterval>[]>(
    () => [
      { id: 'from', header: t('survey.tableFrom'), render: (i) => formatEveClock(i.from) },
      { id: 'to', header: t('survey.tableTo'), render: (i) => formatEveClock(i.to) },
      ...pace.activeOres.map((ore) => ({
        id: `ore:${ore}`,
        header: ore,
        render: (i: PaceInterval) =>
          i.percents[ore] === undefined
            ? '–'
            : t('survey.paceTablePercent', { percent: formatPace(i.percents[ore]) }),
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
