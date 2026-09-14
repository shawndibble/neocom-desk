/**
 * Draws the Price History chart with Recharts. This module statically
 * imports `recharts`, so it must only ever be reached through a dynamic
 * `import()` (see `PriceHistoryPanel.tsx`) — importing it eagerly would put
 * Recharts back in the initial page bundle.
 */
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
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, type DataTableColumn } from '@/components/ui';
import {
  COMPACT_ISK_Y_AXIS_WIDTH,
  GROUPED_NUMBER_Y_AXIS_MARGIN_LEFT,
  GROUPED_NUMBER_Y_AXIS_WIDTH,
} from '@/lib/chartAxis';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { useIsPhone } from '@/lib/useIsPhone';
import { formatVolume } from './format';
import type { MarketHistoryPoint, MovingAveragePoint } from '@/engine/market/priceHistory';

interface PriceHistoryChartProps {
  points: MarketHistoryPoint[];
  itemName: string;
  /** Empty when the item has fewer real days of history than the moving-average window — no line, not a truncated one. */
  movingAverage?: readonly MovingAveragePoint[];
}

/**
 * Links the two charts' tooltips and cursors, so hovering either strip
 * highlights the same day in both. Constant rather than per-item: only one
 * Price History chart is ever mounted (the tab renders a single item), and a
 * per-item id would churn Recharts' module-level sync registry on every
 * selection for no gain.
 */
const SYNC_ID = 'market-price-history';

/** The right-hand gutter the order-count axis needs — its ticks are compact (`1.2K`), never fully grouped. */
const ORDER_COUNT_Y_AXIS_WIDTH = 40;

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

interface ChartRow extends MarketHistoryPoint {
  dateLabel: string;
  /** `[lowest, highest]` — Recharts reads a two-element array off a `dataKey` as a range area rather than a value. */
  range: [number, number];
  movingAverage: number | undefined;
}

/**
 * One tooltip body for both strips. Both charts render it and share a
 * `syncId`, so whichever one the pointer is over, the reader gets the whole
 * day — the price strip alone would leave them hunting the bars below to
 * find out how much actually moved.
 */
function HistoryTooltip({
  active,
  payload,
  label,
}: TooltipContentProps): React.ReactElement | null {
  const { t } = useTranslation();
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as ChartRow | undefined;
  if (!point) return null;
  return (
    <div className="rounded-xs border border-line bg-panel-2 px-2 py-1.5 text-xs text-text shadow-lg shadow-black/50">
      <p className="font-semibold">{label}</p>
      <p>
        {t('market.priceHistory.average')}: {formatIsk(point.average, 2)}
      </p>
      <p>
        {t('market.priceHistory.priceRange')}: {formatIsk(point.lowest, 2)} –{' '}
        {formatIsk(point.highest, 2)}
      </p>
      <p>
        {t('market.priceHistory.volume')}: {formatVolume(point.volume)}
      </p>
      <p>
        {t('market.priceHistory.orderCount')}: {formatVolume(point.orderCount)}
      </p>
    </div>
  );
}

interface LegendItemProps {
  label: string;
  /** A filled block for the band and the volume bars; a rule for the three line series. */
  shape: 'swatch' | 'line' | 'dashed';
  color: string;
  opacity?: number;
}

function LegendItem({ label, shape, color, opacity = 1 }: LegendItemProps) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="14" height="8" aria-hidden="true" className="shrink-0">
        {shape === 'swatch' ? (
          <rect width="14" height="8" fill={color} fillOpacity={opacity} />
        ) : (
          <line
            x1="0"
            y1="4"
            x2="14"
            y2="4"
            stroke={color}
            strokeWidth="2"
            strokeDasharray={shape === 'dashed' ? '4 3' : undefined}
          />
        )}
      </svg>
      {label}
    </span>
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
}: PriceHistoryChartProps) {
  const { t } = useTranslation();
  // Below `sm` the two grouped-integer gutters the desktop chart reserves
  // (95px on the left, plus the order-count axis on the right) eat most of a
  // 358px-wide plot. The phone drops the right-hand axis entirely — the
  // legend and the tooltip carry that series instead — and abbreviates the
  // left-hand ticks.
  const isPhone = useIsPhone();
  const priceAxisWidth = isPhone ? COMPACT_ISK_Y_AXIS_WIDTH : GROUPED_NUMBER_Y_AXIS_WIDTH;
  const orderAxisWidth = isPhone ? 0 : ORDER_COUNT_Y_AXIS_WIDTH;

  const chartData = useMemo<ChartRow[]>(() => {
    const maByDate = new Map(movingAverage.map((p) => [p.date, p.average]));
    return points.map((p) => ({
      ...p,
      dateLabel: formatTick(p.date),
      range: [p.lowest, p.highest],
      movingAverage: maByDate.get(p.date),
    }));
  }, [points, movingAverage]);

  const columns = useMemo<DataTableColumn<ChartRow>[]>(
    () => [
      { id: 'date', header: t('market.priceHistory.date'), render: (p) => p.date },
      {
        id: 'average',
        header: t('market.priceHistory.average'),
        render: (p) => formatIsk(p.average, 2),
      },
      {
        id: 'range',
        header: t('market.priceHistory.priceRange'),
        render: (p) => `${formatIsk(p.lowest, 2)} – ${formatIsk(p.highest, 2)}`,
      },
      {
        id: 'volume',
        header: t('market.priceHistory.volume'),
        render: (p) => formatVolume(p.volume),
      },
      {
        id: 'orderCount',
        header: t('market.priceHistory.orderCount'),
        render: (p) => formatVolume(p.orderCount),
      },
    ],
    [t]
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
                right: 8 + orderAxisWidth,
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
                tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
                width={priceAxisWidth}
                // The band, not the average, sets the extent now; Recharts'
                // default `[0, dataMax]` would squash a 9,000-ISK item into
                // the top tenth of the strip.
                domain={['dataMin', 'dataMax']}
                tickFormatter={(value: number) =>
                  isPhone ? formatIskCompact(value) : formatIsk(value, 0)
                }
              />
              <Tooltip content={(props) => <HistoryTooltip {...props} />} />
              {/* First, so the two price lines draw over the band, not under it. */}
              <Area
                dataKey="range"
                stroke="none"
                fill="var(--color-accent-dim)"
                fillOpacity={0.14}
                name={t('market.priceHistory.priceRange')}
              />
              <Line
                type="monotone"
                dataKey="average"
                stroke="var(--color-accent)"
                strokeWidth={2}
                dot={false}
                name={t('market.priceHistory.average')}
              />
              {movingAverage.length > 0 && (
                <Line
                  type="monotone"
                  dataKey="movingAverage"
                  stroke="var(--color-text-dim)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  connectNulls={false}
                  name={t('market.priceHistory.movingAverage')}
                />
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
              margin={{ top: 4, right: 8, left: GROUPED_NUMBER_Y_AXIS_MARGIN_LEFT, bottom: 0 }}
            >
              <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="dateLabel"
                stroke="var(--color-text-dim)"
                tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
              />
              <YAxis
                yAxisId="volume"
                stroke="var(--color-text-dim)"
                tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
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
                stroke="var(--color-kind-order-expiry)"
                tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
                width={ORDER_COUNT_Y_AXIS_WIDTH}
                tickFormatter={(value: number) => formatCompactNumber(value)}
              />
              <Tooltip content={(props) => <HistoryTooltip {...props} />} />
              <Bar
                yAxisId="volume"
                dataKey="volume"
                fill="var(--color-line-bright)"
                name={t('market.priceHistory.volume')}
              />
              {/* On the phone its axis is hidden, so the line reads as a
                  shape — where activity rose, not by how much. The legend
                  names it and the tooltip carries the number at every width. */}
              <Line
                yAxisId="orders"
                type="monotone"
                dataKey="orderCount"
                stroke="var(--color-kind-order-expiry)"
                strokeWidth={1.5}
                dot={false}
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
      <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 px-3 pt-2 pb-1 text-[0.6875rem] text-text-dim">
        <li>
          <LegendItem
            label={t('market.priceHistory.priceRange')}
            shape="swatch"
            color="var(--color-accent-dim)"
            opacity={0.35}
          />
        </li>
        <li>
          <LegendItem
            label={t('market.priceHistory.average')}
            shape="line"
            color="var(--color-accent)"
          />
        </li>
        {movingAverage.length > 0 && (
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
            color="var(--color-kind-order-expiry)"
          />
        </li>
      </ul>

      <DataTable
        columns={columns}
        rows={chartData}
        rowKey={(p) => p.date}
        label={t('market.priceHistory.chartLabel', { item: itemName })}
        className="sr-only"
      />
    </div>
  );
}
