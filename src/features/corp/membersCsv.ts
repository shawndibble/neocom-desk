import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { exportFlag } from '@/lib/exportFlag';
import { label } from '@/engine/corp/members';
import type { RosterRow } from './CorpRoster';
import { rolesText } from './roles';

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
    {
      header: t('corp.members.csvCeo'),
      value: (row) => exportFlag(t, row.isCeo),
    },
    {
      header: t('corp.members.csvYou'),
      value: (row) => exportFlag(t, row.isSelf),
    },
    {
      header: t('corp.members.csvDark'),
      value: (row) => exportFlag(t, row.standing.isDark),
    },
  ];
}
