import { scalePx } from '@/lib/fontScale';
import { ChartTooltipShell } from '@/components/ui/ChartTooltipShell';
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Area,
  Bar,
  Line,
  type TooltipContentProps,
} from 'recharts';
import { Fragment, useMemo, type ReactNode } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useTranslation } from 'react-i18next';
import { DataTable, InfoTooltip, type DataTableColumn } from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { ColumnPickerMenu } from '@/components/ui/ColumnPickerMenu';
import {
  DEFAULT_VISIBLE_PRICE_HISTORY_COLUMNS,
  PRICE_HISTORY_COLUMN_IDS,
  leanPriceHistoryColumns,
  useVisiblePriceHistoryColumns,
  type PriceHistoryColumnId,
} from './priceHistoryColumns';
import {
  COMPACT_COUNT_Y_AXIS_WIDTH,
  COMPACT_ISK_Y_AXIS_WIDTH,
  GROUPED_NUMBER_Y_AXIS_MARGIN_LEFT,
  GROUPED_NUMBER_Y_AXIS_WIDTH,
} from '@/lib/chartAxis';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatIsk, formatIskCompact, formatMarketIsk } from '@/lib/isk';
import { useIsPhone } from '@/lib/useIsPhone';
import { formatPriceRange, formatVolume } from './format';
import {
  compareRegionStroke,
  openPriceStroke,
  PRIMARY_REGION_STROKE,
} from './compareRegionStrokes';
import { chartOpenSideLabel, openSideLabel } from './priceHistoryLabels';
import { priceHistoryCsvColumns, type PriceHistoryTableRow } from './priceHistoryCsv';
import type { MarketHistoryPoint, MovingAveragePoint } from '@/engine/market/priceHistory';
import { joinRegionAverages } from '@/engine/market/priceHistoryCompare';
import {
  joinOpenPrices,
  seriesShows,
  type OpenPriceSide,
  type PriceSeriesChoice,
  type RegionOpenSeries,
} from '@/engine/market/priceHistoryOpen';

export interface ComparedRegionSeries {
  regionId: number;
  name: string;
  status: 'loading' | 'error' | 'ready';
  points: readonly MovingAveragePoint[];
}

interface PriceHistoryChartProps {
  points: MarketHistoryPoint[];
  itemName: string;
  movingAverage?: readonly MovingAveragePoint[];
  comparisons?: readonly ComparedRegionSeries[];
  primaryRegionName?: string;
  primaryRegionId?: number;
  openPrices?: readonly RegionOpenSeries[];
  series?: PriceSeriesChoice;
  openMissing?: ReadonlySet<number>;
}

const NO_COMPARISONS: readonly ComparedRegionSeries[] = [];
const NO_OPEN: readonly RegionOpenSeries[] = [];
const NO_MISSING: ReadonlySet<number> = new Set();

interface OpenLine {
  regionId: number;
  label: string | undefined;
  region: { color: string; dash: string | undefined };
  primary: boolean;
}

const SIDES: readonly OpenPriceSide[] = ['buy', 'sell'];

const DASH = '—';

const SYNC_ID = 'market-price-history';

const BAND_FILL_OPACITY = 0.14;

const CURVE_TYPE = 'linear';

const PLOT_MARGIN_RIGHT = 8;

function priceTickDecimals(span: number): number {
  if (span < 1) return 3;
  if (span < 10) return 2;
  if (span < 100) return 1;
  return 0;
}

function formatTick(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

interface ChartRow extends Partial<Omit<MarketHistoryPoint, 'date'>> {
  date: string;
  dateLabel: string;
  range: [number, number] | undefined;
  movingAverage: number | undefined;
  comparison: Readonly<Record<number, number>>;
  buy: Readonly<Record<number, number>>;
  sell: Readonly<Record<number, number>>;
}

function averageLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  region?: string
) {
  return region
    ? t('market.priceHistory.regionAverage', { region })
    : t('market.priceHistory.average');
}

export function HistoryTooltip({
  active,
  payload,
  label,
  comparisons,
  primaryAverageLabel,
  comparedAverageLabel,
  openLines,
  series,
}: TooltipContentProps & {
  comparisons: readonly ComparedRegionSeries[];
  primaryAverageLabel: string;
  comparedAverageLabel: (c: ComparedRegionSeries) => string;
  openLines: readonly OpenLine[];
  series: PriceSeriesChoice;
}): React.ReactElement | null {
  const { t } = useTranslation();
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as ChartRow | undefined;
  if (!point) return null;
  const drawn = comparisons.filter((c) => c.status === 'ready');
  const primaryOpen = openLines.find((l) => l.primary);
  const sideRows = (line: OpenLine) =>
    SIDES.filter((side) => seriesShows(series, side)).map((side) => {
      const value = point[side][line.regionId];
      return (
        <p key={`${line.regionId}-${side}`}>
          {chartOpenSideLabel(t, side, line.label)}:{' '}
          {value === undefined ? t('market.priceHistory.noOrders') : formatMarketIsk(value)}
        </p>
      );
    });
  return (
    <ChartTooltipShell>
      <p className="font-semibold text-text">{label}</p>
      {primaryOpen && sideRows(primaryOpen)}
      {point.average !== undefined && (
        <>
          {!primaryOpen && (
            <p>
              {primaryAverageLabel}: {formatMarketIsk(point.average)}
            </p>
          )}
          <p>
            {t('market.priceHistory.tradedRange')}:{' '}
            {formatPriceRange(point.lowest ?? 0, point.highest ?? 0)}
          </p>
          <p>
            {t('market.priceHistory.volume')}: {formatVolume(point.volume ?? 0)}
          </p>
          <p>
            {t('market.priceHistory.orderCount')}: {formatVolume(point.orderCount ?? 0)}
          </p>
        </>
      )}
      {drawn.map((c) => {
        const open = openLines.find((l) => l.regionId === c.regionId);
        if (open) return <Fragment key={c.regionId}>{sideRows(open)}</Fragment>;
        const value = point.comparison[c.regionId];
        return (
          <p key={c.regionId}>
            {comparedAverageLabel(c)}:{' '}
            {value === undefined ? t('market.priceHistory.noTrades') : formatMarketIsk(value)}
          </p>
        );
      })}
    </ChartTooltipShell>
  );
}

interface LegendItemProps {
  label: string;
  shape: 'swatch' | 'line' | 'dashed';
  color: string;
  opacity?: number;
  dash?: string;
  width?: number;
  note?: ReactNode;
}

function LegendItem({ label, shape, color, opacity = 1, dash, width = 2, note }: LegendItemProps) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="14" height="8" aria-hidden="true" className="shrink-0">
        {shape === 'swatch' ? (
          <rect
            x="0.5"
            y="0.5"
            width="13"
            height="7"
            fill={color}
            fillOpacity={opacity}
            stroke={color}
          />
        ) : (
          <line
            x1="0"
            y1="4"
            x2="14"
            y2="4"
            stroke={color}
            strokeWidth={width}
            strokeDasharray={dash ?? (shape === 'dashed' ? '4 3' : undefined)}
          />
        )}
      </svg>
      {label}
      {note}
    </span>
  );
}

function OpenLegend({ line, series }: { line: OpenLine; series: PriceSeriesChoice }) {
  const { t } = useTranslation();
  return (
    <>
      {SIDES.filter((side) => seriesShows(series, side)).map((side) => (
        <li key={side}>
          <LegendItem
            label={chartOpenSideLabel(t, side, line.label)}
            shape="line"
            color={openPriceStroke(line.region, side).color}
            dash={openPriceStroke(line.region, side).dash}
            width={openPriceStroke(line.region, side).width}
          />
        </li>
      ))}
    </>
  );
}

export default function PriceHistoryChart({
  points,
  itemName,
  movingAverage = [],
  comparisons = NO_COMPARISONS,
  primaryRegionName,
  primaryRegionId,
  openPrices = NO_OPEN,
  series = 'both',
  openMissing = NO_MISSING,
}: PriceHistoryChartProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const priceAxisWidth = scalePx(isPhone ? COMPACT_ISK_Y_AXIS_WIDTH : GROUPED_NUMBER_Y_AXIS_WIDTH);
  const ordersAxisWidth = isPhone ? 0 : scalePx(COMPACT_COUNT_Y_AXIS_WIDTH);

  const drawnComparisons = useMemo(
    () => comparisons.filter((c) => c.status === 'ready'),
    [comparisons]
  );
  const openLines = useMemo<OpenLine[]>(() => {
    const stationOf = new Map(
      openPrices.filter((o) => o.points.length > 0).map((o) => [o.regionId, o.station])
    );
    const named = drawnComparisons.length > 0;
    const labelOf = (regionId: number, name: string | undefined) =>
      stationOf.get(regionId) ?? (named ? name : undefined);
    const lines: OpenLine[] = [];
    if (primaryRegionId !== undefined && stationOf.has(primaryRegionId)) {
      lines.push({
        regionId: primaryRegionId,
        label: labelOf(primaryRegionId, primaryRegionName),
        region: PRIMARY_REGION_STROKE,
        primary: true,
      });
    }
    comparisons.forEach((c, slot) => {
      if (c.status === 'ready' && stationOf.has(c.regionId)) {
        lines.push({
          regionId: c.regionId,
          label: labelOf(c.regionId, c.name),
          region: compareRegionStroke(slot),
          primary: false,
        });
      }
    });
    return lines;
  }, [openPrices, primaryRegionId, primaryRegionName, comparisons, drawnComparisons]);
  const drawsOpen = series !== 'average';
  const drawnOpenLines = useMemo(() => (drawsOpen ? openLines : []), [drawsOpen, openLines]);
  const primaryHasOpen = openLines.some((l) => l.primary);
  const primaryOpen = drawnOpenLines.some((l) => l.primary);
  const compared = drawnComparisons.length > 0;
  const lacksOpen = (regionId: number | undefined) =>
    drawsOpen && regionId !== undefined && openMissing.has(regionId);
  const lineAverageLabel = (regionId: number | undefined, region: string | undefined) => {
    if (!lacksOpen(regionId)) return averageLabel(t, region);
    return region
      ? t('market.priceHistory.regionAverageNoOrderData', { region })
      : t('market.priceHistory.averageNoOrderData');
  };
  const comparedAverageLabel = (c: ComparedRegionSeries) => lineAverageLabel(c.regionId, c.name);
  const tradedRangeLabel = t('market.priceHistory.tradedRange');
  const noOrderDataTip = (regionId: number | undefined, label: string) =>
    lacksOpen(regionId) ? (
      <InfoTooltip
        glyph="info"
        label={t('common.aboutLabel', { label })}
        content={t('market.priceHistory.noOrderDataTip')}
      />
    ) : undefined;
  const joined = useMemo(() => {
    const ids = new Set(openLines.map((l) => l.regionId));
    return joinOpenPrices(
      joinRegionAverages(points, drawnComparisons),
      openPrices.filter((o) => ids.has(o.regionId))
    );
  }, [points, drawnComparisons, openPrices, openLines]);

  const chartData = useMemo<ChartRow[]>(() => {
    const maByDate = new Map(movingAverage.map((p) => [p.date, p.average]));
    return joined.map(({ date, primary, averages, buy, sell }) => ({
      ...primary,
      date,
      dateLabel: formatTick(date),
      range: primary ? [primary.lowest, primary.highest] : undefined,
      movingAverage: maByDate.get(date),
      comparison: averages,
      buy,
      sell,
    }));
  }, [joined, movingAverage]);

  const tableRows = useMemo<PriceHistoryTableRow[]>(
    () =>
      joined.flatMap(({ date, primary, averages, buy, sell }) =>
        primary || Object.keys(buy).length > 0 || Object.keys(sell).length > 0
          ? [{ ...primary, date, comparison: averages, buy, sell }]
          : []
      ),
    [joined]
  );

  const priceDomain = useMemo<[number, number]>(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of chartData) {
      if (p.lowest !== undefined) lo = Math.min(lo, p.lowest);
      if (p.highest !== undefined) hi = Math.max(hi, p.highest);
      for (const [id, value] of Object.entries(p.comparison)) {
        if (drawnOpenLines.some((l) => l.regionId === Number(id))) continue;
        lo = Math.min(lo, value);
        hi = Math.max(hi, value);
      }
      for (const side of SIDES) {
        if (!seriesShows(series, side)) continue;
        for (const value of Object.values(p[side])) {
          lo = Math.min(lo, value);
          hi = Math.max(hi, value);
        }
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
    if (lo === hi) {
      const pad = Math.abs(lo) * 0.05 || 1;
      return [lo - pad, hi + pad];
    }
    return [lo, hi];
  }, [chartData, series, drawnOpenLines]);

  const priceDecimals =
    priceDomain[0] >= 10_000 ? 0 : priceTickDecimals(priceDomain[1] - priceDomain[0]);

  const storedColumns = useVisiblePriceHistoryColumns((state) => state.value);
  const setStoredColumns = useVisiblePriceHistoryColumns((state) => state.setValue);
  useHydratedStore(useVisiblePriceHistoryColumns);
  const visibleColumns =
    isPhone && storedColumns === DEFAULT_VISIBLE_PRICE_HISTORY_COLUMNS
      ? leanPriceHistoryColumns(primaryHasOpen)
      : storedColumns;

  const dateColumn = useMemo<DataTableColumn<PriceHistoryTableRow>>(
    () => ({
      id: 'date',
      header: t('market.priceHistory.date'),
      stickyStart: true,
      render: (p) => <span className="whitespace-nowrap">{p.date}</span>,
      sortValue: (p) => p.date,
    }),
    [t]
  );
  const columnsById = useMemo<
    Record<PriceHistoryColumnId, DataTableColumn<PriceHistoryTableRow>[]>
  >(() => {
    const priceCell = (value: number | undefined) =>
      value === undefined ? t('market.priceHistory.noOrders') : formatMarketIsk(value);
    const sideColumn = (
      line: OpenLine,
      side: OpenPriceSide
    ): DataTableColumn<PriceHistoryTableRow> => ({
      id: `${side}-${line.regionId}`,
      header: openSideLabel(t, side, line.label),
      render: (p) => priceCell(p[side]?.[line.regionId]),
      sortValue: (p) => p[side]?.[line.regionId],
    });
    const primaryLine = openLines.find((l) => l.primary);
    return {
      average: [
        {
          id: 'average',
          header: t('market.priceHistory.average'),
          render: (p) => (p.average === undefined ? DASH : formatMarketIsk(p.average)),
          sortValue: (p) => p.average,
        },
      ],
      buy: primaryLine ? [sideColumn(primaryLine, 'buy')] : [],
      sell: primaryLine ? [sideColumn(primaryLine, 'sell')] : [],
      range: [
        {
          id: 'range',
          header: t('market.priceHistory.priceRange'),
          render: (p) =>
            p.lowest === undefined || p.highest === undefined
              ? DASH
              : formatPriceRange(p.lowest, p.highest),
          sortValue: (p) => p.highest,
        },
      ],
      volume: [
        {
          id: 'volume',
          header: t('market.priceHistory.volume'),
          render: (p) => (p.volume === undefined ? DASH : formatVolume(p.volume)),
          sortValue: (p) => p.volume,
        },
      ],
      orderCount: [
        {
          id: 'orderCount',
          header: t('market.priceHistory.orderCount'),
          render: (p) => (p.orderCount === undefined ? DASH : formatVolume(p.orderCount)),
          sortValue: (p) => p.orderCount,
        },
      ],
      compared: drawnComparisons.flatMap((c): DataTableColumn<PriceHistoryTableRow>[] => {
        const line = openLines.find((l) => l.regionId === c.regionId);
        if (line) return SIDES.map((side) => sideColumn(line, side));
        return [
          {
            id: `region-${c.regionId}`,
            header: averageLabel(t, c.name),
            render: (p) => {
              const value = p.comparison?.[c.regionId];
              return value === undefined
                ? t('market.priceHistory.noTrades')
                : formatMarketIsk(value);
            },
            sortValue: (p) => p.comparison?.[c.regionId],
          },
        ];
      }),
    };
  }, [t, drawnComparisons, openLines]);
  const availableColumns = useMemo(
    () => PRICE_HISTORY_COLUMN_IDS.filter((id) => columnsById[id].length > 0),
    [columnsById]
  );
  const columns = useMemo(
    () => [
      dateColumn,
      ...availableColumns
        .filter((id) => visibleColumns.includes(id))
        .flatMap((id) => columnsById[id]),
    ],
    [dateColumn, availableColumns, visibleColumns, columnsById]
  );
  const pickerColumns = useMemo(() => {
    const entries = availableColumns.map((id) => {
      const first = columnsById[id][0]!;
      return [
        id,
        id === 'compared' ? { ...first, header: t('market.priceHistory.columnCompared') } : first,
      ] as const;
    });
    return Object.fromEntries(entries) as Record<
      PriceHistoryColumnId,
      DataTableColumn<PriceHistoryTableRow>
    >;
  }, [availableColumns, columnsById, t]);
  function toggleColumn(id: PriceHistoryColumnId) {
    void setStoredColumns(
      visibleColumns.includes(id)
        ? visibleColumns.filter((existing) => existing !== id)
        : [...visibleColumns, id]
    );
  }

  const csvColumns = useMemo(
    () =>
      priceHistoryCsvColumns(
        t,
        drawnComparisons.map(({ regionId, name }) => ({
          regionId,
          name,
          open: openLines.some((l) => l.regionId === regionId),
        })),
        openLines.map((l) => ({ regionId: l.regionId, name: l.label }))
      ),
    [t, drawnComparisons, openLines]
  );
  const tableExport = useTableExport<PriceHistoryTableRow>({
    surface: 'market-price-history',
    rows: tableRows,
    columns: csvColumns,
  });
  const primaryAverageLabel = lineAverageLabel(
    primaryRegionId,
    compared ? primaryRegionName : undefined
  );

  return (
    <div>
      <div role="img" aria-label={t('market.priceHistory.chartLabel', { item: itemName })}>
        <div className={isPhone ? 'h-48 w-full' : 'h-56 w-full'}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              syncId={SYNC_ID}
              margin={{
                top: 8,
                right: PLOT_MARGIN_RIGHT + ordersAxisWidth,
                left: GROUPED_NUMBER_Y_AXIS_MARGIN_LEFT,
                bottom: 0,
              }}
            >
              <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
              <XAxis dataKey="dateLabel" height={0} tick={false} axisLine={false} />
              <YAxis
                stroke="var(--color-accent)"
                tick={{ fontSize: '0.6875rem', fill: 'var(--color-text-dim)' }}
                width={priceAxisWidth}
                domain={priceDomain}
                tickFormatter={(value: number) =>
                  isPhone && priceDecimals === 0
                    ? formatIskCompact(value)
                    : formatIsk(value, priceDecimals)
                }
              />
              <Tooltip
                content={(props) => (
                  <HistoryTooltip
                    {...props}
                    comparisons={comparisons}
                    primaryAverageLabel={primaryAverageLabel}
                    comparedAverageLabel={comparedAverageLabel}
                    openLines={drawnOpenLines}
                    series={series}
                  />
                )}
              />
              <Area
                isAnimationActive={false}
                type={CURVE_TYPE}
                dataKey="range"
                stroke="none"
                fill="var(--color-accent-dim)"
                fillOpacity={BAND_FILL_OPACITY}
                connectNulls
                name={tradedRangeLabel}
              />
              {!primaryOpen && (
                <Line
                  isAnimationActive={false}
                  type={CURVE_TYPE}
                  dataKey="average"
                  stroke={PRIMARY_REGION_STROKE.color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  name={primaryAverageLabel}
                />
              )}
              {drawnOpenLines.flatMap((line) =>
                SIDES.filter((side) => seriesShows(series, side)).map((side) => (
                  <Line
                    key={`${line.regionId}-${side}`}
                    isAnimationActive={false}
                    type={CURVE_TYPE}
                    dataKey={(row: ChartRow) => row[side][line.regionId]}
                    stroke={openPriceStroke(line.region, side).color}
                    strokeWidth={openPriceStroke(line.region, side).width}
                    strokeDasharray={openPriceStroke(line.region, side).dash}
                    dot={false}
                    name={chartOpenSideLabel(t, side, line.label)}
                  />
                ))
              )}
              {movingAverage.length > 0 && !primaryOpen && (
                <Line
                  isAnimationActive={false}
                  type={CURVE_TYPE}
                  dataKey="movingAverage"
                  stroke="var(--color-text-dim)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  connectNulls
                  name={t('market.priceHistory.movingAverage')}
                />
              )}
              {comparisons.map((c, slot) =>
                c.status === 'ready' && !drawnOpenLines.some((l) => l.regionId === c.regionId) ? (
                  <Line
                    key={c.regionId}
                    isAnimationActive={false}
                    type={CURVE_TYPE}
                    dataKey={(row: ChartRow) => row.comparison[c.regionId]}
                    stroke={compareRegionStroke(slot).color}
                    strokeWidth={1.5}
                    strokeDasharray={compareRegionStroke(slot).dash}
                    dot={false}
                    connectNulls
                    name={comparedAverageLabel(c)}
                  />
                ) : null
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className={isPhone ? 'h-24 w-full' : 'h-28 w-full'}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              syncId={SYNC_ID}
              margin={{
                top: 4,
                right: PLOT_MARGIN_RIGHT,
                left: GROUPED_NUMBER_Y_AXIS_MARGIN_LEFT,
                bottom: 0,
              }}
            >
              <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="dateLabel"
                stroke="var(--color-text-dim)"
                tick={{ fontSize: '0.6875rem', fill: 'var(--color-text-dim)' }}
              />
              <YAxis
                yAxisId="volume"
                stroke="var(--color-text-dim)"
                tick={{ fontSize: '0.6875rem', fill: 'var(--color-text-dim)' }}
                width={priceAxisWidth}
                tickFormatter={(value: number) =>
                  isPhone ? formatCompactNumber(value) : formatVolume(value)
                }
              />
              <YAxis
                yAxisId="orders"
                orientation="right"
                hide={isPhone}
                stroke="var(--color-series-order-count)"
                tick={{ fontSize: '0.6875rem', fill: 'var(--color-text-dim)' }}
                width={ordersAxisWidth}
                tickFormatter={(value: number) => formatCompactNumber(value)}
              />
              <Bar
                isAnimationActive={false}
                yAxisId="volume"
                dataKey="volume"
                fill="var(--color-line-bright)"
                name={t('market.priceHistory.volume')}
              />
              <Line
                isAnimationActive={false}
                yAxisId="orders"
                type={CURVE_TYPE}
                dataKey="orderCount"
                stroke="var(--color-series-order-count)"
                strokeWidth={1.5}
                dot={false}
                connectNulls
                name={t('market.priceHistory.orderCount')}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pr-3">
        <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 px-3 pt-2 pb-1 text-[0.6875rem] text-text-dim">
          <li>
            <LegendItem
              label={tradedRangeLabel}
              shape="swatch"
              color="var(--color-accent-dim)"
              opacity={BAND_FILL_OPACITY}
              note={
                <InfoTooltip
                  label={t('common.aboutLabel', { label: tradedRangeLabel })}
                  content={
                    drawnOpenLines.length > 0
                      ? t('market.priceHistory.tradedRangeAtCloseTip')
                      : t('market.priceHistory.tradedRangeTip')
                  }
                />
              }
            />
          </li>
          {primaryOpen ? (
            <OpenLegend line={drawnOpenLines.find((l) => l.primary)!} series={series} />
          ) : (
            <li>
              <LegendItem
                label={primaryAverageLabel}
                shape="line"
                color={PRIMARY_REGION_STROKE.color}
                note={noOrderDataTip(primaryRegionId, primaryAverageLabel)}
              />
            </li>
          )}
          {movingAverage.length > 0 && !primaryOpen && (
            <li>
              <LegendItem
                label={t('market.priceHistory.movingAverage')}
                shape="dashed"
                color="var(--color-text-dim)"
              />
            </li>
          )}
          <li>
            <LegendItem
              label={t('market.priceHistory.volume')}
              shape="swatch"
              color="var(--color-line-bright)"
            />
          </li>
          <li>
            <LegendItem
              label={t('market.priceHistory.orderCount')}
              shape="line"
              color="var(--color-series-order-count)"
            />
          </li>
          {comparisons.map((c, slot) => {
            const stroke = compareRegionStroke(slot);
            const open = drawnOpenLines.find((l) => l.regionId === c.regionId);
            if (open) return <OpenLegend key={c.regionId} line={open} series={series} />;
            const label =
              c.status === 'loading'
                ? t('market.priceHistory.compareLoading', { region: c.name })
                : c.status === 'error'
                  ? t('market.priceHistory.compareFailed', { region: c.name })
                  : c.points.length === 0
                    ? t('market.priceHistory.compareEmpty', { region: c.name })
                    : comparedAverageLabel(c);
            const drawn = c.status === 'ready' && c.points.length > 0;
            return (
              <li key={c.regionId}>
                <LegendItem
                  label={label}
                  shape="line"
                  color={stroke.color}
                  dash={stroke.dash}
                  note={drawn ? noOrderDataTip(c.regionId, label) : undefined}
                />
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-1">
          <ColumnPickerMenu
            available={availableColumns}
            visible={visibleColumns}
            columnsById={pickerColumns}
            onToggle={toggleColumn}
            buttonLabel={t('market.priceHistory.columnsButton')}
            menuTitle={t('market.priceHistory.columnsMenuTitle')}
            size="sm"
          />
          <TableActionsMenu name={t('market.tabHistory')} tableExport={tableExport} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <DataTable
          {...tableExport.tableProps}
          columns={columns}
          rows={tableRows}
          rowKey={(p) => p.date}
          label={t('market.priceHistory.chartLabel', { item: itemName })}
          responsive="table"
          defaultSort={{ columnId: 'date', direction: 'asc' }}
        />
      </div>
    </div>
  );
}
