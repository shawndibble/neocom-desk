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
  Bar,
  Line,
  type TooltipContentProps,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { formatIsk } from '@/lib/isk';
import { formatVolume } from './format';
import type { MarketHistoryPoint } from '@/engine/market/priceHistory';

interface PriceHistoryChartProps {
  points: MarketHistoryPoint[];
  itemName: string;
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

function HistoryTooltip({
  active,
  payload,
  label,
}: TooltipContentProps): React.ReactElement | null {
  const { t } = useTranslation();
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as MarketHistoryPoint | undefined;
  if (!point) return null;
  return (
    <div className="rounded-xs border border-line bg-panel-2 px-2 py-1.5 text-xs text-text shadow-lg">
      <p className="font-semibold">{label}</p>
      <p>
        {t('market.priceHistory.average')}: {formatIsk(point.average, 2)}
      </p>
      <p>
        {t('market.priceHistory.volume')}: {formatVolume(point.volume)}
      </p>
    </div>
  );
}

/** Daily average price (line) over traded volume (bars), for one item in one region. */
export default function PriceHistoryChart({ points, itemName }: PriceHistoryChartProps) {
  const { t } = useTranslation();
  const chartData = points.map((p) => ({ ...p, dateLabel: formatTick(p.date) }));

  // `role="img"` collapses everything inside it into one opaque image for
  // assistive tech, so the sr-only table below must be a *sibling*, not a
  // child — nesting it here would make the accessible fallback unreachable.
  return (
    <div>
      <div
        role="img"
        aria-label={t('market.priceHistory.chartLabel', { item: itemName })}
        className="h-72 w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
            <XAxis
              dataKey="dateLabel"
              stroke="var(--color-text-dim)"
              tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
            />
            <YAxis
              yAxisId="price"
              stroke="var(--color-accent)"
              tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
              width={70}
              tickFormatter={(value: number) => formatIsk(value, 0)}
            />
            <YAxis
              yAxisId="volume"
              orientation="right"
              stroke="var(--color-text-dim)"
              tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
              width={60}
              tickFormatter={(value: number) => formatVolume(value)}
            />
            <Tooltip content={(props) => <HistoryTooltip {...props} />} />
            <Bar
              yAxisId="volume"
              dataKey="volume"
              fill="var(--color-line-bright)"
              name={t('market.priceHistory.volume')}
            />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="average"
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={false}
              name={t('market.priceHistory.average')}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{t('market.priceHistory.chartLabel', { item: itemName })}</caption>
        <thead>
          <tr>
            <th>{t('market.priceHistory.date')}</th>
            <th>{t('market.priceHistory.average')}</th>
            <th>{t('market.priceHistory.volume')}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <td>{p.date}</td>
              <td>{formatIsk(p.average, 2)}</td>
              <td>{formatVolume(p.volume)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
