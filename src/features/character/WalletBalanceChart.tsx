/**
 * Draws the Wallet Balance tab's balance-over-time chart with Recharts.
 * Statically imports `recharts`, so — same rule as
 * `market/PriceHistoryChart.tsx` and `miningTax/MiningYieldCharts.tsx` —
 * this must only ever be reached through a dynamic `import()`, never
 * imported eagerly.
 */
import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Line,
  type TooltipContentProps,
} from 'recharts';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, type DataTableColumn } from '@/components/ui';
import { formatIsk } from '@/lib/isk';
import { formatDateOnly, formatTimestamp } from '@/lib/timestamp';
import type { WalletBalancePoint, WalletBalanceTrend } from '@/engine/wallet/balanceHistory';

interface ChartPoint extends WalletBalancePoint {
  dateLabel: string;
  tooltipLabel: string;
}

interface WalletBalanceChartProps {
  points: WalletBalancePoint[];
  trend: WalletBalanceTrend;
  timeZone?: string;
}

const TREND_STROKE: Record<WalletBalanceTrend, string> = {
  up: 'var(--color-isk-pos)',
  down: 'var(--color-isk-neg)',
  flat: 'var(--color-accent)',
};

function BalanceTooltip({ active, payload }: TooltipContentProps): React.ReactElement | null {
  const { t } = useTranslation();
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as ChartPoint | undefined;
  if (!point) return null;
  return (
    <div className="rounded-xs border border-line bg-panel-2 px-2 py-1.5 text-xs text-text tabular-nums shadow-lg">
      <p className="font-semibold">{point.tooltipLabel}</p>
      <p>
        {t('wallet.balanceCol')}: {formatIsk(point.balance, 2)}
      </p>
    </div>
  );
}

/** Each journal entry's own `balance`, plotted chronologically — colored by overall trend direction. */
export default function WalletBalanceChart({ points, trend, timeZone }: WalletBalanceChartProps) {
  const { t } = useTranslation();
  const chartData = useMemo<ChartPoint[]>(
    () =>
      points.map((p) => ({
        ...p,
        dateLabel: formatDateOnly(new Date(p.date), timeZone),
        tooltipLabel: formatTimestamp(new Date(p.date), timeZone),
      })),
    [points, timeZone]
  );

  const columns = useMemo<DataTableColumn<ChartPoint>[]>(
    () => [
      { id: 'date', header: t('wallet.date'), render: (p) => p.tooltipLabel },
      { id: 'balance', header: t('wallet.balanceCol'), render: (p) => formatIsk(p.balance, 2) },
    ],
    [t]
  );

  // `role="img"` collapses everything inside it into one opaque image for
  // assistive tech, so the sr-only table below must be a *sibling*, not a
  // child — nesting it here would make the accessible fallback unreachable.
  return (
    <div>
      <div role="img" aria-label={t('wallet.balanceHistoryChartLabel')} className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
            <XAxis
              dataKey="dateLabel"
              stroke="var(--color-text-dim)"
              tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
            />
            <YAxis
              stroke="var(--color-text-dim)"
              tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
              width={70}
              tickFormatter={(value: number) => formatIsk(value, 0)}
            />
            <Tooltip content={(props) => <BalanceTooltip {...props} />} />
            <Line
              type="monotone"
              dataKey="balance"
              stroke={TREND_STROKE[trend]}
              strokeWidth={2}
              dot={false}
              name={t('wallet.balanceCol')}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        columns={columns}
        rows={chartData}
        rowKey={(p) => p.date}
        label={t('wallet.balanceHistoryChartLabel')}
        className="sr-only"
      />
    </div>
  );
}
