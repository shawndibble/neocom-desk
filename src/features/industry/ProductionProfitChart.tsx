/**
 * Draws the Production Log's realized-profit-over-time chart with Recharts
 * (issue #711). Statically imports `recharts`, so — same rule as
 * `character/WalletBalanceChart.tsx` and `miningTax/MiningYieldCharts.tsx` —
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
import type { ProductionProfitPoint, ProductionProfitTrend } from './productionProfitHistory';

interface ProductionProfitChartProps {
  points: ProductionProfitPoint[];
  trend: ProductionProfitTrend;
}

const TREND_STROKE: Record<ProductionProfitTrend, string> = {
  up: 'var(--color-isk-pos)',
  down: 'var(--color-isk-neg)',
  flat: 'var(--color-accent)',
};

/** `date` is a bare calendar date — build the tick from Y/M/D components, never `new Date(string)`, to avoid a UTC/local day shift. */
function formatDateTick(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function ProfitTooltip({ active, payload }: TooltipContentProps): React.ReactElement | null {
  const { t } = useTranslation();
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as ProductionProfitPoint | undefined;
  if (!point) return null;
  return (
    <div className="rounded-xs border border-line bg-panel-2 px-2 py-1.5 text-xs text-text tabular-nums shadow-lg shadow-black/50">
      <p className="font-semibold">{formatDateTick(point.date)}</p>
      <p>
        {t('industry.totalRealizedProfit')}: {formatIsk(point.profit, 2)}
      </p>
    </div>
  );
}

/** Cumulative realized profit, bucketed by local calendar day — colored by overall trend direction. */
export default function ProductionProfitChart({ points, trend }: ProductionProfitChartProps) {
  const { t } = useTranslation();

  const columns = useMemo<DataTableColumn<ProductionProfitPoint>[]>(
    () => [
      {
        id: 'date',
        header: t('industry.productionRunColumnLogged'),
        render: (p) => formatDateTick(p.date),
      },
      {
        id: 'profit',
        header: t('industry.totalRealizedProfit'),
        render: (p) => formatIsk(p.profit, 2),
      },
    ],
    [t]
  );

  // `role="img"` collapses everything inside it into one opaque image for
  // assistive tech, so the sr-only table below must be a *sibling*, not a
  // child — nesting it here would make the accessible fallback unreachable.
  return (
    <div>
      <div role="img" aria-label={t('industry.profitHistoryChartLabel')} className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
              width={70}
              tickFormatter={(value: number) => formatIsk(value, 0)}
            />
            <Tooltip content={(props) => <ProfitTooltip {...props} />} />
            <Line
              type="monotone"
              dataKey="profit"
              stroke={TREND_STROKE[trend]}
              strokeWidth={2}
              dot={false}
              name={t('industry.totalRealizedProfit')}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        columns={columns}
        rows={points}
        rowKey={(p) => p.date}
        label={t('industry.profitHistoryChartLabel')}
        className="sr-only"
      />
    </div>
  );
}
