import { Fragment, useCallback, useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { MenuItem } from '@/components/ui';
import { CharacterLink } from '@/features/entities';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { useUrlSort } from '@/lib/useUrlState';
import {
  ColumnPickerMenu,
  DataTable,
  EmptyState,
  StatChip,
  StatChips,
  type DataTableColumn,
} from '@/components/ui';
import type { UseTableExport } from '@/components/ui/useTableExport';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { isEmptyRosterDiff, type MemberStanding, type RosterDiff } from '@/engine/corp/members';
import { useDarkThreshold } from './darkThreshold';
import { CharacterRowMenu } from './corpRowMenus';
import { useRosterColumns } from './useRosterColumns';
import {
  CORP_ROSTER_COLUMN_IDS,
  CORP_ROSTER_DEFAULT_COLUMNS,
  ROSTER_SORT,
  useVisibleCorpRosterColumns,
  type CorpRosterColumnId,
} from './corpRosterColumns';
import { TableScroll } from '@/components/ui/TableScroll';

export interface RosterRow {
  characterId: number;
  name: string | null;
  standing: MemberStanding;
  shipName: string | null;
  shipTypeId: number | null;
  locationName: string | null;
  locationId: number | null;
  startMs: number | null;
  roles: readonly string[] | null;
  isSelf: boolean;
  isCeo: boolean;
  group?: { size: number; names: readonly string[] };
}

export function CorpRosterSummary({
  diff,
  names,
}: {
  diff: RosterDiff;
  names: ReadonlyMap<number, string>;
}) {
  const { t } = useTranslation();
  if (isEmptyRosterDiff(diff)) return null;

  const nameList = (ids: readonly number[]) =>
    ids.map((id, index) => (
      <Fragment key={id}>
        {index > 0 && ', '}
        <CharacterLink id={id}>{names.get(id) ?? `#${id}`}</CharacterLink>
      </Fragment>
    ));

  return (
    <p className="text-text-dim text-xs">
      {diff.joined.length > 0 && (
        <span className="text-success">
          {t('corp.members.joined', { count: diff.joined.length })} {nameList(diff.joined)}
        </span>
      )}
      {diff.joined.length > 0 && diff.left.length > 0 && <span> · </span>}
      {diff.left.length > 0 && (
        <span className="text-warning">
          {t('corp.members.left', { count: diff.left.length })} {nameList(diff.left)}
        </span>
      )}
    </p>
  );
}

export function CorpRosterStats({ rows }: { rows: readonly RosterRow[] }) {
  const { t } = useTranslation();
  const darkAfterDays = useDarkThreshold((state) => state.value);
  const dark = rows.filter((row) => row.standing.isDark).length;
  return (
    <StatChips>
      <StatChip label={t('corp.members.total')} value={rows.length} />
      <StatChip
        label={t('corp.members.dark', { days: darkAfterDays })}
        value={dark}
        tooltip={t('corp.members.darkHint', { days: darkAfterDays })}
      />
    </StatChips>
  );
}

export function CorpRosterColumnPicker() {
  const { t } = useTranslation();
  const columns = useRosterColumns();
  const { visible, toggle, reset } = useColumnVisibility(
    useVisibleCorpRosterColumns,
    CORP_ROSTER_DEFAULT_COLUMNS
  );
  const columnsById = useMemo(
    () =>
      Object.fromEntries(columns.map((column) => [column.id, column])) as Record<
        CorpRosterColumnId,
        DataTableColumn<RosterRow>
      >,
    [columns]
  );
  return (
    <ColumnPickerMenu
      available={CORP_ROSTER_COLUMN_IDS}
      visible={visible}
      columnsById={columnsById}
      onToggle={toggle}
      onReset={reset}
      buttonLabel={t('common.columnsButton')}
      menuTitle={t('common.columnsMenuTitle')}
      resetLabel={t('common.resetColumns')}
    />
  );
}

const rosterRowKey = (row: RosterRow) => row.characterId;

export function CorpRosterTable({
  rows,
  tableProps,
  onGroupWith,
  onShowInPlayers,
}: {
  rows: readonly RosterRow[];
  onShowInPlayers?: (row: RosterRow) => void;
  onGroupWith?: (row: RosterRow) => void;
  tableProps?: UseTableExport<RosterRow>['tableProps'];
}) {
  const { t } = useTranslation();
  const columns = useRosterColumns();
  const rosterRowMenu = useCallback(
    (row: RosterRow, tr: ReactElement) => (
      <CharacterRowMenu
        characterId={row.characterId}
        name={row.name}
        extraItems={
          onGroupWith && (
            <>
              <MenuItem onSelect={() => onGroupWith(row)}>
                {t('corpTaxBook.moons.grouping.menu')}
              </MenuItem>
              {onShowInPlayers && row.group && (
                <MenuItem onSelect={() => onShowInPlayers(row)}>
                  {t('corp.members.players.showInPlayers')}
                </MenuItem>
              )}
            </>
          )
        }
      >
        {tr}
      </CharacterRowMenu>
    ),
    [onGroupWith, onShowInPlayers, t]
  );
  const { isVisible } = useColumnVisibility(
    useVisibleCorpRosterColumns,
    CORP_ROSTER_DEFAULT_COLUMNS
  );
  const shownColumns = useMemo(
    () =>
      columns.filter(
        (column) => column.id === 'member' || isVisible(column.id as CorpRosterColumnId)
      ),
    [columns, isVisible]
  );

  const highlightedMemberId = useHighlightParam();
  const sortProps = useUrlSort(
    'sort',
    ROSTER_SORT,
    columns.map((column) => column.id)
  );

  if (rows.length === 0) {
    return <EmptyState title={t('corp.members.empty')} />;
  }

  return (
    <TableScroll>
      <DataTable
        {...tableProps}
        columns={shownColumns}
        rows={rows}
        responsive="stack"
        stackLayout="dense"
        mobileSort
        rowKey={rosterRowKey}
        highlightRowKey={highlightedMemberId}
        virtualize="auto"
        label={t('corp.members.tableLabel')}
        density="compact"
        rowContextMenu={rosterRowMenu}
        rowMoreActions
        {...sortProps}
      />
    </TableScroll>
  );
}
