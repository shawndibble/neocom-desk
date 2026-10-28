/**
 * The Survey tab's charts, drawn with Recharts on one shared time axis. Ore left
 * (the default) is the volume left in the field, stacked by ore with a dot and a
 * total-volume label on every scan and a dashed run to zero at the current pace,
 * and under it the total mining rate between each pair of scans. Depletion by
 * ore is its chart with the mining rate stacked by ore under it; ISK left is one
 * chart. Statically imports
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
import { DataTable, type DataTableColumn } from '@/components/ui';
import { formatEveClock } from '@/engine/survey/chatMessage';
import type { SurveySummary } from '@/engine/survey/series';
import type { SurveyChartView } from '@/engine/survey/chartViews';
import { formatCompactNumber } from '@/lib/compactNumber';
import { FULL_HEIGHT, MARGIN, makeScanDot, thinLabels, timeAxis, yAxis } from './surveyChartParts';
import { DepletionChart, IskChart } from './SurveyViewCharts';
import { ByOrePaceFigure, TotalPaceFigure } from './SurveyPacePanel';
import { oreTone } from './surveyTones';
import { createNumberFormat } from '@/lib/numberLocale';

const formatVolume = createNumberFormat({ maximumFractionDigits: 3 });

interface ScanTableRow {
  at: number;
  total: number;
  mined: number | null;
  byOre: Record<string, number>;
}

/** Room a label needs, in px: "301.8K" and "1,116" at 10px. */
const DELTA_LABEL_GAP = 46;

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
  const { domain, xAxis } = timeAxis(summary);
  const rows = volumeRows(summary);
  // Scans can bunch up in time, so labels are thinned to the ones that fit.
  // Every scan keeps its dot; the tooltip carries the rest. The projected
  // finish row sits after the scans and draws no label.
  const rowsWithTotal = rows.slice(0, summary.points.length);
  const deltaShown = thinLabels(
    rowsWithTotal.map((r) => ({ at: r.at, weight: r.total ?? 0 })),
    domain,
    plotWidth,
    scalePx(DELTA_LABEL_GAP)
  );
  const chartRows = rows.map((r, i) => (deltaShown.has(i) ? { ...r, totalLabel: r.total } : r));

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
        stickyStart: true,
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

  if (!compact && view === 'depletion') {
    return (
      <div className="space-y-1">
        <DepletionChart summary={summary} />
        {summary.intervals.length > 0 && <ByOrePaceFigure summary={summary} />}
      </div>
    );
  }
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

      {summary.intervals.length > 0 && <TotalPaceFigure summary={summary} />}
    </div>
  );
}
