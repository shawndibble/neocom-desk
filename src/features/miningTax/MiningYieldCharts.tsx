/**
 * Draws the Mining Yield Overview tab's two charts with Recharts (issue
 * #671). Statically imports `recharts`, so — same rule as
 * `market/PriceHistoryChart.tsx` — this must only ever be reached through a
 * dynamic `import()` from `OverviewTab.tsx`, never imported eagerly.
 */
import { scalePx } from '@/lib/fontScale';
import { ChartTooltipShell } from '@/components/ui/ChartTooltipShell';
import { Eyebrow } from '@/components/ui/Eyebrow';
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  LabelList,
  type TooltipContentProps,
} from 'recharts';
import { useMemo, type ReactElement, type ReactNode } from 'react';
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
import { useMiningTaxCompressedOre } from './oreForm';
import type { ChartMetric } from './chartMetricPref';
import { formatDateTick } from '@/lib/formatDateTick';
import { createNumberFormat } from '@/lib/numberLocale';

const formatFull = createNumberFormat({ maximumFractionDigits: 3 });

export interface DailyRatePoint {
  date: string;
  iskValue: number;
}

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

type MetricKind = 'volume' | 'count';

/** `formatCompactNumber`, plus an "m³" suffix for the volume metric — count has no unit. */
function formatMetricCompact(metric: MetricKind, value: number): string {
  return metric === 'volume' ? `${formatCompactNumber(value)} m³` : formatCompactNumber(value);
}

/** Grouped with up to 3 decimals, plus an "m³" suffix for the volume metric — the sr-only tables' full-precision figure. */
function formatMetricFull(metric: MetricKind, value: number): string {
  return metric === 'volume' ? `${formatFull(value)} m³` : formatFull(value);
}

/** The rate chart's per-metric knobs: where a point's figure lives, and how each surface prints it. */
interface RateSpec {
  valueOf: (point: never) => number;
  /** The figure's line in the tooltip. */
  tooltip: (value: number) => string;
  valueLabelKey: string;
  basisKey: string;
}

const ISK_RATE_SPEC: RateSpec = {
  valueOf: (point: DailyRatePoint) => point.iskValue,
  tooltip: (value) => `${formatIsk(value, 0)} ISK`,
  valueLabelKey: 'miningTax.overview.iskDay',
  basisKey: 'miningTax.overview.dayChartBasis',
};

function metricRateSpec(metric: MetricKind): RateSpec {
  return {
    valueOf: (point: DailyMetricPoint) => point.value,
    tooltip: (value) => formatMetricCompact(metric, value),
    valueLabelKey:
      metric === 'volume' ? 'miningTax.overview.m3PerDay' : 'miningTax.overview.countPerDay',
    basisKey:
      metric === 'volume'
        ? 'miningTax.overview.dayChartBasisVolume'
        : 'miningTax.overview.dayChartBasisCount',
  };
}

/** The daily-rate tooltip for every metric: the day, its figure and the basis. */
export function RateTooltip({
  active,
  payload,
  label,
  metric = 'isk',
}: TooltipContentProps & { metric?: ChartMetric }): ReactElement | null {
  const { t } = useTranslation();
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as (DailyRatePoint & DailyMetricPoint) | undefined;
  if (!point) return null;
  const spec = metric === 'isk' ? ISK_RATE_SPEC : metricRateSpec(metric);
  return (
    <ChartTooltipShell>
      <p className="font-semibold text-text">
        {typeof label === 'string' ? formatDateTick(label) : ''}
      </p>
      <p>
        {t(spec.valueLabelKey)}: {spec.tooltip(spec.valueOf(point as never))}
      </p>
      <p className="text-text-dim">{t(spec.basisKey)}</p>
    </ChartTooltipShell>
  );
}

/** One series of the ore-type chart, as the tooltip reads it. */
interface CompareRow {
  typeId: number;
  typeName: string;
  rawValue: number;
  refineValue: number;
  value: number;
  folded?: CompareRow[];
}

interface CompareSeries {
  labelKey: string;
  valueOf: (type: CompareRow) => number;
  full: (value: number) => string;
  compact: (value: number) => string;
}

function compareSeries(metric: ChartMetric, showRefining: boolean): CompareSeries[] {
  if (metric === 'volume' || metric === 'count') {
    return [
      {
        labelKey:
          metric === 'volume' ? 'miningTax.overview.volumeTotal' : 'miningTax.overview.countTotal',
        valueOf: (type) => type.value,
        full: (value) => formatMetricCompact(metric, value),
        compact: (value) => formatMetricCompact(metric, value),
      },
    ];
  }
  const isk = {
    full: (value: number) => `${formatIsk(value, 0)} ISK`,
    compact: formatIskCompact,
  };
  return [
    { labelKey: 'miningTax.overview.rawSellValue', valueOf: (type) => type.rawValue, ...isk },
    ...(showRefining
      ? [
          {
            labelKey: 'miningTax.overview.refineValue',
            valueOf: (type: CompareRow) => type.refineValue,
            ...isk,
          },
        ]
      : []),
  ];
}

/** The ore-type tooltip for every metric: the type, one line per series, and what an "Other" bar folds. */
function CompareTooltip({
  active,
  payload,
  metric,
  showRefining,
}: TooltipContentProps & { metric: ChartMetric; showRefining: boolean }): ReactElement | null {
  const { t } = useTranslation();
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as CompareRow | undefined;
  if (!point) return null;
  const series = compareSeries(metric, showRefining);
  return (
    <ChartTooltipShell>
      <p className="font-semibold text-text">{point.typeName}</p>
      {series.map((s) => (
        <p key={s.labelKey}>
          {t(s.labelKey)}: {s.full(s.valueOf(point))}
        </p>
      ))}
      {point.folded && (
        <ul className="mt-1 border-t border-line pt-1 text-text-dim">
          {point.folded.map((type) => (
            <li key={type.typeId}>
              {type.typeName}: {series.map((s) => s.compact(s.valueOf(type))).join(' / ')}
            </li>
          ))}
        </ul>
      )}
    </ChartTooltipShell>
  );
}

/** The note under the chart says the ore is compressed, so the axis drops the repeated prefix. */
function stripCompressedPrefix(name: string, compressed: boolean): string {
  return compressed ? name.replace(/^Compressed /, '') : name;
}

const TICK_STYLE = { fontSize: '0.6875rem', fill: 'var(--color-text-dim)' } as const;

interface RatePanelProps<P> {
  title: string;
  basis: string;
  rows: P[];
  rowKey: (row: P) => string;
  columns: DataTableColumn<P>[];
  /** Pixel width of the Y axis' tick column, before font scaling. */
  axisWidth: number;
  /** SVG axis text: IskAmount can't render inside the chart (documented exception). */
  tickFormatter: (value: number) => string;
  tooltip: (props: TooltipContentProps) => ReactElement;
  /** The `<Bar>`. */
  bars: ReactNode;
}

/** The daily-rate card: a bar per day over a screen-reader table of the same rows. */
function RatePanel<P>({
  title,
  basis,
  rows,
  rowKey,
  columns,
  axisWidth,
  tickFormatter,
  tooltip,
  bars,
}: RatePanelProps<P>) {
  return (
    <Panel padded>
      <Eyebrow className="mb-1">{title}</Eyebrow>
      <p className="mb-1 text-[0.6875rem] text-text-dim">{basis}</p>
      <div role="img" aria-label={title} className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={{ top: 8, right: 8, left: COMPACT_ISK_Y_AXIS_MARGIN_LEFT, bottom: 0 }}
          >
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateTick}
              stroke="var(--color-text-dim)"
              tick={TICK_STYLE}
            />
            <YAxis
              stroke="var(--color-text-dim)"
              tick={TICK_STYLE}
              width={scalePx(axisWidth)}
              tickFormatter={tickFormatter}
            />
            <Tooltip content={tooltip} />
            {bars}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* A sibling of the `role="img"` box, never a child — see WalletBalanceChart. */}
      {/* On a wrapper: a <table> ignores sr-only's clip and still stretches the page. */}
      <div className="sr-only">
        <DataTable columns={columns} responsive="table" rows={rows} rowKey={rowKey} label={title} />
      </div>
    </Panel>
  );
}

interface ComparePanelProps<B, R> {
  title: string;
  /** The drawn bars (top types plus an "Other" roll-up). */
  bars: B[];
  /** Every type, for the screen-reader table — the drawn bars fold the tail. */
  rows: R[];
  rowKey: (row: R) => number;
  columns: DataTableColumn<R>[];
  height: number;
  marginRight: number;
  /** SVG axis text: IskAmount can't render inside the chart (documented exception). */
  tickFormatter: (value: number) => string;
  tooltip: (props: TooltipContentProps) => ReactElement;
  series: ReactNode;
  legend?: boolean;
  note?: string | null;
}

/** The ore-type card: horizontal bars, ore names read left of the bar instead of slanted under it. */
function ComparePanel<B, R>({
  title,
  bars,
  rows,
  rowKey,
  columns,
  height,
  marginRight,
  tickFormatter,
  tooltip,
  series,
  legend,
  note,
}: ComparePanelProps<B, R>) {
  const compressed = useMiningTaxCompressedOre((state) => state.value);
  return (
    <Panel padded>
      <Eyebrow className="mb-1">{title}</Eyebrow>
      <div role="img" aria-label={title} className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={bars}
            layout="vertical"
            margin={{ top: 8, right: marginRight, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
            <XAxis
              type="number"
              stroke="var(--color-text-dim)"
              tick={TICK_STYLE}
              tickFormatter={tickFormatter}
            />
            <YAxis
              type="category"
              dataKey="typeName"
              stroke="var(--color-text-dim)"
              tick={TICK_STYLE}
              interval={0}
              tickFormatter={(name: string) => stripCompressedPrefix(name, compressed)}
              width={scalePx(120)}
            />
            <Tooltip content={tooltip} />
            {legend && <Legend wrapperStyle={{ fontSize: '0.6875rem' }} />}
            {series}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* On a wrapper: a <table> ignores sr-only's clip and still stretches the page. */}
      <div className="sr-only">
        <DataTable columns={columns} responsive="table" rows={rows} rowKey={rowKey} label={title} />
      </div>
      {note && <p className="mt-1 text-[0.6875rem] text-text-dim">{note}</p>}
    </Panel>
  );
}

/**
 * The two charts for every metric: ISK keeps its per-day price-source colours,
 * its raw/refined pair and the show-refining switch; volume and count (issue
 * #2160) are the single-series, raw-only shape — no refined series, no Legend,
 * whatever the toggle says, since neither has a refined side.
 */
function MetricChartPair({
  metric,
  dailyRate,
  dailyVolume,
  dailyCount,
  typeComparison,
  typeVolumeComparison,
  typeCountComparison,
  showRefining: showRefiningSetting,
}: MiningYieldChartsProps) {
  const { t } = useTranslation();
  const compressed = useMiningTaxCompressedOre((state) => state.value);
  const isIsk = metric === 'isk';
  const showRefining = isIsk && showRefiningSetting;
  const metricKind: MetricKind = metric === 'volume' ? 'volume' : 'count';

  const rateTitle = t(
    isIsk
      ? 'miningTax.overview.dayChartTitle'
      : metric === 'volume'
        ? 'miningTax.overview.dayChartTitleVolume'
        : 'miningTax.overview.dayChartTitleCount'
  );
  const compareTitle = t(
    isIsk
      ? showRefining
        ? 'miningTax.overview.compareChartTitle'
        : 'miningTax.overview.compareChartTitleRawOnly'
      : metric === 'volume'
        ? 'miningTax.overview.compareChartTitleVolume'
        : 'miningTax.overview.compareChartTitleCount'
  );
  const rateSpec = isIsk ? ISK_RATE_SPEC : metricRateSpec(metricKind);
  const totalLabel = t(
    metric === 'volume' ? 'miningTax.overview.volumeTotal' : 'miningTax.overview.countTotal'
  );

  // Screen-reader tables, one per chart: `role="img"` hides the bars, and
  // the ore chart folds its tail into "Other", so the table carries every
  // type rather than the drawn bars.
  const iskRateColumns = useMemo<DataTableColumn<DailyRatePoint>[]>(
    () => [
      {
        id: 'date',
        header: t('miningTax.overview.dateColumn'),
        render: (point) => formatDateTick(point.date),
      },
      {
        id: 'iskValue',
        header: t('miningTax.overview.iskDay'),
        render: (point) => `${formatIsk(point.iskValue, 0)} ISK`,
      },
    ],
    [t]
  );
  const metricRateColumns = useMemo<DataTableColumn<DailyMetricPoint>[]>(
    () => [
      {
        id: 'date',
        header: t('miningTax.overview.dateColumn'),
        render: (point) => formatDateTick(point.date),
      },
      {
        id: 'value',
        header: t(rateSpec.valueLabelKey),
        render: (point) => formatMetricFull(metricKind, point.value),
      },
    ],
    [t, rateSpec.valueLabelKey, metricKind]
  );
  const iskCompareColumns = useMemo<DataTableColumn<TypeComparisonPoint>[]>(
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
  const metricCompareColumns = useMemo<DataTableColumn<ValueRanked>[]>(
    () => [
      {
        id: 'type',
        header: t('miningTax.overview.typeColumn'),
        render: (point) => point.typeName,
      },
      {
        id: 'value',
        header: totalLabel,
        render: (point) => formatMetricFull(metricKind, point.value),
      },
    ],
    [t, totalLabel, metricKind]
  );

  const tooltip = (props: TooltipContentProps) => (
    <CompareTooltip {...props} metric={metric} showRefining={showRefining} />
  );
  const rateTooltip = (props: TooltipContentProps) => <RateTooltip {...props} metric={metric} />;
  const otherLabel = (count: number) => t('miningTax.overview.otherTypes', { count });

  return (
    // Two cards, same gap as the stat cards above them.
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {isIsk ? (
        <RatePanel
          title={rateTitle}
          basis={t(rateSpec.basisKey)}
          rows={dailyRate}
          rowKey={(point) => point.date}
          columns={iskRateColumns}
          axisWidth={COMPACT_ISK_Y_AXIS_WIDTH}
          tickFormatter={formatIskCompact}
          tooltip={rateTooltip}
          bars={
            <Bar
              isAnimationActive={false}
              dataKey="iskValue"
              name={t(rateSpec.valueLabelKey)}
              fill="var(--color-accent)"
            />
          }
        />
      ) : (
        <RatePanel
          title={rateTitle}
          basis={t(rateSpec.basisKey)}
          rows={metric === 'volume' ? dailyVolume : dailyCount}
          rowKey={(point) => point.date}
          columns={metricRateColumns}
          axisWidth={COMPACT_COUNT_Y_AXIS_WIDTH}
          tickFormatter={formatCompactNumber}
          tooltip={rateTooltip}
          bars={
            <Bar
              isAnimationActive={false}
              dataKey="value"
              name={t(rateSpec.valueLabelKey)}
              fill="var(--color-accent)"
            />
          }
        />
      )}

      {isIsk ? (
        <IskComparePanel
          title={compareTitle}
          typeComparison={typeComparison}
          showRefining={showRefining}
          columns={iskCompareColumns}
          tooltip={tooltip}
          otherLabel={otherLabel}
          note={
            !showRefining || compressed
              ? t(
                  showRefining
                    ? 'miningTax.overview.assumesCompressedNote'
                    : compressed
                      ? 'miningTax.overview.refiningHiddenCompressedNote'
                      : 'miningTax.overview.refiningHiddenNote'
                )
              : null
          }
        />
      ) : (
        <MetricComparePanel
          title={compareTitle}
          metric={metricKind}
          typeComparison={metric === 'volume' ? typeVolumeComparison : typeCountComparison}
          columns={metricCompareColumns}
          tooltip={tooltip}
          otherLabel={otherLabel}
          totalLabel={totalLabel}
          note={compressed ? t('miningTax.overview.assumesCompressedNote') : null}
        />
      )}
    </div>
  );
}

interface CompareVariantProps<R> {
  title: string;
  columns: DataTableColumn<R>[];
  tooltip: (props: TooltipContentProps) => ReactElement;
  otherLabel: (count: number) => string;
  note: string | null;
}

/** The ISK ore-type card: raw (and, with refining on, refined) value per type. */
function IskComparePanel({
  title,
  typeComparison,
  showRefining,
  columns,
  tooltip,
  otherLabel,
  note,
}: CompareVariantProps<TypeComparisonPoint> & {
  typeComparison: TypeComparisonPoint[];
  showRefining: boolean;
}) {
  const { t } = useTranslation();
  // Past TOP_TYPE_LIMIT the rest fold into one "Other" bar, so the card
  // stops growing with the number of types; the table below lists every one.
  const { top, other } = topTypesWithOther(typeComparison, {
    limit: TOP_TYPE_LIMIT,
    by: showRefining ? 'both' : 'raw',
  });
  const bars: ComparisonBar[] = other
    ? [
        ...top,
        {
          typeId: -1,
          typeName: otherLabel(other.types.length),
          rawValue: other.rawValue,
          refineValue: other.refineValue,
          folded: other.types,
        },
      ]
    : top;
  return (
    <ComparePanel
      title={title}
      bars={bars}
      rows={typeComparison}
      rowKey={(point) => point.typeId}
      columns={columns}
      // Same row height with refining on or off — the raw and refined bars split
      // the row — so toggling refining only adds the legend's height.
      height={Math.max(256, bars.length * 24 + (showRefining ? 56 : 32))}
      marginRight={showRefining ? 16 : 56}
      tickFormatter={formatIskCompact}
      tooltip={tooltip}
      legend={showRefining}
      note={note}
      series={
        <>
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
                // SVG label text: IskAmount can't render inside the chart (documented exception).
                formatter={(value: unknown) => formatIskCompact(Number(value))}
                style={TICK_STYLE}
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
        </>
      }
    />
  );
}

/** The volume/count ore-type card: always the "raw only" row height and margin — there is never a second series. */
function MetricComparePanel({
  title,
  metric,
  typeComparison,
  columns,
  tooltip,
  otherLabel,
  totalLabel,
  note,
}: CompareVariantProps<ValueRanked> & {
  metric: MetricKind;
  typeComparison: ValueRanked[];
  totalLabel: string;
}) {
  const { top, other } = topValuesWithOther(typeComparison, { limit: TOP_TYPE_LIMIT });
  const bars: MetricComparisonBar[] = other
    ? [
        ...top,
        {
          typeId: -1,
          typeName: otherLabel(other.types.length),
          value: other.value,
          folded: other.types,
        },
      ]
    : top;
  return (
    <ComparePanel
      title={title}
      bars={bars}
      rows={typeComparison}
      rowKey={(point) => point.typeId}
      columns={columns}
      height={Math.max(256, bars.length * 24 + 32)}
      marginRight={56}
      tickFormatter={formatCompactNumber}
      tooltip={tooltip}
      note={note}
      series={
        <Bar
          isAnimationActive={false}
          dataKey="value"
          fill="var(--color-line-bright)"
          name={totalLabel}
        >
          <LabelList
            dataKey="value"
            position="right"
            formatter={(value: unknown) => formatMetricCompact(metric, Number(value))}
            style={TICK_STYLE}
          />
        </Bar>
      }
    />
  );
}

export default function MiningYieldCharts(props: MiningYieldChartsProps) {
  return <MetricChartPair {...props} />;
}
