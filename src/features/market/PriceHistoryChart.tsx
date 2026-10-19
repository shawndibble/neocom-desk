/**
 * Draws the Price History chart with Recharts. This module statically
 * imports `recharts`, so it must only ever be reached through a dynamic
 * `import()` (see `PriceHistoryPanel.tsx`) — importing it eagerly would put
 * Recharts back in the initial page bundle.
 */
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

/** One compared region's average line, as the panel has it so far. */
export interface ComparedRegionSeries {
  regionId: number;
  name: string;
  /** `loading` and `error` still get a legend entry saying so; only `ready` draws. */
  status: 'loading' | 'error' | 'ready';
  /** Daily averages already cut to the selected range. */
  points: readonly MovingAveragePoint[];
}

interface PriceHistoryChartProps {
  points: MarketHistoryPoint[];
  itemName: string;
  /** Empty when the item has fewer real days of history than the moving-average window — no line, not a truncated one. */
  movingAverage?: readonly MovingAveragePoint[];
  /** Compared regions in pick order — each one's slot fixes its colour and dash. Empty draws today's single-region chart. */
  comparisons?: readonly ComparedRegionSeries[];
  /** Names the primary average once other regions' averages sit beside it. */
  primaryRegionName?: string;
  /** The primary region, so its open series can be found among `openPrices`. */
  primaryRegionId?: number;
  /**
   * Daily open buy and sell per region (the primary's and the compared ones'),
   * already cut to the selected range. A region listed here with days draws a
   * Buy and a Sell line in place of its average line; one absent keeps the
   * average.
   */
  openPrices?: readonly RegionOpenSeries[];
  /**
   * Which lines are drawn. `average` draws every region's average, its open
   * series or not; the day table and export keep the open columns either way.
   */
  series?: PriceSeriesChoice;
  /**
   * Regions whose open-price read came back with no series at all — outside
   * the five Trade Hubs. Under a Buy / Sell choice their average line says so
   * in the legend and tooltip. A region still being read is absent, and so is
   * a hub whose series merely has no day in the range, so neither is
   * mislabelled.
   */
  openMissing?: ReadonlySet<number>;
}

const NO_COMPARISONS: readonly ComparedRegionSeries[] = [];
const NO_OPEN: readonly RegionOpenSeries[] = [];
const NO_MISSING: ReadonlySet<number> = new Set();

/** One region drawing Buy / Sell lines instead of an average. */
interface OpenLine {
  regionId: number;
  /**
   * What its Buy / Sell labels are named after ("Jita 4-4 buy"): the hub
   * station, always; for an old region-wide series, the region once regions
   * are compared; otherwise nothing (plain "Buy").
   */
  label: string | undefined;
  /** The region's own stroke (colour and dash); the side adds the weight. */
  region: { color: string; dash: string | undefined };
  primary: boolean;
}

const SIDES: readonly OpenPriceSide[] = ['buy', 'sell'];

/** A table cell for a figure ESI has no day for (an open price on a day nothing traded). */
const DASH = '—';

/**
 * Links the two charts' tooltips and cursors, so hovering either strip
 * highlights the same day in both. Constant rather than per-item: only one
 * Price History chart is ever mounted (the tab renders a single item), and a
 * per-item id would churn Recharts' module-level sync registry on every
 * selection for no gain.
 */
const SYNC_ID = 'market-price-history';

/**
 * The band's fill strength, shared by the `<Area>` and by the legend swatch
 * that keys it. One constant because both paint the same token over the same
 * `panel` ground: two values drifted apart once already, and a key that
 * misstates its own mark is worse than no key.
 */
const BAND_FILL_OPACITY = 0.14;

/**
 * Every series is `linear`: one point per day, joined by straight lines. A
 * smoothed curve (`monotone`) turned a one-day swing into a wave that
 * overshot between days, inventing prices nobody traded or listed. One
 * constant for every series on both strips: the band, the average, the
 * Buy/Sell lines, the moving average, the compared averages and the
 * order-count line.
 */
const CURVE_TYPE = 'linear';

/** Inset both strips leave beyond their axes. Shared, because unequal horizontal insets slide one plot off the other. */
const PLOT_MARGIN_RIGHT = 8;

/**
 * Decimal places for the price axis, from how much ground the axis covers.
 *
 * A fixed `0` is right for a battleship hull and useless for Tritanium: its
 * whole 30-day range is 3.70 to 4.04 ISK, so every tick rounded to "4" and the
 * axis labelled four different heights with the same number. Keyed to the
 * *span* rather than the magnitude, because that is what decides whether two
 * neighbouring ticks can round together.
 */
function priceTickDecimals(span: number): number {
  if (span < 1) return 3;
  if (span < 10) return 2;
  if (span < 100) return 1;
  return 0;
}

/**
 * `date` is a bare calendar date ("YYYY-MM-DD"), not an instant — parsing it
 * with `new Date(string)` reads it as UTC midnight, then `toLocaleDateString`
 * renders in local time, shifting the label a day back in negative-offset
 * zones. Building the `Date` from local Y/M/D components instead keeps the
 * displayed day matching the raw string everywhere.
 */
function formatTick(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * One plotted day. The primary region's fields are absent on a day only a
 * compared region traded — the chart's X axis is the union of every drawn
 * region's days (`joinRegionAverages`).
 */
interface ChartRow extends Partial<Omit<MarketHistoryPoint, 'date'>> {
  date: string;
  dateLabel: string;
  /** `[lowest, highest]` — Recharts reads a two-element array off a `dataKey` as a range area rather than a value. */
  range: [number, number] | undefined;
  movingAverage: number | undefined;
  /** Each compared region's average that day, by region id. */
  comparison: Readonly<Record<number, number>>;
  /** Each region's open buy and sell that day, by region id. */
  buy: Readonly<Record<number, number>>;
  sell: Readonly<Record<number, number>>;
}

/** "Domain average" once regions are compared; plain "Average Price" otherwise. */
function averageLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  region?: string
) {
  return region
    ? t('market.priceHistory.regionAverage', { region })
    : t('market.priceHistory.average');
}

/**
 * One tooltip body for both strips. Both charts render it and share a
 * `syncId`, so whichever one the pointer is over, the reader gets the whole
 * day — the price strip alone would leave them hunting the bars below to
 * find out how much actually moved. Exported for its tests.
 */
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
  /** The legend's name for each average line, so the tooltip cannot disagree with it. */
  primaryAverageLabel: string;
  comparedAverageLabel: (c: ComparedRegionSeries) => string;
  /** The regions drawing Buy / Sell lines — none under `average`. */
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
  /** A filled block for the band and the volume bars; a rule for the line series. */
  shape: 'swatch' | 'line' | 'dashed';
  color: string;
  opacity?: number;
  /** The rule's own dash pattern, for a compared region's line; `dashed` alone means the moving average's `4 3`. */
  dash?: string;
  /** Rule weight; the open Buy / Sell lines differ by it. */
  width?: number;
  /** After the label, e.g. the info tip on an average standing in for Buy / Sell. */
  note?: ReactNode;
}

function LegendItem({ label, shape, color, opacity = 1, dash, width = 2, note }: LegendItemProps) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="14" height="8" aria-hidden="true" className="shrink-0">
        {shape === 'swatch' ? (
          // Outlined in its own colour at full strength. The band's fill is
          // faint by design — right across 200px of plot, invisible in a 14px
          // key — and raising the swatch's opacity instead would have the key
          // misstate the mark. The edge makes it legible without lying about
          // it; on an already-opaque swatch the stroke is a no-op.
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

/** A region's Buy and Sell legend entries, each in the stroke it is drawn in. */
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

/**
 * Daily price on top, trading activity below — two charts, one shared X axis
 * and one shared `syncId`.
 *
 * Deliberately not a single dual-axis plot. Five series (the high/low band,
 * the average, its moving average, the volume bars and the order count) over
 * two unrelated scales was already crowded at three: the band is a filled
 * shape the bars then draw straight through, and a second right-hand axis on
 * the same plot leaves little room for the plot. Splitting price from
 * activity gives each strip its own vertical scale, keeps one X axis between
 * them, and is what makes the phone layout below possible at all.
 */
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
  // Below `sm` the two grouped-integer gutters the desktop chart reserves
  // (95px on the left, plus the order-count axis on the right) eat most of a
  // 358px-wide plot. The phone drops the right-hand axis entirely — the
  // legend and the tooltip carry that series instead — and abbreviates the
  // left-hand ticks.
  const isPhone = useIsPhone();
  const priceAxisWidth = scalePx(isPhone ? COMPACT_ISK_Y_AXIS_WIDTH : GROUPED_NUMBER_Y_AXIS_WIDTH);
  // The one value both strips read: the lower one sizes its order-count axis
  // from it, the upper one leaves exactly that much empty margin where the
  // axis would be. Two separately-written widths is how the plots drift.
  const ordersAxisWidth = isPhone ? 0 : scalePx(COMPACT_COUNT_Y_AXIS_WIDTH);

  const drawnComparisons = useMemo(
    () => comparisons.filter((c) => c.status === 'ready'),
    [comparisons]
  );
  // Every region drawing Buy / Sell lines: the primary one first, then the
  // compared ones in pick order (slot fixes the colour). A region with no
  // open days in range is absent and keeps its average line.
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
  // What the plot, legend and tooltip draw as Buy / Sell: none under
  // `average`, which puts every region on its average line. `openLines`
  // itself still shapes the day table and the export.
  const drawsOpen = series !== 'average';
  const drawnOpenLines = useMemo(() => (drawsOpen ? openLines : []), [drawsOpen, openLines]);
  const primaryHasOpen = openLines.some((l) => l.primary);
  const primaryOpen = drawnOpenLines.some((l) => l.primary);
  const compared = drawnComparisons.length > 0;
  /**
   * A region drawing its average where Buy / Sell was asked for, because it
   * has no open prices (outside the trade hubs) — named so, and not just left
   * to look like a missing line or a hub's figure.
   */
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

  // The day table and its export are the primary region's days, each
  // carrying the compared regions' averages for that day as extra columns.
  const tableRows = useMemo<PriceHistoryTableRow[]>(
    () =>
      joined.flatMap(({ date, primary, averages, buy, sell }) =>
        // ESI's days, plus any day an open price was recorded for: the tooltip
        // names those, so the table must too.
        primary || Object.keys(buy).length > 0 || Object.keys(sell).length > 0
          ? [{ ...primary, date, comparison: averages, buy, sell }]
          : []
      ),
    [joined]
  );

  /**
   * Explicit rather than `['dataMin', 'dataMax']`: that pair collapses to a
   * zero-height axis when every day shares one price — a single-day range, or
   * an item that traded at exactly one price all week — which draws the band
   * and both lines as one flat rule against a repeated tick.
   */
  const priceDomain = useMemo<[number, number]>(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of chartData) {
      if (p.lowest !== undefined) lo = Math.min(lo, p.lowest);
      if (p.highest !== undefined) hi = Math.max(hi, p.highest);
      // A compared region's line must fit too, or it clips at the strip's edge.
      for (const [id, value] of Object.entries(p.comparison)) {
        // A region drawing Buy / Sell lines draws no average to fit.
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

  // Whole ISK once the axis starts at 10,000, the Market page's no-cents line.
  const priceDecimals =
    priceDomain[0] >= 10_000 ? 0 : priceTickDecimals(priceDomain[1] - priceDomain[0]);

  const storedColumns = useVisiblePriceHistoryColumns((state) => state.value);
  const setStoredColumns = useVisiblePriceHistoryColumns((state) => state.setValue);
  useHydratedStore(useVisiblePriceHistoryColumns);
  // A phone with nothing stored starts lean; an explicit pick is read as saved.
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
  // Each optional id's column(s). Both sides always: the series select shapes
  // the chart, and the table and its export are the day list.
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
          // Sorted by the day's high — the low half of the band has no column
          // of its own to sort by instead.
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
  // What the picker offers: only ids with a column to show.
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
  // The picker labels each id from one representative column's header.
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

  // `role="img"` collapses everything inside it into one opaque image for
  // assistive tech, so the sr-only table below must be a *sibling*, not a
  // child — nesting it here would make the accessible fallback unreachable.
  // Both strips sit inside the one `role="img"`: they are two halves of a
  // single figure, and announcing them separately would say nothing useful
  // twice.
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
              {/* Held at zero height and unlabelled: the activity strip below
                  draws the one visible X axis for both. Recharts still needs
                  a category axis here, or this plot has no X scale for
                  `syncId` to line its cursor up against. */}
              <XAxis dataKey="dateLabel" height={0} tick={false} axisLine={false} />
              <YAxis
                stroke="var(--color-accent)"
                tick={{ fontSize: '0.6875rem', fill: 'var(--color-text-dim)' }}
                width={priceAxisWidth}
                // The band, not the average, sets the extent now; Recharts'
                // default `[0, dataMax]` would squash a 9,000-ISK item into
                // the top tenth of the strip. `priceDomain` rather than a
                // bare `['dataMin', 'dataMax']` because that pair collapses to
                // a zero-height axis whenever every day shares one price.
                domain={priceDomain}
                // The phone's abbreviated ticks only apply where the axis
                // spans whole ISK — abbreviating a 3.70-to-4.04 axis puts "4"
                // on every tick, which is the case these decimals exist for.
                tickFormatter={(value: number) =>
                  isPhone && priceDecimals === 0
                    ? formatIskCompact(value)
                    : formatIsk(value, priceDecimals)
                }
              />
              {/* The only `<Tooltip>` of the two charts. `syncId` activates
                  both on one hover, so a second one here pops an identical
                  box over the lower strip; this one already reports the whole
                  day, activity included. */}
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
              {/* First, so the two price lines draw over the band, not under it. */}
              <Area
                isAnimationActive={false}
                type={CURVE_TYPE}
                dataKey="range"
                stroke="none"
                fill="var(--color-accent-dim)"
                fillOpacity={BAND_FILL_OPACITY}
                // Bridges a day only a compared region traded, rather than
                // breaking there. With nothing compared there is no such day,
                // so the single-region chart draws exactly as before.
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
              {/* A region with an open series draws the day's highest buy and
                  lowest sell order instead of an average: one colour and dash
                  per region, Sell heavy and Buy light. No `connectNulls`: a
                  day with a buy but no sell breaks the sell line. */}
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
              {/* A moving average of the average has no place beside buy and
                  sell lines. */}
              {movingAverage.length > 0 && !primaryOpen && (
                <Line
                  isAnimationActive={false}
                  type={CURVE_TYPE}
                  dataKey="movingAverage"
                  stroke="var(--color-text-dim)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  // Bridges only a compared region's extra days: the window's
                  // leading gap has no point before it to connect from.
                  connectNulls
                  name={t('market.priceHistory.movingAverage')}
                />
              )}
              {/* After the primary series, one per compared region in pick
                  order: the slot fixes the colour and dash, so a region keeps
                  its line when another is added or removed after it. */}
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
              // Same left inset and the same *total* right inset as the price
              // strip above — there the order-count gutter is empty margin,
              // here it is the axis itself. The two plots misalign by exactly
              // that width the moment these drift apart.
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
              {/*
               * Rendered at every width, drawn only above `sm`. `hide`
               * suppresses the ticks and the gutter but keeps the scale, and
               * the scale is the whole point: order counts run in the
               * hundreds against a volume axis in the millions, so putting
               * this series on the volume axis instead flattened it onto the
               * baseline and read as "no orders at all".
               */}
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
              {/* On the phone its axis is hidden, so the line reads as a
                  shape — where activity rose, not by how much. The legend
                  names it and the tooltip carries the number at every width. */}
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

      {/*
       * Not Recharts' own `<Legend>`: there are two charts and one set of
       * series, so a per-chart legend would split the key in half and draw
       * the frame twice. It is also required rather than decorative —
       * DESIGN.md §7 forbids colour as the only signal, and on the phone the
       * order-count line has no axis left to name it.
       */}
      {/* The day table below has no heading of its own; the legend row is
          the bar above it, so its ⋯ menu sits at this row's end. */}
      <div className="flex items-center justify-between gap-2 pr-3">
        <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 px-3 pt-2 pb-1 text-[0.6875rem] text-text-dim">
          <li>
            <LegendItem
              label={tradedRangeLabel}
              shape="swatch"
              color="var(--color-accent-dim)"
              opacity={BAND_FILL_OPACITY}
              // Best buy/sell at close regularly sits outside the band: the
              // orders filled that day are gone by 23:45. Said where the
              // reader meets the two marks, so that reads as data, not a bug.
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
          {/* A region still loading, failed, or with no days in the range
              keeps its entry and says so — the reader picked it, and a line
              that silently never appears reads as a bug. */}
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

      {/*
       * Shown at every width, and never `sr-only`.
       *
       * It was briefly hidden above `useIsPhone`'s breakpoint, which broke on
       * a folding phone: unfolded it reports ~1900px, fails a max-width test
       * written for a handset, and the whole day list vanished mid-session
       * with nothing to say why. Width was answering "is this a phone" when
       * the real question is "does anyone want these numbers", and the answer
       * to that does not change with the hinge.
       *
       * So no breakpoint gates it. Below `sm` it stays a plain table, its
       * range and order-count columns shed (`phoneHidden`): a day list is
       * read across columns, not as cards (DESIGN.md §6c Restraint).
       */}
      <div className="overflow-x-auto">
        <DataTable
          {...tableExport.tableProps}
          columns={columns}
          rows={tableRows}
          rowKey={(p) => p.date}
          label={t('market.priceHistory.chartLabel', { item: itemName })}
          responsive="table"
          // `chartData` arrives oldest-first (`sortPriceHistory`), matching the
          // chart's left-to-right X axis — keep that until a header is clicked.
          defaultSort={{ columnId: 'date', direction: 'asc' }}
        />
      </div>
    </div>
  );
}
