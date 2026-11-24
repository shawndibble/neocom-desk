/**
 * Route Safety's rows (issue #2474): one line per system, with each quiet
 * stretch folded into one muted row that opens in place.
 *
 * Takes any list of route systems and folds between that list's own ends
 * (`foldQuietStretches`), so a multi-stop trip can render one of these per
 * leg. Conditions, never verdicts (decision `20260912-172628`): a fold says
 * "no kills reported in the last hour", never that the stretch is anything.
 *
 * Each row is short: System, Sec., Region, the last hour's ship kills ·
 * pod kills · jumps, and zKillboard's count with only the kills on a gate
 * along the route. NPC kills and kills anywhere else in the system open in
 * the row's detail.
 *
 * Each row's actions (Add/Edit note, Avoid, Set waypoint, zKillboard) live in
 * one menu, the right-click menu and the ⋮ button that closes the row. The
 * note editor opens anchored to that ⋮, since a menu item closes its menu.
 *
 * On a phone the row is a dense card: the system and its security on line
 * one, and region · last hour · zKillboard below with the ⋮ closing it. A
 * zero kill count is left off that line, so a quiet system reads
 * "Khanid · 87 jumps" rather than a string of zeros.
 *
 * A jump through a Thera / Turnur hole (issue #2476) is its own full-width
 * row between its two systems (`HoleStepRow`): where to warp, the signature
 * with Copy, size, life left and how old EVE-Scout's list is. Both systems
 * beside it never fold. A J-space system reads "N/A" for ESI's figures with
 * an info tip giving the reason, since ESI does not report wormhole space; zKillboard still
 * lists it.
 */
import { fixed1 } from '@/lib/fixedFormat';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalMark } from '@/components/ui/ExternalLink';
import { SystemNote, SystemNoteAnchor, SystemNoteMenuItem } from './SystemNote';
import { SetWaypointMenuItem } from './SetWaypointMenuItem';
import { systemZkillUrl } from '@/lib/zkillboard';
import { useSystemNotes } from './systemNotes';
import { SecurityStatus } from '@/components/SecurityStatus';
import { HintText } from '@/components/ui/HintText';
import {
  DataTable,
  DataTableDenseCell,
  InfoTooltip,
  MenuGroup,
  MenuItem,
  RowActionsMenu,
  RowMoreActions,
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
import { shipKillHeatColor } from '@/engine/route/killHeat';
import { RecentKillsCell, RecentKillsDetail } from './RecentKillsCell';
import { useIsPhone } from '@/lib/useIsPhone';
import { LawlessTag } from './LawlessTag';
import { routeSystemName } from './routeSystemName';
import type { RouteKillsCell } from './useRouteKills';
import type { RouteSafetyTripRow } from './useRouteSafety';
import { formatNumber } from '@/lib/numberLocale';

type TableRow = RouteSafetyTripRow | HoleStep | BridgeStep;

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
function withHoleSteps(rows: readonly RouteSafetyTripRow[]): TableRow[] {
  const out: TableRow[] = [];
  rows.forEach((row, index) => {
    const previous = rows[index - 1];
    if (previous) {
      if (row.entry?.kind === 'hole') out.push({ from: previous, to: row, hole: row.entry.hole });
      else if (row.entry?.kind === 'bridge') {
        out.push({ from: previous, to: row, bridge: row.entry.gate });
      }
    }
    out.push(row);
  });
  return out;
}

const DASH = '—';

function count(value: number | null): string {
  return value === null ? DASH : formatNumber(value);
}

/** A zKillboard figure the fold can trust: loading and unavailable are unknown, never zero. */
function zkillCountOf(cell: RouteKillsCell): number | null {
  return cell.status === 'ready' ? cell.summary.count : null;
}

function LastHour({ row }: { row: RouteSafetyRow }) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  if (isWormholeSystem(row.systemId)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-text-dim">
        <span>{t('travel.notApplicable')}</span>
        <InfoTooltip
          glyph="info"
          label={t('travel.wormholeSpace')}
          content={t('travel.wormholeSpace')}
        />
      </span>
    );
  }
  const figures = [
    {
      key: 'ships',
      value: row.shipKills,
      unit: t('travel.lastHour.ships'),
      color: shipKillHeatColor(row.shipKills ?? 0) ?? undefined,
      className: undefined,
    },
    {
      key: 'pods',
      value: row.podKills,
      unit: t('travel.lastHour.pods'),
      color: undefined,
      className: (row.podKills ?? 0) > 0 ? 'text-danger' : undefined,
    },
    {
      key: 'jumps',
      value: row.jumps,
      unit: t('travel.lastHour.jumps'),
      color: undefined,
      className: undefined,
    },
  ].filter((figure) => !isPhone || figure.key === 'jumps' || figure.value !== 0);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums">
      {figures.map((figure, index) => (
        <span key={figure.key} className="inline-flex items-center gap-1.5">
          {index > 0 && (
            <span aria-hidden="true" className="text-text-faint">
              ·
            </span>
          )}
          <span
            className={figure.className}
            style={figure.color ? { color: figure.color } : undefined}
          >
            {count(figure.value)}
          </span>
          {/* Spoken at every width; written out on a phone card, which has no header. */}
          <span className="sm:sr-only">{figure.unit}</span>
        </span>
      ))}
    </span>
  );
}

function useColumns(
  killsOf: (systemId: number) => RouteKillsCell,
  noteOpen: number | null,
  setNoteOpen: Dispatch<SetStateAction<number | null>>
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
          <SystemNote systemId={row.systemId} name={routeSystemName(row)} />
          {row.chokepoint && (
            <HintText
              content={t('travel.chokepointHint')}
              className="text-[0.6875rem] whitespace-nowrap text-warning"
            >
              {t('travel.chokepoint')}
            </HintText>
          )}
          {row.lawless && <LawlessTag />}
        </DataTableDenseCell>
      ),
    },
    {
      id: 'security',
      header: t('travel.col.security'),
      align: 'right',
      // A phone card's headline figure, beside the system name.
      cardCorner: true,
      render: (row) => (row.security === null ? DASH : <SecurityStatus security={row.security} />),
    },
    {
      id: 'region',
      header: t('travel.col.region'),
      className: 'text-text-dim',
      render: (row) => (
        <Tooltip content={row.regionName ?? ''}>
          <span className="inline-block max-w-[12rem] truncate align-bottom">
            {row.regionName ?? DASH}
          </span>
        </Tooltip>
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
      render: (row) => (
        <RecentKillsCell
          systemId={row.systemId}
          systemName={routeSystemName(row)}
          cell={killsOf(row.systemId)}
        />
      ),
    },
    {
      id: 'avoid',
      header: t('travel.col.avoid'),
      headerClassName: 'sr-only',
      align: 'right',
      stackEdge: 'end',
      render: (row) => (
        <SystemNoteAnchor
          systemId={row.systemId}
          name={routeSystemName(row)}
          open={noteOpen === row.systemId}
          // Closing only clears this row's own editor: a stale close must not shut another row's.
          onOpenChange={(open) =>
            setNoteOpen((current) =>
              open ? row.systemId : current === row.systemId ? null : current
            )
          }
        >
          <RowMoreActions />
        </SystemNoteAnchor>
      ),
    },
  ];
  return columns.map(systemColumn);
}

/** One system's actions: the same items behind the right-click menu and the ⋮ button. */
function RowMenuItems({
  row,
  onAvoid,
  onNote,
}: {
  row: RouteSafetyRow;
  /** `null` for a row with nothing to avoid: either end, or a system already avoided. */
  onAvoid: (() => void) | null;
  onNote: () => void;
}) {
  const { t } = useTranslation();
  const name = routeSystemName(row);
  return (
    <>
      <MenuGroup id="primary" size={onAvoid ? 2 : 1}>
        <SystemNoteMenuItem systemId={row.systemId} onSelect={onNote} />
        {onAvoid && <MenuItem onSelect={onAvoid}>{t('travel.avoid.action')}</MenuItem>}
      </MenuGroup>
      <MenuGroup id="game" size={1}>
        <SetWaypointMenuItem locationId={row.systemId} placeName={name} withViewRoute={false} />
      </MenuGroup>
      <MenuGroup id="other">
        <MenuItem asChild>
          <a
            href={systemZkillUrl(row.systemId)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('travel.zkillboardLabel', { system: name })}
          >
            {t('travel.zkillboard')}
            <ExternalMark />
          </a>
        </MenuItem>
      </MenuGroup>
    </>
  );
}

function RowDetail({ row, cell }: { row: RouteSafetyRow; cell: RouteKillsCell }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1 text-sm">
      <p>{t('travel.detail.npcKills', { count: count(row.npcKills) })}</p>
      <RecentKillsDetail cell={cell} systemId={row.systemId} systemName={routeSystemName(row)} />
    </div>
  );
}

/**
 * What a table needs to draw hole (issue #2476) rows beyond the rows' own
 * tags (issue #2546); a gate-only route passes none.
 */
export interface HoleRowProps {
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
  holesFetchedAt = null,
  now = 0,
}: {
  /** One list of route systems in flight order, each tagged with how it was entered; folds never take its first or last. */
  rows: readonly RouteSafetyTripRow[];
  killsOf: (systemId: number) => RouteKillsCell;
  /** `null` for a row with nothing to offer: either end, or a system already avoided. */
  avoidAction: (row: RouteSafetyRow) => (() => void) | null;
  label: string;
} & HoleRowProps) {
  const { t } = useTranslation();
  // The system whose note editor is open, anchored to its row's ⋮ button.
  const [noteOpen, setNoteOpen] = useState<number | null>(null);
  const columns = useColumns(killsOf, noteOpen, setNoteOpen);
  useEffect(() => {
    void useSystemNotes.getState().hydrate();
  }, []);
  const tableRows = withHoleSteps(rows);
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
      const members = tableMembers.filter((row): row is RouteSafetyTripRow => !isHoleStep(row));
      const first = members[0];
      const last = members[members.length - 1];
      const lowest = first ? lowestOf.get(foldKey.get(first.systemId) ?? '') : undefined;
      return (
        <span className="block text-text-dim sm:truncate">
          {t('travel.fold', {
            count: members.length,
            from: first ? routeSystemName(first) : '',
            to: last ? routeSystemName(last) : '',
            security: lowest === undefined ? DASH : fixed1(lowest),
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
      rowContextMenu={(row, tr) =>
        isHoleStep(row) ? (
          tr
        ) : (
          <RowActionsMenu
            name={routeSystemName(row)}
            // The editor takes focus itself; the menu handing it back to the ⋮ would dismiss it.
            onCloseAutoFocus={(event) => {
              if (noteOpen !== null) event.preventDefault();
            }}
            items={
              <RowMenuItems
                row={row}
                onAvoid={avoidAction(row)}
                onNote={() => setNoteOpen(row.systemId)}
              />
            }
          >
            {tr}
          </RowActionsMenu>
        )
      }
      expandableRow={{
        leadingIcon: true,
        renderDetail: (row) =>
          isHoleStep(row) ? null : <RowDetail row={row} cell={killsOf(row.systemId)} />,
      }}
    />
  );
}
