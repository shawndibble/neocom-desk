import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StandingIcon, type DataTableColumn } from '@/components/ui';
import { fixed2 } from '@/lib/fixedFormat';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { useUrlSort } from '@/lib/useUrlState';
import {
  NPC_STANDINGS_COLUMN_IDS,
  NPC_STANDINGS_PHONE_OFF_COLUMNS,
  npcStandingsColumnsStore,
  type NpcStandingsColumnId,
} from '@/features/character/contactsColumns';
import { EmptyCell } from '@/features/character/ContactCells';
import type { NpcStandingRow } from '@/features/character/npcStandingsRows';
import { AccessPips } from '@/features/standings/table/AccessPips';

const STANDINGS_SORT = { columnId: 'standing', direction: 'desc' } as const;
const ALL_COLUMN_IDS = ['name', ...NPC_STANDINGS_COLUMN_IDS];

/**
 * The Standings tab's table: its columns, the optional-column picker's state
 * and the URL sort. The name opens the row's info modal through the table's
 * row click (DESIGN.md §6c: one accent cue per row, on the primary cell).
 */
export function useNpcStandingsColumns() {
  const { t } = useTranslation();
  const visibility = useColumnVisibility(
    npcStandingsColumnsStore,
    NPC_STANDINGS_COLUMN_IDS,
    NPC_STANDINGS_PHONE_OFF_COLUMNS
  );

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
        cardCorner: true,
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
        render: (row) =>
          row.effective === null ? (
            <EmptyCell />
          ) : (
            <span className="tabular-nums">{fixed2(row.effective)}</span>
          ),
        sortValue: (row) => row.effective ?? undefined,
      },
      access: {
        id: 'access',
        header: t('contacts.standings.columnAccess'),
        headerTooltip: t('contacts.standings.columnAccessTooltip'),
        // An agent row answers one question, can you use this agent; the rest
        // show how far up the levels their chain reaches.
        render: (row) => {
          if (row.kind === 'agent') {
            const access = row.agentAccess;
            if (access === null) return <EmptyCell />;
            if (access.open)
              return <span className="text-success">{t('contacts.standings.accessOpen')}</span>;
            return (
              <span className="text-text-dim">
                {access.blockedBy
                  ? t('contacts.standings.accessBlocked')
                  : t('contacts.standings.accessNeeds', { standing: fixed2(access.needs ?? 0) })}
              </span>
            );
          }
          return row.accessLevel === null ? <EmptyCell /> : <AccessPips level={row.accessLevel} />;
        },
        // One scale for every kind: the agent level you can use (0 when you cannot).
        sortValue: (row) =>
          row.kind === 'agent'
            ? row.agentAccess
              ? row.agentAccess.open
                ? (row.belongsTo?.level ?? 1)
                : 0
              : undefined
            : (row.accessLevel ?? undefined),
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
    [t]
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
      ...NPC_STANDINGS_COLUMN_IDS.filter(visibility.isVisible).map((id) => optionalColumns[id]),
    ],
    [t, optionalColumns, visibility.isVisible]
  );
  // The full catalog, not the visible ids: a sort in a shared link survives a
  // hidden column (the Contacts table's own `characterSortProps`).
  const sortProps = useUrlSort('standings.sort', STANDINGS_SORT, ALL_COLUMN_IDS);

  return { columns, optionalColumns, visibility, sortProps };
}
