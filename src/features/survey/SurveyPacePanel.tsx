/**
 * The pace panel under the Survey's volume and depletion charts: the mining rate
 * between each pair of scans, as one Total area or stacked by ore, on the same
 * time axis as the chart above it. Statically imports `recharts`, so — same rule
 * as `SurveyCharts.tsx` — this must only be reached through a dynamic `import()`
 * from `SurveyBoard.tsx`. Which of the two it draws is the caller's `paceView`.
 */
import { scalePx } from '@/lib/fontScale';
import { useMemo, useState } from 'react';
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
import { spacedLabels } from '@/engine/survey/labelSpacing';
import type { SurveySummary } from '@/engine/survey/series';
import { paceByOreSeries, type PaceInterval } from '@/engine/survey/chartViews';
import { formatCount } from '@/lib/formatCount';
import { MARGIN, timeAxis, yAxis, Y_AXIS_WIDTH } from './surveyChartParts';
import { PaceByOreChart } from './SurveyViewCharts';

/** `total`: the one-area rate (Ore left view); `ore`: stacked by ore (Depletion view). */
export type PaceView = 'total' | 'ore';

/** Room a rate label needs, in px: "1,116" at 10px. */
const RATE_LABEL_GAP = 34;

export function SurveyPacePanel({
  summary,
  paceView,
}: {
  summary: SurveySummary;
  paceView: PaceView;
}) {
  const { t } = useTranslation();
  const [plotWidth, setPlotWidth] = useState(0);
  const { domain, xAxis } = timeAxis(summary);
  const paceByOre = useMemo(() => paceByOreSeries(summary), [summary]);

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
  const plotPx = Math.max(0, plotWidth - scalePx(Y_AXIS_WIDTH) - MARGIN.right);
  const pxAt = (at: number) => ((at - domain[0]) / (domain[1] - domain[0])) * plotPx;
  const rateShown =
    plotPx === 0
      ? new Set(rateLabels.keys())
      : spacedLabels(
          rateLabels.map((r) => ({ x: pxAt(r.at), weight: r.rate })),
          scalePx(RATE_LABEL_GAP)
        );
  const shownRateLabels = rateLabels.filter((_, i) => rateShown.has(i));
  const rateLabel = paceView === 'ore' ? t('survey.chartRateByOre') : t('survey.chartRate');

  return (
    <PaceFigure
      summary={summary}
      paceView={paceView}
      rateLabel={rateLabel}
      paceByOre={paceByOre}
      totalChart={
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
    />
  );
}

function PaceFigure({
  summary,
  paceView,
  rateLabel,
  paceByOre,
  totalChart,
}: {
  summary: SurveySummary;
  paceView: PaceView;
  rateLabel: string;
  paceByOre: ReturnType<typeof paceByOreSeries>;
  totalChart: React.ReactElement;
}) {
  const { t } = useTranslation();
  const rateColumns = useMemo<DataTableColumn<SurveySummary['intervals'][number]>[]>(
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
  const rateByOreColumns = useMemo<DataTableColumn<PaceInterval>[]>(() => {
    const unit = (rate: number) => t('survey.paceUnit', { rate: formatCount(rate) });
    return [
      { id: 'from', header: t('survey.tableFrom'), render: (i) => formatEveClock(i.from) },
      { id: 'to', header: t('survey.tableTo'), render: (i) => formatEveClock(i.to) },
      { id: 'total', header: t('survey.chartTotal'), render: (i) => unit(i.total) },
      ...paceByOre.activeOres.map((ore) => ({
        id: `ore:${ore}`,
        header: ore,
        render: (i: PaceInterval) => unit(i.rates[ore] ?? 0),
      })),
    ];
  }, [paceByOre.activeOres, t]);

  return (
    <figure aria-label={rateLabel} className="m-0">
      <div className="h-32 w-full">
        {paceView === 'ore' ? <PaceByOreChart summary={summary} /> : totalChart}
      </div>
      <figcaption className="sr-only">{rateLabel}</figcaption>
      <div className="sr-only">
        {paceView === 'ore' ? (
          <DataTable
            columns={rateByOreColumns}
            responsive="table"
            rows={paceByOre.intervals}
            rowKey={(i) => i.from}
            label={rateLabel}
          />
        ) : (
          <DataTable
            columns={rateColumns}
            responsive="table"
            rows={summary.intervals}
            rowKey={(i) => i.from}
            label={rateLabel}
          />
        )}
      </div>
    </figure>
  );
}
