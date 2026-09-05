/**
 * The roster table and the change summary above it (issue #297).
 *
 * A real `DataTable` here, unlike `CorpBoard.tsx`'s list of cards: every member
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
import {
  DataTable,
  EmptyState,
  FilterChip,
  StatChip,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import { formatAge } from '@/lib/age';
import {
  DARK_AFTER_DAYS,
  DASH,
  isEmptyRosterDiff,
  label,
  type MemberStanding,
  type RosterDiff,
} from '@/engine/corp/members';

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
 * The two figures the page exists to produce, as a stat strip. The dark count
 * doubles as the "dark only" filter toggle (issue #421, AC3): a `FilterChip`
 * rather than the `StatChip` it replaces, since `StatChip` is deliberately
 * the non-interactive readout (`components/ui/FilterChip.tsx`) and this is
 * the one figure a director actually wants to click through to.
 */
export function CorpRosterStats({
  rows,
  darkOnly,
  onToggleDarkOnly,
}: {
  rows: readonly RosterRow[];
  darkOnly: boolean;
  onToggleDarkOnly: () => void;
}) {
  const { t } = useTranslation();
  const dark = rows.filter((row) => row.standing.isDark).length;
  return (
    <div className="flex flex-wrap gap-2">
      <StatChip label={t('corp.members.total')} value={rows.length} />
      <Tooltip content={t('corp.members.darkHint', { days: DARK_AFTER_DAYS })}>
        <FilterChip
          label={t('corp.members.dark', { days: DARK_AFTER_DAYS })}
          count={dark}
          selected={darkOnly}
          onToggle={onToggleDarkOnly}
        />
      </Tooltip>
    </div>
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
  const columns = useMemo<DataTableColumn<RosterRow>[]>(
    () => [
      {
        id: 'member',
        header: t('corp.members.columnMember'),
        // Also the card title below `sm`. It is already the first column, but
        // saying so pins it: reordering the columns later must not silently
        // retitle every card.
        primary: true,
        className: 'truncate',
        render: (row) => label(row.name, row.characterId),
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
    ],
    [t]
  );

  if (rows.length === 0) {
    return <EmptyState title={t('corp.members.empty')} hint={t('corp.members.emptyHint')} />;
  }

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowContextMenu={rowContextMenu}
      rowKey={(row) => row.characterId}
      label={t('corp.members.tableLabel')}
      density="compact"
      defaultSort={{ columnId: 'lastSeen', direction: 'desc' }}
    />
  );
}
