/**
 * The Survey tab's alternative chart views, each replacing the whole chart
 * area: ore left by percent, and ISK left. Statically imports `recharts`, so —
 * same rule as `SurveyCharts.tsx` — this must only be reached through a dynamic
 * `import()` from `SurveyBoard.tsx`. Read-only: no scan-node remove menu.
 */
import {
  cloneElement,
  useMemo,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { ChartTooltipShell } from '@/components/ui/ChartTooltipShell';
import { DataTable, type DataTableColumn } from '@/components/ui';
import { formatDuration, formatEveClock } from '@/engine/survey/chatMessage';
import {
  depletionSeries,
  iskSeries,
  paceAxisMax,
  type PaceByOreSeries,
  type SurveySeriesRow,
} from '@/engine/survey/chartViews';
import type { SurveySummary } from '@/engine/survey/series';
import { formatCompactNumber } from '@/lib/compactNumber';
import { FULL_HEIGHT, MARGIN, formatPace, makeScanDot, timeAxis, yAxis } from './surveyChartParts';
import { oreTone } from './surveyTones';
import { formatCount } from '@/lib/formatCount';

const PERCENT_TICKS = [0, 25, 50, 75, 100];
const formatPercent = (v: number) => `${v}%`;

function useScannedBy(summary: SurveySummary) {
  const { t } = useTranslation();
  return (at: number) =>
    t('survey.scannedBy', {
      name: summary.points.find((p) => p.at === at)?.by ?? t('survey.anonymous'),
    });
}

function Swatch({ tone }: { tone: string }) {
  return (
    <span aria-hidden="true" className="size-2 shrink-0 rounded-xs" style={{ background: tone }} />
  );
}

function ViewFigure({
  label,
  chart,
  table,
}: {
  label: string;
  chart: ReactElement;
  table: ReactNode;
}) {
  return (
    <figure aria-label={label} className="m-0">
      <div className="w-full" style={{ height: FULL_HEIGHT }}>
        <ResponsiveContainer>{chart}</ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{label}</figcaption>
      {/* On a wrapper: a <table> ignores sr-only's clip and still stretches the page. */}
      <div className="sr-only">{table}</div>
    </figure>
  );
}

export function DepletionChart({ summary }: { summary: SurveySummary }) {
  const { t } = useTranslation();
  const scannedBy = useScannedBy(summary);
  const rows = useMemo(() => depletionSeries(summary), [summary]);
  const { xAxis } = timeAxis(summary);
  const label = t('survey.chartDepletion');
  const pct = (v: number | undefined) => (v === undefined ? '' : `${Math.round(v)}%`);

  const columns = useMemo<DataTableColumn<SurveySeriesRow>[]>(
    () => [
      {
        id: 'at',
        header: t('survey.chartScan'),
        render: (r) => t('survey.eveTime', { time: formatEveClock(r.at) }),
      },
      { id: 'all', header: t('survey.chartAllOre'), render: (r) => pct(r.all) },
      ...summary.oreNames.map((ore) => ({
        id: `ore:${ore}`,
        header: ore,
        render: (r: SurveySeriesRow) => pct(r[ore]),
      })),
    ],
    [summary.oreNames, t]
  );

  function Tip({ active, payload }: TooltipContentProps) {
    const row = payload?.[0]?.payload as SurveySeriesRow | undefined;
    if (!active || !row) return null;
    return (
      <ChartTooltipShell>
        <div className="min-w-48 space-y-1 text-xs">
          <div className="font-semibold text-text">
            {t('survey.eveTime', { time: formatEveClock(row.at) })}
          </div>
          <div className="space-y-0.5 border-t border-line pt-1">
            {summary.oreNames.map((ore, i) =>
              row[ore] === undefined ? null : (
                <div key={ore} className="flex items-center gap-2">
                  <Swatch tone={oreTone(i)} />
                  <span className="min-w-0 flex-1 truncate">{ore}</span>
                  <span className="text-text">
                    {t('survey.chartPercentLeft', { percent: Math.round(row[ore]) })}
                  </span>
                </div>
              )
            )}
          </div>
          {row.all !== undefined && (
            <div className="flex justify-between gap-4 border-t border-line pt-1 font-semibold text-text">
              <span>{t('survey.chartAllOre')}</span>
              <span>{t('survey.chartPercentLeft', { percent: Math.round(row.all) })}</span>
            </div>
          )}
          <div className="border-t border-line pt-1">{scannedBy(row.at)}</div>
        </div>
      </ChartTooltipShell>
    );
  }

  const nodeDot = makeScanDot();
  return (
    <ViewFigure
      label={label}
      chart={
        <ComposedChart key={summary.oreNames.join('|')} data={rows} margin={MARGIN}>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          {xAxis(false)}
          {cloneElement(yAxis() as ReactElement<ComponentProps<typeof YAxis>>, {
            domain: [0, 100],
            ticks: PERCENT_TICKS,
            tickFormatter: formatPercent,
          })}
          <Line
            type="linear"
            dataKey="all"
            name={t('survey.chartAllOre')}
            stroke="var(--color-text-dim)"
            strokeWidth={1}
            dot={false}
            isAnimationActive={false}
            legendType="none"
          />
          {summary.oreNames.map((ore, i) => (
            <Line
              key={ore}
              type="linear"
              dataKey={ore}
              name={ore}
              stroke={oreTone(i)}
              strokeWidth={2}
              dot={nodeDot}
              connectNulls
              isAnimationActive={false}
              legendType="none"
            />
          ))}
          <Tooltip content={Tip} isAnimationActive={false} />
        </ComposedChart>
      }
      table={
        <DataTable
          columns={columns}
          responsive="table"
          rows={rows}
          rowKey={(r) => r.at}
          label={label}
        />
      }
    />
  );
}

export function IskChart({ summary }: { summary: SurveySummary }) {
  const { t } = useTranslation();
  const scannedBy = useScannedBy(summary);
  const { rows, pricedOres, unpricedOres, toneIndex } = useMemo(
    () => iskSeries(summary),
    [summary]
  );
  const { xAxis } = timeAxis(summary);
  const label = t('survey.chartIsk');
  const scanRows = rows.slice(0, summary.points.length);
  const isk = (v: number | undefined) => (v === undefined ? '' : `${formatCount(v)} ISK`);

  const columns = useMemo<DataTableColumn<SurveySeriesRow>[]>(
    () => [
      {
        id: 'at',
        header: t('survey.chartScan'),
        render: (r) => t('survey.eveTime', { time: formatEveClock(r.at) }),
      },
      { id: 'total', header: t('survey.tableIskTotal'), render: (r) => isk(r.total) },
      {
        id: 'minedIsk',
        header: t('survey.tableIskMined'),
        render: (r) => (r.minedIsk === undefined ? '' : isk(r.minedIsk)),
      },
      ...pricedOres.map((ore) => ({
        id: `ore:${ore}`,
        header: ore,
        render: (r: SurveySeriesRow) => isk(r[ore]),
      })),
    ],
    [pricedOres, t]
  );

  function Tip({ active, payload }: TooltipContentProps) {
    const row = payload?.[0]?.payload as SurveySeriesRow | undefined;
    if (!active || !row || row.total === undefined) return null;
    return (
      <ChartTooltipShell>
        <div className="min-w-48 space-y-1 text-xs">
          <div className="font-semibold text-text">
            {t('survey.eveTime', { time: formatEveClock(row.at) })}
          </div>
          <div className="space-y-0.5 border-t border-line pt-1">
            {pricedOres.map((ore) => (
              <div key={ore} className="flex items-center gap-2">
                <Swatch tone={oreTone(toneIndex[ore])} />
                <span className="min-w-0 flex-1 truncate">{ore}</span>
                <span className="text-text">{formatCompactNumber(row[ore] ?? 0)} ISK</span>
              </div>
            ))}
            {unpricedOres.map((ore) => (
              <div key={ore} className="flex items-center gap-2 opacity-50">
                <Swatch tone={oreTone(toneIndex[ore])} />
                <span className="min-w-0 flex-1 truncate">{ore}</span>
                <span>{t('survey.chartNoPrice')}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between gap-4 border-t border-line pt-1 font-semibold text-text">
            <span>{t('survey.chartTotal')}</span>
            <span>{formatCompactNumber(row.total)} ISK</span>
          </div>
          {row.minedIsk !== undefined && row.minedIsk > 0 && (
            <div>{t('survey.chartIskMined', { amount: formatCompactNumber(row.minedIsk) })}</div>
          )}
          <div className="border-t border-line pt-1">{scannedBy(row.at)}</div>
        </div>
      </ChartTooltipShell>
    );
  }

  const nodeDot = makeScanDot();
  return (
    <ViewFigure
      label={label}
      chart={
        <ComposedChart key={pricedOres.join('|')} data={rows} margin={MARGIN}>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          {xAxis(false)}
          {yAxis()}
          {/* Stacked bottom-up, so the most valuable ore (first) is drawn last, on top. */}
          {[...pricedOres].reverse().map((ore) => (
            <Area
              key={ore}
              type="linear"
              dataKey={ore}
              name={ore}
              stackId="ore"
              stroke={oreTone(toneIndex[ore])}
              fill={oreTone(toneIndex[ore])}
              fillOpacity={0.45}
              isAnimationActive={false}
            />
          ))}
          <Line
            type="linear"
            dataKey="total"
            stroke="var(--color-text-dim)"
            strokeWidth={1}
            dot={nodeDot}
            isAnimationActive={false}
            legendType="none"
          />
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
          <Tooltip content={Tip} isAnimationActive={false} />
        </ComposedChart>
      }
      table={
        <DataTable
          columns={columns}
          responsive="table"
          rows={scanRows}
          rowKey={(r) => r.at}
          label={label}
        />
      }
    />
  );
}

/** What Recharts hands a pace line's dot. */
interface PaceDotProps {
  cx?: number;
  cy?: number;
  payload?: SurveySeriesRow;
}

/** Dots only on an interval's middle row: a lone interval between idle ones is still visible. */
function makePaceDot(tone: string) {
  return function PaceDot({ cx, cy, payload }: PaceDotProps): ReactElement<SVGElement> {
    if (payload?.mid === undefined || typeof cx !== 'number' || typeof cy !== 'number') {
      return <g key={`none-${payload?.at ?? 'x'}`} />;
    }
    return (
      <circle
        key={payload.at}
        cx={cx}
        cy={cy}
        r={3}
        fill={tone}
        stroke="var(--color-panel)"
        strokeWidth={2}
      />
    );
  };
}

/**
 * The Depletion view's pace chart: one line per ore in the legend's colours, each interval a flat
 * step at the percent of that ore's starting total mined during it. An ore not mined in an
 * interval has no value there, so its line breaks instead of resting on the baseline. The caller
 * wraps it in its figure and table; only the plot is here.
 */
export function PaceByOreChart({
  summary,
  pace,
}: {
  summary: SurveySummary;
  pace: PaceByOreSeries;
}) {
  const { t } = useTranslation();
  const { rows, activeOres, toneIndex, maxPercent } = pace;
  const { xAxis } = timeAxis(summary);

  function Tip({ active, payload }: TooltipContentProps) {
    const row = payload?.[0]?.payload as SurveySeriesRow | undefined;
    if (!active || !row || row.from === undefined || row.to === undefined) return null;
    const slices = activeOres
      .map((ore) => ({ ore, percent: row[ore] }))
      .filter((s): s is { ore: string; percent: number } => s.percent !== undefined)
      .sort((a, b) => b.percent - a.percent);
    return (
      <ChartTooltipShell>
        <div className="min-w-48 space-y-1 text-xs">
          <div className="font-semibold text-text">
            {t('survey.paceRange', {
              from: formatEveClock(row.from),
              to: formatEveClock(row.to),
            })}
          </div>
          <div className="text-text-dim">
            {t('survey.paceLength', { length: formatDuration(row.to - row.from) })}
          </div>
          <div className="space-y-0.5 border-t border-line pt-1">
            {slices.map(({ ore, percent }) => (
              <div key={ore} className="flex items-center gap-2">
                <Swatch tone={oreTone(toneIndex[ore])} />
                <span className="min-w-0 flex-1 truncate">{ore}</span>
                <span className="text-text">
                  {t('survey.pacePercentOf', { percent: formatPace(percent), ore })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </ChartTooltipShell>
    );
  }

  return (
    <ResponsiveContainer>
      <ComposedChart key={activeOres.join('|')} data={rows} margin={{ ...MARGIN, top: 20 }}>
        <CartesianGrid stroke="var(--color-line)" vertical={false} />
        {xAxis(false)}
        {yAxis({
          domain: [0, paceAxisMax(maxPercent)],
          label: {
            value: t('survey.paceAxis'),
            position: 'insideTopLeft',
            offset: 8,
            fill: 'var(--color-text-dim)',
            fontSize: '0.625rem',
          },
        })}
        {activeOres.map((ore) => (
          <Line
            key={ore}
            type="linear"
            dataKey={ore}
            name={ore}
            stroke={oreTone(toneIndex[ore])}
            strokeWidth={1.5}
            connectNulls={false}
            dot={makePaceDot(oreTone(toneIndex[ore]))}
            activeDot={false}
            isAnimationActive={false}
            legendType="none"
          />
        ))}
        <Tooltip content={Tip} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
