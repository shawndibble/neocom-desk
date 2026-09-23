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
  Cell,
  LabelList,
  type TooltipContentProps,
} from 'recharts';
import type { PriceSource } from '@/engine/miningTax/priceBasis';
import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { COMPACT_ISK_Y_AXIS_MARGIN_LEFT, COMPACT_ISK_Y_AXIS_WIDTH } from '@/lib/chartAxis';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { topTypesWithOther, type RankedType } from './topTypes';

export interface DailyRatePoint {
  date: string;
  iskPerHour: number;
  /** The day's weakest price source (issue #1279); null on a day with no mining. */
  source: PriceSource | null;
}

/** Bar colour per price source — the same meaning as the table's tags. */
const SOURCE_FILL: Record<PriceSource, string> = {
  saved: 'var(--color-accent)',
  average: 'var(--color-warning)',
  live: 'var(--color-accent-dim)',
  none: 'var(--color-line-bright)',
};
const LEGEND_SOURCES: PriceSource[] = ['saved', 'average', 'live'];

export type TypeComparisonPoint = RankedType;

/** Bars the ore-type chart draws before folding the rest into "Other". */
const TOP_TYPE_LIMIT = 8;

/** A drawn bar — one type, or the "Other" roll-up carrying the types it folds. */
interface ComparisonBar extends TypeComparisonPoint {
  folded?: TypeComparisonPoint[];
}

interface MiningYieldChartsProps {
  dailyRate: DailyRatePoint[];
  typeComparison: TypeComparisonPoint[];
  /** Issue #1281's page switch — raw-only bars with end labels and a note, no refined series at all. */
  showRefining: boolean;
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
    <div style={tooltipContentStyle()} className="rounded-xs px-2 py-1.5">
      <p className="font-semibold">{point.typeName}</p>
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
              {type.typeName}: {formatIskCompact(type.rawValue)}
              {showRefining && ` / ${formatIskCompact(type.refineValue)}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MiningYieldCharts({
  dailyRate,
  typeComparison,
  showRefining,
}: MiningYieldChartsProps) {
  const { t } = useTranslation();
  const compareChartTitle = t(
    showRefining
      ? 'miningTax.overview.compareChartTitle'
      : 'miningTax.overview.compareChartTitleRawOnly'
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
  const compareHeight = Math.max(
    256,
    compareBars.length * (showRefining ? 36 : 24) + (showRefining ? 64 : 32)
  );

  // Two cards, same gap as the stat cards above them.
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Panel padded>
        <p className="mb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('miningTax.overview.rateChartTitle')}
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
                tickFormatter={(value: number) => formatIskCompact(value)}
              />
              <Tooltip content={(props) => <RateTooltip {...props} />} />
              <Bar dataKey="iskPerHour" name={t('miningTax.overview.iskPerHour')}>
                {dailyRate.map((point) => (
                  <Cell key={point.date} fill={SOURCE_FILL[point.source ?? 'saved']} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
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
                dataKey="rawValue"
                fill="var(--color-line-bright)"
                name={t('miningTax.overview.rawSellValue')}
              >
                {!showRefining && (
                  <LabelList
                    dataKey="rawValue"
                    position="right"
                    formatter={(value: unknown) => formatIskCompact(Number(value))}
                    style={{ fontSize: 10, fill: 'var(--color-text-dim)' }}
                  />
                )}
              </Bar>
              {showRefining && (
                <Bar
                  dataKey="refineValue"
                  fill="var(--color-accent)"
                  name={t('miningTax.overview.refineValue')}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
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
