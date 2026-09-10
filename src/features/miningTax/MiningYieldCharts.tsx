/**
 * Draws the Mining Yield Overview tab's two charts with Recharts (issue
 * #671). Statically imports `recharts`, so — same rule as
 * `market/PriceHistoryChart.tsx` — this must only ever be reached through a
 * dynamic `import()` from `OverviewTab.tsx`, never imported eagerly.
 */
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  type TooltipContentProps,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { GROUPED_NUMBER_Y_AXIS_MARGIN_LEFT, GROUPED_NUMBER_Y_AXIS_WIDTH } from '@/lib/chartAxis';
import { formatIsk } from '@/lib/isk';

export interface DailyRatePoint {
  date: string;
  iskPerHour: number;
}

export interface TypeComparisonPoint {
  typeId: number;
  typeName: string;
  rawValue: number;
  refineValue: number;
}

interface MiningYieldChartsProps {
  dailyRate: DailyRatePoint[];
  typeComparison: TypeComparisonPoint[];
}

/** `date` is a bare calendar date — build the tick from Y/M/D components, never `new Date(string)`, to avoid a UTC/local day shift. */
function formatDateTick(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function tooltipContentStyle(): React.CSSProperties {
  return {
    background: 'var(--color-panel-2)',
    border: '1px solid var(--color-line)',
    fontSize: '0.75rem',
  };
}

function RateTooltip({ active, payload, label }: TooltipContentProps): React.ReactElement | null {
  const { t } = useTranslation();
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as DailyRatePoint | undefined;
  if (!point) return null;
  return (
    <div style={tooltipContentStyle()} className="rounded-xs px-2 py-1.5">
      <p className="font-semibold">{typeof label === 'string' ? formatDateTick(label) : ''}</p>
      <p>
        {t('miningTax.overview.iskPerHour')}: {formatIsk(point.iskPerHour, 0)} ISK
      </p>
    </div>
  );
}

function CompareTooltip({ active, payload }: TooltipContentProps): React.ReactElement | null {
  const { t } = useTranslation();
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as TypeComparisonPoint | undefined;
  if (!point) return null;
  return (
    <div style={tooltipContentStyle()} className="rounded-xs px-2 py-1.5">
      <p className="font-semibold">{point.typeName}</p>
      <p>
        {t('miningTax.overview.rawSellValue')}: {formatIsk(point.rawValue, 0)} ISK
      </p>
      <p>
        {t('miningTax.overview.refineValue')}: {formatIsk(point.refineValue, 0)} ISK
      </p>
    </div>
  );
}

export default function MiningYieldCharts({ dailyRate, typeComparison }: MiningYieldChartsProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div>
        <p className="mb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('miningTax.overview.rateChartTitle')}
        </p>
        <div role="img" aria-label={t('miningTax.overview.rateChartTitle')} className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={dailyRate}
              margin={{ top: 8, right: 8, left: GROUPED_NUMBER_Y_AXIS_MARGIN_LEFT, bottom: 0 }}
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
                width={GROUPED_NUMBER_Y_AXIS_WIDTH}
                tickFormatter={(value: number) => formatIsk(value, 0)}
              />
              <Tooltip content={(props) => <RateTooltip {...props} />} />
              <Bar
                dataKey="iskPerHour"
                fill="var(--color-accent)"
                name={t('miningTax.overview.iskPerHour')}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <p className="mb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('miningTax.overview.compareChartTitle')}
        </p>
        <div
          role="img"
          aria-label={t('miningTax.overview.compareChartTitle')}
          className="h-64 w-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={typeComparison}
              margin={{ top: 8, right: 8, left: GROUPED_NUMBER_Y_AXIS_MARGIN_LEFT, bottom: 0 }}
            >
              <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
              <XAxis
                dataKey="typeName"
                stroke="var(--color-text-dim)"
                tick={{ fontSize: 10, fill: 'var(--color-text-dim)' }}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={50}
              />
              <YAxis
                stroke="var(--color-text-dim)"
                tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
                width={GROUPED_NUMBER_Y_AXIS_WIDTH}
                tickFormatter={(value: number) => formatIsk(value, 0)}
              />
              <Tooltip content={(props) => <CompareTooltip {...props} />} />
              <Legend wrapperStyle={{ fontSize: '0.6875rem' }} />
              <Bar
                dataKey="rawValue"
                fill="var(--color-line-bright)"
                name={t('miningTax.overview.rawSellValue')}
              />
              <Bar
                dataKey="refineValue"
                fill="var(--color-accent)"
                name={t('miningTax.overview.refineValue')}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
