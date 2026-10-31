import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { fixed2 } from '@/lib/fixedFormat';
import { npcAccessLevel, npcAgentAccessState, type NpcStandingRow } from './npcStandingsRows';

/**
 * Export columns for the NPC Standings table: every column the picker offers,
 * whatever it currently shows. The standings are raw numbers, not the
 * `StandingIcon` tag. Belongs to splits into the owner's name, an agent's level
 * (a number) and division. Access is the one numeric scale the column sorts on
 * (`npcAccessLevel`), and Agent access is the words an agent row prints. Both
 * come from `npcStandingsRows`, shared with the table. Unknown is blank, never invented. Skills that
 * could not be read leave Standing and Access blank, never 0.
 */
export function npcStandingsCsvColumns(t: CsvTranslate): CsvColumn<NpcStandingRow>[] {
  return [
    { header: t('contacts.name'), value: (row) => row.name },
    { header: t('contacts.type'), value: (row) => t(`contacts.standingsKind.${row.kind}`) },
    { header: t('contacts.standings.columnBelongsTo'), value: (row) => row.belongsTo?.name },
    { header: t('contacts.standings.csvLevel'), value: (row) => row.belongsTo?.level },
    { header: t('contacts.standings.csvDivision'), value: (row) => row.belongsTo?.division },
    { header: t('contacts.standings.columnEffective'), value: (row) => row.effective },
    { header: t('contacts.standings.columnBase'), value: (row) => row.base },
    { header: t('contacts.standings.columnAccess'), value: (row) => npcAccessLevel(row) },
    {
      header: t('contacts.standings.csvAgentAccess'),
      value: (row) => {
        const access = npcAgentAccessState(row);
        if (!access) return null;
        if (access.state === 'open') return t('contacts.standings.accessOpen');
        return access.state === 'blocked'
          ? t('contacts.standings.accessBlocked')
          : t('contacts.standings.accessNeeds', { standing: fixed2(access.standing) });
      },
    },
    { header: t('contacts.standings.columnJumps'), value: (row) => row.nearest?.jumps },
    {
      header: t('contacts.standings.columnFees'),
      value: (row) => (row.usedForFees ? t('contacts.standings.fees') : undefined),
    },
  ];
}
