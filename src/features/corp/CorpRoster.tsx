/**
 * The roster table and the change summary above it (issue #297).
 *
 * A real `DataTable` here, unlike the ops board's list of cards: every member
 * carries the same five fields, and comparing one column down a column is
 * precisely what this page is for. The board avoided a table because its five
 * item kinds share almost no fields; a roster is the opposite case.
 *
 * The default sort is the whole point of the view. `Last seen` prints an
 * *elapsed* span rather than a date, and sorts on that span descending — so the
 * longest silence is at the top and the member who logged off an hour ago is at
 * the bottom. Sorting on the date instead would put the people still playing
 * first, which answers a question nobody opened this page to ask.
 */
import { useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { useUrlSort } from '@/lib/useUrlState';
import {
  ColumnPickerMenu,
  DataTable,
  EmptyState,
  StatChip,
  type DataTableColumn,
} from '@/components/ui';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { formatAge } from '@/lib/age';
import {
  DASH,
  isEmptyRosterDiff,
  label,
  type MemberStanding,
  type RosterDiff,
} from '@/engine/corp/members';
import { useDarkThreshold } from './darkThreshold';
import { corpRoleLabel } from './roles';
import {
  CORP_ROSTER_COLUMN_IDS,
  CORP_ROSTER_DEFAULT_COLUMNS,
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
    ids.map((id) => names.get(id) ?? `#${id}`).join(', ');

  return (
    <p className="text-text-dim text-xs">
      {diff.joined.length > 0 && (
        <span className="text-success">
          {t('corp.members.joined', {
            count: diff.joined.length,
            names: nameList(diff.joined),
          })}
        </span>
      )}
      {diff.joined.length > 0 && diff.left.length > 0 && <span> · </span>}
      {diff.left.length > 0 && (
        <span className="text-warning">
          {t('corp.members.left', { count: diff.left.length, names: nameList(diff.left) })}
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
    <div className="flex flex-wrap gap-2">
      <StatChip label={t('corp.members.total')} value={rows.length} />
      <StatChip
        label={t('corp.members.dark', { days: darkAfterDays })}
        value={dark}
        tooltip={t('corp.members.darkHint', { days: darkAfterDays })}
      />
    </div>
  );
}

/**
 * A member's roles as one line; null when there are none to print. Sorted
 * because ESI's order is not, and one role set must print and sort one way.
 */
function rolesText(roles: readonly string[] | null): string | null {
  if (roles === null || roles.length === 0) return null;
  return roles
    .map(corpRoleLabel)
    .sort((a, b) => a.localeCompare(b))
    .join(', ');
}

/** Longest silence first — the view's whole point (see the module note). */
const ROSTER_SORT = { columnId: 'lastSeen', direction: 'desc' } as const;

/** Every roster column, hidden or not — the table and its column picker both read it. */
function useRosterColumns(): DataTableColumn<RosterRow>[] {
  const { t } = useTranslation();
  return useMemo<DataTableColumn<RosterRow>[]>(
    () => [
      {
        id: 'member',
        header: t('corp.members.columnMember'),
        // Also the card title below `sm`. It is already the first column, but
        // saying so pins it: reordering the columns later must not silently
        // retitle every card.
        primary: true,
        className: 'truncate',
        // The name truncates, the tag does not: a long name must not ellipsize it away.
        render: (row) => (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">{label(row.name, row.characterId)}</span>
            {row.isSelf && (
              <span className="shrink-0 rounded-xs border border-line bg-panel-2 px-1 py-0.5 text-[0.6875rem] text-text-dim">
                {t('corp.members.you')}
              </span>
            )}
          </span>
        ),
        sortValue: (row) => row.name ?? undefined,
      },
      {
        id: 'lastSeen',
        header: t('corp.members.columnLastSeen'),
        className: 'whitespace-nowrap tabular-nums',
        // The one tone on the table: a member past the dark threshold. Applied
        // to this cell rather than the whole row, so the amber reads as a
        // statement about the silence and not about the person.
        cellClassName: (row) => (row.standing.isDark ? 'text-warning' : undefined),
        render: (row) =>
          row.standing.neverSeen
            ? t('corp.members.never')
            : // Clamped here, not in the engine: a negative span is clock skew,
              // and "just now" is the honest rendering of it.
              formatAge(Math.max(0, row.standing.darkForMs ?? 0), t),
        // Sorted on the span, matching what the cell prints — see the module
        // note. `undefined` for a member with no date at all sinks them to the
        // end in either direction, which is right: nothing is known about them.
        sortValue: (row) => row.standing.darkForMs ?? undefined,
      },
      {
        id: 'ship',
        header: t('corp.members.columnShip'),
        className: 'truncate',
        render: (row) => label(row.shipName, row.shipTypeId),
        sortValue: (row) => row.shipName ?? undefined,
      },
      {
        id: 'location',
        header: t('corp.members.columnLocation'),
        className: 'truncate',
        render: (row) => label(row.locationName, row.locationId),
        sortValue: (row) => row.locationName ?? undefined,
      },
      {
        id: 'joined',
        header: t('corp.members.columnJoined'),
        className: 'whitespace-nowrap tabular-nums text-text-dim',
        render: (row) => (row.startMs === null ? DASH : new Date(row.startMs).toLocaleDateString()),
        sortValue: (row) => row.startMs ?? undefined,
      },
      {
        id: 'roles',
        header: t('corp.members.columnRoles'),
        className: 'truncate',
        render: (row) => rolesText(row.roles) ?? DASH,
        sortValue: (row) => rolesText(row.roles) ?? undefined,
      },
    ],
    [t]
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

export function CorpRosterTable({
  rows,
  rowContextMenu,
}: {
  rows: readonly RosterRow[];
  /** Row context menu (issue #421): Show Info + Copy Character Name. */
  rowContextMenu?: (row: RosterRow, tr: ReactElement) => ReactElement;
}) {
  const { t } = useTranslation();
  const columns = useRosterColumns();
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
    return <EmptyState title={t('corp.members.empty')} hint={t('corp.members.emptyHint')} />;
  }

  return (
    <DataTable
      columns={shownColumns}
      rows={rows}
      rowContextMenu={rowContextMenu}
      rowKey={(row) => row.characterId}
      highlightRowKey={highlightedMemberId}
      label={t('corp.members.tableLabel')}
      density="compact"
      {...sortProps}
    />
  );
}
