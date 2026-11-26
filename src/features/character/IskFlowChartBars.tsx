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
import { signedIsk } from '@/lib/signedIsk';
import { COMPACT_ISK_Y_AXIS_MARGIN_LEFT, COMPACT_ISK_Y_AXIS_WIDTH } from '@/lib/chartAxis';
import { formatDateTick, formatDateWithYear } from '@/lib/formatDateTick';
import { scalePx } from '@/lib/fontScale';
import { formatIsk, formatIskCompact } from '@/lib/isk';

interface IskFlowChartBarsProps {
  days: readonly JournalDayFlow[];
  selectedDay: string | null;
  readOnly: boolean;
  onSelectDay: (day: string) => void;
}

interface BarPoint extends JournalDayFlow {
  below: number;
}

const BARS: { dataKey: string; fill: string; radius: [number, number, number, number] }[] = [
  { dataKey: 'in', fill: 'var(--color-isk-pos)', radius: [4, 4, 0, 0] },
  { dataKey: 'below', fill: 'var(--color-isk-neg)', radius: [4, 4, 0, 0] },
];

function FlowTooltip({ active, payload }: TooltipContentProps) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as BarPoint | undefined;
  if (!point) return null;
  return (
    <ChartTooltipShell>
      <p className="font-semibold text-text">{formatDateWithYear(point.day)}</p>
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
  readOnly,
  onSelectDay,
}: IskFlowChartBarsProps) {
  const { t } = useTranslation();
  const data = useMemo<BarPoint[]>(() => days.map((d) => ({ ...d, below: -d.out })), [days]);
  const columns = useMemo<DataTableColumn<JournalDayFlow>[]>(
    () => [
      { id: 'day', header: t('wallet.journalFlowDay'), render: (d) => formatDateWithYear(d.day) },
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
  const tableDays = useMemo(() => {
    const first = days.findIndex((d) => d.in > 0 || d.out > 0);
    return first < 0 ? days : days.slice(first);
  }, [days]);
  const opacity = (day: string) => (selectedDay && selectedDay !== day ? 0.35 : 1);
  const tickEvery = Math.max(0, Math.ceil(data.length / 5) - 1);
  return (
    <div>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            stackOffset="sign"
            margin={{ top: 4, right: 4, bottom: 0, left: COMPACT_ISK_Y_AXIS_MARGIN_LEFT }}
            onClick={(state) => {
              if (readOnly) return;
              const index = Number(state?.activeIndex);
              const point = Number.isInteger(index) ? data[index] : undefined;
              if (point) onSelectDay(point.day);
            }}
            style={{ cursor: readOnly ? 'default' : 'pointer' }}
          >
            <CartesianGrid vertical={false} stroke="var(--color-line)" strokeOpacity={0.5} />
            <XAxis
              dataKey="day"
              tickFormatter={(day: string) => formatDateTick(day)}
              tick={{ fontSize: '0.6875rem', fill: 'var(--color-text-dim)' }}
              interval={tickEvery}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              width={scalePx(COMPACT_ISK_Y_AXIS_WIDTH)}
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
            {BARS.map(({ dataKey, fill, radius }) => (
              <Bar
                key={dataKey}
                dataKey={dataKey}
                stackId="flow"
                fill={fill}
                isAnimationActive={false}
                radius={radius}
              >
                {data.map((point) => (
                  <Cell key={point.day} fillOpacity={opacity(point.day)} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="sr-only">
        <DataTable
          columns={columns}
          rows={tableDays}
          rowKey={(d) => d.day}
          label={t('wallet.journalFlowChartLabel')}
        />
      </div>
    </div>
  );
}
