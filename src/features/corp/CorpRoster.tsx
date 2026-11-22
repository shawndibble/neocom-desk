/**
 * The roster table and the change summary above it (issue #297).
 *
 * A real `DataTable` here, unlike the ops board's list of cards: every member
 * carries the same five fields, and comparing one column down a column is
 * precisely what this page is for. The board avoided a table because its five
 * item kinds share almost no fields; a roster is the opposite case.
 *
 * `Last seen` prints an *elapsed* span, and sorts on its negation descending:
 * most recently seen first under a down arrow, like any date column. The
 * silent members are the amber ones and the "dark only" filter, not the order.
 */
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

/** One member, joined to every name the page managed to resolve. */
export interface RosterRow {
  characterId: number;
  /** The resolved name, or null when `/universe/names` could not answer. */
  name: string | null;
  standing: MemberStanding;
  shipName: string | null;
  shipTypeId: number | null;
  locationName: string | null;
  locationId: number | null;
  startMs: number | null;
  /** Corporation-wide roles; null when the `/roles` read had nothing for this member. */
  roles: readonly string[] | null;
  /** The active Character's own row (issue #1766). */
  isSelf: boolean;
  /** The corporation's CEO (its `ceo_id`). */
  isCeo: boolean;
  /** Set for an officer when this member is grouped: the group's size and the other characters' names. */
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
  // AC6: an unchanged roster gets no summary at all, not an empty one
  // announcing that nothing happened.
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

/**
 * The two figures the page exists to produce, as a stat strip. Readouts only:
 * the "dark only" toggle (issue #421, AC3) lives with the page's other filters
 * behind the funnel; the count stays here, always on screen.
 */
export function CorpRosterStats({ rows }: { rows: readonly RosterRow[] }) {
  const { t } = useTranslation();
  // Label only — `rows` arrive with `standing` already computed against this
  // same preference in CorpMembers.tsx, so the chip's text and the set it
  // filters can never disagree.
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

/**
 * The roster's column picker, for the page's filter row. Reads the same store
 * as `CorpRosterTable`, so the two agree without the page threading state.
 */
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
  /** Officers only: jumps to this member's Player in the Players view (grouped rows only). */
  onShowInPlayers?: (row: RosterRow) => void;
  /** Officers only: opens the group dialog for this member ("Group with" in the row menu). */
  onGroupWith?: (row: RosterRow) => void;
  /** `useTableExport(...).tableProps` — feeds the header's Export menu. */
  tableProps?: UseTableExport<RosterRow>['tableProps'];
}) {
  const { t } = useTranslation();
  const columns = useRosterColumns();
  // Stable while the wiring is, so the table's windowing and row memo see one function.
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

  // The roster row a `corpMemberJoined` alert pointed at, if any. Its sibling
  // `corpMemberLeft` deliberately has no highlight — that member is gone from
  // this table, so there would be nothing to scroll to.
  const highlightedMemberId = useHighlightParam();
  // In the URL (ADR 0015) as `?sort=`; the one table on `/corp/members`.
  // Validated against every column, so a sort on a hidden one survives.
  const sortProps = useUrlSort(
    'sort',
    ROSTER_SORT,
    columns.map((column) => column.id)
  );

  if (rows.length === 0) {
    return <EmptyState title={t('corp.members.empty')} />;
  }

  return (
    <div className="overflow-x-auto">
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
    </div>
  );
}
