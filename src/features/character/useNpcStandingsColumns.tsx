import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StandingIcon, type DataTableColumn } from '@/components/ui';
import { JumpsLink } from '@/features/route/JumpsLink';
import { fixed2 } from '@/lib/fixedFormat';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { useUrlSort } from '@/lib/useUrlState';
import {
  NPC_STANDINGS_COLUMN_IDS,
  NPC_STANDINGS_DEFAULT_COLUMNS,
  npcStandingsColumnsStore,
  type NpcStandingsColumnId,
} from '@/features/character/contactsColumns';
import { EmptyCell } from '@/features/character/ContactCells';
import {
  npcAccessLevel,
  npcAgentAccessState,
  type NpcStandingRow,
} from '@/features/character/npcStandingsRows';
import { AccessPips } from '@/features/standings/table/AccessPips';

/** The number the game shows, or Base when the pilot's skills could not be read. */
const standingsSort = (skillsKnown: boolean) =>
  ({ columnId: skillsKnown ? 'effective' : 'standing', direction: 'desc' }) as const;
const ALL_COLUMN_IDS = ['name', ...NPC_STANDINGS_COLUMN_IDS];

/**
 * The Standings tab's table: its columns, the optional-column picker's state
 * and the URL sort. The name opens the row's info modal through the table's
 * row click (DESIGN.md §6c: one accent cue per row, on the primary cell).
 *
 * `skillsKnown`: Standing (with skills) leads and Base is optional. With the
 * skills unknown Standing has nothing to say, so Base stands in for it, shown
 * whatever the column picker says.
 */
export function useNpcStandingsColumns(skillsKnown: boolean) {
  const { t } = useTranslation();
  const visibility = useColumnVisibility(npcStandingsColumnsStore, NPC_STANDINGS_DEFAULT_COLUMNS);

  const optionalColumns = useMemo<Record<NpcStandingsColumnId, DataTableColumn<NpcStandingRow>>>(
    () => ({
      kind: {
        id: 'kind',
        header: t('contacts.type'),
        render: (row) => t(`contacts.standingsKind.${row.kind}`),
        sortValue: (row) => t(`contacts.standingsKind.${row.kind}`),
      },
      belongsTo: {
        id: 'belongsTo',
        header: t('contacts.standings.columnBelongsTo'),
        // A corporation's faction; an agent's corporation, level and division.
        render: (row) => {
          const { belongsTo } = row;
          if (belongsTo === null)
            return row.kind === 'agent' ? <EmptyCell /> : <span data-dense-omit />;
          const detail = [
            belongsTo.level && t('contacts.standings.level', { level: belongsTo.level }),
            belongsTo.division,
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <span>
              {belongsTo.name}
              {detail && <span className="text-text-dim"> · {detail}</span>}
            </span>
          );
        },
        sortValue: (row) => row.belongsTo?.name,
      },
      standing: {
        id: 'standing',
        header: t('contacts.standings.columnBase'),
        headerTooltip: t('contacts.standings.columnBaseTooltip'),
        align: 'center',
        cardCorner: !skillsKnown,
        render: (row) => (
          <span className="inline-flex items-center gap-1.5">
            <StandingIcon value={row.base} />
            <span className="tabular-nums">{fixed2(row.base)}</span>
          </span>
        ),
        sortValue: (row) => row.base,
      },
      effective: {
        id: 'effective',
        header: t('contacts.standings.columnEffective'),
        headerTooltip: t('contacts.standings.columnEffectiveTooltip'),
        align: 'center',
        cardCorner: true,
        render: (row) =>
          row.effective === null ? (
            <EmptyCell />
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <StandingIcon value={row.effective} />
              <span className="tabular-nums">{fixed2(row.effective)}</span>
            </span>
          ),
        sortValue: (row) => row.effective ?? undefined,
      },
      jumps: {
        id: 'jumps',
        header: t('contacts.standings.columnJumps'),
        headerTooltip: t('contacts.standings.columnJumpsTooltip'),
        align: 'right',
        className: 'whitespace-nowrap tabular-nums',
        render: (row) => {
          const { nearest } = row;
          if (nearest === null) return <EmptyCell />;
          const text = t('contacts.standings.jumpsValue', { count: nearest.jumps });
          // Already there: no route to open.
          if (nearest.jumps === 0) return <span className="text-text-dim">{text}</span>;
          return (
            <JumpsLink systemId={nearest.systemId} stationId={nearest.stationId}>
              {text}
            </JumpsLink>
          );
        },
        sortValue: (row) => row.nearest?.jumps,
      },
      access: {
        id: 'access',
        header: t('contacts.standings.columnAccess'),
        headerTooltip: t('contacts.standings.columnAccessTooltip'),
        // An agent row answers one question, can you use this agent; the rest
        // show how far up the levels their chain reaches.
        render: (row) => {
          if (row.kind === 'agent') {
            const access = npcAgentAccessState(row);
            if (access === null) return <EmptyCell />;
            if (access.state === 'open')
              return <span className="text-success">{t('contacts.standings.accessOpen')}</span>;
            return (
              <span className="text-text-dim">
                {access.state === 'blocked'
                  ? t('contacts.standings.accessBlocked')
                  : t('contacts.standings.accessNeeds', { standing: fixed2(access.standing) })}
              </span>
            );
          }
          return row.accessLevel === null ? <EmptyCell /> : <AccessPips level={row.accessLevel} />;
        },
        // One scale for every kind: the agent level you can use (0 when you cannot).
        sortValue: (row) => npcAccessLevel(row) ?? undefined,
        stackAffix: { before: `${t('contacts.standings.columnAccess')} ` },
      },
      fees: {
        id: 'fees',
        header: t('contacts.standings.columnFees'),
        headerTooltip: t('contacts.standings.columnFeesTooltip'),
        render: (row) =>
          row.usedForFees ? t('contacts.standings.fees') : <span data-dense-omit />,
        sortValue: (row) => (row.usedForFees ? 1 : 0),
      },
    }),
    [t, skillsKnown]
  );

  // Standing leads; Base shows when asked, or in its place when the skills are unknown.
  const { isVisible } = visibility;
  const shownIds = useMemo(
    () =>
      NPC_STANDINGS_COLUMN_IDS.filter((id) =>
        id === 'standing'
          ? !skillsKnown || isVisible(id)
          : id === 'effective'
            ? skillsKnown && isVisible(id)
            : isVisible(id)
      ),
    [skillsKnown, isVisible]
  );
  // Standing is not offered when it would be empty.
  const availableIds = useMemo(
    () => NPC_STANDINGS_COLUMN_IDS.filter((id) => skillsKnown || id !== 'effective'),
    [skillsKnown]
  );

  const columns = useMemo<DataTableColumn<NpcStandingRow>[]>(
    () => [
      {
        id: 'name',
        header: t('contacts.name'),
        primary: true,
        render: (row) => <span className="text-accent">{row.name}</span>,
        sortValue: (row) => row.name,
      },
      ...shownIds.map((id) => optionalColumns[id]),
    ],
    [t, optionalColumns, shownIds]
  );
  // The full catalog, not the visible ids: a sort in a shared link survives a
  // hidden column (the Contacts table's own `characterSortProps`).
  const sortProps = useUrlSort('standings.sort', standingsSort(skillsKnown), ALL_COLUMN_IDS);

  return { columns, optionalColumns, availableIds, visibility, sortProps };
}
