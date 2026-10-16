/**
 * The bars of the Journal panel's daily In / Out chart (issue #3914), drawn
 * with Recharts. Statically imports `recharts`, so — same rule as
 * `industry/ProductionProfitChart.tsx` — this must only ever be reached
 * through a dynamic `import()` (see `IskFlowChart.tsx`).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { ChartTooltipShell } from '@/components/ui/ChartTooltipShell';
import { DataTable, type DataTableColumn } from '@/components/ui';
import type { JournalDayFlow } from '@/engine/journalDailyFlow';
import { netToneClass } from '@/features/character/format';
import { signedIsk } from '@/features/market/signedIsk';
import { COMPACT_ISK_Y_AXIS_WIDTH } from '@/lib/chartAxis';
import { scalePx } from '@/lib/fontScale';
import { formatIsk, formatIskCompact } from '@/lib/isk';

interface IskFlowChartBarsProps {
  days: readonly JournalDayFlow[];
  /** The day the Journal is filtered to, when it is one day: the others dim. */
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
}

interface BarPoint extends JournalDayFlow {
  /** Out as a negative number: stacked below the zero line. */
  below: number;
}

/** Bare calendar date to a short label, built from components so no UTC/local day shift. */
function formatDay(day: string, withYear = false): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

function FlowTooltip({ active, payload }: TooltipContentProps) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as BarPoint | undefined;
  if (!point) return null;
  return (
    <ChartTooltipShell>
      <p className="font-semibold text-text">{formatDay(point.day, true)}</p>
      <p>
        {t('wallet.journalBreakdownIn')}: {formatIsk(point.in)}
      </p>
      <p>
        {t('wallet.journalBreakdownOut')}: {formatIsk(point.out)}
      </p>
      <p>
        {t('wallet.journalBreakdownNet')}: {signedIsk(point.net, 0)}
      </p>
    </ChartTooltipShell>
  );
}

export default function IskFlowChartBars({
  days,
  selectedDay,
  onSelectDay,
}: IskFlowChartBarsProps) {
  const { t } = useTranslation();
  const data = useMemo<BarPoint[]>(() => days.map((d) => ({ ...d, below: -d.out })), [days]);
  const columns = useMemo<DataTableColumn<JournalDayFlow>[]>(
    () => [
      { id: 'day', header: t('wallet.journalFlowDay'), render: (d) => formatDay(d.day, true) },
      { id: 'in', header: t('wallet.journalBreakdownIn'), render: (d) => formatIsk(d.in) },
      { id: 'out', header: t('wallet.journalBreakdownOut'), render: (d) => formatIsk(d.out) },
      {
        id: 'net',
        header: t('wallet.journalBreakdownNet'),
        cellClassName: (d) => netToneClass(d.net),
        render: (d) => signedIsk(d.net, 0),
      },
    ],
    [t]
  );
  const opacity = (day: string) => (selectedDay && selectedDay !== day ? 0.35 : 1);
  const tickEvery = Math.max(0, Math.ceil(data.length / 5) - 1);
  return (
    <div>
      <div role="img" aria-label={t('wallet.journalFlowChartLabel')} className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            stackOffset="sign"
            margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
            onClick={(state) => {
              const index = Number(state?.activeIndex);
              const point = Number.isInteger(index) ? data[index] : undefined;
              if (point) onSelectDay(point.day);
            }}
            style={{ cursor: 'pointer' }}
          >
            <CartesianGrid vertical={false} stroke="var(--color-line)" strokeOpacity={0.5} />
            <XAxis
              dataKey="day"
              tickFormatter={(day: string) => formatDay(day)}
              tick={{ fontSize: '0.6875rem', fill: 'var(--color-text-dim)' }}
              interval={tickEvery}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              width={scalePx(COMPACT_ISK_Y_AXIS_WIDTH)}
              // SVG axis tick: IskAmount can't render here (documented exception).
              tickFormatter={(value: number) => formatIskCompact(value)}
              tick={{ fontSize: '0.6875rem', fill: 'var(--color-text-dim)' }}
              tickLine={false}
              axisLine={false}
            />
            <ReferenceLine y={0} stroke="var(--color-line-bright)" />
            <Tooltip
              content={(props) => <FlowTooltip {...props} />}
              cursor={{ fill: 'var(--color-panel-2)' }}
            />
            <Bar
              dataKey="in"
              stackId="flow"
              fill="var(--color-isk-pos)"
              isAnimationActive={false}
              radius={[4, 4, 0, 0]}
            >
              {data.map((point) => (
                <Cell key={point.day} fillOpacity={opacity(point.day)} />
              ))}
            </Bar>
            <Bar
              dataKey="below"
              stackId="flow"
              fill="var(--color-isk-neg)"
              isAnimationActive={false}
              radius={[0, 0, 4, 4]}
            >
              {data.map((point) => (
                <Cell key={point.day} fillOpacity={opacity(point.day)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* On a wrapper: a <table> ignores sr-only's clip and still stretches the page. */}
      <div className="sr-only">
        <DataTable
          columns={columns}
          rows={days}
          rowKey={(d) => d.day}
          label={t('wallet.journalFlowChartLabel')}
        />
      </div>
    </div>
  );
}
