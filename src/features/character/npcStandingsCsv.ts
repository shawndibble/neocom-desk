import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { npcAccessLevel, npcAgentAccessText, type NpcStandingRow } from './npcStandingsRows';

/** Every column the picker offers, whatever it shows; standings are raw numbers and unknown is blank, never invented. */
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
    { header: t('contacts.standings.csvAgentAccess'), value: (row) => npcAgentAccessText(t, row) },
    { header: t('contacts.standings.columnJumps'), value: (row) => row.nearest?.jumps },
    {
      header: t('contacts.standings.columnFees'),
      value: (row) => (row.usedForFees ? t('contacts.standings.fees') : undefined),
    },
  ];
}
