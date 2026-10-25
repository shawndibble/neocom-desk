/**
 * The Survey tab's two charts, drawn with Recharts on one shared time axis:
 * the volume left in the field, stacked by ore with a dot and a total-volume
 * label on every scan and a dashed run to zero at the current pace,
 * and under it the mining rate between each pair of scans. Statically imports
 * `recharts`, so — same rule as `miningTax/MiningYieldCharts.tsx` — this must
 * only be reached through a dynamic `import()` from `SurveyBoard.tsx`.
 *
 * Ore layers borrow the clock-kind tokens (DESIGN.md "Clock kinds"): the same
 * rule every other categorical series follows, so no new palette.
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
  Tooltip,
  type TooltipContentProps,
} from 'recharts';
import { ChartTooltipShell } from '@/components/ui/ChartTooltipShell';
import { DataTable, SegmentedControl, type DataTableColumn } from '@/components/ui';
import { formatEveClock } from '@/engine/survey/chatMessage';
import { spacedLabels } from '@/engine/survey/labelSpacing';
import type { SurveySummary } from '@/engine/survey/series';
import type { SurveyChartView } from '@/engine/survey/chartViews';
import { formatCompactNumber } from '@/lib/compactNumber';
import {
  FULL_HEIGHT,
  MARGIN,
  makeScanDot,
  timeAxis,
  yAxis,
  Y_AXIS_WIDTH,
} from './surveyChartParts';
import { DepletionChart, IskChart, PaceByOreChart } from './SurveyViewCharts';
import { oreTone } from './surveyTones';
import { formatCount } from '@/lib/formatCount';
import { createNumberFormat } from '@/lib/numberLocale';

type PaceView = 'total' | 'ore';

const formatVolume = createNumberFormat({ maximumFractionDigits: 3 });

interface ScanTableRow {
  at: number;
  total: number;
  mined: number | null;
  byOre: Record<string, number>;
}

/** Room a label needs, in px: "301.8K" and "1,116" at 10px. */
const DELTA_LABEL_GAP = 46;
const RATE_LABEL_GAP = 34;

interface VolumeRow {
  at: number;
  total?: number;
  delta?: number;
  projected?: number;
  /** `total`, only on the scans whose label has room. */
  totalLabel?: number;
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

export function SurveyCharts({
  summary,
  onRemoveScan,
  compactHeight,
  view = 'ore',
}: {
  summary: SurveySummary;
  /** Offered to the survey's owner: the right-click menu on a scan's node removes it. */
  onRemoveScan?: (at: number) => void;
  /**
   * Draws only the volume chart at this height in px, as the Overview's Mining
   * survey widget does: its own time axis, no scan nodes or labels, no rate chart.
   */
  compactHeight?: number;
  /**
   * Which chart the volume slot shows: `ore` (default, the stacked ore volume),
   * `depletion` or `isk`. Ignored when `compactHeight` is set.
   */
  view?: SurveyChartView;
}) {
  const { t } = useTranslation();
  const compact = compactHeight !== undefined;
  const [plotWidth, setPlotWidth] = useState(0);
  const [paceView, setPaceView] = useState<PaceView>('total');
  const { domain, xAxis } = timeAxis(summary);
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
  // Scans can bunch up in time, so labels are thinned to the ones that fit.
  // Every scan keeps its dot; the tooltip carries the rest.
  const plotPx = Math.max(0, plotWidth - scalePx(Y_AXIS_WIDTH) - MARGIN.right);
  const pxAt = (at: number) => ((at - domain[0]) / (domain[1] - domain[0])) * plotPx;
  // Before the chart reports a width there is nothing to measure, so show all.
  const thin = (labels: { x: number; weight: number }[], gap: number) =>
    plotPx === 0 ? new Set(labels.keys()) : spacedLabels(labels, gap);
  // The projected finish row sits after the scans and draws no label.
  const deltaShown = thin(
    rows.slice(0, summary.points.length).map((r) => ({ x: pxAt(r.at), weight: r.total ?? 0 })),
    scalePx(DELTA_LABEL_GAP)
  );
  const rateShown = thin(
    rateLabels.map((r) => ({ x: pxAt(r.at), weight: r.rate })),
    scalePx(RATE_LABEL_GAP)
  );
  const chartRows = rows.map((r, i) => (deltaShown.has(i) ? { ...r, totalLabel: r.total } : r));
  const shownRateLabels = rateLabels.filter((_, i) => rateShown.has(i));

  const scanRows = useMemo<ScanTableRow[]>(
    () =>
      summary.points.map((p, i) => ({
        at: p.at,
        total: p.total,
        mined: i > 0 ? summary.intervals[i - 1].mined : null,
        byOre: p.byOre,
      })),
    [summary]
  );
  const volumeColumns = useMemo<DataTableColumn<ScanTableRow>[]>(
    () => [
      {
        id: 'at',
        header: t('survey.chartScan'),
        render: (r) => t('survey.eveTime', { time: formatEveClock(r.at) }),
      },
      {
        id: 'total',
        header: t('survey.chartTotal'),
        render: (r) => `${formatVolume(r.total)} m³`,
      },
      {
        id: 'mined',
        header: t('survey.tableMined'),
        render: (r) => (r.mined === null ? '' : `${formatVolume(r.mined)} m³`),
      },
      ...summary.oreNames.map((ore) => ({
        id: `ore:${ore}`,
        header: ore,
        render: (r: ScanTableRow) => `${formatVolume(r.byOre[ore] ?? 0)} m³`,
      })),
    ],
    [summary.oreNames, t]
  );
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
  const rateByOreColumns = useMemo<DataTableColumn<SurveySummary['intervals'][number]>[]>(
    () => [
      ...rateColumns.slice(0, 2),
      { ...rateColumns[2], header: t('survey.chartTotal') },
      ...summary.oreNames
        .filter((ore) => summary.intervals.some((i) => ore in i.minedByOre))
        .map((ore) => ({
          id: `ore:${ore}`,
          header: ore,
          render: (i: SurveySummary['intervals'][number]) =>
            `${formatCount((i.minedByOre[ore] ?? 0) / ((i.to - i.from) / 1000))} m³/s`,
        })),
    ],
    [rateColumns, summary.oreNames, summary.intervals, t]
  );

  function VolumeTooltip({ active, payload }: TooltipContentProps) {
    const row = payload?.[0]?.payload as VolumeRow | undefined;
    if (!active || !row || row.total === undefined) return null;
    // Most valuable first, which is the top of the stack, so the list reads like the chart.
    const layers = summary.oreNames.map((ore, i) => ({ ore, tone: oreTone(i) }));
    return (
      <ChartTooltipShell>
        <div className="min-w-48 space-y-1 text-xs">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-semibold text-text">
              {t('survey.eveTime', { time: formatEveClock(row.at) })}
            </span>
            {row.delta !== undefined && row.delta > 0 && (
              <span>{t('survey.chartMined', { amount: formatCompactNumber(row.delta) })}</span>
            )}
          </div>
          <div className="space-y-0.5 border-t border-line pt-1">
            {layers.map(({ ore, tone }) => {
              const value = row[ore] ?? 0;
              return (
                <div
                  key={ore}
                  className={`flex items-center gap-2 ${value === 0 ? 'opacity-50' : ''}`}
                >
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-xs"
                    style={{ background: tone }}
                  />
                  <span className="min-w-0 flex-1 truncate">{ore}</span>
                  <span className="text-text">{formatCompactNumber(value)} m³</span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between gap-4 border-t border-line pt-1 font-semibold text-text">
            <span>{t('survey.chartTotal')}</span>
            <span>{formatCompactNumber(row.total)} m³</span>
          </div>
          <div className="border-t border-line pt-1">
            {t('survey.scannedBy', {
              name: summary.points.find((p) => p.at === row.at)?.by ?? t('survey.anonymous'),
            })}
          </div>
        </div>
      </ChartTooltipShell>
    );
  }

  const nodeDot = makeScanDot(onRemoveScan);
  const rateLabel = paceView === 'ore' ? t('survey.chartRateByOre') : t('survey.chartRate');

  const plot = (
    <div className="w-full" style={{ height: compactHeight ?? FULL_HEIGHT }}>
      <ResponsiveContainer onResize={(w) => setPlotWidth(w)}>
        {/* Recharts stacks in the order the areas first registered, and a re-sort only moves them, so a new order remounts the chart. */}
        <ComposedChart key={summary.oreNames.join('|')} data={chartRows} margin={MARGIN}>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          {xAxis(!compact)}
          {yAxis({ compact })}
          {/* Stacked bottom-up, so the most valuable ore (first) is drawn last, on top. */}
          {summary.oreNames
            .map((ore, i) => ({ ore, i }))
            .reverse()
            .map(({ ore, i }) => (
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
            dot={compact ? false : nodeDot}
            isAnimationActive={false}
            legendType="none"
          >
            {!compact && (
              <LabelList
                dataKey="totalLabel"
                position="top"
                offset={8}
                fill="var(--color-text)"
                fontSize="0.625rem"
                formatter={(value: unknown) =>
                  typeof value === 'number' ? formatCompactNumber(value) : ''
                }
              />
            )}
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
                fontSize: '0.6875rem',
              }}
            />
          )}
          <Tooltip content={VolumeTooltip} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );

  if (!compact && view === 'depletion') return <DepletionChart summary={summary} />;
  if (!compact && view === 'isk') return <IskChart summary={summary} />;

  if (compact) return plot;

  return (
    <div className="space-y-1">
      <figure aria-label={t('survey.chartVolume')} className="m-0">
        {plot}
        <figcaption className="sr-only">{t('survey.chartVolume')}</figcaption>
        {/* On a wrapper: a <table> ignores sr-only's clip and still stretches the page. */}
        <div className="sr-only">
          <DataTable
            columns={volumeColumns}
            responsive="table"
            rows={scanRows}
            rowKey={(r) => r.at}
            label={t('survey.chartVolume')}
          />
        </div>
      </figure>

      {rateSteps.length > 0 && (
        <figure aria-label={rateLabel} className="m-0">
          <div className="flex justify-end">
            <SegmentedControl
              label={t('survey.paceView')}
              size="sm"
              value={paceView}
              onChange={setPaceView}
              options={[
                { value: 'total', label: t('survey.paceTotal') },
                { value: 'ore', label: t('survey.paceByOre') },
              ]}
            />
          </div>
          <div className="h-32 w-full">
            {paceView === 'ore' ? (
              <PaceByOreChart summary={summary} />
            ) : (
              <ResponsiveContainer>
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
                    <ReferenceLine
                      y={summary.pace}
                      stroke="var(--color-text)"
                      strokeDasharray="5 4"
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
          <figcaption className="sr-only">{rateLabel}</figcaption>
          <div className="sr-only">
            <DataTable
              columns={paceView === 'ore' ? rateByOreColumns : rateColumns}
              responsive="table"
              rows={summary.intervals}
              rowKey={(i) => i.from}
              label={rateLabel}
            />
          </div>
        </figure>
      )}
    </div>
  );
}
