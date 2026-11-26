import { scalePx } from '@/lib/fontScale';
import { ChartTooltipShell } from '@/components/ui/ChartTooltipShell';
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
import { COMPACT_ISK_Y_AXIS_MARGIN_LEFT, COMPACT_ISK_Y_AXIS_WIDTH } from '@/lib/chartAxis';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import type {
  ProductionProfitPoint,
  ProductionProfitTrend,
} from '@/engine/industry/productionProfitHistory';
import { formatDateTick } from '@/lib/formatDateTick';

interface ProductionProfitChartProps {
  points: ProductionProfitPoint[];
  trend: ProductionProfitTrend;
}

const TREND_STROKE: Record<ProductionProfitTrend, string> = {
  up: 'var(--color-isk-pos)',
  down: 'var(--color-isk-neg)',
  flat: 'var(--color-accent)',
};

function ProfitTooltip({ active, payload }: TooltipContentProps): React.ReactElement | null {
  const { t } = useTranslation();
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as ProductionProfitPoint | undefined;
  if (!point) return null;
  return (
    <ChartTooltipShell>
      <p className="font-semibold text-text">{formatDateTick(point.date)}</p>
      <p>
        {t('industry.totalRealizedProfit')}: {formatIsk(point.profit, 2)}
      </p>
    </ChartTooltipShell>
  );
}

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

  return (
    <div>
      <div role="img" aria-label={t('industry.profitHistoryChartLabel')} className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: 8, right: 8, left: COMPACT_ISK_Y_AXIS_MARGIN_LEFT, bottom: 0 }}
          >
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateTick}
              stroke="var(--color-text-dim)"
              tick={{ fontSize: '0.6875rem', fill: 'var(--color-text-dim)' }}
            />
            <YAxis
              stroke="var(--color-text-dim)"
              tick={{ fontSize: '0.6875rem', fill: 'var(--color-text-dim)' }}
              width={scalePx(COMPACT_ISK_Y_AXIS_WIDTH)}
              tickFormatter={(value: number) => formatIskCompact(value)}
            />
            <Tooltip content={(props) => <ProfitTooltip {...props} />} />
            <Line
              isAnimationActive={false}
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
      <div className="sr-only">
        <DataTable
          columns={columns}
          rows={points}
          rowKey={(p) => p.date}
          label={t('industry.profitHistoryChartLabel')}
        />
      </div>
    </div>
  );
}
