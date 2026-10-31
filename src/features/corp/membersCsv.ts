import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { label } from '@/engine/corp/members';
import type { RosterRow } from './CorpRoster';
import { rolesText } from './roles';

/**
 * CSV columns for the corp members roster export (issue #421): member, last
 * seen, ship, location, joined, roles — the table's own columns, in the table's own
 * order, plus the CEO / you / dark tags the member cell carries. `lastSeenMs`/`startMs` pass through as epoch ms rather than the
 * table's localized span/date string: the export is data, not a screenshot
 * of the rendering.
 *
 * The member column reuses the table's own `label()` — `characterId` is
 * never null, so it always degrades to `#id` rather than `label()`'s DASH
 * placeholder. Ship/location roll their own null handling instead: a CSV
 * blank cell (`null`), not `label()`'s em-dash, is the right "nothing here"
 * for a truly unresolved and unknown ship/location.
 */
export function membersCsvColumns(t: CsvTranslate): CsvColumn<RosterRow>[] {
  return [
    {
      header: t('corp.members.columnMember'),
      value: (row) => label(row.name, row.characterId),
    },
    {
      header: t('corp.members.columnLastSeen'),
      value: (row) => row.standing.lastSeenMs,
    },
    {
      header: t('corp.members.columnShip'),
      value: (row) => row.shipName ?? (row.shipTypeId === null ? null : `#${row.shipTypeId}`),
    },
    {
      header: t('corp.members.columnLocation'),
      value: (row) => row.locationName ?? (row.locationId === null ? null : `#${row.locationId}`),
    },
    {
      header: t('corp.members.columnJoined'),
      value: (row) => row.startMs,
    },
    {
      header: t('corp.members.columnRoles'),
      value: (row) => rolesText(row.roles),
    },
    // The member cell's tags, as columns a spreadsheet can filter on.
    {
      header: t('corp.members.csvCeo'),
      value: (row) => (row.isCeo ? t('corp.members.csvYes') : t('corp.members.csvNo')),
    },
    {
      header: t('corp.members.csvYou'),
      value: (row) => (row.isSelf ? t('corp.members.csvYes') : t('corp.members.csvNo')),
    },
    {
      header: t('corp.members.csvDark'),
      value: (row) => (row.standing.isDark ? t('corp.members.csvYes') : t('corp.members.csvNo')),
    },
  ];
}
