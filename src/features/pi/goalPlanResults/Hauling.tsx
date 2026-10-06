/** What it costs to move: hauling effort against the Baseline, and every leg. */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, Panel, StatChip, StatChips, type DataTableColumn } from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import type { FlowEnd, GoalPlan } from '@/engine/pi/goalTypes';
import type { BaselineTotal } from '@/engine/pi/baseline';
import { volumeOf } from '@/engine/pi/haulEffort';
import { piTier as piTierOf } from '@/engine/pi/chain';
import { PiProductLink } from '../PiProductLink';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { JumpsLink } from '@/features/travel/JumpsLink';
import { formatVolume } from '@/features/industry/format';
import { TierChip } from '../DirectiveRow';
import type { PlanHauling } from '../goalPlannerModel';
import { commodityName, formatUnits } from '../goalPlannerFormat';
import { ColonyLink } from './ColonyLink';
import { endName, type PlanNames } from './format';

interface LegRow {
  key: string;
  from: FlowEnd;
  to: FlowEnd;
  typeId: number;
  name: string;
  m3PerTrip: number;
  /** Undefined without distances yet; null when there is no route. */
  jumps: number | null | undefined;
}

function EndLink({ end, names }: { end: FlowEnd; names: PlanNames }) {
  return end === 'hub' ? <>{names.hub.systemName}</> : <ColonyLink planetId={end} names={names} />;
}

function endSystem(end: FlowEnd, names: PlanNames): number | undefined {
  return end === 'hub' ? names.hub.systemId : names.systemOf(end);
}

function effortText(m3Jumps: number): string {
  return formatUnits(Math.round(m3Jumps));
}

export function Hauling({
  hauling,
  plan,
  baseline,
  haulHours,
  haulDays,
  distancesPending,
  names,
}: {
  hauling: PlanHauling;
  plan: Pick<GoalPlan, 'flows' | 'haulEffort'>;
  baseline: Pick<BaselineTotal, 'haulEffort'>;
  haulHours: number;
  haulDays: number;
  distancesPending: boolean;
  names: PlanNames;
}) {
  const { t } = useTranslation();
  const { pi } = names;
  const rows: LegRow[] = useMemo(
    () =>
      plan.flows
        .filter((flow) => flow.from !== flow.to)
        .map((flow) => ({
          key: `${flow.from}>${flow.to}:${flow.typeId}`,
          from: flow.from,
          to: flow.to,
          typeId: flow.typeId,
          name: commodityName(flow.typeId, pi),
          m3PerTrip: flow.unitsPerHour * volumeOf(flow.typeId, pi) * haulHours,
          jumps: flow.jumps,
        }))
        .filter((row) => row.m3PerTrip > 0)
        .sort((x, y) => y.m3PerTrip - x.m3PerTrip),
    [plan.flows, pi, haulHours]
  );
  const unknown = plan.haulEffort.unknownLegs + baseline.haulEffort.unknownLegs;
  // What the note counts: the plan's own legs on screen with no distance.
  const unknownShown = rows.filter((row) => row.jumps === null).length;
  const planEffort = plan.haulEffort.m3JumpsPerHour * haulHours;
  const baselineEffort = baseline.haulEffort.m3JumpsPerHour * haulHours;
  const changePercent =
    unknown === 0 && baselineEffort > 0
      ? Math.round((planEffort / baselineEffort - 1) * 100)
      : null;

  const columns = useMemo<DataTableColumn<LegRow>[]>(
    () => [
      {
        id: 'from',
        header: t('piPlan.legFrom'),
        primary: true,
        sortValue: (row) => endName(row.from, names),
        render: (row) => (
          <span>
            <EndLink end={row.from} names={names} />
            {' → '}
            <EndLink end={row.to} names={names} />
          </span>
        ),
      },
      {
        id: 'item',
        header: t('piPlan.legItem'),
        sortValue: (row) => row.name,
        render: (row) => (
          <span className="inline-flex items-center gap-2">
            <TierChip tier={piTierOf(row.typeId, names.pi)} />
            <PiProductLink typeId={row.typeId}>{row.name}</PiProductLink>
          </span>
        ),
      },
      {
        id: 'm3',
        header: t('piPlan.legM3'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.m3PerTrip,
        render: (row) => formatVolume(row.m3PerTrip),
      },
      {
        id: 'jumps',
        header: t('piPlan.legJumps'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.jumps ?? undefined,
        render: (row) => {
          if (row.jumps === undefined) {
            return (
              <span className="text-text-dim" title={t('piPlan.legJumpsPending')}>
                <span aria-hidden="true">…</span>
                <span className="sr-only">{t('piPlan.legJumpsPending')}</span>
              </span>
            );
          }
          if (row.jumps === null) {
            return (
              <span className="text-text-dim" title={t('jumpRange.distanceUnavailable')}>
                <span aria-hidden="true">—</span>
                <span className="sr-only">{t('jumpRange.distanceUnavailable')}</span>
              </span>
            );
          }
          const to = endSystem(row.to, names);
          const from = endSystem(row.from, names);
          if (row.jumps === 0)
            return <span className="text-text-dim">{t('piPlan.legSameSystem')}</span>;
          return to === undefined ? (
            String(row.jumps)
          ) : (
            <JumpsLink systemId={to} fromId={from}>
              {row.jumps}
            </JumpsLink>
          );
        },
      },
    ],
    [t, names]
  );
  const tableExport = useTableExport({
    surface: 'pi-plan-hauling',
    rows,
    columns: [
      { header: t('piPlan.legFromCsv'), value: (row) => endName(row.from, names) },
      { header: t('piPlan.legToCsv'), value: (row) => endName(row.to, names) },
      { header: t('piPlan.legItem'), value: (row) => row.name },
      { header: t('piPlan.legM3'), value: (row) => Math.round(row.m3PerTrip * 10) / 10 },
      { header: t('piPlan.legJumps'), value: (row) => row.jumps ?? '' },
    ],
  });
  const perColony = [...hauling.perColony]
    .map(([planetId, m3]) => ({ planetId, ...m3 }))
    .sort((x, y) => y.outM3 + y.inM3 - (x.outM3 + x.inM3));

  return (
    <Panel
      title={t('piPlan.haulTitle')}
      meta={
        <span className="text-[0.6875rem] text-text-dim">
          {t('piPlan.haulPerTrip', { count: haulDays })}
        </span>
      }
      actions={
        rows.length > 0 ? (
          <TableActionsMenu name={t('piPlan.haulTitle')} tableExport={tableExport} />
        ) : undefined
      }
      padded={false}
    >
      <div className="space-y-2 p-3">
        <StatChips>
          <StatChip
            label={t('piPlan.haulEffortPlan')}
            tooltip={t('piPlan.haulEffortTooltip')}
            value={unknown > 0 ? '—' : effortText(planEffort)}
          />
          <StatChip
            label={t('piPlan.haulEffortBaseline')}
            value={unknown > 0 ? '—' : effortText(baselineEffort)}
          />
          {changePercent !== null && (
            <StatChip
              label={t('piPlan.haulChange')}
              tone={changePercent < 0 ? 'success' : 'default'}
              value={
                changePercent < 0
                  ? t('piPlan.haulLess', { percent: -changePercent })
                  : changePercent > 0
                    ? t('piPlan.haulMore', { percent: changePercent })
                    : t('piPlan.haulSameEffort')
              }
            />
          )}
          <StatChip label={t('piPlan.haulPlanTotal')} value={formatVolume(hauling.planM3PerTrip)} />
          <StatChip
            label={t('piPlan.haulBaselineTotal')}
            value={formatVolume(hauling.baselineM3PerTrip)}
          />
        </StatChips>
        {distancesPending ? (
          <p className="text-[0.6875rem] text-text-dim">{t('piPlan.haulDistancesPending')}</p>
        ) : unknownShown > 0 ? (
          <p className="text-[0.6875rem] text-text-dim">
            {t('piPlan.haulDistancesUnknown', { count: unknownShown })}
          </p>
        ) : unknown > 0 ? (
          <p className="text-[0.6875rem] text-text-dim">{t('piPlan.haulBaselineUnknown')}</p>
        ) : null}
        {perColony.length > 0 && (
          <p className="text-[0.6875rem] text-text-dim">
            {perColony
              .map((c) =>
                t('piPlan.haulColonyTotal', {
                  name: names.planet(c.planetId),
                  out: formatVolume(c.outM3),
                  in: formatVolume(c.inM3),
                })
              )
              .join(' · ')}
          </p>
        )}
      </div>
      {rows.length > 0 && (
        <DataTable
          {...tableExport.tableProps}
          label={t('piPlan.haulTableLabel')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.key}
          density="compact"
          stackColumns={2}
          rowContextMenu={(row, tr) => (
            <ItemContextMenu typeId={row.typeId} itemName={row.name}>
              {tr}
            </ItemContextMenu>
          )}
        />
      )}
    </Panel>
  );
}
