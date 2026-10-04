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
 *
 * A jump through a Thera / Turnur hole (issue #2476) is its own full-width
 * row between its two systems (`HoleStepRow`): where to warp, the signature
 * with Copy, size, life left and how old EVE-Scout's list is. Both systems
 * beside it never fold. A J-space system reads "—" for ESI's figures with
 * the reason, since ESI does not report wormhole space; zKillboard still
 * lists it.
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
import {
  foldQuietStretches,
  isWormholeSystem,
  type RouteSafetyRow,
} from '@/engine/route/routeSafety';
import { BridgeStepLine, type BridgeStep } from './BridgeStepLine';
import { HoleStepLine, type HoleStep } from './HoleStepLine';
import { RecentKillsCell, RecentKillsDetail } from './RecentKillsCell';
import { routeSystemName } from './routeSystemName';
import type { RouteKillsCell } from './useRouteKills';
import type { BridgeAt, HoleAt } from './useRouteSafety';

type TableRow = RouteSafetyRow | HoleStep | BridgeStep;

/** A hole or bridge jump: its own full-width row, not a system. */
function isHoleStep(row: TableRow): row is HoleStep | BridgeStep {
  return 'hole' in row || 'bridge' in row;
}

/** A system column, drawn only for system rows — a hole row is one full-width cell. */
function systemColumn(column: DataTableColumn<RouteSafetyRow>): DataTableColumn<TableRow> {
  const { render, cellClassName, sortValue, ...rest } = column;
  return {
    ...rest,
    render: (row) => (isHoleStep(row) ? null : render(row)),
    cellClassName: cellClassName && ((row) => (isHoleStep(row) ? undefined : cellClassName(row))),
    sortValue: sortValue && ((row) => (isHoleStep(row) ? undefined : sortValue(row))),
  };
}

/** The route's systems in order, with each hole or bridge jump as its own row between its two. */
function withHoleSteps(
  rows: readonly RouteSafetyRow[],
  holeAt: HoleAt,
  bridgeAt: BridgeAt
): TableRow[] {
  const out: TableRow[] = [];
  rows.forEach((row, index) => {
    const previous = rows[index - 1];
    if (previous) {
      const hole = holeAt(previous.systemId, row.systemId);
      const bridge = hole ? null : bridgeAt(previous.systemId, row.systemId);
      if (hole) out.push({ from: previous, to: row, hole });
      else if (bridge) out.push({ from: previous, to: row, bridge });
    }
    out.push(row);
  });
  return out;
}

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
  if (isWormholeSystem(row.systemId)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-text-dim">
        <span aria-hidden="true">{DASH}</span>
        <span>{t('travel.wormholeSpace')}</span>
      </span>
    );
  }
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
): DataTableColumn<TableRow>[] {
  const { t } = useTranslation();
  const columns: DataTableColumn<RouteSafetyRow>[] = [
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
  return columns.map(systemColumn);
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

const GATES_ONLY: HoleAt = () => null;
const NO_BRIDGES: BridgeAt = () => null;

/** What a table needs to draw hole (issue #2476) and bridge (issue #2478) rows; a gate-only route passes none. */
export interface HoleRowProps {
  /** The hole a step crosses, or `null` for a stargate jump. */
  holeAt?: HoleAt;
  /** The Ansiblex a step crosses, or `null`. */
  bridgeAt?: BridgeAt;
  /** When EVE-Scout's list was read, for each hole row's age. */
  holesFetchedAt?: Date | null;
  /** The clock a hole's remaining life is read against. */
  now?: number;
}

export function RouteSystemsTable({
  rows,
  killsOf,
  avoidAction,
  label,
  holeAt = GATES_ONLY,
  bridgeAt = NO_BRIDGES,
  holesFetchedAt = null,
  now = 0,
}: {
  /** One list of route systems in flight order; folds never take its first or last. */
  rows: readonly RouteSafetyRow[];
  killsOf: (systemId: number) => RouteKillsCell;
  /** `null` for a row with nothing to offer: either end, or a system already avoided. */
  avoidAction: (row: RouteSafetyRow) => (() => void) | null;
  label: string;
} & HoleRowProps) {
  const { t } = useTranslation();
  const columns = useColumns(killsOf, avoidAction);
  const tableRows = withHoleSteps(rows, holeAt, bridgeAt);
  // Both ends of a hole or bridge jump stay in view beside it.
  const pinned = new Set(
    tableRows.flatMap((row) => (isHoleStep(row) ? [row.from.systemId, row.to.systemId] : []))
  );
  const stretches = foldQuietStretches(rows, (systemId) => zkillCountOf(killsOf(systemId)), pinned);
  // Which fold each folded system sits in. A route never repeats a system,
  // so the system id is enough; the fold is named after its first system.
  const foldKey = new Map<number, string>();
  const lowestOf = new Map<string, number>();
  for (const stretch of stretches) {
    if (stretch.kind !== 'quiet') continue;
    const key = `quiet:${stretch.rows[0]?.systemId}`;
    lowestOf.set(key, stretch.lowestSecurity);
    for (const row of stretch.rows) foldKey.set(row.systemId, key);
  }

  const groupBy: DataTableGroupBy<TableRow> = {
    allWidths: true,
    key: (row) => (isHoleStep(row) ? null : (foldKey.get(row.systemId) ?? null)),
    renderHeader: (tableMembers) => {
      const members = tableMembers.filter((row): row is RouteSafetyRow => !isHoleStep(row));
      const first = members[0];
      const last = members[members.length - 1];
      const lowest = first ? lowestOf.get(foldKey.get(first.systemId) ?? '') : undefined;
      return (
        <span className="block text-text-dim sm:truncate">
          {t('travel.fold', {
            count: members.length,
            from: first ? routeSystemName(first) : '',
            to: last ? routeSystemName(last) : '',
            security: lowest === undefined ? DASH : lowest.toFixed(1),
          })}
        </span>
      );
    },
  };

  return (
    <DataTable
      columns={columns}
      rows={tableRows}
      rowKey={(row) =>
        isHoleStep(row)
          ? `${'hole' in row ? 'hole' : 'bridge'}:${row.from.systemId}-${row.to.systemId}`
          : String(row.systemId)
      }
      label={label}
      stackLayout="dense"
      groupBy={groupBy}
      fullWidthRow={(row) =>
        !isHoleStep(row) ? null : 'hole' in row ? (
          <HoleStepLine step={row} fetchedAt={holesFetchedAt} now={now} />
        ) : (
          <BridgeStepLine step={row} />
        )
      }
      rowClassName={(row) => (isHoleStep(row) ? 'bg-panel-2' : undefined)}
      expandableRow={{
        renderDetail: (row) =>
          isHoleStep(row) ? null : <RowDetail row={row} cell={killsOf(row.systemId)} />,
      }}
    />
  );
}
