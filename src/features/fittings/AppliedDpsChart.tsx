/**
 * The applied-DPS graphs (issue #1546): against range and against target
 * speed, with an optional second Fitting overlaid. Statically imports
 * `recharts`, so — same rule as `industry/ProductionProfitChart.tsx` — this
 * must only ever be reached through a dynamic `import()`.
 *
 * The overlay is told apart by form, not colour (docs/DESIGN.md: dashed
 * against solid before reaching for a second hue): both lines are `accent`,
 * the overlay dashed, and the key draws the dash too.
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

export interface AppliedDpsRow {
  /** Metres (range graph) or m/s (speed graph). */
  x: number;
  primary: number;
  overlay?: number;
}

interface AppliedDpsChartProps {
  range: AppliedDpsRow[];
  speed: AppliedDpsRow[];
  /** Metres — the fixed range the speed graph is worked out at. */
  speedAtRange: number;
  /** The overlaid Fitting's name; absent when nothing is overlaid. */
  overlayName?: string;
}

const STROKE = 'var(--color-accent)';
const OVERLAY_DASH = '4 3';

function formatKm(metres: number): string {
  return (metres / 1000).toFixed(metres % 1000 === 0 ? 0 : 1);
}

function Swatch({ dashed, label }: { dashed: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="14" height="8" aria-hidden="true">
        <line
          x1="0"
          y1="4"
          x2="14"
          y2="4"
          stroke={STROKE}
          strokeWidth="2"
          strokeDasharray={dashed ? OVERLAY_DASH : undefined}
        />
      </svg>
      {label}
    </span>
  );
}

function DpsTooltip({
  active,
  payload,
  formatX,
}: TooltipContentProps & { formatX: (x: number) => string }): React.ReactElement | null {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as AppliedDpsRow | undefined;
  if (!row) return null;
  return (
    <div className="rounded-xs border border-line bg-panel-2 px-2 py-1.5 text-xs text-text tabular-nums shadow-lg shadow-black/50">
      <p className="font-semibold">{formatX(row.x)}</p>
      {payload.map((entry) => (
        <p key={String(entry.dataKey)}>
          {entry.name}: {Number(entry.value).toFixed(1)}
        </p>
      ))}
    </div>
  );
}

function Graph({
  rows,
  label,
  xHeader,
  formatX,
  overlayName,
}: {
  rows: AppliedDpsRow[];
  label: string;
  xHeader: string;
  formatX: (x: number) => string;
  overlayName?: string;
}) {
  const { t } = useTranslation();
  const primaryName = t('fittings.appliedDps.thisFitting');

  const columns = useMemo<DataTableColumn<AppliedDpsRow>[]>(
    () => [
      { id: 'x', header: xHeader, render: (row) => formatX(row.x) },
      { id: 'primary', header: primaryName, render: (row) => row.primary.toFixed(1) },
      ...(overlayName === undefined
        ? []
        : [
            {
              id: 'overlay',
              header: overlayName,
              render: (row: AppliedDpsRow) => (row.overlay ?? 0).toFixed(1),
            },
          ]),
    ],
    [xHeader, formatX, primaryName, overlayName]
  );

  // `role="img"` collapses its content for assistive tech, so the sr-only
  // table is a sibling, never a child.
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-text-dim">{label}</p>
      <div role="img" aria-label={label} className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
            <XAxis
              dataKey="x"
              type="number"
              domain={[0, 'dataMax']}
              tickFormatter={formatX}
              stroke="var(--color-text-dim)"
              tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
            />
            <YAxis
              stroke="var(--color-text-dim)"
              tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
              width={40}
              tickFormatter={(value: number) => value.toFixed(0)}
            />
            <Tooltip content={(props) => <DpsTooltip {...props} formatX={formatX} />} />
            <Line
              type="monotone"
              dataKey="primary"
              stroke={STROKE}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              name={primaryName}
            />
            {overlayName !== undefined && (
              <Line
                type="monotone"
                dataKey="overlay"
                stroke={STROKE}
                strokeWidth={2}
                strokeDasharray={OVERLAY_DASH}
                dot={false}
                isAnimationActive={false}
                name={overlayName}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => String(row.x)}
        label={label}
        className="sr-only"
      />
    </div>
  );
}

export default function AppliedDpsChart({
  range,
  speed,
  speedAtRange,
  overlayName,
}: AppliedDpsChartProps) {
  const { t } = useTranslation();
  const formatRange = useMemo(
    () => (x: number) => t('fittings.appliedDps.km', { value: formatKm(x) }),
    [t]
  );
  const formatSpeed = useMemo(
    () => (x: number) => t('fittings.appliedDps.speed', { value: x.toFixed(0) }),
    [t]
  );

  return (
    <div className="space-y-3">
      {overlayName !== undefined && (
        <div className="flex flex-wrap gap-3 text-xs text-text-dim">
          <Swatch dashed={false} label={t('fittings.appliedDps.thisFitting')} />
          <Swatch dashed label={overlayName} />
        </div>
      )}
      <Graph
        rows={range}
        label={t('fittings.appliedDps.vsRange')}
        xHeader={t('fittings.appliedDps.rangeHeader')}
        formatX={formatRange}
        overlayName={overlayName}
      />
      <Graph
        rows={speed}
        label={t('fittings.appliedDps.vsSpeed', { km: formatKm(speedAtRange) })}
        xHeader={t('fittings.appliedDps.speedHeader')}
        formatX={formatSpeed}
        overlayName={overlayName}
      />
    </div>
  );
}
