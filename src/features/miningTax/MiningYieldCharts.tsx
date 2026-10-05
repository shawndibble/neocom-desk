/**
 * Draws the Mining Yield Overview tab's two charts with Recharts (issue
 * #671). Statically imports `recharts`, so — same rule as
 * `market/PriceHistoryChart.tsx` — this must only ever be reached through a
 * dynamic `import()` from `OverviewTab.tsx`, never imported eagerly.
 */
import { ChartTooltipShell } from '@/components/ui/ChartTooltipShell';
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  Cell,
  LabelList,
  type TooltipContentProps,
} from 'recharts';
import type { PriceSource } from '@/engine/miningTax/priceBasis';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, Panel, type DataTableColumn } from '@/components/ui';
import {
  COMPACT_ISK_Y_AXIS_MARGIN_LEFT,
  COMPACT_ISK_Y_AXIS_WIDTH,
  COMPACT_COUNT_Y_AXIS_WIDTH,
} from '@/lib/chartAxis';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { formatCompactNumber } from '@/lib/compactNumber';
import {
  topTypesWithOther,
  topValuesWithOther,
  type RankedType,
  type ValueRanked,
} from './topTypes';
import type { DailyMetricPoint } from './chartAggregation';
import { SOURCE_FILL } from './priceSourceTone';
import type { ChartMetric } from './chartMetricPref';

export interface DailyRatePoint {
  date: string;
  iskPerHour: number;
  /** The day's weakest price source (issue #1279); null on a day with no mining. */
  source: PriceSource | null;
}

const LEGEND_SOURCES: PriceSource[] = ['saved', 'historical', 'average', 'live'];

export type TypeComparisonPoint = RankedType;

/** Bars the ore-type chart draws before folding the rest into "Other". */
const TOP_TYPE_LIMIT = 8;

/** A drawn bar — one type, or the "Other" roll-up carrying the types it folds. */
interface ComparisonBar extends TypeComparisonPoint {
  folded?: TypeComparisonPoint[];
}

interface MiningYieldChartsProps {
  /** Which quantity the two charts plot (issue #2160). ISK keeps every prior behaviour byte-for-byte; volume/count are a separate, simpler render. */
  metric: ChartMetric;
  dailyRate: DailyRatePoint[];
  dailyVolume: DailyMetricPoint[];
  dailyCount: DailyMetricPoint[];
  typeComparison: TypeComparisonPoint[];
  typeVolumeComparison: ValueRanked[];
  typeCountComparison: ValueRanked[];
  /** Issue #1281's page switch — raw-only bars with end labels and a note, no refined series at all. Ignored for volume/count, which never show a refined series or Legend. */
  showRefining: boolean;
}

/** A drawn bar for the volume/count comparison chart — one type, or the "Other" roll-up carrying the types it folds. */
interface MetricComparisonBar extends ValueRanked {
  folded?: ValueRanked[];
}

/** `date` is a bare calendar date — build the tick from Y/M/D components, never `new Date(string)`, to avoid a UTC/local day shift. */
function formatDateTick(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function RateTooltip({
  active,
  payload,
  label,
}: TooltipContentProps): React.ReactElement | null {
  const { t } = useTranslation();
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as DailyRatePoint | undefined;
  if (!point) return null;
  return (
    <ChartTooltipShell>
      <p className="font-semibold text-text">
        {typeof label === 'string' ? formatDateTick(label) : ''}
      </p>
      <p>
        {t('miningTax.overview.iskPerHour')}: {formatIsk(point.iskPerHour, 0)} ISK
      </p>
      <p className="text-text-dim">{t('miningTax.overview.rateChartBasis')}</p>
      {point.source && (
        <p>
          {t('miningTax.overview.sourceColumn')}:{' '}
          {t(`miningTax.overview.priceSource.${point.source}`)}
        </p>
      )}
    </ChartTooltipShell>
  );
}

function CompareTooltip({
  active,
  payload,
  showRefining,
}: TooltipContentProps & { showRefining: boolean }): React.ReactElement | null {
  const { t } = useTranslation();
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as ComparisonBar | undefined;
  if (!point) return null;
  return (
    <ChartTooltipShell>
      <p className="font-semibold text-text">{point.typeName}</p>
      <p>
        {t('miningTax.overview.rawSellValue')}: {formatIsk(point.rawValue, 0)} ISK
      </p>
      {showRefining && (
        <p>
          {t('miningTax.overview.refineValue')}: {formatIsk(point.refineValue, 0)} ISK
        </p>
      )}
      {point.folded && (
        <ul className="mt-1 border-t border-line pt-1 text-text-dim">
          {point.folded.map((type) => (
            <li key={type.typeId}>
              {type.typeName}: {formatIsk(type.rawValue, 0)}
              {showRefining && ` / ${formatIsk(type.refineValue, 0)}`}
            </li>
          ))}
        </ul>
      )}
    </ChartTooltipShell>
  );
}

/** `formatCompactNumber`, plus an "m³" suffix for the volume metric — count has no unit. */
function formatMetricCompact(metric: 'volume' | 'count', value: number): string {
  return metric === 'volume' ? `${formatCompactNumber(value)} m³` : formatCompactNumber(value);
}

/** `toLocaleString`, plus an "m³" suffix for the volume metric — the sr-only tables' full-precision figure. */
function formatMetricFull(metric: 'volume' | 'count', value: number): string {
  return metric === 'volume' ? `${value.toLocaleString()} m³` : value.toLocaleString();
}

function MetricRateTooltip({
  active,
  payload,
  label,
  metric,
}: TooltipContentProps & { metric: 'volume' | 'count' }): React.ReactElement | null {
  const { t } = useTranslation();
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as DailyMetricPoint | undefined;
  if (!point) return null;
  const valueLabel = t(
    metric === 'volume' ? 'miningTax.overview.m3PerHour' : 'miningTax.overview.countPerHour'
  );
  return (
    <ChartTooltipShell>
      <p className="font-semibold text-text">
        {typeof label === 'string' ? formatDateTick(label) : ''}
      </p>
      <p>
        {valueLabel}: {formatMetricCompact(metric, point.value)}
      </p>
      <p className="text-text-dim">
        {t(
          metric === 'volume'
            ? 'miningTax.overview.rateChartBasisVolume'
            : 'miningTax.overview.rateChartBasisCount'
        )}
      </p>
    </ChartTooltipShell>
  );
}

function MetricCompareTooltip({
  active,
  payload,
  metric,
}: TooltipContentProps & { metric: 'volume' | 'count' }): React.ReactElement | null {
  const { t } = useTranslation();
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as MetricComparisonBar | undefined;
  if (!point) return null;
  const valueLabel = t(
    metric === 'volume' ? 'miningTax.overview.volumeTotal' : 'miningTax.overview.countTotal'
  );
  return (
    <ChartTooltipShell>
      <p className="font-semibold text-text">{point.typeName}</p>
      <p>
        {valueLabel}: {formatMetricCompact(metric, point.value)}
      </p>
      {point.folded && (
        <ul className="mt-1 border-t border-line pt-1 text-text-dim">
          {point.folded.map((type) => (
            <li key={type.typeId}>
              {type.typeName}: {formatMetricCompact(metric, type.value)}
            </li>
          ))}
        </ul>
      )}
    </ChartTooltipShell>
  );
}

function IskCharts({
  dailyRate,
  typeComparison,
  showRefining,
}: Pick<MiningYieldChartsProps, 'dailyRate' | 'typeComparison' | 'showRefining'>) {
  const { t } = useTranslation();
  const compareChartTitle = t(
    showRefining
      ? 'miningTax.overview.compareChartTitle'
      : 'miningTax.overview.compareChartTitleRawOnly'
  );

  // Screen-reader tables, one per chart: `role="img"` hides the bars, and
  // the ore chart folds its tail into "Other", so the table carries every
  // type rather than the drawn bars.
  const rateColumns = useMemo<DataTableColumn<DailyRatePoint>[]>(
    () => [
      {
        id: 'date',
        header: t('miningTax.overview.dateColumn'),
        render: (point) => formatDateTick(point.date),
      },
      {
        id: 'iskPerHour',
        header: t('miningTax.overview.iskPerHour'),
        render: (point) => `${formatIsk(point.iskPerHour, 0)} ISK`,
      },
      {
        id: 'source',
        header: t('miningTax.overview.sourceColumn'),
        render: (point) =>
          point.source ? t(`miningTax.overview.priceSource.${point.source}`) : '',
      },
    ],
    [t]
  );
  const compareColumns = useMemo<DataTableColumn<TypeComparisonPoint>[]>(
    () => [
      {
        id: 'type',
        header: t('miningTax.overview.typeColumn'),
        render: (point) => point.typeName,
      },
      {
        id: 'rawValue',
        header: t('miningTax.overview.rawSellValue'),
        render: (point) => `${formatIsk(point.rawValue, 0)} ISK`,
      },
      ...(showRefining
        ? [
            {
              id: 'refineValue',
              header: t('miningTax.overview.refineValue'),
              render: (point: TypeComparisonPoint) => `${formatIsk(point.refineValue, 0)} ISK`,
            },
          ]
        : []),
    ],
    [t, showRefining]
  );

  // Past TOP_TYPE_LIMIT the rest fold into one "Other" bar, so the card
  // stops growing with the number of types; the table below lists every one.
  const { top, other } = topTypesWithOther(typeComparison, {
    limit: TOP_TYPE_LIMIT,
    by: showRefining ? 'both' : 'raw',
  });
  const compareBars: ComparisonBar[] = other
    ? [
        ...top,
        {
          typeId: -1,
          typeName: t('miningTax.overview.otherTypes', { count: other.types.length }),
          rawValue: other.rawValue,
          refineValue: other.refineValue,
          folded: other.types,
        },
      ]
    : top;

  // Horizontal bars: ore names read left of the bar instead of slanted under it.
  // Same row height with refining on or off — the raw and refined bars split
  // the row — so toggling refining only adds the legend's height.
  const compareHeight = Math.max(256, compareBars.length * 24 + (showRefining ? 56 : 32));

  // Two cards, same gap as the stat cards above them.
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Panel padded>
        <p className="mb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('miningTax.overview.rateChartTitle')}
        </p>
        <p className="mb-1 text-[0.6875rem] text-text-dim">
          {t('miningTax.overview.rateChartBasis')}
        </p>
        <div role="img" aria-label={t('miningTax.overview.rateChartTitle')} className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={dailyRate}
              margin={{ top: 8, right: 8, left: COMPACT_ISK_Y_AXIS_MARGIN_LEFT, bottom: 0 }}
            >
              <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateTick}
                stroke="var(--color-text-dim)"
                tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
              />
              <YAxis
                stroke="var(--color-text-dim)"
                tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
                width={COMPACT_ISK_Y_AXIS_WIDTH}
                // SVG axis text: IskAmount can't render inside the chart (documented exception).
                tickFormatter={(value: number) => formatIskCompact(value)}
              />
              <Tooltip content={(props) => <RateTooltip {...props} />} />
              <Bar
                isAnimationActive={false}
                dataKey="iskPerHour"
                name={t('miningTax.overview.iskPerHour')}
              >
                {dailyRate.map((point) => (
                  <Cell key={point.date} fill={SOURCE_FILL[point.source ?? 'saved']} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* A sibling of the `role="img"` box, never a child — see WalletBalanceChart. */}
        {/* On a wrapper: a <table> ignores sr-only's clip and still stretches the page. */}
        <div className="sr-only">
          <DataTable
            columns={rateColumns}
            rows={dailyRate}
            rowKey={(point) => point.date}
            label={t('miningTax.overview.rateChartTitle')}
          />
        </div>
        <ul className="mt-1 flex flex-wrap gap-x-3.5 text-[0.6875rem] text-text-dim">
          {LEGEND_SOURCES.map((source) => (
            <li key={source} className="flex items-center gap-1">
              <span
                aria-hidden="true"
                className="size-2"
                style={{ background: SOURCE_FILL[source] }}
              />
              {t(`miningTax.overview.priceSource.${source}`)}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel padded>
        <p className="mb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {compareChartTitle}
        </p>
        <div
          role="img"
          aria-label={compareChartTitle}
          className="w-full"
          style={{ height: compareHeight }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={compareBars}
              layout="vertical"
              margin={{ top: 8, right: showRefining ? 16 : 56, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
              <XAxis
                type="number"
                stroke="var(--color-text-dim)"
                tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
                // SVG axis text: IskAmount can't render inside the chart (documented exception).
                tickFormatter={(value: number) => formatIskCompact(value)}
              />
              <YAxis
                type="category"
                dataKey="typeName"
                stroke="var(--color-text-dim)"
                tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
                interval={0}
                width={120}
              />
              <Tooltip
                content={(props) => <CompareTooltip {...props} showRefining={showRefining} />}
              />
              {showRefining && <Legend wrapperStyle={{ fontSize: '0.6875rem' }} />}
              <Bar
                isAnimationActive={false}
                dataKey="rawValue"
                fill="var(--color-line-bright)"
                name={t('miningTax.overview.rawSellValue')}
              >
                {!showRefining && (
                  <LabelList
                    dataKey="rawValue"
                    position="right"
                    formatter={(value: unknown) => formatIskCompact(Number(value))}
                    style={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
                  />
                )}
              </Bar>
              {showRefining && (
                <Bar
                  isAnimationActive={false}
                  dataKey="refineValue"
                  fill="var(--color-accent)"
                  name={t('miningTax.overview.refineValue')}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* On a wrapper: a <table> ignores sr-only's clip and still stretches the page. */}
        <div className="sr-only">
          <DataTable
            columns={compareColumns}
            rows={typeComparison}
            rowKey={(point) => point.typeId}
            label={compareChartTitle}
          />
        </div>
        {!showRefining && (
          <p className="mt-1 text-[0.6875rem] text-text-dim">
            {t('miningTax.overview.refiningHiddenNote')}
          </p>
        )}
      </Panel>
    </div>
  );
}

/**
 * The volume/count render (issue #2160): a single-series rate chart and a
 * single-series ore-type chart, always in "raw only" shape — no refined
 * series, no Legend, regardless of the show-refining toggle, since neither
 * metric has a refined side.
 */
function MetricCharts({
  metric,
  dailyPoints,
  typeComparison,
}: {
  metric: 'volume' | 'count';
  dailyPoints: DailyMetricPoint[];
  typeComparison: ValueRanked[];
}) {
  const { t } = useTranslation();
  const rateChartTitle = t(
    metric === 'volume'
      ? 'miningTax.overview.rateChartTitleVolume'
      : 'miningTax.overview.rateChartTitleCount'
  );
  const rateChartBasis = t(
    metric === 'volume'
      ? 'miningTax.overview.rateChartBasisVolume'
      : 'miningTax.overview.rateChartBasisCount'
  );
  const compareChartTitle = t(
    metric === 'volume'
      ? 'miningTax.overview.compareChartTitleVolume'
      : 'miningTax.overview.compareChartTitleCount'
  );
  const rateValueLabel = t(
    metric === 'volume' ? 'miningTax.overview.m3PerHour' : 'miningTax.overview.countPerHour'
  );
  const totalValueLabel = t(
    metric === 'volume' ? 'miningTax.overview.volumeTotal' : 'miningTax.overview.countTotal'
  );

  const rateColumns = useMemo<DataTableColumn<DailyMetricPoint>[]>(
    () => [
      {
        id: 'date',
        header: t('miningTax.overview.dateColumn'),
        render: (point) => formatDateTick(point.date),
      },
      {
        id: 'value',
        header: rateValueLabel,
        render: (point) => formatMetricFull(metric, point.value),
      },
    ],
    [t, rateValueLabel, metric]
  );
  const compareColumns = useMemo<DataTableColumn<ValueRanked>[]>(
    () => [
      {
        id: 'type',
        header: t('miningTax.overview.typeColumn'),
        render: (point) => point.typeName,
      },
      {
        id: 'value',
        header: totalValueLabel,
        render: (point) => formatMetricFull(metric, point.value),
      },
    ],
    [t, totalValueLabel, metric]
  );

  const { top, other } = topValuesWithOther(typeComparison, { limit: TOP_TYPE_LIMIT });
  const compareBars: MetricComparisonBar[] = other
    ? [
        ...top,
        {
          typeId: -1,
          typeName: t('miningTax.overview.otherTypes', { count: other.types.length }),
          value: other.value,
          folded: other.types,
        },
      ]
    : top;
  // Always the "raw only" row height/margin — there is never a second series here.
  const compareHeight = Math.max(256, compareBars.length * 24 + 32);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Panel padded>
        <p className="mb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {rateChartTitle}
        </p>
        <p className="mb-1 text-[0.6875rem] text-text-dim">{rateChartBasis}</p>
        <div role="img" aria-label={rateChartTitle} className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={dailyPoints}
              margin={{ top: 8, right: 8, left: COMPACT_ISK_Y_AXIS_MARGIN_LEFT, bottom: 0 }}
            >
              <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateTick}
                stroke="var(--color-text-dim)"
                tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
              />
              <YAxis
                stroke="var(--color-text-dim)"
                tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
                width={COMPACT_COUNT_Y_AXIS_WIDTH}
                tickFormatter={(value: number) => formatCompactNumber(value)}
              />
              <Tooltip content={(props) => <MetricRateTooltip {...props} metric={metric} />} />
              <Bar
                isAnimationActive={false}
                dataKey="value"
                name={rateValueLabel}
                fill="var(--color-accent)"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="sr-only">
          <DataTable
            columns={rateColumns}
            rows={dailyPoints}
            rowKey={(point) => point.date}
            label={rateChartTitle}
          />
        </div>
      </Panel>

      <Panel padded>
        <p className="mb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {compareChartTitle}
        </p>
        <div
          role="img"
          aria-label={compareChartTitle}
          className="w-full"
          style={{ height: compareHeight }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={compareBars}
              layout="vertical"
              margin={{ top: 8, right: 56, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
              <XAxis
                type="number"
                stroke="var(--color-text-dim)"
                tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
                tickFormatter={(value: number) => formatCompactNumber(value)}
              />
              <YAxis
                type="category"
                dataKey="typeName"
                stroke="var(--color-text-dim)"
                tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
                interval={0}
                width={120}
              />
              <Tooltip content={(props) => <MetricCompareTooltip {...props} metric={metric} />} />
              <Bar
                isAnimationActive={false}
                dataKey="value"
                fill="var(--color-line-bright)"
                name={totalValueLabel}
              >
                <LabelList
                  dataKey="value"
                  position="right"
                  formatter={(value: unknown) => formatMetricCompact(metric, Number(value))}
                  style={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="sr-only">
          <DataTable
            columns={compareColumns}
            rows={typeComparison}
            rowKey={(point) => point.typeId}
            label={compareChartTitle}
          />
        </div>
      </Panel>
    </div>
  );
}

export default function MiningYieldCharts({
  metric,
  dailyRate,
  dailyVolume,
  dailyCount,
  typeComparison,
  typeVolumeComparison,
  typeCountComparison,
  showRefining,
}: MiningYieldChartsProps) {
  if (metric === 'volume' || metric === 'count') {
    return (
      <MetricCharts
        metric={metric}
        dailyPoints={metric === 'volume' ? dailyVolume : dailyCount}
        typeComparison={metric === 'volume' ? typeVolumeComparison : typeCountComparison}
      />
    );
  }
  return (
    <IskCharts dailyRate={dailyRate} typeComparison={typeComparison} showRefining={showRefining} />
  );
}
