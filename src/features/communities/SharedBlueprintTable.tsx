import { useCallback, type ReactElement } from 'react';
import { OpenInEveItemMenuItems } from '@/features/market/ItemContextMenu';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  DataTable,
  DisabledMenuItem,
  EmptyState,
  MenuItem,
  RowActionsMenu,
  type DataTableColumn,
} from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { bpcSourcingHref } from '@/features/bpcContracts/bpcSourcingUrl';
import { ItemInfoLink } from '@/features/entities/EntityLink';
import { BuildPlanMenuItem } from '@/features/industry/BuildPlanContextMenu';
import { usePlannableIndexOnOpen } from '@/features/industry/usePlannableIndexOnOpen';
import {
  useCurrentSystem,
  useJumpRangeFilter,
  type JumpsCellValue,
} from '@/features/route/currentSystem';
import { jumpsCellSortValue, renderJumpsCell } from '@/features/route/jumpsCell';
import { routeToHref } from '@/features/route/routeSafetyLink';
import { openItemInfo } from '@/stores/itemInfoModal';
import { placeNamesSystem, type SharedBlueprintRow } from './sharedBlueprintCopies';

/**
 * A Shared Blueprint's ⋮ (and right-click) menu: Show info, a Build Plan
 * seeded with this copy's ME / TE / runs, BPC Sourcing on this blueprint, and
 * the route to its system. Show info and View route repeat the name and the
 * Jumps count on purpose: the pilot asked for both ways in
 * (`docs/context/decisions/20261013-085734-community-shared-blueprint-row-actions-and-jumps.md`).
 */
function SharedBlueprintMenu({
  row,
  systemId,
  children,
}: {
  row: SharedBlueprintRow;
  /** `undefined` while the system list loads, `null` when the system is not in it. */
  systemId: number | null | undefined;
  children: ReactElement;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Resolved as the menu first opens and kept for this row, as
  // `BuildPlanContextMenu` does.
  const { index, onOpenChange } = usePlannableIndexOnOpen();
  return (
    <RowActionsMenu
      name={row.name}
      linksKeepBrowserMenu
      onOpenChange={onOpenChange}
      items={
        <>
          <MenuItem onSelect={() => openItemInfo(row.typeId, row.name)}>
            {t('market.contextMenu.showInfo')}
          </MenuItem>
          <OpenInEveItemMenuItems typeId={row.typeId} />
          <BuildPlanMenuItem
            typeId={row.typeId}
            index={index}
            seed={row.runs < 0 ? null : { me: row.me, te: row.te, runs: row.runs }}
          />
          <MenuItem onSelect={() => navigate(bpcSourcingHref(row.typeId))}>
            {t('communities.library.openInSourcing')}
          </MenuItem>
          {systemId === undefined ? (
            <MenuItem disabled>{t('communities.library.viewRouteChecking')}</MenuItem>
          ) : systemId === null ? (
            <DisabledMenuItem reason={t('communities.library.systemUnknown')}>
              {t('travel.waypoints.viewRoute')}
            </DisabledMenuItem>
          ) : (
            <MenuItem onSelect={() => navigate(routeToHref(systemId))}>
              {t('travel.waypoints.viewRoute')}
            </MenuItem>
          )}
        </>
      }
    >
      {children}
    </RowActionsMenu>
  );
}

/**
 * The Community Library's "Shared in the Community" view: each shared
 * blueprint with who shares it, where it is (station or structure; its
 * system only when the name does not start with it), how many jumps that is
 * from the Character's Current System, ME / TE and runs (BPO, or the runs a
 * BPC has left). A stale Member's rows are greyed, never hidden. The name
 * opens Show info and the Jumps count Route Safety; the ⋮ holds those two,
 * a Build Plan and BPC Sourcing.
 *
 * `systemIds` finds a row's system id by its name (lowercase); `null` while
 * the system list is loading. A row whose system is not in it (or an empty
 * lookup, when the list could not be read) shows the Jumps placeholder.
 */
export function SharedBlueprintTable({
  rows,
  systemIds,
}: {
  rows: readonly SharedBlueprintRow[];
  systemIds: ReadonlyMap<string, number> | null;
}) {
  const { t } = useTranslation();
  // Measured as BPC Sourcing measures its offers: from the Current System,
  // over the pilot's own jump basis (Travel Settings, Route Safety's picks).
  const currentSystem = useCurrentSystem();
  const jumpFilter = useJumpRangeFilter(currentSystem, 'any');
  const systemIdOf = useCallback(
    (row: SharedBlueprintRow): number | null | undefined =>
      systemIds === null ? undefined : (systemIds.get(row.systemName.toLowerCase()) ?? null),
    [systemIds]
  );
  const rowJumps = useCallback(
    (row: SharedBlueprintRow): JumpsCellValue => {
      if (jumpFilter.jumpsStatus !== 'ready') return { kind: jumpFilter.jumpsStatus };
      const systemId = systemIdOf(row);
      if (systemId === undefined) return { kind: 'loading' };
      return {
        kind: 'value',
        count: systemId === null ? null : (jumpFilter.jumps?.get(systemId) ?? null),
      };
    },
    [jumpFilter, systemIdOf]
  );

  if (rows.length === 0) return <EmptyState title={t('communities.library.none')} />;
  const columns: DataTableColumn<SharedBlueprintRow>[] = [
    {
      id: 'name',
      header: t('communities.library.columns.blueprint'),
      primary: true,
      render: (row) => (
        <ItemInfoLink typeId={row.typeId} itemName={row.name}>
          {row.name}
        </ItemInfoLink>
      ),
      sortValue: (row) => row.name,
    },
    {
      id: 'member',
      header: t('communities.library.columns.member'),
      render: (row) => (
        <>
          {row.memberName}
          {row.stale && <Pill className="ml-1">{t('communities.staleBadge')}</Pill>}
        </>
      ),
      sortValue: (row) => row.memberName,
    },
    {
      id: 'location',
      header: t('communities.library.columns.location'),
      render: (row) => (
        <>
          {row.locationName}
          {!placeNamesSystem(row.locationName, row.systemName) && (
            <span className="block text-text-dim">{row.systemName}</span>
          )}
        </>
      ),
      sortValue: (row) => `${row.systemName} ${row.locationName}`,
    },
    {
      id: 'jumps',
      header: t('communities.library.columns.jumps'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => jumpsCellSortValue(rowJumps(row)),
      render: (row) =>
        renderJumpsCell(rowJumps(row), t, 'communities.library.jumpsUnavailable', systemIdOf(row)),
    },
    {
      id: 'meTe',
      header: t('communities.library.columns.meTe'),
      align: 'right',
      headerClassName: 'whitespace-nowrap',
      render: (row) => `${row.me} / ${row.te}`,
      sortValue: (row) => row.me * 100 + row.te,
    },
    {
      id: 'runs',
      header: t('communities.library.columns.runs'),
      align: 'right',
      render: (row) =>
        row.runs < 0
          ? t('communities.library.bpo')
          : t('communities.library.runs', { count: row.runs }),
      sortValue: (row) => (row.runs < 0 ? Number.MAX_SAFE_INTEGER : row.runs),
    },
  ];
  return (
    <DataTable
      label={t('communities.library.sharedLabel')}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.key}
      rowClassName={(row) => (row.stale ? 'opacity-60' : undefined)}
      rowContextMenu={(row, tr) => (
        <SharedBlueprintMenu row={row} systemId={systemIdOf(row)}>
          {tr}
        </SharedBlueprintMenu>
      )}
      rowMoreActions
      defaultSort={{ columnId: 'name', direction: 'asc' }}
      virtualize="auto"
    />
  );
}
