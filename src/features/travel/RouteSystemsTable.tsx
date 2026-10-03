/**
 * Route Safety's rows (issue #2474): one line per system, with each quiet
 * stretch folded into one muted row that opens in place.
 *
 * Takes any list of route systems and folds between that list's own ends
 * (`foldQuietStretches`), so a multi-stop trip can render one of these per
 * leg. Conditions, never verdicts (decision `20260912-172628`): a fold says
 * "no kills reported in the last hour", never that the stretch is anything.
 *
 * Every row is one line: System, Sec., Region, the last hour's ship kills ·
 * pod kills · jumps, and zKillboard's count with only the kills on a gate
 * along the route. NPC kills and kills anywhere else in the system open in
 * the row's detail.
 */
import { useTranslation } from 'react-i18next';
import { SecurityStatus } from '@/components/SecurityStatus';
import {
  Button,
  DataTable,
  DataTableDenseCell,
  Tooltip,
  type DataTableColumn,
  type DataTableGroupBy,
} from '@/components/ui';
import { foldQuietStretches, type RouteSafetyRow } from '@/engine/route/routeSafety';
import { RecentKillsCell, RecentKillsDetail } from './RecentKillsCell';
import { routeSystemName } from './routeSystemName';
import type { RouteKillsCell } from './useRouteKills';

const DASH = '—';

function count(value: number | null): string {
  return value === null ? DASH : value.toLocaleString();
}

/** A zKillboard figure the fold can trust: loading and unavailable are unknown, never zero. */
function zkillCountOf(cell: RouteKillsCell): number | null {
  return cell.status === 'ready' ? cell.summary.count : null;
}

function LastHour({ row }: { row: RouteSafetyRow }) {
  const { t } = useTranslation();
  const figures = [
    { key: 'ships', value: row.shipKills, unit: t('travel.lastHour.ships') },
    { key: 'pods', value: row.podKills, unit: t('travel.lastHour.pods') },
    { key: 'jumps', value: row.jumps, unit: t('travel.lastHour.jumps') },
  ];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums">
      {figures.map((figure, index) => (
        <span key={figure.key} className="inline-flex items-center gap-1.5">
          {index > 0 && (
            <span aria-hidden="true" className="text-text-faint">
              ·
            </span>
          )}
          <span>{count(figure.value)}</span>
          {/* Spoken at every width; written out on a phone card, which has no header. */}
          <span className="sm:sr-only">{figure.unit}</span>
        </span>
      ))}
    </span>
  );
}

function useColumns(
  killsOf: (systemId: number) => RouteKillsCell,
  avoidAction: (row: RouteSafetyRow) => (() => void) | null
): DataTableColumn<RouteSafetyRow>[] {
  const { t } = useTranslation();
  return [
    {
      id: 'system',
      header: t('travel.col.system'),
      primary: true,
      render: (row) => (
        <DataTableDenseCell>
          <span className="font-semibold whitespace-nowrap">{row.name ?? DASH}</span>
          {row.chokepoint && (
            <Tooltip content={t('travel.chokepointHint')} openOnTap>
              <span
                tabIndex={0}
                // A tap explains the badge; it never opens the row.
                data-row-control
                className="rounded-xs border border-warning/60 px-1.5 text-[0.6875rem] whitespace-nowrap text-warning"
              >
                {t('travel.chokepoint')}
              </span>
            </Tooltip>
          )}
        </DataTableDenseCell>
      ),
    },
    {
      id: 'security',
      header: t('travel.col.security'),
      align: 'right',
      render: (row) => (row.security === null ? DASH : <SecurityStatus security={row.security} />),
    },
    {
      id: 'region',
      header: t('travel.col.region'),
      className: 'text-text-dim',
      render: (row) => (
        <span
          className="inline-block max-w-[12rem] truncate align-bottom"
          title={row.regionName ?? undefined}
        >
          {row.regionName ?? DASH}
        </span>
      ),
    },
    {
      id: 'lastHour',
      header: t('travel.col.lastHour'),
      headerTooltip: t('travel.col.lastHourHint'),
      align: 'right',
      render: (row) => <LastHour row={row} />,
    },
    {
      id: 'recentKills',
      header: t('travel.col.recentKills'),
      render: (row) => <RecentKillsCell systemId={row.systemId} cell={killsOf(row.systemId)} />,
    },
    {
      id: 'avoid',
      header: t('travel.col.avoid'),
      headerClassName: 'sr-only',
      align: 'right',
      cardCorner: true,
      render: (row) => {
        const onAvoid = avoidAction(row);
        const name = routeSystemName(row);
        return onAvoid === null ? null : (
          <Button size="sm" onClick={onAvoid} aria-label={t('travel.avoid.actionLabel', { name })}>
            {t('travel.avoid.action')}
          </Button>
        );
      },
    },
  ];
}

function RowDetail({ row, cell }: { row: RouteSafetyRow; cell: RouteKillsCell }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1 text-[0.8125rem]">
      <p>{t('travel.detail.npcKills', { count: count(row.npcKills) })}</p>
      <RecentKillsDetail cell={cell} />
    </div>
  );
}

export function RouteSystemsTable({
  rows,
  killsOf,
  avoidAction,
  label,
}: {
  /** One list of route systems in flight order; folds never take its first or last. */
  rows: readonly RouteSafetyRow[];
  killsOf: (systemId: number) => RouteKillsCell;
  /** `null` for a row with nothing to offer: either end, or a system already avoided. */
  avoidAction: (row: RouteSafetyRow) => (() => void) | null;
  label: string;
}) {
  const { t } = useTranslation();
  const columns = useColumns(killsOf, avoidAction);
  const stretches = foldQuietStretches(rows, (systemId) => zkillCountOf(killsOf(systemId)));
  // Which fold each folded system sits in. A route never repeats a system,
  // so the system id is enough; the fold is named after its first system.
  const foldKey = new Map<number, string>();
  for (const stretch of stretches) {
    if (stretch.kind !== 'quiet') continue;
    const key = `quiet:${stretch.rows[0]?.systemId}`;
    for (const row of stretch.rows) foldKey.set(row.systemId, key);
  }

  const groupBy: DataTableGroupBy<RouteSafetyRow> = {
    allWidths: true,
    key: (row) => foldKey.get(row.systemId) ?? null,
    renderHeader: (members) => {
      const first = members[0];
      const last = members[members.length - 1];
      const securities = members.flatMap((m) => (m.security === null ? [] : [m.security]));
      return (
        <span className="block text-text-dim sm:truncate">
          {t('travel.fold', {
            count: members.length,
            from: first ? routeSystemName(first) : '',
            to: last ? routeSystemName(last) : '',
            security: securities.length === 0 ? DASH : Math.min(...securities).toFixed(1),
          })}
        </span>
      );
    },
  };

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => String(row.systemId)}
      label={label}
      stackLayout="dense"
      groupBy={groupBy}
      expandableRow={{
        renderDetail: (row) => <RowDetail row={row} cell={killsOf(row.systemId)} />,
      }}
    />
  );
}
