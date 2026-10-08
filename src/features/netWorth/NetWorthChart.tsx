/**
 * Draws the Wallet net worth chart (issue #2935) with Recharts. Statically
 * imports `recharts`, so — same rule as `WalletBalanceChart` before it — this
 * must only ever be reached through a dynamic `import()`.
 *
 * One Character: layers stacked as areas. Several: one line per Character,
 * clickable to drill in. Days without a snapshot are a hatched band (never an
 * interpolated value); the wallet line carries on through them.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { ChartTooltipShell } from '@/components/ui/ChartTooltipShell';
import { DataTable, type DataTableColumn } from '@/components/ui';
import { COMPACT_ISK_Y_AXIS_MARGIN_LEFT, COMPACT_ISK_Y_AXIS_WIDTH } from '@/lib/chartAxis';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { formatDateOnly } from '@/lib/timestamp';
import { timeAxisTicks } from '@/engine/wallet/timeTicks';
import { lineKey, type LineRow, type StackRow } from '@/engine/netWorth/chartRows';
import { LAYER_IDS, type LayerId } from '@/engine/netWorth/series';
import { CHARACTER_COLORS, LAYER_COLOR, LAYER_LABEL_KEYS, characterStroke } from './layerMeta';

const MAX_X_TICKS = 5;
const HATCH_ID = 'net-worth-hatch';

export interface NetWorthChartLine {
  characterId: number;
  name: string;
}

export type NetWorthChartProps = { label: string } & (
  | {
      mode: 'single';
      rows: StackRow[];
      shown: readonly LayerId[];
      /** Marks where the layers join the wallet; `null` when there is no snapshot yet. */
      firstSnapshotDay: string | null;
      walletOnlyLabel: string;
    }
  | {
      mode: 'multi';
      rows: LineRow[];
      lines: NetWorthChartLine[];
      onSelect: (characterId: number) => void;
    }
);

function dayLabel(x: number): string {
  return formatDateOnly(new Date(x), 'UTC');
}

/** Contiguous runs of days with no snapshot after the first, as [from, to] x ranges. */
function gapRuns(rows: readonly StackRow[]): [number, number][] {
  const runs: [number, number][] = [];
  let start: number | null = null;
  let prev: number | null = null;
  for (const row of rows) {
    if (row.kind === 'gap') {
      start ??= row.x;
      prev = row.x;
    } else if (start !== null && prev !== null) {
      runs.push([start, row.x]);
      start = prev = null;
    }
  }
  if (start !== null && prev !== null) runs.push([start, prev]);
  return runs;
}

function StackTooltip({
  active,
  payload,
  shown,
}: TooltipContentProps & { shown: readonly LayerId[] }): React.ReactElement | null {
  const { t } = useTranslation();
  const row = payload?.[0]?.payload as StackRow | undefined;
  if (!active || !row) return null;
  return (
    <ChartTooltipShell>
      <p className="font-semibold text-text">{dayLabel(row.x)}</p>
      {LAYER_IDS.filter((id) => shown.includes(id)).map((id) => (
        <p key={id}>
          {t(LAYER_LABEL_KEYS[id])}: {formatIsk(row.values[id])}
        </p>
      ))}
      <p className="font-semibold text-text">
        {t('wallet.netWorth.total')}: {formatIsk(row.total)}
      </p>
    </ChartTooltipShell>
  );
}

function LinesTooltip({
  active,
  payload,
  lines,
}: TooltipContentProps & { lines: NetWorthChartLine[] }): React.ReactElement | null {
  const row = payload?.[0]?.payload as LineRow | undefined;
  if (!active || !row) return null;
  return (
    <ChartTooltipShell>
      <p className="font-semibold text-text">{dayLabel(row.x)}</p>
      {lines.map((line) => {
        const value = row[lineKey(line.characterId)];
        return typeof value === 'number' ? (
          <p key={line.characterId}>
            {line.name}: {formatIsk(value)}
          </p>
        ) : null;
      })}
    </ChartTooltipShell>
  );
}

export default function NetWorthChart(props: NetWorthChartProps) {
  const { t } = useTranslation();
  const { rows, label } = props;

  const axis = useMemo(() => {
    const xs = rows.map((r) => r.x);
    const min = xs.length ? Math.min(...xs) : 0;
    const max = xs.length ? Math.max(...xs) : 0;
    return { min, max, ...timeAxisTicks(min, max, 'UTC', MAX_X_TICKS) };
  }, [rows]);

  const columns = useMemo<DataTableColumn<StackRow | LineRow>[]>(
    () =>
      props.mode === 'single'
        ? [
            { id: 'day', header: t('wallet.date'), render: (r) => r.day },
            {
              id: 'total',
              header: t('wallet.netWorth.total'),
              render: (r) => formatIsk((r as StackRow).total),
            },
          ]
        : [
            { id: 'day', header: t('wallet.date'), render: (r) => r.day },
            ...props.lines.map((line) => ({
              id: lineKey(line.characterId),
              header: line.name,
              render: (r: StackRow | LineRow) => {
                const value = (r as LineRow)[lineKey(line.characterId)];
                return typeof value === 'number' ? formatIsk(value) : '';
              },
            })),
          ],
    [props, t]
  );

  const xAxis = (
    <XAxis
      dataKey="x"
      type="number"
      scale="time"
      domain={[axis.min, axis.max]}
      ticks={axis.ticks}
      tickFormatter={dayLabel}
      stroke="var(--color-text-dim)"
      tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
    />
  );
  const yAxis = (
    <YAxis
      stroke="var(--color-text-dim)"
      tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
      width={COMPACT_ISK_Y_AXIS_WIDTH}
      tickFormatter={(value: number) => formatIskCompact(value)}
    />
  );
  const hatch = (
    <defs>
      <pattern id={HATCH_ID} width="6" height="6" patternUnits="userSpaceOnUse">
        <path d="M0 6 L6 0" stroke="var(--color-text-dim)" strokeWidth="1" opacity="0.5" />
      </pattern>
    </defs>
  );
  const margin = { top: 8, right: 8, left: COMPACT_ISK_Y_AXIS_MARGIN_LEFT, bottom: 0 };

  // `role="img"` collapses its children into one opaque image for assistive
  // tech, so the sr-only table is a sibling, not a child.
  return (
    <div>
      <div role="img" aria-label={label} className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {props.mode === 'single' ? (
            <AreaChart data={props.rows} margin={margin}>
              {hatch}
              <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
              {xAxis}
              {yAxis}
              <Tooltip content={(p) => <StackTooltip {...p} shown={props.shown} />} />
              {gapRuns(props.rows).map(([from, to]) => (
                <ReferenceArea key={from} x1={from} x2={to} fill={`url(#${HATCH_ID})`} />
              ))}
              {props.firstSnapshotDay !== null && props.rows[0]?.kind === 'wallet-only' && (
                <ReferenceLine
                  x={Date.parse(props.firstSnapshotDay)}
                  stroke="var(--color-text-dim)"
                  strokeDasharray="4 3"
                  label={{
                    value: props.walletOnlyLabel,
                    position: 'insideTopLeft',
                    fontSize: 11,
                    fill: 'var(--color-text-dim)',
                  }}
                />
              )}
              {LAYER_IDS.filter((id) => props.shown.includes(id)).map((id) => (
                <Area
                  key={id}
                  isAnimationActive={false}
                  type="stepAfter"
                  stackId="net-worth"
                  dataKey={`values.${id}`}
                  name={t(LAYER_LABEL_KEYS[id])}
                  stroke={LAYER_COLOR[id]}
                  fill={LAYER_COLOR[id]}
                  fillOpacity={0.75}
                />
              ))}
            </AreaChart>
          ) : (
            <LineChart data={props.rows} margin={margin}>
              <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
              {xAxis}
              {yAxis}
              <Tooltip content={(p) => <LinesTooltip {...p} lines={props.lines} />} />
              {props.lines.map((line, index) => {
                const { color, dash } = characterStroke(index);
                return (
                  <Line
                    key={line.characterId}
                    isAnimationActive={false}
                    type="linear"
                    dataKey={lineKey(line.characterId)}
                    name={line.name}
                    stroke={color || CHARACTER_COLORS[0]}
                    strokeDasharray={dash}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4, onClick: () => props.onSelect(line.characterId) }}
                    connectNulls={false}
                    style={{ cursor: 'pointer' }}
                    onClick={() => props.onSelect(line.characterId)}
                  />
                );
              })}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      <div className="sr-only">
        <DataTable
          columns={columns}
          rows={rows as (StackRow | LineRow)[]}
          rowKey={(r) => r.day}
          label={label}
          responsive="table"
        />
      </div>
    </div>
  );
}
